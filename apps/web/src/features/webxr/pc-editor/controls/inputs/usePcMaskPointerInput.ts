"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { AFrame360PlaybackState } from "../types";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";
import { screenPointToViewCenter } from "../operations/viewGeometry";
import { isInteractiveTarget } from "./domTargetGuards";
import type { PcEdgePanControls } from "./usePcEdgePan";

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

function isVideoStageTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(
    ".aframe-player-xr-hud, .xr-pc-workbench, .xr-pc-effects-panel, .xr-pc-effect-shortcut-overlay, .xr-pc-bgm-controls, .xr-session-player-ui"
  );
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
  setCameraCenter: (center: PcViewCenter) => void;
  setMaskDragging: (dragging: boolean) => void;
}) {
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
    mode: "click-or-view" | "mask-drag";
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

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
    cancelSmoothMaskDrag();
    edgePan.stopEdgePan();
    setMaskDragging(false);
  };

  useEffect(() => () => {
    cancelSmoothMaskDrag();
  }, []);

  return {
    handleMaskPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (isInteractiveTarget(event.target) || !isVideoStageTarget(event.target) || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      if (event.shiftKey) {
        mask.moveMaskTo(viewCenterFromPointer(event.clientX, event.clientY), 1000);
        return;
      }

      stagePointerRef.current = {
        id: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        mode: maskDragArmed || event.ctrlKey ? "mask-drag" : "click-or-view",
        startX: event.clientX,
        startY: event.clientY,
        dragging: false
      };
      maskDragPointerRef.current = { x: event.clientX, y: event.clientY };
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

      if (active.mode === "click-or-view") {
        const deltaX = event.clientX - active.lastX;
        const deltaY = event.clientY - active.lastY;
        const travel = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
        active.lastX = event.clientX;
        active.lastY = event.clientY;

        if (travel > MASK_CLICK_MAX_TRAVEL_PX) {
          active.dragging = true;
        }

        if (!active.dragging || (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1)) {
          return;
        }

        event.preventDefault();
        maskDragPointerRef.current = { x: event.clientX, y: event.clientY };
        const current = cameraLookRef.current ?? { pitch: 0, yaw: 0 };
        setCameraCenter({
          pitch: current.pitch - deltaY * VIEW_DRAG_PITCH_PER_PX,
          yaw: current.yaw + deltaX * VIEW_DRAG_YAW_PER_PX
        });
        return;
      }

      if (!maskDragging || !maskDragPointerRef.current) {
        return;
      }

      event.preventDefault();
      const deltaX = event.clientX - maskDragPointerRef.current.x;
      const deltaY = event.clientY - maskDragPointerRef.current.y;
      maskDragPointerRef.current = { x: event.clientX, y: event.clientY };

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
        edgePan.stopEdgePan();
        setMaskDragging(false);
        return;
      }

      const travel = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
      if (active.dragging || travel > MASK_CLICK_MAX_TRAVEL_PX || isInteractiveTarget(event.target) || !isVideoStageTarget(event.target)) {
        maskDragPointerRef.current = null;
        edgePan.stopEdgePan();
        setMaskDragging(false);
        return;
      }

      event.preventDefault();
      maskDragPointerRef.current = null;
      edgePan.stopEdgePan();
      setMaskDragging(false);
      mask.moveMaskTo(viewCenterFromPointer(event.clientX, event.clientY), 520);
    },
    stopMaskPointerDrag
  };
}
