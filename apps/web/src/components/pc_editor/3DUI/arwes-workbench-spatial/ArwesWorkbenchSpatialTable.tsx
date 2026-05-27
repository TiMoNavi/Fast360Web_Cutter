"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { PcEditorCommand } from "../commands";
import {
  SPATIAL_UI_HIT_ATTRIBUTE,
  SPATIAL_UI_HIT_RENDER_ORDER,
  SPATIAL_UI_RENDER_ORDER,
  useSpatialButtonEvents,
  useSpatialRayBlockerEvents,
  type SpatialControlVisualState
} from "../shared/SpatialUiInteraction";
import {
  ARWES_WORKBENCH_DESKTOP_TABLE_POSITION,
  ARWES_WORKBENCH_DESKTOP_TABLE_ROTATION,
  ARWES_WORKBENCH_CANVAS_HEIGHT,
  ARWES_WORKBENCH_CANVAS_WIDTH,
  ARWES_WORKBENCH_TEXTURE_IDS,
  ARWES_WORKBENCH_WORLD_HEIGHT,
  ARWES_WORKBENCH_WORLD_WIDTH,
  ARWES_WORKBENCH_XR_TABLE_POSITION,
  ARWES_WORKBENCH_XR_TABLE_ROTATION,
  arwesWorkbenchRegions,
  worldPositionFromPx,
  worldSizeFromPx,
  type ArwesWorkbenchRegion
} from "./ArwesWorkbenchSpatialLayout";
import {
  paintArwesWorkbenchBase,
  paintArwesWorkbenchControls,
  paintArwesWorkbenchText,
  type ArwesWorkbenchControlState
} from "./ArwesWorkbenchSpatialPainter";

type AFrameEntityElement = HTMLElement & {
  object3D?: {
    getObjectByProperty?: (name: string, value: string) => {
      material?: {
        map?: {
          needsUpdate?: boolean;
        };
      };
    };
    traverse?: (callback: (child: { renderOrder?: number }) => void) => void;
  };
};

type AFrameSceneElement = HTMLElement & {
  is?: (state: string) => boolean;
};

export type ArwesWorkbenchSpatialTableProps = {
  autoRenderEnabled?: boolean;
  discardActive?: boolean;
  enabled?: boolean;
  maskLocked?: boolean;
  onCommand?: (command: PcEditorCommand) => void;
  recordingActive?: boolean;
  renderExportId?: string | null;
  renderStatus?: string;
};

type WorkbenchRegionCommandFactory = (state: {
  autoRenderEnabled?: boolean;
  maskLocked?: boolean;
  recordingActive?: boolean;
}) => PcEditorCommand;

type WorkbenchRegionHoldCommandFactory = (state: {
  autoRenderEnabled?: boolean;
  maskLocked?: boolean;
  recordingActive?: boolean;
}) => {
  begin: PcEditorCommand;
  end: PcEditorCommand;
};

const WORKBENCH_REGION_COMMANDS: Partial<Record<string, WorkbenchRegionCommandFactory>> = {
  CUT: () => ({ type: "timeline.cut" }),
  CRYSTAL: () => ({ type: "effects.select", categoryId: "frame", effectId: "crystal-ball", label: "Crystal ball" }),
  DOLLY: () => ({ type: "effects.select", categoryId: "frame", effectId: "dolly-zoom", label: "Dolly zoom" }),
  EFFECT: () => ({ type: "effects.select", categoryId: "frame", effectId: "little-planet", label: "Little planet" }),
  END: () => ({ type: "crop.end" }),
  LOCK: ({ maskLocked }) => ({ type: "mask.lock.set", locked: !(maskLocked ?? true) }),
  LOOK: () => ({ type: "effects.select", categoryId: "frame", effectId: "look-around", label: "Look around" }),
  PITCH_DOWN: () => ({ type: "mask.pitch.step", delta: -5 }),
  PITCH_UP: () => ({ type: "mask.pitch.step", delta: 5 }),
  PLAY: () => ({ type: "player.playPause.toggle" }),
  START: ({ recordingActive }) => ({ type: recordingActive ? "crop.end" : "crop.start" }),
  YAW_LEFT: () => ({ type: "mask.yaw.step", delta: -5 }),
  YAW_RIGHT: () => ({ type: "mask.yaw.step", delta: 5 })
};

