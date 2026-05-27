"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { AFrame360PlaybackState } from "../types";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";
import {
  addMotionDelta,
  correctLineRippleDelta,
  createLineRippleFilterState,
  deltaToCenter,
  resetLineRippleFilter,
  scaleVector,
  vectorLength
} from "../operations/motionSmoothing";
import {
  clampNumber,
  directionToViewCenter,
  normalizeViewCenter,
  screenPointToViewCenter,
  viewCenterToSpherePoint
} from "../operations/viewGeometry";
import { isPcMaskCenterFollowKeyPressed } from "./centerFollowKey";
import { isInteractiveTarget } from "./domTargetGuards";
import type { PcEdgePanControls } from "./usePcEdgePan";
import { setPcEditorPointerState } from "../../state";
import { PC_MASK_BACKGROUND_HIT_ATTRIBUTE } from "../webxr/AFrameMaskBackgroundTarget";
import { SPATIAL_UI_HIT_ATTRIBUTE, SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE } from "../../3DUI/shared/SpatialUiInteraction";

const MASK_DRAG_YAW_PER_PX = 0.12;
const MASK_DRAG_PITCH_PER_PX = 0.12;
const MASK_CLICK_MAX_TRAVEL_PX = 6;
const MASK_DRAG_MAX_SMOOTH_SPEED_DEG_PER_SECOND = 180;
const MASK_DRAG_SMOOTH_RESPONSE_SECONDS = 0.115;
const MASK_DRAG_SETTLE_EPSILON_DEG = 0.006;
const VIEW_DRAG_YAW_PER_PX = 0.11;
const VIEW_DRAG_PITCH_PER_PX = 0.11;
const MASK_DRAG_CAMERA_THRESHOLD_RATIO = 0.25;
const MASK_DRAG_CAMERA_SPEED_PER_PX = 0.08;
const CENTER_FOLLOW_RESPONSE_MS = 420;
const CENTER_FOLLOW_TARGET_DEADZONE_DEG = 0.2;
const CENTER_FOLLOW_TARGET_RESPONSE_SECONDS = 0.18;
const CENTER_FOLLOW_TARGET_MAX_SPEED_DEG_PER_SECOND = 180;
const CENTER_FOLLOW_COMMAND_GRACE_MS = 96;
const CENTER_FOLLOW_LOOK_DEADZONE_PX = 0.04;
const CENTER_FOLLOW_LOOK_RESPONSE_SECONDS = 0.075;
const CENTER_FOLLOW_LOOK_MAX_STEP_PX = 40;

function isVideoStageTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(
    ".aframe-player-xr-hud, .xr-pc-workbench, .xr-pc-effects-panel, .xr-pc-effect-shortcut-overlay, .xr-pc-bgm-controls, .xr-session-player-ui"
  );
}

type RaycasterProbeElement = HTMLElement & {
  components?: {
    raycaster?: {
      intersectedEls?: HTMLElement[];
      intersections?: Array<{
        el?: HTMLElement;
        object?: {
          el?: HTMLElement;
        };
      }>;
    };
  };
};

function raycasterHits(probe: RaycasterProbeElement | null | undefined) {
  const raycaster = probe?.components?.raycaster;

  return [
    ...(raycaster?.intersections ?? []).map((intersection) => intersection.el ?? intersection.object?.el ?? null),
    ...(raycaster?.intersectedEls ?? [])
  ].filter(Boolean) as HTMLElement[];
}

function raycasterProbes(scene: HTMLElement | null) {
  if (!scene) {
    return [];
  }

  return [
    scene,
    scene.querySelector("a-cursor"),
    scene.querySelector("#main-camera"),
    scene.querySelector("#left-controller"),
    scene.querySelector("#right-controller"),
    ...Array.from(scene.querySelectorAll("[raycaster]"))
  ] as RaycasterProbeElement[];
}

