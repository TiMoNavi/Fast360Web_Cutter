"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  axisVelocityStep,
  correctLineRippleDelta,
  createLineRippleFilterState,
  resetLineRippleFilter,
  type PcMotionVector
} from "../mask_controller/operations/motionSmoothing";
import {
  getPcEditorRuntimeState,
  setPcEditorViewTarget,
  type PcEditorViewTargetRuntimeState
} from "../state";
import {
  PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H,
  PC_EDITOR_MIN_VIEWPORT_FOV_H,
  verticalFovFromHorizontal
} from "../viewFov";
import {
  VR_CROP_MASK_CENTER_EVENT,
  VR_CROP_MASK_CHANGE_EVENT,
  VR_CROP_MASK_FOV_EVENT,
  type VrCropMaskState
} from "./webxr/AFrameVrCropViewportMask";

type ControllerAxes = {
  magnitude: number;
  x: number;
  y: number;
};

type ControllerAxesSample = ControllerAxes & {
  at: number;
};

type XrInputSourceWithGamepad = XRInputSource & {
  gamepad?: Gamepad;
};

type AFrameSceneWithXrSession = HTMLElement & {
  xrSession?: XRSession;
};

type AFrameControllerElement = HTMLElement & {
  components?: Record<string, {
    controller?: {
      gamepad?: Gamepad;
    };
  }>;
};

const VR_AXIS_DEADZONE = 0.18;
const VR_AXIS_EVENT_TTL_MS = 220;
const VR_AXIS_MAX_DELTA_SECONDS = 0.05;
const VR_AXIS_STOP_SPEED_EPSILON = 0.04;
const VR_CENTER_SPEED_DEG_PER_SECOND = 56;
const VR_CENTER_ACCEL_DEG_PER_SECOND2 = 210;
const VR_CENTER_BRAKE_DEG_PER_SECOND2 = 430;
const VR_FOV_SPEED_DEG_PER_SECOND = 62;
const VR_FOV_ACCEL_DEG_PER_SECOND2 = 260;
const VR_FOV_BRAKE_DEG_PER_SECOND2 = 620;
const VR_DISCRETE_CENTER_STEP_DEG = 5;
const VR_DISCRETE_FOV_STEP_DEG = 5;
const AFRAME_CONTROLLER_COMPONENT_NAMES = [
  "tracked-controls",
  "oculus-touch-controls",
  "vive-controls",
  "windows-motion-controls",
  "laser-controls"
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYaw(yaw: number) {
  let nextYaw = yaw;

  while (nextYaw > 180) {
    nextYaw -= 360;
  }
  while (nextYaw < -180) {
    nextYaw += 360;
  }

  return Object.is(nextYaw, -0) ? 0 : Number(nextYaw.toFixed(3));
}

function normalizeAxis(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < VR_AXIS_DEADZONE) {
    return 0;
  }

  const sign = value < 0 ? -1 : 1;
  return sign * clamp((Math.abs(value) - VR_AXIS_DEADZONE) / (1 - VR_AXIS_DEADZONE), 0, 1);
}

function readAxesPair(axes: readonly number[] | undefined, firstIndex: number, secondIndex: number) {
  if (!axes || firstIndex < 0 || secondIndex < 0) {
    return null;
  }

  const x = axes[firstIndex];
  const y = axes[secondIndex];

  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const normalized = {
    x: normalizeAxis(x),
    y: normalizeAxis(y)
  };

  return {
    ...normalized,
    magnitude: Math.hypot(normalized.x, normalized.y)
  };
}

function readPrimaryThumbstickAxes(gamepad: Gamepad | undefined): ControllerAxes | null {
  const axes = gamepad?.axes;

  if (!axes || axes.length < 2) {
    return null;
  }

  const candidateIndexes = [
    [2, 3],
    [0, 1],
    [axes.length - 2, axes.length - 1]
  ];
  let bestAxes: ControllerAxes | null = null;

  for (const [firstIndex, secondIndex] of candidateIndexes) {
    const candidate = readAxesPair(axes, firstIndex, secondIndex);

    if (!candidate) {
      continue;
    }

    if (!bestAxes || candidate.magnitude > bestAxes.magnitude) {
      bestAxes = candidate;
    }
  }

  return bestAxes;
}