const WORKBENCH_REGION_HOLD_COMMANDS: Partial<Record<string, WorkbenchRegionHoldCommandFactory>> = {
  DROP: () => ({ begin: { type: "timeline.discard.begin" }, end: { type: "timeline.discard.end" } }),
  MORE_DROP: () => ({ begin: { type: "timeline.discard.begin" }, end: { type: "timeline.discard.end" } })
};

const WORKBENCH_RAY_BLOCKER_LAYER_Z = 0.038;
const WORKBENCH_REGION_HIT_LAYER_Z = 0.058;

function createTextureCanvas(id: string) {
  const existing = document.getElementById(id) as HTMLCanvasElement | null;

  if (existing) {
    return existing;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "arwes-spatial-texture-source";
  canvas.height = ARWES_WORKBENCH_CANVAS_HEIGHT;
  canvas.id = id;
  canvas.width = ARWES_WORKBENCH_CANVAS_WIDTH;
  document.body.appendChild(canvas);
  return canvas;
}

function markTextureDirty(entity: AFrameEntityElement | null) {
  const mesh = entity?.object3D?.getObjectByProperty?.("type", "Mesh");
  const map = mesh?.material?.map;

  if (map) {
    map.needsUpdate = true;
  }
}

function flatTextureMaterial(id: string) {
  return `shader: flat; src: #${id}; transparent: true; alphaTest: 0.01; side: double; depthTest: false; depthWrite: false`;
}

function transparentHitVolumeMaterial(color = "#ffffff") {
  return `shader: flat; color: ${color}; emissive: ${color}; emissiveIntensity: 0; opacity: 0.001; transparent: true; side: double; depthTest: false; depthWrite: false`;
}

function elevateTableLayer(root: AFrameEntityElement | null) {
  root?.object3D?.traverse?.((child) => {
    child.renderOrder = SPATIAL_UI_RENDER_ORDER;
  });
}

function regionTargetId(regionId: string) {
  return `spatial-workbench-${regionId.toLowerCase().replaceAll("_", "-")}`;
}

function WorkbenchRayBlocker() {
  const ref = useSpatialRayBlockerEvents();

  return createElement("a-plane", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": "arwes-workbench-spatial-table-hit-plane",
    height: String(ARWES_WORKBENCH_WORLD_HEIGHT),
    material: transparentHitVolumeMaterial("#00ffff"),
    position: `0 0 ${WORKBENCH_RAY_BLOCKER_LAYER_Z}`,
    renderOrder: SPATIAL_UI_HIT_RENDER_ORDER,
    ref,
    width: String(ARWES_WORKBENCH_WORLD_WIDTH)
  });
}

function WorkbenchRegionHitTarget({
  onCommand,
  onState,
  region,
  resolveCommand,
  resolveHoldCommand
}: {
  onCommand?: (command: PcEditorCommand) => void;
  onState: (regionId: string, state: SpatialControlVisualState) => void;
  region: ArwesWorkbenchRegion;
  resolveCommand?: WorkbenchRegionCommandFactory;
  resolveHoldCommand?: WorkbenchRegionHoldCommandFactory;
}) {
  const holdActiveRef = useRef(false);
  const ref = useSpatialButtonEvents({
    onClick: () => {
      if (resolveCommand) {
        onCommand?.(resolveCommand({}));
      }
    },
    onState: (state) => {
      onState(region.id, state);

      if (!resolveHoldCommand) {
        return;
      }

      const holdCommand = resolveHoldCommand({});
      if (state === "pressed" && !holdActiveRef.current) {
        holdActiveRef.current = true;
        onCommand?.(holdCommand.begin);
        return;
      }

      if (state !== "pressed" && holdActiveRef.current) {
        holdActiveRef.current = false;
        onCommand?.(holdCommand.end);
      }
    }
  });
  const size = worldSizeFromPx(region.w, region.h);

  return createElement("a-plane", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-spatial-target-id": regionTargetId(region.id),
    "data-testid": `arwes-workbench-region-hit-${region.id.toLowerCase()}`,
    height: String(size.height),
    material: transparentHitVolumeMaterial("#ffffff"),
    position: worldPositionFromPx(region.x + region.w / 2, region.y + region.h / 2, WORKBENCH_REGION_HIT_LAYER_Z),
    renderOrder: SPATIAL_UI_HIT_RENDER_ORDER,
    ref,
    width: String(size.width)
  });
}

