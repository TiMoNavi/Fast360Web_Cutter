"use client";

import { useEffect, useRef } from "react";
import { usePcEditorEventEmitter } from "../events";
import { getPcEditorRuntimeState } from "../state";
import {
  addMotionDelta,
  axisVelocityStep,
  correctLineRippleDelta,
  createLineRippleFilterState,
  normalizeMotionCenter,
  resetLineRippleFilter,
  type PcMotionVector
} from "../mask_controller/operations/motionSmoothing";

const KEY_TO_AXIS: Record<string, PcMotionVector> = {
  KeyA: { pitch: 0, yaw: -1 },
  KeyD: { pitch: 0, yaw: 1 },
  KeyS: { pitch: -1, yaw: 0 },
  KeyW: { pitch: 1, yaw: 0 }
};

const MAX_KEYBOARD_SPEED_DEG_PER_SECOND = 72;
const KEYBOARD_ACCEL_DEG_PER_SECOND2 = 210;
const KEYBOARD_BRAKE_DEG_PER_SECOND2 = 430;
const KEYBOARD_STOP_SPEED_EPSILON = 0.04;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function motionId() {
  return `wasd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRuntimeCenter() {
  return normalizeMotionCenter(
    getPcEditorRuntimeState().viewTarget?.center ?? {
      pitch: 0,
      yaw: 0
    }
  );
}

export function usePcViewportKeyboardMotion({ enabled = true }: { enabled?: boolean } = {}) {
  const emit = usePcEditorEventEmitter();
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const pressedRef = useRef<Record<string, boolean>>({});
  const velocityRef = useRef<PcMotionVector>({ pitch: 0, yaw: 0 });
  const activeMotionIdRef = useRef<string | null>(null);
  const filterRef = useRef(createLineRippleFilterState());

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const stopFrame = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      lastTimeRef.current = null;
    };

    const emitCenter = (commit: boolean, phase: "change" | "end") => {
      const center = readRuntimeCenter();
      emit({
        type: "editor.viewport.center.set",
        payload: {
          ...center,
          commit,
          motionId: activeMotionIdRef.current ?? motionId()
        },
        source: {
          kind: "keyboard",
          id: "wasd-motion",
          device: "pc"
        },
        meta: {
          phase
        }
      });
    };

    const tick = (time: number) => {
      const lastTime = lastTimeRef.current ?? time;
      const deltaSeconds = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      lastTimeRef.current = time;

      const pressed = pressedRef.current;
      const axis = Object.entries(KEY_TO_AXIS).reduce<PcMotionVector>(
        (acc, [code, vector]) => {
          if (!pressed[code]) {
            return acc;
          }
          return {
            pitch: acc.pitch + vector.pitch,
            yaw: acc.yaw + vector.yaw
          };
        },
        { pitch: 0, yaw: 0 }
      );
      const axisMagnitude = Math.hypot(axis.yaw, axis.pitch);
      const normalizedAxis =
        axisMagnitude > 0.0001
          ? {
              pitch: axis.pitch / axisMagnitude,
              yaw: axis.yaw / axisMagnitude
            }
          : { pitch: 0, yaw: 0 };
      const targetVelocity = {
        pitch: normalizedAxis.pitch * MAX_KEYBOARD_SPEED_DEG_PER_SECOND,
        yaw: normalizedAxis.yaw * MAX_KEYBOARD_SPEED_DEG_PER_SECOND
      };
      const velocity = velocityRef.current;
      const nextVelocity = {
        pitch: axisVelocityStep({
          accelerationDegPerSecond2: KEYBOARD_ACCEL_DEG_PER_SECOND2,
          brakeDegPerSecond2: KEYBOARD_BRAKE_DEG_PER_SECOND2,
          currentVelocity: velocity.pitch,
          deltaSeconds,
          targetVelocity: targetVelocity.pitch
        }),
        yaw: axisVelocityStep({
          accelerationDegPerSecond2: KEYBOARD_ACCEL_DEG_PER_SECOND2,
          brakeDegPerSecond2: KEYBOARD_BRAKE_DEG_PER_SECOND2,
          currentVelocity: velocity.yaw,
          deltaSeconds,
          targetVelocity: targetVelocity.yaw
        })
      };
      velocityRef.current = nextVelocity;

      const speed = Math.hypot(nextVelocity.yaw, nextVelocity.pitch);
      const keysDown = axisMagnitude > 0.0001;
      if (!keysDown && speed <= KEYBOARD_STOP_SPEED_EPSILON) {
        velocityRef.current = { pitch: 0, yaw: 0 };
        emitCenter(true, "end");
        activeMotionIdRef.current = null;
        resetLineRippleFilter(filterRef.current);
        stopFrame();
        return;
      }

      const rawDelta = {
        pitch: nextVelocity.pitch * deltaSeconds,
        yaw: nextVelocity.yaw * deltaSeconds
      };
      const correctedDelta = correctLineRippleDelta(filterRef.current, rawDelta, {
        deadzoneDeg: 0.001,
        lineLockStrength: 0.2,
        lowPassAlpha: 0.88,
        reorientDotThreshold: 0.4
      });
      const nextCenter = addMotionDelta(readRuntimeCenter(), correctedDelta);

      emit({
        type: "editor.viewport.center.set",
        payload: {
          ...nextCenter,
          commit: false,
          motionId: activeMotionIdRef.current
        },
        source: {
          kind: "keyboard",
          id: "wasd-motion",
          device: "pc"
        },
        meta: {
          phase: "change"
        }
      });

      frameRef.current = window.requestAnimationFrame(tick);
    };

    const ensureFrame = () => {
      if (frameRef.current !== null) {
        return;
      }
      activeMotionIdRef.current ??= motionId();
      resetLineRippleFilter(filterRef.current, readRuntimeCenter());
      frameRef.current = window.requestAnimationFrame(tick);
    };

    const handleKey = (event: KeyboardEvent, pressed: boolean) => {
      if (!KEY_TO_AXIS[event.code] || isEditableTarget(event.target) || (pressed && (event.ctrlKey || event.metaKey || event.altKey))) {
        return;
      }

      event.preventDefault();
      pressedRef.current[event.code] = pressed;
      ensureFrame();
    };

    const handleDown = (event: Event) => handleKey(event as KeyboardEvent, true);
    const handleUp = (event: Event) => handleKey(event as KeyboardEvent, false);

    window.addEventListener("keydown", handleDown, true);
    window.addEventListener("keyup", handleUp, true);
    return () => {
      window.removeEventListener("keydown", handleDown, true);
      window.removeEventListener("keyup", handleUp, true);
      stopFrame();
    };
  }, [emit, enabled]);
}
