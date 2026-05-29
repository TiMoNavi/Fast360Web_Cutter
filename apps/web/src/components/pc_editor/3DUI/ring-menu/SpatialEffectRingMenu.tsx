"use client";

import { createElement, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Vector3 } from "three";
import {
  SPATIAL_UI_HIT_ATTRIBUTE,
  SPATIAL_UI_TEXT_RENDER_ORDER,
  flatEmissiveMaterial,
  transparentHitMaterial,
  useSpatialButtonEvents,
  useSpatialRayBlockerEvents,
  type SpatialControlVisualState
} from "../shared/SpatialUiInteraction";
import type { Spatial3DUiAction, SpatialEffectCategory, SpatialEffectItem } from "../shared/Spatial3DUiPublicApi";

type AFrameEntityElement = HTMLElement & {
  object3D?: {
    getWorldPosition?: (target: Vector3) => Vector3;
    lookAt?: (target: Vector3) => void;
    position?: {
      set?: (x: number, y: number, z: number) => void;
    };
    rotateY?: (radians: number) => void;
    traverse?: (callback: (child: { renderOrder?: number }) => void) => void;
    updateMatrixWorld?: (force?: boolean) => void;
  };
};

type AFrameSceneElement = HTMLElement & {
  object3D?: {
    updateMatrixWorld?: (force?: boolean) => void;
  };
  renderer?: {
    xr?: {
      getController?: (index: number) => AFrameEntityElement["object3D"];
      getControllerGrip?: (index: number) => AFrameEntityElement["object3D"];
      getReferenceSpace?: () => XRReferenceSpace | null;
    };
  };
  xrSession?: XRSession;
};

type RingItem = {
  category?: SpatialEffectCategory;
  effect?: SpatialEffectItem;
  id: string;
  label: string;
};

type RingLevel = {
  id: string;
  items: RingItem[];
  radius: number;
  spreadDeg: number;
};

const COLORS = {
  cyan: "#00ffff",
  magenta: "#ff00ff",
  orange: "#ff9900",
  panel: "#070011",
  white: "#f7ffff"
};
const TOP_ANGLE = 90;
const ARC_GAP = 7;
const HOLD_EFFECT_IDS = new Set(["black-fade", "white-fade"]);
const CATEGORY_DWELL_OPEN_MS = 500;
const EFFECT_LEVEL_IDLE_COLLAPSE_MS = 1000;
const RING_MENU_FALLBACK_POSITION = { x: 0.44, y: 1.2, z: -0.86 };
const RING_MENU_FACE_CAMERA_YAW_FLIP_RADIANS = Math.PI * 2;
const RING_MENU_WORLD_FORWARD_OFFSET = -0.12;
const RING_MENU_WORLD_UP_OFFSET = 0.1;
const RING_MENU_ANCHOR_CAPTURE_MAX_FRAMES = 18;
const RING_MENU_FALLBACK_VECTOR = new Vector3(
  RING_MENU_FALLBACK_POSITION.x,
  RING_MENU_FALLBACK_POSITION.y,
  RING_MENU_FALLBACK_POSITION.z
);
const RING_MENU_MIN_CONTROLLER_POSE_LENGTH = 0.001;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function ringGeometry(innerRadius: number, outerRadius: number, startAngle: number, angleLength: number) {
  return `primitive: ring; radiusInner: ${innerRadius}; radiusOuter: ${outerRadius}; thetaStart: ${startAngle}; thetaLength: ${angleLength}; segmentsTheta: 28`;
}

function levelArc({
  index,
  itemCount,
  spreadDeg
}: {
  index: number;
  itemCount: number;
  spreadDeg: number;
}) {
  const arcSlot = spreadDeg / Math.max(1, itemCount);
  const arcLength = Math.max(12, arcSlot - ARC_GAP);
  const spreadStart = spreadDeg === 360 ? 0 : TOP_ANGLE - spreadDeg / 2;
  const startAngle = normalizeAngle(spreadStart + index * arcSlot + ARC_GAP / 2);
  const centerAngle = normalizeAngle(startAngle + arcLength / 2);

  return {
    arcLength,
    centerAngle,
    startAngle
  };
}

function labelPosition(radius: number, angleDeg: number) {
  const radians = toRadians(angleDeg);
  return `${Math.cos(radians) * radius} ${Math.sin(radians) * radius} 0.07`;
}

