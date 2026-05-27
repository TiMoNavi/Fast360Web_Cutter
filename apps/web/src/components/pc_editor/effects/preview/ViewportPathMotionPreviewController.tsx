"use client";

import { useEffect, useRef } from "react";
import { verticalFovFromHorizontal } from "../../mask_controller";
import { usePcEditorEventSubscription } from "../../events";
import {
  getPcEditorRuntimeState,
  setPcEditorViewTarget,
  type PcEditorViewTargetRuntimeState
} from "../../state";
import { previewElapsedMs, readEffectTiming, readNumberParam, scaleTemporalParams } from "../timing";

const MIN_CAMERA_FOV_H = 35;
const MAX_CAMERA_FOV_H = 140;

type ViewTargetSnapshot = Omit<PcEditorViewTargetRuntimeState, "updatedAt">;
type CameraMotionPreset = {
  defaultDurationMs: number;
  defaultParams: Record<string, number | string>;
  id: "hero-push" | "reveal-pull" | "drift-left-parallax" | "impact-shake" | "look-around";
};

const CAMERA_MOTION_PRESETS: Record<string, CameraMotionPreset> = {
  "hero-push": {
    defaultDurationMs: 900,
    defaultParams: {
      deltaFovH: -10,
      peakAtRatio: 0.72,
      reboundFovH: 1
    },
    id: "hero-push"
  },
  "frame.hero_push": {
    defaultDurationMs: 900,
    defaultParams: {
      deltaFovH: -10,
      peakAtRatio: 0.72,
      reboundFovH: 1
    },
    id: "hero-push"
  },
  "reveal-pull": {
    defaultDurationMs: 1400,
    defaultParams: {
      deltaFovH: 14,
      deltaPitch: 2
    },
    id: "reveal-pull"
  },
  "frame.reveal_pull": {
    defaultDurationMs: 1400,
    defaultParams: {
      deltaFovH: 14,
      deltaPitch: 2
    },
    id: "reveal-pull"
  },
  "drift-left-parallax": {
    defaultDurationMs: 1600,
    defaultParams: {
      deltaFovH: -3,
      deltaYaw: -8
    },
    id: "drift-left-parallax"
  },
  "frame.drift_left_parallax": {
    defaultDurationMs: 1600,
    defaultParams: {
      deltaFovH: -3,
      deltaYaw: -8
    },
    id: "drift-left-parallax"
  },
  "impact-shake": {
    defaultDurationMs: 620,
    defaultParams: {
      amplitudePitch: 1.4,
      amplitudeYaw: 2.6,
      decay: 0.62,
      shakes: 4
    },
    id: "impact-shake"
  },
  "frame.impact_shake": {
    defaultDurationMs: 620,
    defaultParams: {
      amplitudePitch: 1.4,
      amplitudeYaw: 2.6,
      decay: 0.62,
      shakes: 4
    },
    id: "impact-shake"
  },
  "look-around": {
    defaultDurationMs: 2200,
    defaultParams: {
      returnYaw: -10,
      sweepYaw: 28,
      widenFovH: 3
    },
    id: "look-around"
  },
  "frame.look_around": {
    defaultDurationMs: 2200,
    defaultParams: {
      returnYaw: -10,
      sweepYaw: 28,
      widenFovH: 3
    },
    id: "look-around"
  },
  "push-in": {
    defaultDurationMs: 900,
    defaultParams: {
      deltaFovH: -10,
      peakAtRatio: 0.72,
      reboundFovH: 1
    },
    id: "hero-push"
  },
  "pull-out": {
    defaultDurationMs: 1400,
    defaultParams: {
      deltaFovH: 14,
      deltaPitch: 2
    },
    id: "reveal-pull"
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function normalizeYaw(yaw: number) {
  return ((((yaw + 180) % 360) + 360) % 360) - 180;
}

function lerpYaw(from: number, to: number, progress: number) {
  return normalizeYaw(from + normalizeYaw(to - from) * progress);
}

function easeInOut(progress: number) {
  const t = clamp(progress, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOut(progress: number) {
  const t = clamp(progress, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function readStringPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readRecordPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readNumberPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mergeParams(...params: Array<Record<string, unknown> | null | undefined>) {
  return params.reduce<Record<string, unknown>>((merged, value) => {
    if (!value) {
      return merged;
    }

    return {
      ...merged,
      ...value
    };
  }, {});
}

function readCurrentViewTarget(): ViewTargetSnapshot {
  const runtime = getPcEditorRuntimeState();
  const viewTarget = runtime.viewTarget;
  const cropMask = runtime.cropMask;

  if (viewTarget) {
    return {
      center: { ...viewTarget.center },
      fov: { ...viewTarget.fov },
      input: viewTarget.input,
      locked: viewTarget.locked,
      ...(typeof viewTarget.maskOpacity === "number" ? { maskOpacity: viewTarget.maskOpacity } : {}),
      roll: viewTarget.roll,
      source: viewTarget.source,
      videoTimeMs: runtime.playback?.currentTimeMs ?? viewTarget.videoTimeMs
    };
  }

  if (cropMask) {
    return {
      center: { ...cropMask.center },
      fov: { ...cropMask.fov },
      input: cropMask.input,
      locked: cropMask.locked,
      maskOpacity: cropMask.maskOpacity,
      roll: cropMask.roll,
      source: "crop-mask",
      videoTimeMs: runtime.playback?.currentTimeMs ?? cropMask.videoTimeMs
    };
  }

  return {
    center: { pitch: 0, yaw: 0 },
    fov: { h: 90, v: verticalFovFromHorizontal(90) },
    input: "workflow",
    locked: true,
    maskOpacity: 0.7,
    roll: 0,
    source: "workflow",
    videoTimeMs: runtime.playback?.currentTimeMs ?? 0
  };
}

function writePreviewViewTarget(start: ViewTargetSnapshot, next: {
  fovH: number;
  pitch: number;
  yaw: number;
}) {
  const runtime = getPcEditorRuntimeState();
  const safeFovH = clamp(next.fovH, MIN_CAMERA_FOV_H, MAX_CAMERA_FOV_H);

  setPcEditorViewTarget({
    center: {
      yaw: normalizeYaw(next.yaw),
      pitch: clamp(next.pitch, -88, 88)
    },
    fov: {
      h: Number(safeFovH.toFixed(2)),
      v: verticalFovFromHorizontal(safeFovH)
    },
    input: "workflow",
    locked: true,
    ...(typeof start.maskOpacity === "number" ? { maskOpacity: start.maskOpacity } : {}),
    roll: start.roll,
    source: "workflow",
    videoTimeMs: runtime.playback?.currentTimeMs ?? start.videoTimeMs
  });
}

function cameraStateFromDelta(start: ViewTargetSnapshot, params: {
  deltaFovH?: number;
  deltaPitch?: number;
  deltaYaw?: number;
}) {
  return {
    fovH: clamp(start.fov.h + (params.deltaFovH ?? 0), MIN_CAMERA_FOV_H, MAX_CAMERA_FOV_H),
    pitch: clamp(start.center.pitch + (params.deltaPitch ?? 0), -88, 88),
    yaw: normalizeYaw(start.center.yaw + (params.deltaYaw ?? 0))
  };
}

function impactShakeStates(start: ViewTargetSnapshot, params: Record<string, unknown>) {
  const shakes = Math.max(2, Math.min(6, Math.round(readNumberParam(params, "shakes", 4))));
  const amplitudeYaw = clamp(readNumberParam(params, "amplitudeYaw", 2.6), 0.2, 8);
  const amplitudePitch = clamp(readNumberParam(params, "amplitudePitch", 1.4), 0, 5);
  const decay = clamp(readNumberParam(params, "decay", 0.62), 0.25, 0.9);

  return Array.from({ length: shakes }, (_, index) => {
    const sign = index % 2 === 0 ? 1 : -1;
    const power = Math.pow(decay, index);

    return cameraStateFromDelta(start, {
      deltaPitch: sign * amplitudePitch * power,
      deltaYaw: sign * amplitudeYaw * power
    });
  });
}

export function ViewportPathMotionPreviewController() {
  const animationRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }
  }, []);

  usePcEditorEventSubscription("editor.effects.select", (event) => {
    const effectId = readStringPayload(event.payload, "effectId");
    const eventName = readStringPayload(event.payload, "eventName");
    const preset = (effectId ? CAMERA_MOTION_PRESETS[effectId] : null) ?? (eventName ? CAMERA_MOTION_PRESETS[eventName] : null);

    if (!preset) {
      return;
    }

    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const params = mergeParams(preset.defaultParams, readRecordPayload(event.payload, "params"));
    const runtime = getPcEditorRuntimeState();
    const timing = readEffectTiming({
      authoredDurationMs: readNumberPayload(event.payload, "durationMs"),
      effectSpeed: readNumberPayload(event.payload, "effectSpeed") ?? runtime.rates.effectSpeed,
      fallbackDurationMs: preset.defaultDurationMs,
      minDurationMs: 160,
      params
    });
    const timedParams = scaleTemporalParams(params, timing.effectSpeed);
    const durationMs = timing.semanticDurationMs;
    const start = readCurrentViewTarget();

    if (preset.id === "impact-shake") {
      const states = [
        {
          fovH: start.fov.h,
          pitch: start.center.pitch,
          yaw: start.center.yaw
        },
        ...impactShakeStates(start, timedParams ?? {}),
        {
          fovH: start.fov.h,
          pitch: start.center.pitch,
          yaw: start.center.yaw
        }
      ];
      const startedAt = performance.now();

      const tick = (now: number) => {
        const elapsed = previewElapsedMs(startedAt, now, getPcEditorRuntimeState().rates.frontendPlaybackRate);

        if (elapsed < durationMs) {
          const segmentDuration = durationMs / Math.max(states.length - 1, 1);
          const segmentIndex = Math.min(states.length - 2, Math.max(0, Math.floor(elapsed / segmentDuration)));
          const segmentProgress = easeInOut((elapsed - segmentIndex * segmentDuration) / segmentDuration);
          const from = states[segmentIndex];
          const to = states[segmentIndex + 1];

          writePreviewViewTarget(start, {
            fovH: lerp(from.fovH, to.fovH, segmentProgress),
            pitch: lerp(from.pitch, to.pitch, segmentProgress),
            yaw: lerpYaw(from.yaw, to.yaw, segmentProgress)
          });
          animationRef.current = window.requestAnimationFrame(tick);
          return;
        }

        setPcEditorViewTarget({
          ...start,
          center: { ...start.center },
          fov: { ...start.fov },
          locked: true,
          source: "workflow",
          videoTimeMs: getPcEditorRuntimeState().playback?.currentTimeMs ?? start.videoTimeMs
        });
        animationRef.current = null;
      };

      animationRef.current = window.requestAnimationFrame(tick);
      return;
    }

    if (preset.id === "look-around") {
      const sweepAtMs = Math.max(1, Math.round(durationMs * clamp(readNumberParam(timedParams, "sweepAtRatio", 0.42), 0.2, 0.65)));
      const returnAtMs = Math.max(sweepAtMs + 1, Math.round(durationMs * clamp(readNumberParam(timedParams, "returnAtRatio", 0.72), 0.5, 0.9)));
      const states = [
        {
          atMs: 0,
          fovH: start.fov.h,
          pitch: start.center.pitch,
          yaw: start.center.yaw
        },
        {
          atMs: sweepAtMs,
          ...cameraStateFromDelta(start, {
            deltaFovH: readNumberParam(timedParams, "widenFovH", 3),
            deltaPitch: readNumberParam(timedParams, "sweepPitch", 0),
            deltaYaw: readNumberParam(timedParams, "sweepYaw", 28)
          })
        },
        {
          atMs: returnAtMs,
          ...cameraStateFromDelta(start, {
            deltaFovH: readNumberParam(timedParams, "returnFovH", 1),
            deltaPitch: readNumberParam(timedParams, "returnPitch", 0),
            deltaYaw: readNumberParam(timedParams, "returnYaw", -10)
          })
        },
        {
          atMs: durationMs,
          fovH: start.fov.h,
          pitch: start.center.pitch,
          yaw: start.center.yaw
        }
      ];
      const startedAt = performance.now();

      const tick = (now: number) => {
        const elapsed = previewElapsedMs(startedAt, now, getPcEditorRuntimeState().rates.frontendPlaybackRate);

        if (elapsed < durationMs) {
          const segmentIndex = Math.min(
            states.length - 2,
            Math.max(0, states.findIndex((state) => elapsed <= state.atMs) - 1)
          );
          const from = states[segmentIndex];
          const to = states[segmentIndex + 1];
          const segmentProgress = easeInOut((elapsed - from.atMs) / Math.max(to.atMs - from.atMs, 1));

          writePreviewViewTarget(start, {
            fovH: lerp(from.fovH, to.fovH, segmentProgress),
            pitch: lerp(from.pitch, to.pitch, segmentProgress),
            yaw: lerpYaw(from.yaw, to.yaw, segmentProgress)
          });
          animationRef.current = window.requestAnimationFrame(tick);
          return;
        }

        setPcEditorViewTarget({
          ...start,
          center: { ...start.center },
          fov: { ...start.fov },
          locked: true,
          source: "workflow",
          videoTimeMs: getPcEditorRuntimeState().playback?.currentTimeMs ?? start.videoTimeMs
        });
        animationRef.current = null;
      };

      animationRef.current = window.requestAnimationFrame(tick);
      return;
    }

    const end = cameraStateFromDelta(start, {
      deltaFovH: readNumberParam(timedParams, "deltaFovH", 0) + readNumberParam(timedParams, "reboundFovH", 0),
      deltaPitch: readNumberParam(timedParams, "deltaPitch", 0),
      deltaYaw: readNumberParam(timedParams, "deltaYaw", 0)
    });
    const peak = preset.id === "hero-push"
      ? cameraStateFromDelta(start, {
          deltaFovH: readNumberParam(timedParams, "deltaFovH", -10),
          deltaPitch: readNumberParam(timedParams, "deltaPitch", 0),
          deltaYaw: readNumberParam(timedParams, "deltaYaw", 0)
        })
      : null;
    const peakAtMs = Math.max(1, Math.round(durationMs * clamp(readNumberParam(timedParams, "peakAtRatio", 0.72), 0.35, 0.9)));
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = previewElapsedMs(startedAt, now, getPcEditorRuntimeState().rates.frontendPlaybackRate);

      if (peak && elapsed <= peakAtMs) {
        const progress = easeOut(elapsed / peakAtMs);
        writePreviewViewTarget(start, {
          fovH: lerp(start.fov.h, peak.fovH, progress),
          pitch: lerp(start.center.pitch, peak.pitch, progress),
          yaw: lerpYaw(start.center.yaw, peak.yaw, progress)
        });
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (elapsed < durationMs) {
        const from = peak ?? {
          fovH: start.fov.h,
          pitch: start.center.pitch,
          yaw: start.center.yaw
        };
        const progress = easeInOut((elapsed - (peak ? peakAtMs : 0)) / Math.max(durationMs - (peak ? peakAtMs : 0), 1));
        writePreviewViewTarget(start, {
          fovH: lerp(from.fovH, end.fovH, progress),
          pitch: lerp(from.pitch, end.pitch, progress),
          yaw: lerpYaw(from.yaw, end.yaw, progress)
        });
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      setPcEditorViewTarget({
        ...start,
        center: {
          pitch: end.pitch,
          yaw: end.yaw
        },
        fov: {
          h: Number(end.fovH.toFixed(2)),
          v: Number(verticalFovFromHorizontal(end.fovH).toFixed(2))
        },
        locked: true,
        source: "workflow",
        videoTimeMs: getPcEditorRuntimeState().playback?.currentTimeMs ?? start.videoTimeMs
      });
      animationRef.current = null;
    };

    animationRef.current = window.requestAnimationFrame(tick);
  });

  return null;
}
