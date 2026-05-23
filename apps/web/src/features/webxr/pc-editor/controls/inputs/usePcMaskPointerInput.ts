"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { AFrame360PlaybackState } from "../types";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";
import { screenPointToViewCenter } from "../operations/viewGeometry";
import { isInteractiveTarget } from "./domTargetGuards";
import type { PcEdgePanControls } from "./usePcEdgePan";

const MASK_DRAG_YAW_PER_PX = 0.12;
const MASK_DRAG_PITCH_PER_PX = 0.12;
const MASK_CLICK_MAX_TRAVEL_PX = 6;
const VIEW_DRAG_YAW_PER_PX = 0.11;
const VIEW_DRAG_PITCH_PER_PX = 0.11;

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

  const stopMaskPointerDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    maskDragPointerRef.current = null;
    stagePointerRef.current = null;
    edgePan.stopEdgePan();
    setMaskDragging(false);
  };

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
        edgePan.startEdgePanFromPointer(event.clientX, event.clientY);
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
      edgePan.updateEdgePanFromPointer(event.clientX, event.clientY);

      if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) {
        return;
      }

      active.dragging = true;
      mask.nudgePreviewCenterBy(deltaX * MASK_DRAG_YAW_PER_PX, -deltaY * MASK_DRAG_PITCH_PER_PX);
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