function effectPayload(category: SpatialEffectCategory, effect: SpatialEffectItem) {
  return {
    categoryId: category.id,
    conflictGroup: effect.conflictGroup,
    durationMs: effect.durationMs,
    effectId: effect.id,
    eventName: effect.eventName,
    label: effect.label,
    params: effect.params,
    previewMode: effect.previewMode,
    previewTarget: effect.previewTarget,
    renderFallback: effect.renderFallback,
    renderStage: effect.renderStage,
    renderSupported: effect.renderSupported
  };
}

function effectHoldDurationMs(effect: SpatialEffectItem, elapsedMs: number) {
  if (effect.id === "white-fade") {
    return Math.min(1800, Math.max(260, Math.round(elapsedMs)));
  }

  return Math.max(160, Math.round(elapsedMs));
}

function hasUsableControllerPose(position: Vector3) {
  return position.lengthSq() > RING_MENU_MIN_CONTROLLER_POSE_LENGTH * RING_MENU_MIN_CONTROLLER_POSE_LENGTH;
}

function readObjectWorldPosition(
  object3D: AFrameEntityElement["object3D"] | null | undefined,
  target: Vector3
) {
  if (!object3D?.getWorldPosition) {
    return false;
  }

  object3D.updateMatrixWorld?.(true);
  target.set(0, 0, 0);
  object3D.getWorldPosition(target);
  return hasUsableControllerPose(target);
}

function readRightXrFrameAnchor(scene: AFrameSceneElement | null, frame: XRFrame | null | undefined, target: Vector3) {
  const referenceSpace = scene?.renderer?.xr?.getReferenceSpace?.();
  const inputSources = scene?.xrSession?.inputSources ?? frame?.session?.inputSources;

  if (!frame?.getPose || !referenceSpace || !inputSources) {
    return null;
  }

  for (const inputSource of Array.from(inputSources)) {
    if (inputSource.handedness !== "right") {
      continue;
    }

    const spaces: Array<[string, XRSpace | undefined]> = [
      ["xr-frame-right-grip", inputSource.gripSpace],
      ["xr-frame-right-target-ray", inputSource.targetRaySpace]
    ];

    for (const [source, space] of spaces) {
      if (!space) {
        continue;
      }

      const pose = frame.getPose(space, referenceSpace);
      const position = pose?.transform?.position;

      if (!position) {
        continue;
      }

      target.set(position.x, position.y, position.z);
      if (hasUsableControllerPose(target)) {
        return source;
      }
    }
  }

  return null;
}

function readRightControllerAnchor(scene: AFrameSceneElement | null, target: Vector3, frame?: XRFrame | null) {
  const xrFrameSource = readRightXrFrameAnchor(scene, frame, target);

  if (xrFrameSource) {
    return xrFrameSource;
  }

  const controller = scene?.querySelector("#right-controller") as AFrameEntityElement | null;

  if (readObjectWorldPosition(controller?.object3D, target)) {
    return "aframe-right-controller";
  }

  const xr = scene?.renderer?.xr;
  const candidates: Array<[string, AFrameEntityElement["object3D"] | null | undefined]> = [
    ["xr-controller-1", xr?.getController?.(1)],
    ["xr-controller-grip-1", xr?.getControllerGrip?.(1)],
    ["xr-controller-0", xr?.getController?.(0)],
    ["xr-controller-grip-0", xr?.getControllerGrip?.(0)]
  ];

  for (const [source, object3D] of candidates) {
    if (readObjectWorldPosition(object3D, target)) {
      return source;
    }
  }

  target.copy(RING_MENU_FALLBACK_VECTOR);
  return "fallback";
}

function RingMenuRayBlocker() {
  const ref = useSpatialRayBlockerEvents();

  return createElement("a-circle", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": "spatial-effect-ring-ray-blocker",
    material: flatEmissiveMaterial(COLORS.white, 0.001, 0),
    position: "0 0 0.035",
    radius: "0.84",
    ref,
    segments: "80"
  });
}

function RingHitArc({
  arcLength,
  innerRadius,
  item,
  onClick,
  onState,
  outerRadius,
  startAngle
}: {
  arcLength: number;
  innerRadius: number;
  item: RingItem;
  onClick: (item: RingItem) => void;
  onState: (item: RingItem, state: SpatialControlVisualState) => void;
  outerRadius: number;
  startAngle: number;
}) {
  const ref = useSpatialButtonEvents({
    onClick: () => onClick(item),
    onState: (state) => onState(item, state)
  });

  return createElement("a-entity", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-ring-hit-id": item.id,
    "data-testid": `spatial-effect-ring-hit-${item.id}`,
    geometry: ringGeometry(innerRadius, outerRadius, startAngle, arcLength),
    material: transparentHitMaterial(),
    position: "0 0 0.12",
    ref
  });
}

