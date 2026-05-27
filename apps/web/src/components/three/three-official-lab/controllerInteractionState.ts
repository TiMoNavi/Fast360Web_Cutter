import type { Vector3 } from "three";
import type { ControllerHand } from "./types";

export type ControllerRayOverrideState = Record<ControllerHand, { rayDirection: Vector3 | null; rayOrigin: Vector3 | null }>;

export type ThumbstickOverrideState = Record<ControllerHand, { active: boolean; y: number }>;

export type ThumbstickFovState = {
  active: boolean;
  lastFrameAt: number;
  lastInputAt: number;
  pendingFlush: boolean;
};

export type QuickMenuButtonState = {
  lastButtonDown: boolean;
  recordToggleButtonDown: boolean;
  syntheticPointerPosition: Vector3 | null;
  syntheticRayDirection: Vector3 | null;
  syntheticRayOrigin: Vector3 | null;
};

export type LeftMenuButtonState = {
  lastButtonDown: boolean;
};

export type SelectComboState = Record<
  ControllerHand,
  {
    comboConsumed: boolean;
    down: boolean;
    instant: boolean;
    rayDirection: Vector3 | null;
    rayOrigin: Vector3 | null;
    startedAt: number;
    uiPressed: boolean;
  }
>;

export type ControllerDiscardState = {
  active: boolean;
  hand: ControllerHand | null;
  startMs: number;
};

export function createControllerRayOverrideState(): ControllerRayOverrideState {
  return {
    left: { rayDirection: null, rayOrigin: null },
    right: { rayDirection: null, rayOrigin: null }
  };
}

export function createThumbstickOverrideState(): ThumbstickOverrideState {
  return {
    left: { active: false, y: 0 },
    right: { active: false, y: 0 }
  };
}

export function createThumbstickFovState(now = performance.now()): ThumbstickFovState {
  return {
    active: false,
    lastFrameAt: now,
    lastInputAt: 0,
    pendingFlush: false
  };
}

export function createQuickMenuButtonState(): QuickMenuButtonState {
  return {
    lastButtonDown: false,
    recordToggleButtonDown: false,
    syntheticPointerPosition: null,
    syntheticRayDirection: null,
    syntheticRayOrigin: null
  };
}

export function createLeftMenuButtonState(): LeftMenuButtonState {
  return {
    lastButtonDown: false
  };
}

export function createSelectComboState(): SelectComboState {
  return {
    left: { comboConsumed: false, down: false, instant: false, rayDirection: null, rayOrigin: null, startedAt: 0, uiPressed: false },
    right: { comboConsumed: false, down: false, instant: false, rayDirection: null, rayOrigin: null, startedAt: 0, uiPressed: false }
  };
}

export function createControllerDiscardState(): ControllerDiscardState {
  return {
    active: false,
    hand: null,
    startMs: 0
  };
}
