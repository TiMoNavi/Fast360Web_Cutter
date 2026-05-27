"use client";

import type { MutableRefObject, WheelEvent as ReactWheelEvent } from "react";
import type { PcPlaybackOperations } from "../operations/playbackOperations";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcRateWheelTarget } from "../operations/rateCurve";
import type { PcRecordingOperations } from "../operations/recordingOperations";
import type { AFrame360VideoCommand, AFrame360VideoCommandPayload } from "../types";
import { maskOpacityFromWheel } from "../../mask_controller/operations/maskOpacityWheel";
import { isInteractiveTarget } from "./domTargetGuards";

export function usePcWheelZoom({
  mask,
  maskOpacity,
  onEffectSpeedWheel,
  pcWorkbench,
  playback,
  rateWheelTarget,
  rateWheelTargetRef,
  recording,
  runCommand
}: {
  mask: PcMaskOperations;
  maskOpacity: number;
  onEffectSpeedWheel: (deltaY: number) => void;
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

    if (activeWheelTarget === "effect-speed") {
      onEffectSpeedWheel(event.deltaY);
      return;
    }

    if (activeWheelTarget === "mask-opacity") {
      mask.setPreviewMaskOpacity(maskOpacityFromWheel(maskOpacity, event.deltaY), 0);
      return;
    }

    void runCommand(event.deltaY < 0 ? "zoom-in" : "zoom-out");
  };
}