function RingArc({
  active,
  item,
  level,
  onClick,
  onState
}: {
  active: boolean;
  item: RingItem;
  level: RingLevel;
  onClick: (item: RingItem) => void;
  onState: (item: RingItem, state: SpatialControlVisualState) => void;
}) {
  const itemIndex = level.items.findIndex((candidate) => candidate.id === item.id);
  const arc = levelArc({
    index: itemIndex,
    itemCount: level.items.length,
    spreadDeg: level.spreadDeg
  });
  const color = item.effect ? COLORS.orange : COLORS.cyan;
  const outerRadius = level.radius + (active ? 0.038 : 0.026);
  const innerRadius = level.radius - (active ? 0.038 : 0.026);
  const label = item.label.toUpperCase().slice(0, 12);

  return createElement(
    "a-entity",
    {
      "data-ring-item-id": item.id
    },
    createElement("a-entity", {
      geometry: ringGeometry(innerRadius - 0.006, outerRadius + 0.006, arc.startAngle, arc.arcLength),
      material: flatEmissiveMaterial(COLORS.panel, 0.72, 0.08)
    }),
    createElement("a-entity", {
      geometry: ringGeometry(innerRadius, outerRadius, arc.startAngle, arc.arcLength),
      material: flatEmissiveMaterial(color, active ? 0.34 : 0.22, active ? 0.92 : 0.4)
    }),
    createElement("a-entity", {
      geometry: ringGeometry(outerRadius + 0.012, outerRadius + 0.028, arc.startAngle + 3, Math.max(7, arc.arcLength - 6)),
      material: flatEmissiveMaterial(active ? COLORS.white : COLORS.magenta, active ? 0.58 : 0.2, active ? 1 : 0.44)
    }),
    createElement("a-text", {
      align: "center",
      baseline: "center",
      color: COLORS.white,
      font: "exo2bold",
      material: `shader: msdf; emissive: ${COLORS.white}; emissiveIntensity: 0.62; depthTest: false; depthWrite: false`,
      position: labelPosition(level.radius, arc.centerAngle),
      scale: `${active ? 0.116 : 0.096} ${active ? 0.116 : 0.096} ${active ? 0.116 : 0.096}`,
      side: "double",
      value: label,
      width: "4.4",
      wrapCount: "10"
    }),
    createElement(RingHitArc, {
      arcLength: arc.arcLength,
      innerRadius: Math.max(0.01, innerRadius - 0.026),
      item,
      onClick,
      onState,
      outerRadius: outerRadius + 0.054,
      startAngle: arc.startAngle
    })
  );
}