function isAFramePointerBlocked(scene: HTMLElement | null) {
  if (scene?.getAttribute(SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE) === "true") {
    return true;
  }

  const hits = raycasterProbes(scene).flatMap(raycasterHits);
  const spatialUiHit = hits.find((hit) => hit.closest?.(`[${SPATIAL_UI_HIT_ATTRIBUTE}="true"]`));

  if (spatialUiHit) {
    return true;
  }

  const hit = hits[0] ?? null;

  if (!hit) {
    return false;
  }

  if (hit.closest?.(`[${PC_MASK_BACKGROUND_HIT_ATTRIBUTE}="true"]`)) {
    return false;
  }

  return Boolean(hit.closest?.("[data-ray-blocking='true'], [data-crop-arc-id]") ?? hit.classList.contains("clickable"));
}

function stopNativeInput(event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation?.();
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function usePcMaskPointerInput({
  cameraLookRef,
  cropMaskState,
  edgePan,
  mask,
  maskDragArmed,
  maskDragging,
  playbackState,
  sceneRef,
  setCameraCenter,
  setMaskDragging
}: {
  cameraLookRef: RefObject<PcViewCenter>;
  cropMaskState: { center: PcViewCenter };
  edgePan: PcEdgePanControls;
  mask: PcMaskOperations;
  maskDragArmed: boolean;
  maskDragging: boolean;
  playbackState: AFrame360PlaybackState;
  sceneRef: RefObject<HTMLElement | null>;
  setCameraCenter: (center: PcViewCenter, options?: { commit?: boolean; phase?: "change" | "end" }) => void;
  setMaskDragging: (dragging: boolean) => void;
}) {
  const centerFollowFrameRef = useRef<number | null>(null);
  const centerFollowClickBlockUntilRef = useRef(0);
  const centerFollowTargetRef = useRef({
    commandedCameraCenter: null as { center: PcViewCenter; until: number } | null,
    filteredCenter: null as PcViewCenter | null,
    lastTime: null as number | null,
    lineFilter: createLineRippleFilterState()
  });
  const centerFollowLookRef = useRef({
    filteredX: 0,
    filteredY: 0,
    lastTime: null as number | null,
    pendingX: 0,
    pendingY: 0,
    previousBodyCursor: null as string | null,
    previousDocumentCursor: null as string | null,
    previousStageCursor: null as string | null,
    stageElement: null as HTMLElement | null
  });
  const maskDragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const maskDragSmoothRef = useRef<{
    frame: number | null;
    lastTime: number | null;
    pendingPitch: number;
    pendingYaw: number;
  }>({
    frame: null,
    lastTime: null,
    pendingPitch: 0,
    pendingYaw: 0
  });
  const stagePointerRef = useRef<{
    id: number;
    lastX: number;
    lastY: number;
    mode: "center-follow" | "click-or-view" | "mask-drag";
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  const isCenterFollowRequested = () => isPcMaskCenterFollowKeyPressed();

  const viewCenterFromPointer = (x: number, y: number) => {
    const stage = sceneRef.current?.parentElement ?? document.documentElement;
    return screenPointToViewCenter({
      cameraLook: cameraLookRef.current ?? { pitch: 0, yaw: 0 },
      horizontalFov: playbackState.fov,
      stage,
      x,
      y
    });
  };

  const viewCenterFromCameraState = () => normalizeViewCenter(cameraLookRef.current ?? { pitch: 0, yaw: 0 });

  const spherePointFromCameraCenter = () => viewCenterToSpherePoint(viewCenterFromCameraState(), 1);

  const hideCenterFollowCursor = (stageElement?: HTMLElement | null) => {
    const look = centerFollowLookRef.current;
    const stage = stageElement ?? look.stageElement;

    if (look.previousDocumentCursor === null) {
      look.previousDocumentCursor = document.documentElement.style.cursor;
      look.previousBodyCursor = document.body.style.cursor;
    }
    if (stage && look.previousStageCursor === null) {
      look.previousStageCursor = stage.style.cursor;
    }

    document.documentElement.style.cursor = "none";
    document.body.style.cursor = "none";
    if (stage) {
      stage.style.cursor = "none";
    }
  };

  const restoreCenterFollowCursor = () => {
    const look = centerFollowLookRef.current;

    if (look.previousDocumentCursor !== null) {
      document.documentElement.style.cursor = look.previousDocumentCursor;
    }
    if (look.previousBodyCursor !== null) {
      document.body.style.cursor = look.previousBodyCursor;
    }
    if (look.stageElement && look.previousStageCursor !== null) {
      look.stageElement.style.cursor = look.previousStageCursor;
    }

    look.previousDocumentCursor = null;
    look.previousBodyCursor = null;
    look.previousStageCursor = null;
  };

  const requestCenterFollowPointerLock = (stageElement: HTMLElement) => {
    centerFollowLookRef.current.stageElement = stageElement;
    hideCenterFollowCursor(stageElement);

    try {
      const result = stageElement.requestPointerLock?.();
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch(() => undefined);
      }
    } catch {
      // Pointer lock can be denied by the browser; cursor hiding and edge fallback still work.
    }
  };

  const releaseCenterFollowPointerLock = () => {
    if (document.pointerLockElement === centerFollowLookRef.current.stageElement) {
      document.exitPointerLock?.();
    }
    restoreCenterFollowCursor();
    centerFollowLookRef.current.stageElement = null;
  };

  const clearCenterFollowLook = () => {
    const look = centerFollowLookRef.current;
    look.filteredX = 0;
    look.filteredY = 0;
    look.lastTime = null;
    look.pendingX = 0;
    look.pendingY = 0;
  };

  const queueCenterFollowLookDelta = (deltaX: number, deltaY: number) => {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return;
    }

    const look = centerFollowLookRef.current;
    look.pendingX += deltaX;
    look.pendingY += deltaY;
  };

  const resetCenterFollowTarget = (center: PcViewCenter) => {
    const normalized = normalizeViewCenter(center);
    const state = centerFollowTargetRef.current;
    state.commandedCameraCenter = {
      center: normalized,
      until: performance.now() + CENTER_FOLLOW_COMMAND_GRACE_MS
    };
    state.filteredCenter = normalized;
    state.lastTime = performance.now();
    resetLineRippleFilter(state.lineFilter, normalized);
  };

  const queueCenterFollowCameraCenter = (center: PcViewCenter) => {
    centerFollowTargetRef.current.commandedCameraCenter = {
      center: normalizeViewCenter(center),
      until: performance.now() + CENTER_FOLLOW_COMMAND_GRACE_MS
    };
  };

  const readCenterFollowCameraCenter = () => {
    const commanded = centerFollowTargetRef.current.commandedCameraCenter;
    if (commanded && performance.now() <= commanded.until) {
      return commanded.center;
    }

    centerFollowTargetRef.current.commandedCameraCenter = null;
    return viewCenterFromCameraState();
  };

  const smoothCenterFollowTarget = (rawCenter: PcViewCenter) => {
    const state = centerFollowTargetRef.current;
    const raw = normalizeViewCenter(rawCenter);
    const now = performance.now();

    if (!state.filteredCenter) {
      resetCenterFollowTarget(raw);
      return raw;
    }

    const deltaSeconds = Math.min(0.05, Math.max(1 / 120, (now - (state.lastTime ?? now)) / 1000));
    state.lastTime = now;

    const rawDelta = deltaToCenter(state.filteredCenter, raw);
    const rawDistance = vectorLength(rawDelta);
    if (rawDistance <= CENTER_FOLLOW_TARGET_DEADZONE_DEG) {
      resetLineRippleFilter(state.lineFilter, state.filteredCenter);
      return state.filteredCenter;
    }

    const correctedDelta = correctLineRippleDelta(state.lineFilter, rawDelta, {
      deadzoneDeg: CENTER_FOLLOW_TARGET_DEADZONE_DEG,
      lineLockStrength: 0.72,
      lowPassAlpha: 0.38,
      reorientDotThreshold: 0.42
    });
    const correctedDistance = vectorLength(correctedDelta);
    if (correctedDistance <= 0.0001) {
      return state.filteredCenter;
    }

    const responseScale = 1 - Math.exp(-deltaSeconds / CENTER_FOLLOW_TARGET_RESPONSE_SECONDS);
    const deadzoneScale = Math.max(0, (rawDistance - CENTER_FOLLOW_TARGET_DEADZONE_DEG) / rawDistance);
    const maxStep = CENTER_FOLLOW_TARGET_MAX_SPEED_DEG_PER_SECOND * deltaSeconds;
    const stepScale = Math.min(
      1,
      deadzoneScale,
      responseScale,
      maxStep / correctedDistance,
      rawDistance / correctedDistance
    );

    state.filteredCenter = normalizeViewCenter(addMotionDelta(state.filteredCenter, scaleVector(correctedDelta, stepScale)));
    return state.filteredCenter;
  };

  const applyCenterFollowLook = (time: number) => {
    if (stagePointerRef.current?.mode !== "center-follow") {
      return;
    }

    const look = centerFollowLookRef.current;
    const lastTime = look.lastTime ?? time;
    const deltaSeconds = Math.min(0.05, Math.max(1 / 120, (time - lastTime) / 1000));
    look.lastTime = time;

    const rawX = look.pendingX;
    const rawY = look.pendingY;
    look.pendingX = 0;
    look.pendingY = 0;

    const alpha = 1 - Math.exp(-deltaSeconds / CENTER_FOLLOW_LOOK_RESPONSE_SECONDS);
    look.filteredX += (rawX - look.filteredX) * alpha;
    look.filteredY += (rawY - look.filteredY) * alpha;

    const length = Math.hypot(look.filteredX, look.filteredY);
    if (length <= CENTER_FOLLOW_LOOK_DEADZONE_PX) {
      look.filteredX = 0;
      look.filteredY = 0;
      return;
    }

    const scale = Math.min(1, CENTER_FOLLOW_LOOK_MAX_STEP_PX / length);
    const stepX = look.filteredX * scale;
    const stepY = look.filteredY * scale;
    const current = viewCenterFromCameraState();
    const nextCamera = normalizeViewCenter({
      pitch: clampNumber(current.pitch - stepY * VIEW_DRAG_PITCH_PER_PX, -70, 70),
      yaw: current.yaw + stepX * VIEW_DRAG_YAW_PER_PX
    });

    queueCenterFollowCameraCenter(nextCamera);
    setCameraCenter(nextCamera, { commit: false, phase: "change" });
  };

  const cancelSmoothMaskDrag = () => {
    const smooth = maskDragSmoothRef.current;
    if (smooth.frame !== null) {
      window.cancelAnimationFrame(smooth.frame);
    }
    smooth.frame = null;
    smooth.lastTime = null;
    smooth.pendingPitch = 0;
    smooth.pendingYaw = 0;
  };

  const cancelCenterFollow = () => {
    if (centerFollowFrameRef.current !== null) {
      window.cancelAnimationFrame(centerFollowFrameRef.current);
      centerFollowFrameRef.current = null;
    }
  };

  const ensureCenterFollow = () => {
    if (centerFollowFrameRef.current !== null) {
      return;
    }

    const tick = (time: number) => {
      applyCenterFollowLook(time);
      mask.trackMaskToCenter(smoothCenterFollowTarget(readCenterFollowCameraCenter()), CENTER_FOLLOW_RESPONSE_MS);
      centerFollowFrameRef.current = window.requestAnimationFrame(tick);
    };

    centerFollowFrameRef.current = window.requestAnimationFrame(tick);
  };

  const startCenterFollow = (event: ReactPointerEvent<HTMLElement>) => {
    stopNativeInput(event);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    requestCenterFollowPointerLock(event.currentTarget);

    centerFollowClickBlockUntilRef.current = performance.now() + 350;
    const cameraCenter = directionToViewCenter(spherePointFromCameraCenter());
    mask.stopMotion();
    clearCenterFollowLook();
    mask.syncMotionState({
      camera: cameraCenter,
      mask: cropMaskState.center
    });
    resetCenterFollowTarget(cameraCenter);

    stagePointerRef.current = {
      id: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      mode: "center-follow",
      startX: event.clientX,
      startY: event.clientY,
      dragging: true
    };
    maskDragPointerRef.current = { x: event.clientX, y: event.clientY };
    setPcEditorPointerState({
      draggingMask: true,
      lastScreen: {
        x: event.clientX,
        y: event.clientY
      },
      primaryDown: true
    });
    setMaskDragging(true);
    mask.trackMaskToCenter(cameraCenter, CENTER_FOLLOW_RESPONSE_MS);
    ensureCenterFollow();
  };

  const endCenterFollow = (
    screen?: { x: number; y: number },
    capture?: { element: HTMLElement; pointerId: number }
  ) => {
    const active = stagePointerRef.current;
    if (!active || active.mode !== "center-follow") {
      return false;
    }

    const captureElement = capture?.element ?? centerFollowLookRef.current.stageElement;
    const pointerId = capture?.pointerId ?? active.id;
    if (captureElement?.hasPointerCapture(pointerId)) {
      captureElement.releasePointerCapture(pointerId);
    }

    stagePointerRef.current = null;
    maskDragPointerRef.current = null;
    cancelCenterFollow();
    clearCenterFollowLook();
    releaseCenterFollowPointerLock();
    centerFollowClickBlockUntilRef.current = performance.now() + 450;
    edgePan.stopEdgePan();
    setMaskDragging(false);
    setCameraCenter(viewCenterFromCameraState(), { commit: true, phase: "end" });
    setPcEditorPointerState({
      draggingMask: false,
      ...(screen ? { lastScreen: screen } : {}),
      primaryDown: false
    });
    return true;
  };

  const ensureSmoothMaskDrag = () => {
    const smooth = maskDragSmoothRef.current;
    if (smooth.frame !== null) {
      return;
    }

    const tick = (time: number) => {
      const active = maskDragSmoothRef.current;
      const lastTime = active.lastTime ?? time;
      const deltaSeconds = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      active.lastTime = time;

      const remaining = Math.hypot(active.pendingYaw, active.pendingPitch);
      if (remaining <= MASK_DRAG_SETTLE_EPSILON_DEG) {
        active.pendingYaw = 0;
        active.pendingPitch = 0;
        active.lastTime = null;
        active.frame = null;
        return;
      }

      const alpha = 1 - Math.exp(-deltaSeconds / MASK_DRAG_SMOOTH_RESPONSE_SECONDS);
      const maxStep = Math.max(
        MASK_DRAG_SETTLE_EPSILON_DEG,
        MASK_DRAG_MAX_SMOOTH_SPEED_DEG_PER_SECOND * Math.max(deltaSeconds, 1 / 120)
      );
      const stepScale = Math.min(alpha, maxStep / remaining, 1);
      const stepYaw = active.pendingYaw * stepScale;
      const stepPitch = active.pendingPitch * stepScale;

      active.pendingYaw -= stepYaw;
      active.pendingPitch -= stepPitch;
      mask.nudgePreviewCenterBy(stepYaw, stepPitch);
      active.frame = window.requestAnimationFrame(tick);
    };

    smooth.frame = window.requestAnimationFrame(tick);
  };

  const queueSmoothMaskNudge = (deltaYaw: number, deltaPitch: number) => {
    const smooth = maskDragSmoothRef.current;
    smooth.pendingYaw += deltaYaw;
    smooth.pendingPitch += deltaPitch;
    ensureSmoothMaskDrag();
  };

  const stopMaskPointerDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    maskDragPointerRef.current = null;
    stagePointerRef.current = null;
    cancelCenterFollow();
    cancelSmoothMaskDrag();
    clearCenterFollowLook();
    releaseCenterFollowPointerLock();
    mask.stopMotion();
    edgePan.stopEdgePan();
    setMaskDragging(false);
    setPcEditorPointerState({
      draggingMask: false,
      primaryDown: false
    });
  };

  useEffect(() => () => {
    cancelCenterFollow();
    cancelSmoothMaskDrag();
    clearCenterFollowLook();
    releaseCenterFollowPointerLock();
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (stagePointerRef.current?.mode !== "center-follow") {
        return;
      }

      if (document.pointerLockElement !== centerFollowLookRef.current.stageElement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      queueCenterFollowLookDelta(event.movementX, event.movementY);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0 || stagePointerRef.current?.mode !== "center-follow") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      endCenterFollow({ x: event.clientX, y: event.clientY });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyV" || isEditableKeyboardTarget(event.target)) {
        return;
      }

      hideCenterFollowCursor();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "KeyV") {
        return;
      }

      if (endCenterFollow()) {
        return;
      }

      restoreCenterFollowCursor();
    };

    const handlePointerLockChange = () => {
      if (document.pointerLockElement !== centerFollowLookRef.current.stageElement && stagePointerRef.current?.mode !== "center-follow") {
        restoreCenterFollowCursor();
      }
    };

    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
    };
  }, []);

  return {
    handleMaskClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (!isCenterFollowRequested() && performance.now() > centerFollowClickBlockUntilRef.current) {
        return;
      }
      if (isInteractiveTarget(event.target) || isAFramePointerBlocked(sceneRef.current) || !isVideoStageTarget(event.target)) {
        return;
      }

      stopNativeInput(event);
    },
    handleMaskMouseDownCapture(event: ReactMouseEvent<HTMLElement>) {
      if (!isCenterFollowRequested() && stagePointerRef.current?.mode !== "center-follow") {
        return;
      }
      if (isInteractiveTarget(event.target) || isAFramePointerBlocked(sceneRef.current) || !isVideoStageTarget(event.target)) {
        return;
      }

      stopNativeInput(event);
    },
    handleMaskPointerDownCapture(event: ReactPointerEvent<HTMLElement>) {
      if (!isCenterFollowRequested() || event.button !== 0) {
        return;
      }
      if (isInteractiveTarget(event.target) || isAFramePointerBlocked(sceneRef.current) || !isVideoStageTarget(event.target)) {
        return;
      }

      startCenterFollow(event);
    },
    handleMaskPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (isInteractiveTarget(event.target) || isAFramePointerBlocked(sceneRef.current) || !isVideoStageTarget(event.target) || event.button !== 0) {
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        mask.moveMaskTo(viewCenterFromPointer(event.clientX, event.clientY), 1000);
        return;
      }

      const mode = isCenterFollowRequested() ? "center-follow" : maskDragArmed ? "mask-drag" : "click-or-view";

      if (mode === "center-follow") {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      stagePointerRef.current = {
        id: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false
      };
      maskDragPointerRef.current = { x: event.clientX, y: event.clientY };
      setPcEditorPointerState({
        draggingMask: stagePointerRef.current.mode !== "click-or-view",
        lastScreen: {
          x: event.clientX,
          y: event.clientY
        },
        primaryDown: true
      });
      if (stagePointerRef.current.mode === "mask-drag") {
        setMaskDragging(true);
      }
    },
    handleMaskPointerLeave() {
      if (!maskDragging) {
        maskDragPointerRef.current = null;
      }
    },
    handleMaskPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const active = stagePointerRef.current;
      if (!active || active.id !== event.pointerId || !maskDragPointerRef.current) {
        return;
      }

      if (active.mode === "center-follow") {
        stopNativeInput(event);
        const deltaX = event.clientX - active.lastX;
        const deltaY = event.clientY - active.lastY;
        active.lastX = event.clientX;
        active.lastY = event.clientY;
        active.dragging = true;
        setPcEditorPointerState({
          draggingMask: true,
          lastScreen: {
            x: event.clientX,
            y: event.clientY
          },
          primaryDown: true
        });
        if (document.pointerLockElement !== centerFollowLookRef.current.stageElement) {
          queueCenterFollowLookDelta(deltaX, deltaY);
        }
        return;
      }

      if (active.mode === "click-or-view") {
        const deltaX = event.clientX - active.lastX;
        const deltaY = event.clientY - active.lastY;
        const travel = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
        active.lastX = event.clientX;
        active.lastY = event.clientY;
        setPcEditorPointerState({
          draggingMask: false,
          lastScreen: {
            x: event.clientX,
            y: event.clientY
          },
          primaryDown: true
        });

        if (travel > MASK_CLICK_MAX_TRAVEL_PX) {
          active.dragging = true;
        }

        if (!active.dragging || (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1)) {
          return;
        }

        event.preventDefault();
        maskDragPointerRef.current = { x: event.clientX, y: event.clientY };
        const current = cameraLookRef.current ?? { pitch: 0, yaw: 0 };
        const nextCamera = {
          pitch: current.pitch - deltaY * VIEW_DRAG_PITCH_PER_PX,
          yaw: current.yaw + deltaX * VIEW_DRAG_YAW_PER_PX
        };
        setCameraCenter(nextCamera, { commit: false, phase: "change" });
        return;
      }

      if (!maskDragging || !maskDragPointerRef.current) {
        return;
      }

      event.preventDefault();
      const deltaX = event.clientX - maskDragPointerRef.current.x;
      const deltaY = event.clientY - maskDragPointerRef.current.y;
      maskDragPointerRef.current = { x: event.clientX, y: event.clientY };
      setPcEditorPointerState({
        draggingMask: true,
        lastScreen: {
          x: event.clientX,
          y: event.clientY
        },
        primaryDown: true
      });

      if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) {
        return;
      }

      active.dragging = true;

      const stage = sceneRef.current?.parentElement ?? document.documentElement;
      const bounds = stage.getBoundingClientRect();
      const thresholdX = bounds.width * MASK_DRAG_CAMERA_THRESHOLD_RATIO;
      const thresholdY = bounds.height * MASK_DRAG_CAMERA_THRESHOLD_RATIO;
      const offsetX = event.clientX - active.startX;
      const offsetY = event.clientY - active.startY;
      const excessX = Math.abs(offsetX) > thresholdX ? offsetX - Math.sign(offsetX) * thresholdX : 0;
      const excessY = Math.abs(offsetY) > thresholdY ? offsetY - Math.sign(offsetY) * thresholdY : 0;

      if (Math.abs(excessX) > 1 || Math.abs(excessY) > 1) {
        const current = cameraLookRef.current ?? { pitch: 0, yaw: 0 };
        setCameraCenter({
          pitch: current.pitch - excessY * MASK_DRAG_CAMERA_SPEED_PER_PX,
          yaw: current.yaw + excessX * MASK_DRAG_CAMERA_SPEED_PER_PX
        });
      }

      queueSmoothMaskNudge(deltaX * MASK_DRAG_YAW_PER_PX, -deltaY * MASK_DRAG_PITCH_PER_PX);
    },
    handleMaskPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const active = stagePointerRef.current;
      if (!active || active.id !== event.pointerId) {
        return;
      }

      if (active.mode === "center-follow") {
        stopNativeInput(event);
        endCenterFollow(
          {
            x: event.clientX,
            y: event.clientY
          },
          {
            element: event.currentTarget,
            pointerId: event.pointerId
          }
        );
        return;
      }

      stagePointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (active.mode === "mask-drag") {
        if (!active.dragging && !isInteractiveTarget(event.target) && isVideoStageTarget(event.target)) {
          event.preventDefault();
          mask.moveMaskTo(viewCenterFromPointer(event.clientX, event.clientY), 0);
        }
        maskDragPointerRef.current = null;
        cancelCenterFollow();
        mask.stopMotion();
        edgePan.stopEdgePan();
        setMaskDragging(false);
        setPcEditorPointerState({
          draggingMask: false,
          lastScreen: {
            x: event.clientX,
            y: event.clientY
          },
          primaryDown: false
        });
        return;
      }

      const travel = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
      if (
        active.dragging ||
        travel > MASK_CLICK_MAX_TRAVEL_PX ||
        isInteractiveTarget(event.target) ||
        isAFramePointerBlocked(sceneRef.current) ||
        !isVideoStageTarget(event.target)
      ) {
        maskDragPointerRef.current = null;
        edgePan.stopEdgePan();
        setMaskDragging(false);
        if (active.dragging) {
          setCameraCenter(cameraLookRef.current ?? { pitch: 0, yaw: 0 }, { commit: true, phase: "end" });
        }
        setPcEditorPointerState({
          draggingMask: false,
          lastScreen: {
            x: event.clientX,
            y: event.clientY
          },
          primaryDown: false
        });
        return;
      }

      event.preventDefault();
      maskDragPointerRef.current = null;
      edgePan.stopEdgePan();
      setMaskDragging(false);
      setPcEditorPointerState({
        draggingMask: false,
        lastScreen: {
          x: event.clientX,
          y: event.clientY
        },
        primaryDown: false
      });
      mask.moveMaskTo(viewCenterFromPointer(event.clientX, event.clientY), 520);
    },
    stopMaskPointerDrag
  };
}
