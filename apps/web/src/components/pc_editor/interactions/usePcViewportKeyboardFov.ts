"use client";

import { useEffect, useRef } from "react";
import { usePcEditorEventEmitter } from "../events";
import { axisVelocityStep, clampNumber } from "../mask_controller/operations/motionSmoothing";
import { getPcEditorRuntimeState } from "../state";
import {
  PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H,
  PC_EDITOR_MIN_VIEWPORT_FOV_H
} from "../viewFov";

const KEY_TO_FOV_AXIS: Record<string, number> = {
  KeyE: 1,
  KeyQ: -1
};

const MIN_FOV_H = PC_EDITOR_MIN_VIEWPORT_FOV_H;
const MAX_FOV_H = PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H;
const MAX_FOV_SPEED_DEG_PER_SECOND = 62;
const FOV_ACCEL_DEG_PER_SECOND2 = 260;
const FOV_BRAKE_DEG_PER_SECOND2 = 620;
const FOV_EMERGENCY_BRAKE_DEG_PER_SECOND2 = 1800;
const FOV_STOP_SPEED_EPSILON = 0.04;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function motionId() {
  return `qe-fov-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readRuntimeFov() {
  return clampNumber(getPcEditorRuntimeState().viewTarget?.fov.h ?? 90, MIN_FOV_H, MAX_FOV_H);
}

export function usePcViewportKeyboardFov({ enabled = true }: { enabled?: boolean } = {}) {
  const emit = usePcEditorEventEmitter();
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const pressedRef = useRef<Record<string, boolean>>({});
  const velocityRef = useRef(0);
  const activeMotionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const emitFov = (fovH: number, commit: boolean, phase: "change" | "end") => {
      emit({
        type: "editor.viewport.fov.set",
        payload: {
          commit,
          fovH: Number(clampNumber(fovH, MIN_FOV_H, MAX_FOV_H).toFixed(3)),
          motionId: activeMotionIdRef.current ?? motionId()
        },
        source: {
          kind: "keyboard",
          id: "qe-fov-motion",
          device: "pc"
        },
        meta: {
          phase
        }
      });
    };

    const stopFrame = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      lastTimeRef.current = null;
    };

    const stopMotion = () => {
      velocityRef.current = 0;
      emitFov(readRuntimeFov(), true, "end");
      activeMotionIdRef.current = null;
      stopFrame();
    };

    const tick = (time: number) => {
      const lastTime = lastTimeRef.current ?? time;
      const deltaSeconds = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      lastTimeRef.current = time;

      const pressed = pressedRef.current;
      const qDown = Boolean(pressed.KeyQ);
      const eDown = Boolean(pressed.KeyE);
      const axis = (eDown ? 1 : 0) - (qDown ? 1 : 0);
      const bothDirectionsHeld = qDown && eDown;
      const targetVelocity = axis * MAX_FOV_SPEED_DEG_PER_SECOND;
      let nextVelocity = axisVelocityStep({
        accelerationDegPerSecond2: FOV_ACCEL_DEG_PER_SECOND2,
        brakeDegPerSecond2: bothDirectionsHeld ? FOV_EMERGENCY_BRAKE_DEG_PER_SECOND2 : FOV_BRAKE_DEG_PER_SECOND2,
        currentVelocity: velocityRef.current,
        deltaSeconds,
        targetVelocity
      });

      const speed = Math.abs(nextVelocity);
      const anyKeyDown = qDown || eDown;
      if ((!anyKeyDown || bothDirectionsHeld) && speed <= FOV_STOP_SPEED_EPSILON) {
        stopMotion();
        return;
      }

      const currentFov = readRuntimeFov();
      const nextFov = clampNumber(currentFov + nextVelocity * deltaSeconds, MIN_FOV_H, MAX_FOV_H);
      const hitLimit =
        (nextFov <= MIN_FOV_H && nextVelocity < 0) ||
        (nextFov >= MAX_FOV_H && nextVelocity > 0);

      if (hitLimit) {
        nextVelocity = 0;
      }

      velocityRef.current = nextVelocity;
      emitFov(nextFov, false, "change");
      frameRef.current = window.requestAnimationFrame(tick);
    };

    const ensureFrame = () => {
      if (frameRef.current !== null) {
        return;
      }
      activeMotionIdRef.current ??= motionId();
      frameRef.current = window.requestAnimationFrame(tick);
    };

    const handleKey = (event: KeyboardEvent, pressed: boolean) => {
      if (!KEY_TO_FOV_AXIS[event.code] || isEditableTarget(event.target) || (pressed && (event.ctrlKey || event.metaKey || event.altKey))) {
        return;
      }

      event.preventDefault();
      const wasPressed = Boolean(pressedRef.current[event.code]);
      pressedRef.current[event.code] = pressed;

      if (pressed !== wasPressed || (!pressed && Math.abs(velocityRef.current) > FOV_STOP_SPEED_EPSILON)) {
        ensureFrame();
      }
    };

    const handleDown = (event: Event) => handleKey(event as KeyboardEvent, true);
    const handleUp = (event: Event) => handleKey(event as KeyboardEvent, false);
    const handleBlur = () => {
      pressedRef.current = {};
      if (frameRef.current !== null || Math.abs(velocityRef.current) > FOV_STOP_SPEED_EPSILON) {
        stopMotion();
      }
    };

    window.addEventListener("keydown", handleDown, true);
    window.addEventListener("keyup", handleUp, true);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleDown, true);
      window.removeEventListener("keyup", handleUp, true);
      window.removeEventListener("blur", handleBlur);
      stopFrame();
    };
  }, [emit, enabled]);
}