function useControllerAnchoredBillboard(rootRef: RefObject<AFrameEntityElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let frameId: number | null = null;
    let scheduledXrSession: XRSession | null = null;
    let stopped = false;
    let captureAttemptCount = 0;
    const cameraPosition = new Vector3(0, 1.6, 0);
    const controllerPosition = new Vector3();

    const scheduleNextFrame = () => {
      const scene = rootRef.current?.closest("a-scene") as AFrameSceneElement | null;
      const xrSession = scene?.xrSession;

      if (xrSession?.requestAnimationFrame) {
        scheduledXrSession = xrSession;
        frameId = xrSession.requestAnimationFrame((_time, frame) => tick(frame));
        return;
      }

      scheduledXrSession = null;
      frameId = window.requestAnimationFrame(() => tick(null));
    };

    const tick = (frame: XRFrame | null) => {
      if (stopped) {
        return;
      }

      const root = rootRef.current;
      const scene = root?.closest("a-scene") as AFrameSceneElement | null;
      const camera = scene?.querySelector("#main-camera") as AFrameEntityElement | null;
      captureAttemptCount += 1;

      scene?.object3D?.updateMatrixWorld?.(true);
      root?.object3D?.updateMatrixWorld?.(true);
      camera?.object3D?.updateMatrixWorld?.(true);

      camera?.object3D?.getWorldPosition?.(cameraPosition);
      const anchorSource = readRightControllerAnchor(scene, controllerPosition, frame);
      const hasControllerPose = anchorSource !== "fallback";
      const anchor = hasControllerPose ? controllerPosition : RING_MENU_FALLBACK_VECTOR;
      const x = anchor.x;
      const y = anchor.y + (hasControllerPose ? RING_MENU_WORLD_UP_OFFSET : 0);
      const z = anchor.z + (hasControllerPose ? RING_MENU_WORLD_FORWARD_OFFSET : 0);

      root?.object3D?.position?.set?.(x, y, z);
      root?.setAttribute("data-anchor-source", anchorSource);
      root?.setAttribute("data-anchor-x", x.toFixed(4));
      root?.setAttribute("data-anchor-y", y.toFixed(4));
      root?.setAttribute("data-anchor-z", z.toFixed(4));
      root?.object3D?.lookAt?.(cameraPosition);
      root?.object3D?.rotateY?.(RING_MENU_FACE_CAMERA_YAW_FLIP_RADIANS);
      root?.object3D?.traverse?.((child) => {
        child.renderOrder = SPATIAL_UI_TEXT_RENDER_ORDER;
      });
      if (hasControllerPose || captureAttemptCount >= RING_MENU_ANCHOR_CAPTURE_MAX_FRAMES) {
        stopped = true;
        root?.setAttribute("data-anchor-captured", hasControllerPose ? "true" : "fallback");
        return;
      }

      scheduleNextFrame();
    };

    scheduleNextFrame();
    return () => {
      stopped = true;
      if (frameId !== null) {
        scheduledXrSession?.cancelAnimationFrame?.(frameId);
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [enabled, rootRef]);
}

export function SpatialEffectRingMenu({
  categories,
  onAction,
  visible
}: {
  categories: SpatialEffectCategory[];
  onAction?: (action: Spatial3DUiAction) => void;
  visible: boolean;
}) {
  const rootRef = useRef<AFrameEntityElement | null>(null);
  const selectedCategoryIdRef = useRef<string | null>(null);
  const categoryDwellTimerRef = useRef<number | null>(null);
  const effectCollapseTimerRef = useRef<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<Record<string, SpatialControlVisualState>>({});
  const holdRef = useRef<{
    category: SpatialEffectCategory;
    effect: SpatialEffectItem;
    startedAtMs: number;
  } | null>(null);

  useControllerAnchoredBillboard(rootRef, visible);

  useEffect(() => {
    if (selectedCategoryId && !categories.some((category) => category.id === selectedCategoryId)) {
      selectedCategoryIdRef.current = null;
      setSelectedCategoryId(null);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    selectedCategoryIdRef.current = selectedCategoryId;
  }, [selectedCategoryId]);

  const categoryItems = useMemo<RingItem[]>(
    () => categories.map((category) => ({ category, id: `category-${category.id}`, label: category.label })),
    [categories]
  );
  const selectedCategory = selectedCategoryId ? categories.find((category) => category.id === selectedCategoryId) ?? null : null;
  const effectItems = useMemo<RingItem[]>(
    () => (selectedCategory?.effects ?? []).map((effect) => ({ effect, id: `effect-${effect.id}`, label: effect.label })),
    [selectedCategory]
  );

  const finishHold = () => {
    const active = holdRef.current;

    if (!active) {
      return;
    }

    holdRef.current = null;
    onAction?.({
      ...effectPayload(active.category, active.effect),
      durationMs: effectHoldDurationMs(active.effect, performance.now() - active.startedAtMs),
      type: "effects.hold.end"
    });
  };

  const clearCategoryDwellTimer = () => {
    if (categoryDwellTimerRef.current !== null) {
      window.clearTimeout(categoryDwellTimerRef.current);
      categoryDwellTimerRef.current = null;
    }
  };

  const clearEffectCollapseTimer = () => {
    if (effectCollapseTimerRef.current !== null) {
      window.clearTimeout(effectCollapseTimerRef.current);
      effectCollapseTimerRef.current = null;
    }
  };

  const openCategoryLevel = (category: SpatialEffectCategory) => {
    clearCategoryDwellTimer();
    clearEffectCollapseTimer();

    if (selectedCategoryIdRef.current === category.id) {
      return;
    }

    selectedCategoryIdRef.current = category.id;
    setSelectedCategoryId(category.id);
    onAction?.({ categoryId: category.id, open: true, type: "effects.category.toggle" });
  };

  const scheduleCategoryDwellOpen = (category: SpatialEffectCategory) => {
    clearCategoryDwellTimer();
    clearEffectCollapseTimer();
    categoryDwellTimerRef.current = window.setTimeout(() => {
      openCategoryLevel(category);
    }, CATEGORY_DWELL_OPEN_MS);
  };

  const scheduleEffectLevelCollapse = () => {
    clearEffectCollapseTimer();
    effectCollapseTimerRef.current = window.setTimeout(() => {
      if (holdRef.current) {
        effectCollapseTimerRef.current = null;
        return;
      }

      selectedCategoryIdRef.current = null;
      setSelectedCategoryId(null);
      effectCollapseTimerRef.current = null;
    }, EFFECT_LEVEL_IDLE_COLLAPSE_MS);
  };

  const handleItemClick = (item: RingItem) => {
    if (item.category) {
      openCategoryLevel(item.category);
      return;
    }

    if (!item.effect || !selectedCategory || HOLD_EFFECT_IDS.has(item.effect.id)) {
      return;
    }

    onAction?.({
      ...effectPayload(selectedCategory, item.effect),
      type: "effects.select"
    });
  };

  const handleItemState = (item: RingItem, state: SpatialControlVisualState) => {
    setInteraction((value) => ({
      ...value,
      [item.id]: state
    }));

    if (item.category) {
      if (state === "pressed") {
        openCategoryLevel(item.category);
      } else if (state === "hover") {
        scheduleCategoryDwellOpen(item.category);
      } else {
        clearCategoryDwellTimer();
        scheduleEffectLevelCollapse();
      }
      return;
    }

    if (item.effect) {
      if (state === "idle") {
        scheduleEffectLevelCollapse();
      } else {
        clearEffectCollapseTimer();
      }
    }

    if (!item.effect || !selectedCategory || !HOLD_EFFECT_IDS.has(item.effect.id)) {
      return;
    }

    const active = holdRef.current;
    if (state === "pressed" && !active) {
      holdRef.current = {
        category: selectedCategory,
        effect: item.effect,
        startedAtMs: performance.now()
      };
      onAction?.({
        ...effectPayload(selectedCategory, item.effect),
        type: "effects.hold.start"
      });
      return;
    }

    if (state !== "pressed" && active?.effect.id === item.effect.id) {
      finishHold();
    }
  };

  useEffect(() => {
    if (visible) {
      selectedCategoryIdRef.current = null;
      setSelectedCategoryId(null);
      setInteraction({});
      return;
    }

    finishHold();
    clearCategoryDwellTimer();
    clearEffectCollapseTimer();
    selectedCategoryIdRef.current = null;
    setSelectedCategoryId(null);
    setInteraction({});
  }, [visible]);

  useEffect(
    () => () => {
      clearCategoryDwellTimer();
      clearEffectCollapseTimer();
    },
    []
  );

  if (!visible || categories.length === 0) {
    return null;
  }

  const categoryLevel: RingLevel = {
    id: "category",
    items: categoryItems,
    radius: 0.2,
    spreadDeg: 360
  };
  const effectLevel: RingLevel = {
    id: "effect",
    items: effectItems,
    radius: 0.34,
    spreadDeg: Math.min(260, Math.max(130, effectItems.length * 42))
  };

  return createElement(
    "a-entity",
    {
      ref: rootRef,
      "data-anchor-hand": "right",
      "data-anchor-mode": "controller-world-position",
      "data-testid": "spatial-effect-ring-menu",
      position: `${RING_MENU_FALLBACK_POSITION.x} ${RING_MENU_FALLBACK_POSITION.y} ${RING_MENU_FALLBACK_POSITION.z}`
    },
    createElement(RingMenuRayBlocker),
    createElement("a-circle", {
      material: flatEmissiveMaterial(COLORS.panel, 0.52, 0.08),
      radius: "0.09",
      segments: "40"
    }),
    createElement("a-ring", {
      material: flatEmissiveMaterial(COLORS.magenta, 0.26, 0.74),
      "radius-inner": "0.075",
      "radius-outer": "0.09",
      "theta-length": "360"
    }),
    ...categoryItems.map((item) =>
      createElement(RingArc, {
        active: item.category?.id === selectedCategory?.id || interaction[item.id] === "pressed",
        item,
        key: item.id,
        level: categoryLevel,
        onClick: handleItemClick,
        onState: handleItemState
      })
    ),
    ...effectItems.map((item) =>
      createElement(RingArc, {
        active: interaction[item.id] === "pressed" || interaction[item.id] === "hover",
        item,
        key: item.id,
        level: effectLevel,
        onClick: handleItemClick,
        onState: handleItemState
      })
    ),
    createElement("a-text", {
      align: "center",
      baseline: "center",
      color: COLORS.white,
      font: "exo2bold",
      material: `shader: msdf; emissive: ${COLORS.white}; emissiveIntensity: 0.58`,
      position: "0 -0.54 0.03",
      scale: "0.075 0.075 0.075",
      side: "double",
      value: selectedCategory ? selectedCategory.label.toUpperCase() : "EFFECTS",
      width: "7.2",
      wrapCount: "28"
    })
  );
}