function readXrControllerAxes(scene: HTMLElement, hand: "left" | "right") {
  const session = (scene as AFrameSceneWithXrSession).xrSession;

  if (!session) {
    return null;
  }

  for (const inputSource of Array.from(session.inputSources ?? []) as XrInputSourceWithGamepad[]) {
    if (inputSource.handedness !== hand) {
      continue;
    }

    const axes = readPrimaryThumbstickAxes(inputSource.gamepad);
    if (axes) {
      return axes;
    }
  }

  return null;
}

function findAFrameControllerElement(scene: HTMLElement, hand: "left" | "right") {
  const byId = scene.querySelector(`#${hand}-controller`);
  if (byId instanceof HTMLElement) {
    return byId as AFrameControllerElement;
  }

  const candidates = Array.from(scene.querySelectorAll("[hand], [data-hand], [laser-controls], [tracked-controls]"));
  const match = candidates.find((element) =>
    element instanceof HTMLElement &&
    (element.getAttribute("hand") === hand ||
      element.dataset.hand === hand ||
      (element.id.toLowerCase().includes(hand) && element.id.toLowerCase().includes("controller")))
  );

  return match instanceof HTMLElement ? match as AFrameControllerElement : null;
}

function readAFrameControllerAxes(scene: HTMLElement, hand: "left" | "right") {
  const controller = findAFrameControllerElement(scene, hand);

  if (!controller?.components) {
    return null;
  }

  let bestAxes: ControllerAxes | null = null;

  for (const componentName of AFRAME_CONTROLLER_COMPONENT_NAMES) {
    const axes = readPrimaryThumbstickAxes(controller.components[componentName]?.controller?.gamepad);

    if (!axes) {
      continue;
    }

    if (!bestAxes || axes.magnitude > bestAxes.magnitude) {
      bestAxes = axes;
    }
  }

  return bestAxes;
}

function strongestAxes(...candidates: Array<ControllerAxes | null>) {
  let bestAxes: ControllerAxes | null = null;

  for (const axes of candidates) {
    if (!axes) {
      continue;
    }

    if (!bestAxes || axes.magnitude > bestAxes.magnitude) {
      bestAxes = axes;
    }
  }

  return bestAxes;
}

function collectVrMaskEventTargets(scene: HTMLElement) {
  const targets: HTMLElement[] = [scene];
  const selectors = [
    "#left-controller",
    "#right-controller",
    "[data-hand='left']",
    "[data-hand='right']",
    "[laser-controls]",
    "[tracked-controls]"
  ];

  for (const selector of selectors) {
    for (const element of Array.from(scene.querySelectorAll(selector))) {
      if (element instanceof HTMLElement && !targets.includes(element)) {
        targets.push(element);
      }
    }
  }

  return targets;
}

function readControllerHand(event: Event): "left" | "right" {
  const customEvent = event as CustomEvent<{
    hand?: unknown;
    inputSource?: { handedness?: unknown };
    sourceEvent?: { inputSource?: { handedness?: unknown } };
  }> & {
    inputSource?: { handedness?: unknown };
  };
  const detailHand = customEvent.detail?.hand;

  if (detailHand === "left" || detailHand === "right") {
    return detailHand;
  }

  const inputHand =
    customEvent.inputSource?.handedness ??
    customEvent.detail?.inputSource?.handedness ??
    customEvent.detail?.sourceEvent?.inputSource?.handedness;

  if (inputHand === "left" || inputHand === "right") {
    return inputHand;
  }

  const target = event.target instanceof HTMLElement ? event.target : null;
  const handAttribute = target?.getAttribute("hand") ?? target?.dataset.hand;

  if (handAttribute === "left" || handAttribute === "right") {
    return handAttribute;
  }

  const id = target?.id.toLowerCase() ?? "";
  return id.includes("left") ? "left" : "right";
}

