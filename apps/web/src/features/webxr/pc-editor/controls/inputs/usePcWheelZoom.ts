"use client";

import type { MutableRefObject, WheelEvent as ReactWheelEvent } from "react";
import type { PcPlaybackOperations } from "../operations/playbackOperations";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcRateWheelTarget } from "../operations/rateCurve";
import type { PcRecordingOperations } from "../operations/recordingOperations";
import type { AFrame360VideoCommand, AFrame360VideoCommandPayload } from "../types";
import { isInteractiveTarget } from "./domTargetGuards";

const MASK_OPACITY_MIN = 0;
const MASK_OPACITY_MAX = 0.95;

function clampMaskOpacity(opacity: number) {
  return Math.min(MASK_OPACITY_MAX, Math.max(MASK_OPACITY_MIN, opacity));
}

export function usePcWheelZoom({
  mask,
  maskOpacity,
  pcWorkbench,
  playback,
  rateWheelTarget,
  rateWheelTargetRef,
  recording,
  runCommand
}: {
  mask: PcMaskOperations;
  maskOpacity: number;
  pcWorkbench: boolean;
  playback: PcPlaybackOperations;
  rateWheelTarget: PcRateWheelTarget;
  rateWheelTargetRef: MutableRefObject<PcRateWheelTarget>;
  recording: PcRecordingOperations;
  runCommand: (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => void | Promise<void>;
}) {
  return function handleStageWheel(event: ReactWheelEvent<HTMLElement>) {
    if (!pcWorkbench || isInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
    const activeWheelTarget = rateWheelTargetRef.current ?? rateWheelTarget;

    if (activeWheelTarget === "playback") {
      playback.adjustPlaybackRateByWheel(event.deltaY);
      return;
    }

    if (activeWheelTarget === "recording") {
      recording.adjustRecordingRateByWheel(event.deltaY);
      return;
    }

    if (activeWheelTarget === "mask-opacity") {
      const direction = event.deltaY < 0 ? 1 : -1;
      const wheelUnits = Math.min(8, Math.max(0.5, Math.abs(event.deltaY) / 120));
      mask.setPreviewMaskOpacity(clampMaskOpacity(maskOpacity + direction * 0.035 * wheelUnits), 0);
      return;
    }

    void runCommand(event.deltaY < 0 ? "zoom-in" : "zoom-out");
  };
}
