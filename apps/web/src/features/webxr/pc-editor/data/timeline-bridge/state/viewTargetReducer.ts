import type { ViewTargetState, WebXrSemanticEvent } from "../types";
import { verticalFovFromHorizontal } from "../../../viewFov";

const DEFAULT_FOV_H = 82;
const MIN_FOV_H = 35;
const MAX_FOV_H = 110;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function defaultViewTargetState(): ViewTargetState {
  return {
    center: {
      yaw: 0,
      pitch: 0
    },
    cut: false,
    enabled: true,
    fov: {
      h: DEFAULT_FOV_H,
      v: verticalFovFromHorizontal(DEFAULT_FOV_H)
    },
    input: "head_gaze",
    locked: false,
    roll: 0,
    samplingPaused: false,
    smoothFollow: true
  };
}

export function reduceViewTargetState(
  state: ViewTargetState,
  event: WebXrSemanticEvent
): ViewTargetState {
  if (event.type === "setViewTarget") {
    if (state.locked) {
      return state;
    }
    return {
      ...state,
      center: {
        yaw: event.pose.yaw,
        pitch: event.pose.pitch
      },
      input: event.pose.input
    };
  }

  if (event.type === "lockViewport") {
    return { ...state, locked: true };
  }

  if (event.type === "unlockViewport") {
    return { ...state, locked: false };
  }

  if (event.type === "toggleLock") {
    return { ...state, locked: !state.locked };
  }

  if (event.type === "setFov") {
    const h = clamp(event.h, MIN_FOV_H, MAX_FOV_H);
    return {
      ...state,
      fov: {
        h,
        v: clamp(event.v ?? verticalFovFromHorizontal(h), 20, 85)
      }
    };
  }

  if (event.type === "nudgeFov") {
    const h = clamp(state.fov.h + event.deltaH, MIN_FOV_H, MAX_FOV_H);
    return {
      ...state,
      fov: {
        h,
        v: verticalFovFromHorizontal(h)
      }
    };
  }

  if (event.type === "discardRange") {
    return { ...state, enabled: false };
  }

  if (event.type === "restoreRange") {
    return { ...state, enabled: true };
  }

  if (event.type === "cutHere") {
    return { ...state, cut: true };
  }

  if (event.type === "samplingPause") {
    return { ...state, samplingPaused: true };
  }

  if (event.type === "samplingResume") {
    return { ...state, samplingPaused: false };
  }

  return state;
}

export function clearOneShotViewFlags(state: ViewTargetState): ViewTargetState {
  return state.cut ? { ...state, cut: false } : state;
}