function readRuntimeViewTarget(): Omit<PcEditorViewTargetRuntimeState, "updatedAt"> {
  const runtime = getPcEditorRuntimeState();
  const viewTarget = runtime.viewTarget;
  const cropMask = runtime.cropMask;
  const fallbackFovH = viewTarget?.fov.h ?? cropMask?.fov.h ?? 90;

  return {
    center: viewTarget?.center ?? cropMask?.center ?? { pitch: 0, yaw: 0 },
    fov: viewTarget?.fov ?? cropMask?.fov ?? {
      h: fallbackFovH,
      v: verticalFovFromHorizontal(fallbackFovH)
    },
    input: "controller",
    locked: true,
    maskOpacity: viewTarget?.maskOpacity ?? cropMask?.maskOpacity ?? 0.74,
    roll: viewTarget?.roll ?? cropMask?.roll ?? 0,
    source: "controller",
    videoTimeMs: runtime.playback?.currentTimeMs ?? viewTarget?.videoTimeMs ?? cropMask?.videoTimeMs ?? 0
  };
}

function syncVrMaskStateToRuntime(state: VrCropMaskState) {
  const runtime = getPcEditorRuntimeState();
  const fovH = clamp(state.fov.h, PC_EDITOR_MIN_VIEWPORT_FOV_H, PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H);

  setPcEditorViewTarget({
    center: {
      pitch: clamp(state.center.pitch, -88, 88),
      yaw: normalizeYaw(state.center.yaw)
    },
    fov: {
      h: Number(fovH.toFixed(3)),
      v: verticalFovFromHorizontal(fovH)
    },
    input: state.input,
    locked: state.locked,
    maskOpacity: clamp(state.maskOpacity, 0, 0.95),
    roll: state.roll,
    source: "controller",
    videoTimeMs: runtime.playback?.currentTimeMs ?? readRuntimeViewTarget().videoTimeMs
  });
}

function isVrMaskProbeEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  const search = new URLSearchParams(window.location.search);
  return search.get("vrMaskProbe") === "1" || search.get("vrMaskProbe") === "true";
}

function startVrMaskProbe() {
  if (!isVrMaskProbeEnabled()) {
    return null;
  }

  const base = readRuntimeViewTarget();
  const baseFov = clamp(base.fov.h, PC_EDITOR_MIN_VIEWPORT_FOV_H, PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H);
  const startedAt = performance.now();
  let frame: number | null = null;

  const tick = (time: number) => {
    const elapsedSeconds = (time - startedAt) / 1000;
    const phase = elapsedSeconds * Math.PI * 0.42;
    const yawOffset = Math.sin(phase) * 24;
    const pitchOffset = Math.sin(phase * 0.72) * 8;
    const fovOffset = Math.sin(phase * 1.18) * 14;
    const fovH = clamp(baseFov + fovOffset, PC_EDITOR_MIN_VIEWPORT_FOV_H, PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H);

    window.dispatchEvent(new CustomEvent(VR_CROP_MASK_CENTER_EVENT, {
      detail: {
        pitch: base.center.pitch + pitchOffset,
        yaw: base.center.yaw + yawOffset
      }
    }));
    window.dispatchEvent(new CustomEvent(VR_CROP_MASK_FOV_EVENT, {
      detail: { fovH }
    }));
    frame = window.requestAnimationFrame(tick);
  };

  frame = window.requestAnimationFrame(tick);
  return () => {
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
    }
  };
}

function dispatchVrMaskCenterEvent(detail: {
  deltaPitch?: number;
  deltaYaw?: number;
  pitch?: number;
  yaw?: number;
}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(VR_CROP_MASK_CENTER_EVENT, {
    detail
  }));
}

export function dispatchVrMaskCenterStep(pitchDelta: number, yawDelta: number) {
  dispatchVrMaskCenterEvent({
    deltaPitch: pitchDelta,
    deltaYaw: yawDelta
  });
}

export function dispatchVrMaskFovStep(deltaH: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(VR_CROP_MASK_FOV_EVENT, {
    detail: { deltaH }
  }));
}