export function ArwesWorkbenchSpatialTable({
  autoRenderEnabled,
  discardActive,
  enabled = true,
  maskLocked,
  onCommand,
  recordingActive,
  renderExportId,
  renderStatus
}: ArwesWorkbenchSpatialTableProps) {
  const basePlaneRef = useRef<AFrameEntityElement | null>(null);
  const controlPlaneRef = useRef<AFrameEntityElement | null>(null);
  const rootRef = useRef<AFrameEntityElement | null>(null);
  const textPlaneRef = useRef<AFrameEntityElement | null>(null);
  const [controlStates, setControlStates] = useState<Partial<Record<string, ArwesWorkbenchControlState>>>({});
  const [pose, setPose] = useState({
    position: ARWES_WORKBENCH_DESKTOP_TABLE_POSITION,
    rotation: ARWES_WORKBENCH_DESKTOP_TABLE_ROTATION
  });
  const [texturesReady, setTexturesReady] = useState(false);
  const disabledRegionIds = useMemo(
    () => new Set(arwesWorkbenchRegions.filter((region) => !WORKBENCH_REGION_COMMANDS[region.id] && !WORKBENCH_REGION_HOLD_COMMANDS[region.id]).map((region) => region.id)),
    []
  );

  useEffect(() => {
    if (!enabled) {
      setTexturesReady(false);
      return undefined;
    }

    const baseCanvas = createTextureCanvas(ARWES_WORKBENCH_TEXTURE_IDS.base);
    const controlCanvas = createTextureCanvas(ARWES_WORKBENCH_TEXTURE_IDS.controls);
    const textCanvas = createTextureCanvas(ARWES_WORKBENCH_TEXTURE_IDS.text);

    paintArwesWorkbenchBase(baseCanvas);
    paintArwesWorkbenchControls(controlCanvas, { disabledRegionIds });
    paintArwesWorkbenchText(textCanvas);
    setTexturesReady(true);

    return () => {
      setTexturesReady(false);
      baseCanvas.remove();
      controlCanvas.remove();
      textCanvas.remove();
    };
  }, [disabledRegionIds, enabled]);

  useEffect(() => {
    if (!texturesReady) {
      return;
    }

    const textCanvas = document.getElementById(ARWES_WORKBENCH_TEXTURE_IDS.text) as HTMLCanvasElement | null;
    if (!textCanvas) {
      return;
    }

    paintArwesWorkbenchText(textCanvas, { discardActive, recordingActive, renderExportId, renderStatus });
    window.requestAnimationFrame(() => {
      markTextureDirty(textPlaneRef.current);
    });
  }, [discardActive, recordingActive, renderExportId, renderStatus, texturesReady]);

  useEffect(() => {
    if (!texturesReady) {
      return;
    }

    const controlCanvas = document.getElementById(ARWES_WORKBENCH_TEXTURE_IDS.controls) as HTMLCanvasElement | null;
    if (!controlCanvas) {
      return;
    }

    paintArwesWorkbenchControls(controlCanvas, { controlStates, disabledRegionIds });
    window.requestAnimationFrame(() => {
      markTextureDirty(controlPlaneRef.current);
    });
  }, [controlStates, disabledRegionIds, texturesReady]);

  useEffect(() => {
    if (!texturesReady) {
      return;
    }

    window.requestAnimationFrame(() => {
      elevateTableLayer(rootRef.current);
      markTextureDirty(basePlaneRef.current);
      markTextureDirty(controlPlaneRef.current);
      markTextureDirty(textPlaneRef.current);
    });
  }, [texturesReady]);

  useEffect(() => {
    const root = rootRef.current;
    const scene = root?.closest("a-scene") as AFrameSceneElement | null;

    if (!scene) {
      return undefined;
    }

    const syncPose = () => {
      if (scene.is?.("vr-mode")) {
        setPose({
          position: ARWES_WORKBENCH_XR_TABLE_POSITION,
          rotation: ARWES_WORKBENCH_XR_TABLE_ROTATION
        });
        return;
      }

      setPose({
        position: ARWES_WORKBENCH_DESKTOP_TABLE_POSITION,
        rotation: ARWES_WORKBENCH_DESKTOP_TABLE_ROTATION
      });
    };

    syncPose();
    scene.addEventListener("enter-vr", syncPose);
    scene.addEventListener("exit-vr", syncPose);
    return () => {
      scene.removeEventListener("enter-vr", syncPose);
      scene.removeEventListener("exit-vr", syncPose);
    };
  }, [texturesReady]);

  if (!enabled || !texturesReady) {
    return null;
  }

  const handleRegionState = (regionId: string, state: SpatialControlVisualState) => {
    setControlStates((value) => ({
      ...value,
      [regionId]: state
    }));
  };

  const createCommandResolver =
    (resolveCommand: WorkbenchRegionCommandFactory): WorkbenchRegionCommandFactory =>
    () =>
      resolveCommand({
        autoRenderEnabled,
        maskLocked,
        recordingActive
      });

  const createHoldCommandResolver =
    (resolveCommand: WorkbenchRegionHoldCommandFactory): WorkbenchRegionHoldCommandFactory =>
    () =>
      resolveCommand({
        autoRenderEnabled,
        maskLocked,
        recordingActive
      });

  return createElement(
    "a-entity",
    {
      ref: rootRef,
      "data-testid": "arwes-workbench-spatial-table",
      position: pose.position,
      rotation: pose.rotation
    },
    createElement("a-plane", {
      height: String(ARWES_WORKBENCH_WORLD_HEIGHT + 0.018),
      material: "shader: flat; color: #00ffff; emissive: #00ffff; emissiveIntensity: 0.16; opacity: 0.09; transparent: true; side: double",
      position: "0 -0.004 -0.012",
      width: String(ARWES_WORKBENCH_WORLD_WIDTH + 0.05)
    }),
    createElement("a-plane", {
      ref: basePlaneRef,
      "data-testid": "arwes-workbench-spatial-table-base-plane",
      height: String(ARWES_WORKBENCH_WORLD_HEIGHT),
      material: flatTextureMaterial(ARWES_WORKBENCH_TEXTURE_IDS.base),
      width: String(ARWES_WORKBENCH_WORLD_WIDTH)
    }),
    createElement("a-plane", {
      ref: controlPlaneRef,
      "data-testid": "arwes-workbench-spatial-table-control-plane",
      height: String(ARWES_WORKBENCH_WORLD_HEIGHT),
      material: flatTextureMaterial(ARWES_WORKBENCH_TEXTURE_IDS.controls),
      position: "0 0 0.014",
      width: String(ARWES_WORKBENCH_WORLD_WIDTH)
    }),
    createElement("a-plane", {
      ref: textPlaneRef,
      "data-testid": "arwes-workbench-spatial-table-text-plane",
      height: String(ARWES_WORKBENCH_WORLD_HEIGHT),
      material: flatTextureMaterial(ARWES_WORKBENCH_TEXTURE_IDS.text),
      position: "0 0 0.028",
      width: String(ARWES_WORKBENCH_WORLD_WIDTH)
    }),
    createElement(WorkbenchRayBlocker),
    ...arwesWorkbenchRegions.flatMap((region) => {
      const resolveCommand = WORKBENCH_REGION_COMMANDS[region.id];
      const resolveHoldCommand = WORKBENCH_REGION_HOLD_COMMANDS[region.id];

      if (!resolveCommand && !resolveHoldCommand) {
        return [];
      }

      return [
        createElement(WorkbenchRegionHitTarget, {
          key: region.id,
          onCommand,
          onState: handleRegionState,
          region,
          resolveCommand: resolveCommand ? createCommandResolver(resolveCommand) : undefined,
          resolveHoldCommand: resolveHoldCommand ? createHoldCommandResolver(resolveHoldCommand) : undefined
        })
      ];
    })
  );
}
