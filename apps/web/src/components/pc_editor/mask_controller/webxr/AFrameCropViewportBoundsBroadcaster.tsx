"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  setPcEditorMaskViewportBounds,
  usePcEditorCropMaskState,
  usePcEditorViewTarget,
  type PcEditorCropMaskRuntimeState,
  type PcEditorMaskViewportBounds,
  type PcEditorViewportCorner,
  type PcEditorViewTargetRuntimeState
} from "../../state";
import {
  CROP_MASK_ASPECT,
  WEBXR_CROP_MASK_CHANGE_EVENT,
  defaultCropMaskState,
  type CropMaskState
} from "./AFrameCropViewportMask";
import {
  computeCropViewportPlane,
  createCropMaskViewportBounds
} from "./cropViewportGeometry";

export const WEBXR_CROP_MASK_BOUNDS_EVENT = "webxr:crop-mask-bounds-change";

type Vector3Like = {
  x: number;
  y: number;
  z: number;
  project?: (camera: unknown) => Vector3Like;
};

type Object3DLike = {
  localToWorld?: (vector: Vector3Like) => Vector3Like;
  updateMatrixWorld?: (force?: boolean) => void;
};

type SceneLike = {
  camera?: unknown;
  renderer?: {
    domElement?: HTMLElement;
  };
};

type AFrameEntityLike = HTMLElement & {
  object3D?: Object3DLike;
  sceneEl?: SceneLike;
};

type AFrameRuntime = {
  THREE?: {
    Vector3: new (x?: number, y?: number, z?: number) => Vector3Like;
  };
};

declare global {
  interface Window {
    AFRAME?: unknown;
  }
}

function rounded(value: number) {
  return Number(value.toFixed(2));
}

function boundsSignature(bounds: PcEditorMaskViewportBounds) {
  return JSON.stringify({
    center: bounds.center,
    fov: bounds.fov,
    roll: rounded(bounds.roll),
    rect: bounds.screenRect
      ? {
          bottom: rounded(bounds.screenRect.bottom),
          left: rounded(bounds.screenRect.left),
          right: rounded(bounds.screenRect.right),
          top: rounded(bounds.screenRect.top)
        }
      : null
  });
}

function projectCornersToScreen(root: AFrameEntityLike, state: CropMaskState): PcEditorViewportCorner[] {
  const aframe = window.AFRAME as AFrameRuntime | undefined;
  const Vector3 = aframe?.THREE?.Vector3;
  const object3D = root.object3D;
  const camera = root.sceneEl?.camera;
  const canvasRect = root.sceneEl?.renderer?.domElement?.getBoundingClientRect();
  const viewportPlane = computeCropViewportPlane(state);

  object3D?.updateMatrixWorld?.(true);

  return viewportPlane.corners.map((corner) => {
    const projected: PcEditorViewportCorner = {
      id: corner.id,
      sphere: corner.position
    };

    if (!Vector3 || !object3D?.localToWorld || !camera || !canvasRect) {
      return projected;
    }

    const world = object3D.localToWorld(new Vector3(corner.position.x, corner.position.y, corner.position.z));
    const ndc = typeof world.project === "function" ? world.project(camera) : null;

    if (!ndc || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) {
      return projected;
    }

    projected.screen = {
      x: rounded(canvasRect.left + ((ndc.x + 1) / 2) * canvasRect.width),
      y: rounded(canvasRect.top + ((1 - ndc.y) / 2) * canvasRect.height)
    };
    return projected;
  });
}

function cropRuntimeStateToCropMaskState(state: PcEditorCropMaskRuntimeState): CropMaskState {
  return {
    aspect: CROP_MASK_ASPECT,
    center: state.center,
    cut: false,
    enabled: true,
    fov: state.fov,
    input: state.input,
    locked: state.locked,
    maskOpacity: state.maskOpacity,
    roll: state.roll,
    smoothFollow: state.smoothFollow,
    source: "crop-mask-preview",
    version: 1,
    videoTimeMs: state.videoTimeMs
  };
}

function viewTargetRuntimeStateToCropMaskState(
  state: PcEditorViewTargetRuntimeState,
  cropMask: PcEditorCropMaskRuntimeState | null
): CropMaskState {
  return {
    aspect: CROP_MASK_ASPECT,
    center: state.center,
    cut: false,
    enabled: true,
    fov: state.fov,
    input: state.input === "head_gaze" ? "head_gaze" : "keyboard",
    locked: state.locked,
    maskOpacity: state.maskOpacity ?? cropMask?.maskOpacity ?? 0.74,
    roll: state.roll,
    smoothFollow: cropMask?.smoothFollow ?? !state.locked,
    source: "crop-mask-preview",
    version: 1,
    videoTimeMs: state.videoTimeMs
  };
}

function publishBounds(bounds: PcEditorMaskViewportBounds, legacyWindowEvents: boolean) {
  setPcEditorMaskViewportBounds(bounds);

  if (legacyWindowEvents) {
    window.dispatchEvent(
      new CustomEvent<PcEditorMaskViewportBounds>(WEBXR_CROP_MASK_BOUNDS_EVENT, {
        detail: bounds
      })
    );
  }
}

export function AFrameCropViewportBoundsBroadcaster({
  legacyWindowEvents = false
}: {
  legacyWindowEvents?: boolean;
}) {
  const runtimeCropMask = usePcEditorCropMaskState();
  const runtimeViewTarget = usePcEditorViewTarget();
  const [state, setState] = useState<CropMaskState>(() => defaultCropMaskState());
  const rootRef = useRef<AFrameEntityLike | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const viewportPlane = useMemo(() => computeCropViewportPlane(state), [state]);

  useEffect(() => {
    if (!legacyWindowEvents) {
      return;
    }

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<CropMaskState>).detail;
      if (detail?.fov) {
        setState(detail);
      }
    };

    window.addEventListener(WEBXR_CROP_MASK_CHANGE_EVENT, listener);
    return () => window.removeEventListener(WEBXR_CROP_MASK_CHANGE_EVENT, listener);
  }, [legacyWindowEvents]);

  useEffect(() => {
    if (legacyWindowEvents) {
      return;
    }

    if (runtimeViewTarget) {
      setState(viewTargetRuntimeStateToCropMaskState(runtimeViewTarget, runtimeCropMask));
      return;
    }

    if (runtimeCropMask) {
      setState(cropRuntimeStateToCropMaskState(runtimeCropMask));
    }
  }, [legacyWindowEvents, runtimeCropMask, runtimeViewTarget]);

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const root = rootRef.current;
      if (root) {
        const corners = projectCornersToScreen(root, state);
        const bounds = createCropMaskViewportBounds(state, corners);
        const signature = boundsSignature(bounds);

        if (signature !== lastSignatureRef.current) {
          lastSignatureRef.current = signature;
          publishBounds(bounds, legacyWindowEvents);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [legacyWindowEvents, state]);

  return createElement("a-entity", {
    "data-testid": "aframe-crop-viewport-bounds-broadcaster",
    ref: rootRef,
    rotation: viewportPlane.rotationAttribute,
    visible: "false"
  });
}