export function useVrImmersiveMaskController({
  controllerInputEnabled = true,
  enabled = true,
  sceneReady,
  sceneRef
}: {
  controllerInputEnabled?: boolean;
  enabled?: boolean;
  sceneReady: boolean;
  sceneRef: RefObject<HTMLElement | null>;
}) {
  const axesFromEventRef = useRef<Partial<Record<"left" | "right", ControllerAxesSample>>>({});
  const centerVelocityRef = useRef<PcMotionVector>({ pitch: 0, yaw: 0 });
  const centerLineFilterRef = useRef(createLineRippleFilterState());
  const fovVelocityRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!enabled || !sceneReady || !scene) {
      return undefined;
    }

    const handleVrMaskChange = (event: Event) => {
      const state = (event as CustomEvent<VrCropMaskState>).detail;

      if (!state) {
        return;
      }

      syncVrMaskStateToRuntime(state);
    };

    window.addEventListener(VR_CROP_MASK_CHANGE_EVENT, handleVrMaskChange);

    if (!controllerInputEnabled) {
      const stopProbe = startVrMaskProbe();

      return () => {
        window.removeEventListener(VR_CROP_MASK_CHANGE_EVENT, handleVrMaskChange);
        stopProbe?.();
      };
    }

    const readControllerAxes = (hand: "left" | "right") => {
      const eventAxes = axesFromEventRef.current[hand];

      if (eventAxes && performance.now() - eventAxes.at <= VR_AXIS_EVENT_TTL_MS) {
        return eventAxes;
      }

      return strongestAxes(
        readAFrameControllerAxes(scene, hand),
        readXrControllerAxes(scene, hand)
      );
    };

    const handleAxesMove = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      const axis = Array.isArray(detail?.axis) ? detail.axis : null;
      const rawX = typeof detail?.x === "number"
        ? detail.x
        : typeof axis?.[0] === "number"
          ? axis[0]
          : null;
      const rawY = typeof detail?.y === "number"
        ? detail.y
        : typeof axis?.[1] === "number"
          ? axis[1]
          : null;

      if (rawX === null || rawY === null) {
        return;
      }

      const x = normalizeAxis(rawX);
      const y = normalizeAxis(rawY);

      axesFromEventRef.current[readControllerHand(event)] = {
        at: performance.now(),
        magnitude: Math.hypot(x, y),
        x,
        y
      };
    };

    const applyCenterAxis = (axis: ControllerAxes | null, deltaSeconds: number) => {
      const targetVelocity = {
        pitch: -(axis?.y ?? 0) * VR_CENTER_SPEED_DEG_PER_SECOND,
        yaw: (axis?.x ?? 0) * VR_CENTER_SPEED_DEG_PER_SECOND
      };
      const currentVelocity = centerVelocityRef.current;
      const nextVelocity = {
        pitch: axisVelocityStep({
          accelerationDegPerSecond2: VR_CENTER_ACCEL_DEG_PER_SECOND2,
          brakeDegPerSecond2: VR_CENTER_BRAKE_DEG_PER_SECOND2,
          currentVelocity: currentVelocity.pitch,
          deltaSeconds,
          targetVelocity: targetVelocity.pitch
        }),
        yaw: axisVelocityStep({
          accelerationDegPerSecond2: VR_CENTER_ACCEL_DEG_PER_SECOND2,
          brakeDegPerSecond2: VR_CENTER_BRAKE_DEG_PER_SECOND2,
          currentVelocity: currentVelocity.yaw,
          deltaSeconds,
          targetVelocity: targetVelocity.yaw
        })
      };
      const speed = Math.hypot(nextVelocity.yaw, nextVelocity.pitch);
      const hasAxis = Boolean(axis && axis.magnitude > 0);

      if (!hasAxis && speed <= VR_AXIS_STOP_SPEED_EPSILON) {
        centerVelocityRef.current = { pitch: 0, yaw: 0 };
        resetLineRippleFilter(centerLineFilterRef.current);
        return false;
      }

      centerVelocityRef.current = nextVelocity;
      const rawDelta = {
        pitch: nextVelocity.pitch * deltaSeconds,
        yaw: nextVelocity.yaw * deltaSeconds
      };
      const correctedDelta = correctLineRippleDelta(centerLineFilterRef.current, rawDelta, {
        deadzoneDeg: 0.001,
        lineLockStrength: 0.2,
        lowPassAlpha: 0.88,
        reorientDotThreshold: 0.4
      });

      if (Math.hypot(correctedDelta.yaw, correctedDelta.pitch) <= 0.0001) {
        return false;
      }

      dispatchVrMaskCenterStep(correctedDelta.pitch, correctedDelta.yaw);
      return true;
    };

    const applyFovAxis = (axis: ControllerAxes | null, deltaSeconds: number) => {
      const targetVelocity = (axis?.y ?? 0) * VR_FOV_SPEED_DEG_PER_SECOND;
      const nextVelocity = axisVelocityStep({
        accelerationDegPerSecond2: VR_FOV_ACCEL_DEG_PER_SECOND2,
        brakeDegPerSecond2: VR_FOV_BRAKE_DEG_PER_SECOND2,
        currentVelocity: fovVelocityRef.current,
        deltaSeconds,
        targetVelocity
      });
      const hasAxis = Boolean(axis && Math.abs(axis.y) > 0);

      if (!hasAxis && Math.abs(nextVelocity) <= VR_AXIS_STOP_SPEED_EPSILON) {
        fovVelocityRef.current = 0;
        return false;
      }

      fovVelocityRef.current = nextVelocity;
      if (Math.abs(nextVelocity) <= 0.0001) {
        return false;
      }

      dispatchVrMaskFovStep(nextVelocity * deltaSeconds);
      return true;
    };

    const tick = (time: number) => {
      const lastTime = lastTimeRef.current ?? time;
      const deltaSeconds = Math.min(VR_AXIS_MAX_DELTA_SECONDS, Math.max(0, (time - lastTime) / 1000));
      lastTimeRef.current = time;

      const leftAxes = readControllerAxes("left");
      const rightAxes = readControllerAxes("right");
      applyCenterAxis(leftAxes, deltaSeconds);
      applyFovAxis(rightAxes && Math.abs(rightAxes.y) > 0 ? rightAxes : null, deltaSeconds);

      frameRef.current = window.requestAnimationFrame(tick);
    };

    const handleDiscreteThumbstick = (event: Event, direction: "down" | "left" | "right" | "up") => {
      const hand = readControllerHand(event);

      if (hand === "left") {
        dispatchVrMaskCenterStep(
          direction === "up" ? VR_DISCRETE_CENTER_STEP_DEG : direction === "down" ? -VR_DISCRETE_CENTER_STEP_DEG : 0,
          direction === "right" ? VR_DISCRETE_CENTER_STEP_DEG : direction === "left" ? -VR_DISCRETE_CENTER_STEP_DEG : 0
        );
        return;
      }

      if (hand === "right" && (direction === "up" || direction === "down")) {
        dispatchVrMaskFovStep(direction === "up" ? -VR_DISCRETE_FOV_STEP_DEG : VR_DISCRETE_FOV_STEP_DEG);
      }
    };

    const handlers: Array<[string, (event: Event) => void]> = [
      ["axismove", handleAxesMove],
      ["thumbstickmoved", handleAxesMove],
      ["thumbstickup", (event) => handleDiscreteThumbstick(event, "up")],
      ["thumbstickdown", (event) => handleDiscreteThumbstick(event, "down")],
      ["thumbstickleft", (event) => handleDiscreteThumbstick(event, "left")],
      ["thumbstickright", (event) => handleDiscreteThumbstick(event, "right")]
    ];
    const handledEvents = new WeakSet<Event>();
    const dedupedHandlers = handlers.map(([eventName, handler]) => [
      eventName,
      (event: Event) => {
        if (handledEvents.has(event)) {
          return;
        }

        handledEvents.add(event);
        handler(event);
      }
    ] as [string, (event: Event) => void]);
    const eventTargets = collectVrMaskEventTargets(scene);

    const stopProbe = startVrMaskProbe();
    resetLineRippleFilter(centerLineFilterRef.current, readRuntimeViewTarget().center);
    eventTargets.forEach((target) => {
      dedupedHandlers.forEach(([eventName, handler]) => target.addEventListener(eventName, handler));
    });
    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      eventTargets.forEach((target) => {
        dedupedHandlers.forEach(([eventName, handler]) => target.removeEventListener(eventName, handler));
      });
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      axesFromEventRef.current = {};
      centerVelocityRef.current = { pitch: 0, yaw: 0 };
      fovVelocityRef.current = 0;
      lastTimeRef.current = null;
      resetLineRippleFilter(centerLineFilterRef.current);
      stopProbe?.();
      window.removeEventListener(VR_CROP_MASK_CHANGE_EVENT, handleVrMaskChange);
    };
  }, [controllerInputEnabled, enabled, sceneReady, sceneRef]);
}
