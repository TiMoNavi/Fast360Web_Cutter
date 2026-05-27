import type { EffectEventName } from "@/lib/path-protocol";
import { verticalFovFromHorizontal } from "../../mask_controller";
import type { ViewTargetState, WebXrSemanticEvent } from "../../data/timeline-bridge";
import {
  clampEffectSpeed,
  readEffectTiming,
  readNumberParam,
  scaleTemporalParams,
  semanticDurationMs
} from "../timing";
import { getPcEditorEffectSpec } from "./effectSpecs";
import type {
  EffectEventDraft,
  EffectHoldEndCompileInput,
  EffectSelectCompileInput,
  PcEditorEffectSpec,
  ViewPathMotionCompileInput,
  ViewPathRangeDraft
} from "./types";

const MIN_VIEW_PATH_DURATION_MS = 160;
const MIN_CAMERA_FOV_H = 35;
const MAX_CAMERA_FOV_H = 140;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYaw(yaw: number) {
  return ((((yaw + 180) % 360) + 360) % 360) - 180;
}

function renderPolicyFromSpec(
  spec: PcEditorEffectSpec | null,
  overrides: {
    conflictGroup?: string | null;
    fallback?: "ignore" | "warn" | "fail" | null;
  } = {}
): EffectEventDraft["renderPolicy"] {
  const conflictGroup = overrides.conflictGroup ?? spec?.render.conflictGroup;

  if (!spec) {
    return {
      ...(conflictGroup ? { conflictGroup } : {}),
      fallback: overrides.fallback ?? "warn"
    };
  }

  return {
    ...(conflictGroup ? { conflictGroup } : {}),
    fallback: overrides.fallback ?? spec.render.fallback,
    ...(typeof spec.render.priority === "number" ? { priority: spec.render.priority } : {})
  };
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

function cloneViewState(state: ViewTargetState): ViewTargetState {
  return {
    ...state,
    center: { ...state.center },
    fov: { ...state.fov }
  };
}

type CameraMotionPreset = {
  defaultDurationMs: number;
  defaultParams: Record<string, number | string>;
  id: string;
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
  "reveal-pull": {
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
  "look-around": {
    defaultDurationMs: 2200,
    defaultParams: {
      returnYaw: -10,
      sweepYaw: 28,
      widenFovH: 3
    },
    id: "look-around"
  },
  "dolly-zoom": {
    defaultDurationMs: 1700,
    defaultParams: {
      peakAtMs: 820,
      peakDeltaFovH: -18
    },
    id: "dolly-zoom"
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

function cloneWithCameraDelta(
  startState: ViewTargetState,
  params: {
    deltaFovH?: number;
    deltaPitch?: number;
    deltaYaw?: number;
  }
) {
  const fovH = clamp(startState.fov.h + (params.deltaFovH ?? 0), MIN_CAMERA_FOV_H, MAX_CAMERA_FOV_H);
  const next = cloneViewState(startState);

  next.center = {
    pitch: clamp(startState.center.pitch + (params.deltaPitch ?? 0), -88, 88),
    yaw: normalizeYaw(startState.center.yaw + (params.deltaYaw ?? 0))
  };
  next.fov = {
    h: Number(fovH.toFixed(2)),
    v: Number(verticalFovFromHorizontal(fovH).toFixed(2))
  };
  next.input = startState.input;
  next.locked = true;
  next.smoothFollow = false;

  return next;
}

export function compileEffectSelectDraft(input: EffectSelectCompileInput): EffectEventDraft {
  const spec = getPcEditorEffectSpec(input.effectId);
  const effectType = (
    input.eventName ??
    spec?.eventName ??
    input.fallbackEventName ??
    input.effectId
  ) as EffectEventName;
  const params = mergeParams(spec?.defaultParams, input.fallbackParams, input.params);
  const timing = readEffectTiming({
    authoredDurationMs: input.durationMs,
    effectSpeed: input.effectSpeed,
    fallbackDurationMs: spec?.defaultDurationMs ?? input.fallbackDurationMs ?? 900,
    params
  });
  const timedParams = scaleTemporalParams(params, timing.effectSpeed);

  return {
    displayName: input.label,
    durationMs: timing.semanticDurationMs,
    effectType,
    kind: "effect-event",
    params: mergeParams(
      timedParams,
      {
        category: input.categoryId,
        effectId: input.effectId
      }
    ),
    renderPolicy: renderPolicyFromSpec(spec, {
      conflictGroup: input.conflictGroup,
      fallback: input.renderFallback
    })
  };
}

export function compileViewPathMotionDraft(input: ViewPathMotionCompileInput): ViewPathRangeDraft | null {
  const spec = getPcEditorEffectSpec(input.effectId);

  if (spec?.engine !== "view-path" && input.renderStage !== "viewport_path") {
    return null;
  }

  const preset = CAMERA_MOTION_PRESETS[input.effectId];

  if (!preset) {
    return null;
  }

  const startState = input.timeline.viewState;
  const params = mergeParams(preset.defaultParams, spec?.defaultParams, input.params);
  const timing = readEffectTiming({
    authoredDurationMs: input.durationMs,
    effectSpeed: input.effectSpeed,
    fallbackDurationMs: spec?.defaultDurationMs ?? input.fallbackDurationMs ?? preset.defaultDurationMs,
    minDurationMs: MIN_VIEW_PATH_DURATION_MS,
    params
  });
  const durationMs = timing.semanticDurationMs;
  const timedParams = scaleTemporalParams(params, timing.effectSpeed);

  if (preset.id === "impact-shake") {
    const shakes = Math.max(2, Math.min(6, Math.round(readNumberParam(timedParams, "shakes", 4))));
    const amplitudeYaw = clamp(readNumberParam(timedParams, "amplitudeYaw", 2.6), 0.2, 8);
    const amplitudePitch = clamp(readNumberParam(timedParams, "amplitudePitch", 1.4), 0, 5);
    const decay = clamp(readNumberParam(timedParams, "decay", 0.62), 0.25, 0.9);
    const keyframes = Array.from({ length: shakes }, (_, index) => {
      const sign = index % 2 === 0 ? 1 : -1;
      const power = Math.pow(decay, index);
      const timeMs = input.timeline.currentVideoTimeMs + Math.max(1, Math.round(durationMs * ((index + 1) / (shakes + 1))));
      const state = cloneWithCameraDelta(startState, {
        deltaPitch: sign * amplitudePitch * power,
        deltaYaw: sign * amplitudeYaw * power
      });

      return {
        interpolation: "fast" as const,
        state,
        timeMs,
        transitionMs: Math.max(1, Math.round(durationMs / (shakes + 1)))
      };
    });

    return {
      endMs: input.timeline.currentVideoTimeMs + durationMs,
      endState: cloneViewState(startState),
      interpolation: "fast",
      keyframes,
      kind: "view-path-range",
      reason: "lock",
      startMs: input.timeline.currentVideoTimeMs,
      startState: cloneViewState(startState),
      transitionMs: Math.max(1, Math.round(durationMs / (shakes + 1)))
    };
  }

  if (preset.id === "look-around") {
    const sweepAtMs = Math.max(1, Math.round(durationMs * clamp(readNumberParam(timedParams, "sweepAtRatio", 0.42), 0.2, 0.65)));
    const returnAtMs = Math.max(sweepAtMs + 1, Math.round(durationMs * clamp(readNumberParam(timedParams, "returnAtRatio", 0.72), 0.5, 0.9)));
    const sweepState = cloneWithCameraDelta(startState, {
      deltaFovH: readNumberParam(timedParams, "widenFovH", 3),
      deltaPitch: readNumberParam(timedParams, "sweepPitch", 0),
      deltaYaw: readNumberParam(timedParams, "sweepYaw", 28)
    });
    const returnState = cloneWithCameraDelta(startState, {
      deltaFovH: readNumberParam(timedParams, "returnFovH", 1),
      deltaPitch: readNumberParam(timedParams, "returnPitch", 0),
      deltaYaw: readNumberParam(timedParams, "returnYaw", -10)
    });

    return {
      endMs: input.timeline.currentVideoTimeMs + durationMs,
      endState: cloneViewState(startState),
      interpolation: "fast",
      keyframes: [
        {
          interpolation: "fast",
          state: sweepState,
          timeMs: input.timeline.currentVideoTimeMs + sweepAtMs,
          transitionMs: sweepAtMs
        },
        {
          interpolation: "fast",
          state: returnState,
          timeMs: input.timeline.currentVideoTimeMs + returnAtMs,
          transitionMs: returnAtMs - sweepAtMs
        }
      ],
      kind: "view-path-range",
      reason: "lock",
      startMs: input.timeline.currentVideoTimeMs,
      startState: cloneViewState(startState),
      transitionMs: durationMs - returnAtMs
    };
  }

  if (preset.id === "dolly-zoom") {
    const peakAtMs = Math.max(1, Math.min(durationMs - 1, Math.round(readNumberParam(timedParams, "peakAtMs", durationMs * 0.48))));
    const peakState = cloneWithCameraDelta(startState, {
      deltaFovH: readNumberParam(timedParams, "peakDeltaFovH", -18),
      deltaPitch: readNumberParam(timedParams, "peakDeltaPitch", 0),
      deltaYaw: readNumberParam(timedParams, "peakDeltaYaw", 0)
    });

    return {
      endMs: input.timeline.currentVideoTimeMs + durationMs,
      endState: cloneViewState(startState),
      interpolation: "fast",
      keyframes: [
        {
          interpolation: "fast",
          state: peakState,
          timeMs: input.timeline.currentVideoTimeMs + peakAtMs,
          transitionMs: peakAtMs
        }
      ],
      kind: "view-path-range",
      reason: "fov",
      startMs: input.timeline.currentVideoTimeMs,
      startState: cloneViewState(startState),
      transitionMs: durationMs - peakAtMs
    };
  }

  const endState = cloneWithCameraDelta(startState, {
    deltaFovH: readNumberParam(timedParams, "deltaFovH", 0) + readNumberParam(timedParams, "reboundFovH", 0),
    deltaPitch: readNumberParam(timedParams, "deltaPitch", 0),
    deltaYaw: readNumberParam(timedParams, "deltaYaw", 0)
  });

  if (preset.id === "hero-push") {
    const peakAtRatio = clamp(readNumberParam(timedParams, "peakAtRatio", 0.72), 0.35, 0.9);
    const peakAtMs = Math.max(1, Math.round(durationMs * peakAtRatio));
    const peakState = cloneWithCameraDelta(startState, {
      deltaFovH: readNumberParam(timedParams, "deltaFovH", -10),
      deltaPitch: readNumberParam(timedParams, "deltaPitch", 0),
      deltaYaw: readNumberParam(timedParams, "deltaYaw", 0)
    });

    return {
      endMs: input.timeline.currentVideoTimeMs + durationMs,
      endState,
      interpolation: "fast",
      keyframes: [
        {
          interpolation: "fast",
          state: peakState,
          timeMs: input.timeline.currentVideoTimeMs + peakAtMs,
          transitionMs: peakAtMs
        }
      ],
      kind: "view-path-range",
      reason: "fov",
      startMs: input.timeline.currentVideoTimeMs,
      startState: cloneViewState(startState),
      transitionMs: durationMs - peakAtMs
    };
  }

  return {
    endMs: input.timeline.currentVideoTimeMs + durationMs,
    endState,
    interpolation: "fast",
    kind: "view-path-range",
    reason: "fov",
    startMs: input.timeline.currentVideoTimeMs,
    startState: cloneViewState(startState),
    transitionMs: durationMs
  };
}

export function compileEffectHoldEndDraft(input: EffectHoldEndCompileInput): EffectEventDraft {
  const spec = getPcEditorEffectSpec(input.effectId);
  const effectSpeed = clampEffectSpeed(input.effectSpeed ?? readNumberParam(input.params, "effectSpeed", 1));
  const fadeMs = semanticDurationMs(input.fadeMs, effectSpeed, 1);
  const params = mergeParams(spec?.defaultParams, input.params);
  const timedParams = scaleTemporalParams(params, effectSpeed, {
    excludeKeys: ["holdDurationMs"]
  });

  return {
    displayName: input.label,
    durationMs: input.durationMs,
    effectType: input.eventName,
    endMs: input.endMs,
    kind: "effect-event",
    params: mergeParams(
      timedParams,
      {
        category: input.categoryId,
        direction: "hold",
        edgeMs: fadeMs,
        effectId: input.effectId,
        fadeInMs: fadeMs,
        fadeOutMs: fadeMs,
        holdDurationMs: input.durationMs,
        holdMode: "press-release",
        peakOpacity: 1
      }
    ),
    renderPolicy: renderPolicyFromSpec(spec, {
      conflictGroup: input.conflictGroup,
      fallback: input.renderFallback
    }),
    startMs: input.startMs
  };
}

export function effectEventDraftToTimelineEvent(draft: EffectEventDraft): Extract<WebXrSemanticEvent, { type: "createEffectEvent" }> {
  return {
    displayName: draft.displayName,
    durationMs: draft.durationMs,
    effectType: draft.effectType,
    endMs: draft.endMs,
    params: draft.params,
    renderPolicy: draft.renderPolicy,
    startMs: draft.startMs,
    type: "createEffectEvent"
  };
}

export function viewPathRangeDraftToTimelineEvent(draft: ViewPathRangeDraft): Extract<WebXrSemanticEvent, { type: "createViewPathRange" }> {
  return {
    endMs: draft.endMs,
    endState: draft.endState,
    interpolation: draft.interpolation,
    keyframes: draft.keyframes,
    reason: draft.reason,
    startMs: draft.startMs,
    startState: draft.startState,
    transitionMs: draft.transitionMs,
    type: "createViewPathRange"
  };
}
