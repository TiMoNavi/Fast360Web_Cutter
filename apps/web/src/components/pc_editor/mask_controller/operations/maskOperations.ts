import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import {
  MAX_CROP_FOV_H,
  MIN_CROP_FOV_H,
  WEBXR_CROP_MASK_CENTER_EVENT,
  WEBXR_CROP_MASK_FOV_EVENT,
  WEBXR_CROP_MASK_LOCK_EVENT,
  WEBXR_CROP_MASK_OPACITY_EVENT,
  type CropMaskState
} from "../webxr/AFrameCropViewportMask";
import type { PcTrajectoryRippleCorrectorHandle, PcViewCenter } from "../PcTrajectoryRippleCorrector";
import type { PcTimelineOperations } from "./timelineOperations";
import { normalizeViewCenter } from "./viewGeometry";

export type PcMaskOperations = {
  bindMaskAndCameraBy: (deltaYaw: number, deltaPitch: number, durationMs?: number) => void;
  moveMaskBy: (deltaYaw: number, deltaPitch: number, durationMs?: number) => void;
  moveMaskTo: (center: PcViewCenter, durationMs?: number) => void;
  nudgePreviewCenterBy: (deltaYaw: number, deltaPitch: number) => void;
  setPreviewCenter: (center: PcViewCenter) => void;
  setPreviewFov: (fovH: number, durationMs?: number) => void;
  setPreviewLocked: (locked: boolean) => void;
  setPreviewMaskOpacity: (opacity: number, durationMs?: number) => void;
  stopMotion: () => void;
  syncMotionState: (state: { camera: PcViewCenter; mask: PcViewCenter }) => void;
  trackMaskToCenter: (center: PcViewCenter, durationMs?: number) => void;
};

export function createPcMaskOperations({
  cropMaskState,
  setCropMaskState,
  fovAnimationRef,
  smoothFlushTimerRef,
  timeline,
  trajectoryCorrectorRef
}: {
  cropMaskState: CropMaskState;
  fovAnimationRef: MutableRefObject<number | null>;
  setCropMaskState: Dispatch<SetStateAction<CropMaskState>>;
  smoothFlushTimerRef: MutableRefObject<number | null>;
  timeline: PcTimelineOperations;
  trajectoryCorrectorRef: RefObject<PcTrajectoryRippleCorrectorHandle | null>;
}): PcMaskOperations {
  const emitFov = (fovH: number) => {
    const nextFov = Math.min(MAX_CROP_FOV_H, Math.max(MIN_CROP_FOV_H, fovH));
    window.dispatchEvent(
      new CustomEvent(WEBXR_CROP_MASK_FOV_EVENT, {
        detail: {
          fovH: nextFov
        }
      })
    );
  };

  const scheduleFlush = (reason: Parameters<PcTimelineOperations["flushTimeline"]>[0], delayMs: number) => {
    if (smoothFlushTimerRef.current !== null) {
      window.clearTimeout(smoothFlushTimerRef.current);
    }
    smoothFlushTimerRef.current = window.setTimeout(() => {
      smoothFlushTimerRef.current = null;
      timeline.flushTimeline(reason);
    }, Math.max(0, delayMs));
  };

  const animateFov = (targetFovH: number, durationMs = 180) => {
    if (fovAnimationRef.current !== null) {
      window.cancelAnimationFrame(fovAnimationRef.current);
      fovAnimationRef.current = null;
    }

    const from = cropMaskState.fov.h;
    const to = Math.min(MAX_CROP_FOV_H, Math.max(MIN_CROP_FOV_H, targetFovH));
    const startedAt = performance.now();

    if (durationMs <= 0) {
      emitFov(to);
      scheduleFlush("fov", 140);
      return;
    }

    const tick = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - startedAt) / Math.max(durationMs, 1)));
      const eased = progress * progress * (3 - 2 * progress);
      emitFov(from + (to - from) * eased);

      if (progress >= 1) {
        fovAnimationRef.current = null;
        timeline.flushTimeline("fov");
        return;
      }

      fovAnimationRef.current = window.requestAnimationFrame(tick);
    };

    fovAnimationRef.current = window.requestAnimationFrame(tick);
  };

  const setPreviewCenter = (center: PcViewCenter) => {
    const nextCenter = normalizeViewCenter(center);
    setCropMaskState((state) => ({
      ...state,
      center: nextCenter,
      input: "keyboard"
    }));
    window.dispatchEvent(
      new CustomEvent(WEBXR_CROP_MASK_CENTER_EVENT, {
        detail: nextCenter
      })
    );
    scheduleFlush("lock", 120);
  };

  return {
    bindMaskAndCameraBy(deltaYaw, deltaPitch, durationMs = 130) {
      trajectoryCorrectorRef.current?.bindMove({ pitch: deltaPitch, yaw: deltaYaw }, durationMs);
    },
    moveMaskBy(deltaYaw, deltaPitch, durationMs = 220) {
      trajectoryCorrectorRef.current?.moveMaskTo({
        pitch: cropMaskState.center.pitch + deltaPitch,
        yaw: cropMaskState.center.yaw + deltaYaw
      }, durationMs);
    },
    moveMaskTo(center, durationMs = 220) {
      trajectoryCorrectorRef.current?.moveMaskTo(center, durationMs);
      scheduleFlush("lock", durationMs + 140);
    },
    nudgePreviewCenterBy(deltaYaw, deltaPitch) {
      setCropMaskState((state) => {
        const nextCenter = normalizeViewCenter({
          pitch: state.center.pitch + deltaPitch,
          yaw: state.center.yaw + deltaYaw
        });
        window.dispatchEvent(
          new CustomEvent(WEBXR_CROP_MASK_CENTER_EVENT, {
            detail: nextCenter
          })
        );
        return {
          ...state,
          center: nextCenter,
          input: "keyboard"
        };
      });
      scheduleFlush("lock", 120);
    },
    setPreviewCenter,
    setPreviewFov(fovH, durationMs = 180) {
      animateFov(fovH, durationMs);
    },
    setPreviewLocked(locked) {
      setCropMaskState((state) => ({
        ...state,
        input: locked ? "keyboard" : "head_gaze",
        locked,
        smoothFollow: !locked
      }));
      window.dispatchEvent(
        new CustomEvent(WEBXR_CROP_MASK_LOCK_EVENT, {
          detail: {
            locked
          }
        })
      );
      timeline.flushTimeline("lock");
    },
    setPreviewMaskOpacity(opacity, durationMs = 0) {
      setCropMaskState((state) => ({
        ...state,
        maskOpacity: opacity
      }));
      window.dispatchEvent(
        new CustomEvent(WEBXR_CROP_MASK_OPACITY_EVENT, {
          detail: {
            durationMs,
            opacity
          }
        })
      );
    },
    stopMotion() {
      trajectoryCorrectorRef.current?.stop();
      scheduleFlush("lock", 120);
    },
    syncMotionState(state) {
      trajectoryCorrectorRef.current?.sync(state);
    },
    trackMaskToCenter(center, durationMs = 180) {
      trajectoryCorrectorRef.current?.trackMaskToCenter(center, durationMs);
      scheduleFlush("lock", durationMs + 140);
    }
  };
}
