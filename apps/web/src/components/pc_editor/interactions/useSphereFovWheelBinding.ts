"use client";

import { useCallback, type WheelEvent as ReactWheelEvent } from "react";
import { usePcEditorEventEmitter } from "../events";
import { maskOpacityFromWheel } from "../mask_controller/operations/maskOpacityWheel";
import { getPcEditorRuntimeState } from "../state";
import { rateFromAdaptiveWheel } from "../controls/operations/rateCurve";

function isInteractiveWheelTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("button,a,input,textarea,select,[contenteditable='true'],[role='button']"));
}

export function useSphereFovWheelBinding({
  enabled = true
}: {
  enabled?: boolean;
} = {}) {
  const emit = usePcEditorEventEmitter();

  return useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (!enabled || isInteractiveWheelTarget(event.target)) {
      return;
    }

    const pressed = getPcEditorRuntimeState().keyboard.pressed;
    const wheelTarget =
      pressed.KeyH ? "mask-opacity" :
      pressed.KeyZ ? "playback" :
      pressed.KeyX ? "recording" :
      pressed.KeyC ? "effect-speed" :
      null;

    if (wheelTarget) {
      const runtime = getPcEditorRuntimeState();

      if (wheelTarget === "mask-opacity") {
        emit({
          type: "editor.mask.opacity.set",
          payload: {
            durationMs: 0,
            opacity: maskOpacityFromWheel(runtime.viewTarget?.maskOpacity ?? runtime.cropMask?.maskOpacity ?? 0.74, event.deltaY)
          },
          source: {
            kind: "gesture",
            id: "pc-mask-opacity-wheel",
            device: "pc"
          }
        });
      } else if (wheelTarget === "playback") {
        emit({
          type: "player.playback.rate.set",
          payload: {
            playbackRate: rateFromAdaptiveWheel(runtime.playback?.playbackRate ?? 1, event.deltaY)
          },
          source: {
            kind: "gesture",
            id: "pc-playback-rate-wheel",
            device: "pc"
          }
        });
      } else if (wheelTarget === "recording") {
        emit({
          type: "player.recording.rate.set",
          payload: {
            recordingRate: rateFromAdaptiveWheel(runtime.rates.recordingRate, event.deltaY)
          },
          source: {
            kind: "gesture",
            id: "pc-recording-rate-wheel",
            device: "pc"
          }
        });
      } else {
        emit({
          type: "editor.effects.speed.set",
          payload: {
            effectSpeed: rateFromAdaptiveWheel(runtime.rates.effectSpeed, event.deltaY)
          },
          source: {
            kind: "gesture",
            id: "pc-effect-speed-wheel",
            device: "pc"
          }
        });
      }

      return;
    }

    const wheelUnits = Math.min(8, Math.max(0.5, Math.abs(event.deltaY) / 120));
    const delta = (event.deltaY < 0 ? -1 : 1) * 6 * wheelUnits;

    emit({
      type: "editor.sphere.fov.step",
      payload: { delta },
      source: {
        kind: "gesture",
        id: "pc-sphere-fov-wheel",
        device: "pc"
      }
    });
  }, [emit, enabled]);
}
