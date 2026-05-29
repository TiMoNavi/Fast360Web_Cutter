"use client";

import { Fragment, createElement, useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { AFrameSpatial3DUi, type Spatial3DUiAction } from "@/components/pc_editor/3DUI";
import { defaultPcEditorBindings, resolvePcEditorBinding, type PcEditorTriggerDescriptor } from "@/components/pc_editor/bindings";
import type { AFrame360VideoSource } from "@/components/pc_editor/controls/types";
import { usePcEditorEventEmitter, type PcEditorEventInput } from "@/components/pc_editor/events";
import {
  axisVelocityStep,
  createLineRippleFilterState,
  resetLineRippleFilter,
  stepTowardTarget,
  type PcMotionVector
} from "@/components/pc_editor/mask_controller/operations/motionSmoothing";
import {
  getPcEditorRuntimeState,
  getPcEditorFrontendPlaybackRate,
  setPcEditorControlPressed,
  setPcEditorEffectInput,
  setPcEditorRateState,
  setPcEditorViewTarget,
  setPcEditorVrControllerState,
  usePcEditorCameraPose,
  usePcEditorEffectCatalogState,
  usePcEditorEffectInput,
  usePcEditorPlaybackState,
  usePcEditorRateState,
  usePcEditorViewTarget,
  usePcEditorVrControllerState,
  usePcEditorXrSession
} from "@/components/pc_editor/state";
import { dispatchVrMaskCenterStep, dispatchVrMaskFovStep } from "@/components/pc_editor/vr_mask_controller";
import {
  PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H,
  PC_EDITOR_MIN_VIEWPORT_FOV_H,
  verticalFovFromHorizontal
} from "@/components/pc_editor/viewFov";

const BULLET_TIME_PLAYBACK_RATE = 0.1;
const DEFAULT_BULLET_TIME_RESTORE_RATE = 1;
const DUAL_TRIGGER_CLICK_SUPPRESS_MS = 260;
const VR_MASK_OPACITY_STEP = 0.05;
const VR_MASK_OPACITY_MIN = 0;
const VR_MASK_OPACITY_MAX = 0.95;
const VR_RATE_SMALL_STEP = 0.05;
const VR_RATE_LARGE_STEP = 0.25;
const VR_RATE_MIN = 0.25;
const VR_RATE_MAX = 4;
const VR_RATE_SMOOTH_MS = 160;
const VR_RATE_CLICK_SUPPRESS_MS = 360;
const VR_AXIS_DEADZONE = 0.18;
const VR_AXIS_DISCRETE_SUPPRESS_MS = 140;
const VR_AXIS_MAX_DELTA_SECONDS = 0.05;
const VR_SIMPLE_AXIS_SMOOTH_ALPHA = 0.24;
const VR_SIMPLE_AXIS_STOP_EPSILON = 0.015;
const VR_SIMPLE_CENTER_SPEED_DEG_PER_SECOND = 46;
const VR_SIMPLE_OPACITY_SPEED_PER_SECOND = 0.34;
const VR_FOV_SPEED_DEG_PER_SECOND = 62;
const VR_FOV_ACCEL_DEG_PER_SECOND2 = 260;
const VR_FOV_BRAKE_DEG_PER_SECOND2 = 620;
const VR_MASK_OPACITY_SPEED_PER_SECOND = 0.42;
const VR_RATE_AXIS_TICK_MS = 140;
const VR_AXIS_STOP_SPEED_EPSILON = 0.04;
const VR_EVENT_AXIS_TTL_MS = 220;
const VR_GRIP_TOGGLE_DEBOUNCE_MS = 220;
const VR_HEAD_FOLLOW_CONFIG = {
  accelerationDegPerSecond2: 760,
  brakeDegPerSecond2: 980,
  maxSpeedDegPerSecond: 185,
  settleDistanceDeg: 0.025,
  settleSpeedDegPerSecond: 0.12
};

type AxisMotionKind = "center" | "fov" | "roll";

type ControllerButtonId = "a" | "b" | "grip" | "trigger" | "x" | "y";

type SpatialRateChipTarget = "effect" | "playback" | "recording";

type ActiveRateChipState = {
  adjusted: boolean;
  target: SpatialRateChipTarget;
};

type ControllerAxes = {
  magnitude: number;
  x: number;
  y: number;
};

type ControllerAxesSample = ControllerAxes & {
  at: number;
};

type AFrameDirectionLike = {
  x: number;
  y: number;
  z: number;
};

type AFrameEntityWithObject3D = HTMLElement & {
  components?: Record<string, {
    buttonStates?: Record<string, { pressed?: boolean; touched?: boolean; value?: number }>;
    controller?: {
      gamepad?: Gamepad;
    };
  }>;
  object3D?: {
    getWorldDirection?: (target: AFrameDirectionLike) => AFrameDirectionLike;
    updateMatrixWorld?: (force?: boolean) => void;
  };
};

type AFrameSceneWithCamera = HTMLElement & {
  camera?: {
    getWorldDirection?: (target: AFrameDirectionLike) => AFrameDirectionLike;
    updateMatrixWorld?: (force?: boolean) => void;
  };
  object3D?: {
    updateMatrixWorld?: (force?: boolean) => void;
  };
  renderer?: {
    xr?: {
      getCamera?: (camera: {
        getWorldDirection?: (target: AFrameDirectionLike) => AFrameDirectionLike;
      }) => {
        getWorldDirection?: (target: AFrameDirectionLike) => AFrameDirectionLike;
        updateMatrixWorld?: (force?: boolean) => void;
      };
      isPresenting?: boolean;
    };
  };
};

type AFrameSceneWithXrSession = HTMLElement & {
  xrSession?: XRSession;
};

type XrInputSourceWithGamepad = XRInputSource & {
  gamepad?: Gamepad;
};

type AFrameWindowWithThree = Window &
  typeof globalThis & {
    AFRAME?: {
      THREE?: {
        Vector3?: new (x?: number, y?: number, z?: number) => AFrameDirectionLike;
      };
    };
  };

export type PlayerV2Spatial3DUiLayerProps = {
  activeSource: AFrame360VideoSource;
  autoRenderEnabled: boolean;
  discardActive: boolean;
  discardMessage: string;
  playlistOpen: boolean;
  playlistSources: AFrame360VideoSource[];
  recordingActive: boolean;
  renderExportId: string | null;
  renderMessage: string;
  renderStatus: "idle" | "rendering" | "done" | "error";
  sceneRef: RefObject<HTMLElement | null>;
  sourceLabel: string;
  sourceMessage: string;
  sourceStatus: "error" | "ready" | "switching";
};

function triggerFromSpatialAction(action: Spatial3DUiAction): PcEditorTriggerDescriptor | null {
  switch (action.type) {
    case "crop.end":
      return { kind: "vr-ray", target: "spatial-player-record-end", action: "select" };
    case "crop.start":
      return { kind: "vr-ray", target: "spatial-player-record-start", action: "select" };
    case "overlays.close":
    case "playlist.close":
      return { kind: "vr-ray", target: "spatial-playlist-close", action: "select" };
    case "player.next":
      return { kind: "vr-ray", target: "spatial-player-next", action: "select" };
    case "player.playPause.toggle":
      return { kind: "vr-ray", target: "spatial-player-play-toggle", action: "select" };
    case "player.seekTo":
      return { kind: "vr-ray", target: "spatial-player-progress", action: "change" };
    case "player.previous":
      return { kind: "vr-ray", target: "spatial-player-previous", action: "select" };
    case "player.source.select":
      return { kind: "vr-ray", target: "spatial-playlist-source-select", action: "select" };
    case "playlist.toggle":
      return { kind: "vr-ray", target: "spatial-playlist-toggle", action: "select" };
    default:
      return null;
  }
}

function payloadFromSpatialAction(action: Spatial3DUiAction) {
  switch (action.type) {
    case "crop.end":
      return { renderAfterEnd: true };
    case "player.seekTo":
      return { timeMs: action.timeMs };
    case "player.source.select":
      return { sourceId: action.source.id };
    default:
      return undefined;
  }
}

function effectPayloadFromSpatialAction(action: Extract<Spatial3DUiAction, { type: "effects.hold.end" | "effects.hold.start" | "effects.select" }>) {
  return {
    categoryId: action.categoryId,
    conflictGroup: action.conflictGroup,
    durationMs: "durationMs" in action ? action.durationMs : undefined,
    effectId: action.effectId,
    eventName: action.eventName,
    label: action.label,
    params: action.params,
    previewMode: action.previewMode,
    previewTarget: action.previewTarget,
    renderFallback: action.renderFallback,
    renderStage: action.renderStage,
    renderSupported: action.renderSupported
  };
}

function eventFromSpatialAction(action: Spatial3DUiAction): Pick<PcEditorEventInput, "payload" | "type"> | null {
  const trigger = triggerFromSpatialAction(action);
  const binding = trigger ? resolvePcEditorBinding(trigger, defaultPcEditorBindings) : null;

  if (binding) {
    return {
      type: binding.event.type,
      payload: payloadFromSpatialAction(action) ?? binding.event.payload
    };
  }

  switch (action.type) {
    case "crop.autoRender.set":
      return { type: "editor.render.auto.set", payload: { enabled: action.enabled } };
    case "crop.end":
      return { type: "editor.crop.end", payload: { renderAfterEnd: true } };
    case "crop.render":
    case "render.request":
      return { type: "editor.render.request" };
    case "crop.start":
      return { type: "editor.crop.start" };
    case "effects.category.toggle":
      return { type: "ui.panel.effects.category.toggle", payload: { categoryId: action.categoryId, open: action.open } };
    case "effects.hold.end":
      return {
        type: "editor.effects.hold.end",
        payload: effectPayloadFromSpatialAction(action)
      };
    case "effects.hold.start":
      return {
        type: "editor.effects.hold.start",
        payload: effectPayloadFromSpatialAction(action)
      };
    case "effects.select":
      return {
        type: "editor.effects.select",
        payload: effectPayloadFromSpatialAction(action)
      };
    case "effects.shortcut.key.down":
      return { type: "editor.effects.shortcut.key.down", payload: { key: action.key, repeat: action.repeat } };
    case "effects.shortcut.key.up":
      return { type: "editor.effects.shortcut.key.up", payload: { key: action.key } };
    case "effects.shortcut.open":
      return { type: "editor.effects.shortcut.open" };
    case "effects.speed.reset":
      return { type: "editor.effects.speed.reset" };
    case "effects.speed.set":
      return { type: "editor.effects.speed.set", payload: { effectSpeed: action.effectSpeed } };
    case "mask.fov.step":
      return { type: "editor.viewport.fov.step", payload: { delta: action.delta } };
    case "mask.lock.set":
      return { type: "editor.viewport.lock.set", payload: { locked: action.locked } };
    case "mask.opacity.set":
      return { type: "editor.mask.opacity.set", payload: { durationMs: action.durationMs, opacity: action.opacity } };
    case "mask.pitch.step":
      return { type: "editor.viewport.center.step", payload: { pitchDelta: action.delta, yawDelta: 0 } };
    case "mask.yaw.step":
      return { type: "editor.viewport.center.step", payload: { pitchDelta: 0, yawDelta: action.delta } };
    case "overlays.close":
    case "playlist.close":
      return { type: "player.playlist.close" };
    case "panel.effects.collapse.set":
      return { type: "ui.panel.effects.collapse.set", payload: { collapsed: action.collapsed } };
    case "panel.workbench.collapse.set":
      return { type: "ui.panel.workbench.collapse.set", payload: { collapsed: action.collapsed } };
    case "player.next":
      return { type: "player.source.next" };
    case "player.playPause.toggle":
      return { type: "player.playback.toggle" };
    case "player.playbackRate.reset":
      return { type: "player.playback.rate.reset" };
    case "player.playbackRate.set":
      return { type: "player.playback.rate.set", payload: { playbackRate: action.playbackRate } };
    case "player.previous":
      return { type: "player.source.previous" };
    case "player.recordingRate.reset":
      return { type: "player.recording.rate.reset" };
    case "player.recordingRate.set":
      return { type: "player.recording.rate.set", payload: { recordingRate: action.recordingRate } };
    case "player.seekTo":
      return { type: "player.playback.seek", payload: { timeMs: action.timeMs } };
    case "player.source.select":
      return { type: "player.source.select", payload: { sourceId: action.source.id } };
    case "playlist.open":
      return { type: "player.playlist.open" };
    case "playlist.toggle":
      return { type: "player.playlist.toggle" };
    case "render.auto.set":
      return { type: "editor.render.auto.set", payload: { enabled: action.enabled } };
    case "timeline.cut":
      return { type: "editor.timeline.cut" };
    case "timeline.discard.begin":
      return { type: "editor.timeline.discard.begin" };
    case "timeline.discard.end":
      return { type: "editor.timeline.discard.end" };
    case "timeline.flush":
      return { type: "editor.timeline.flush", payload: { reason: "live" } };
    default:
      return null;
  }
}

function dualTriggerPlaybackEvent() {
  const binding = resolvePcEditorBinding(
    { kind: "xr-runtime", target: "dual-trigger", action: "press" },
    defaultPcEditorBindings
  );

  return binding?.event ?? { type: "player.playback.toggle" as const };
}

function clampNumber(value: number, min: number, max: number) {
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

  return Object.is(nextYaw, -0) ? 0 : nextYaw;
}

function isVrMaskProbeEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  const search = new URLSearchParams(window.location.search);
  return search.get("vrMaskProbe") === "1" || search.get("vrMaskProbe") === "true";
}

function angularCenterDistanceDeg(a: { pitch: number; yaw: number }, b: { pitch: number; yaw: number }) {
  let yawDelta = a.yaw - b.yaw;

  while (yawDelta > 180) {
    yawDelta -= 360;
  }
  while (yawDelta < -180) {
    yawDelta += 360;
  }

  return Math.hypot(yawDelta, a.pitch - b.pitch);
}

function isFiniteCenter(center: { pitch: number; yaw: number } | null | undefined): center is { pitch: number; yaw: number } {
  return center !== null && center !== undefined && Number.isFinite(center.pitch) && Number.isFinite(center.yaw);
}

function directionToViewCenter(direction: AFrameDirectionLike) {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z)) {
    return null;
  }

  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length <= 0.000001) {
    return null;
  }

  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;
  const center = {
    pitch: clampNumber(Math.asin(clampNumber(y, -1, 1)) * 180 / Math.PI, -85, 85),
    yaw: normalizeYaw(Math.atan2(x, -z) * 180 / Math.PI)
  };

  return isFiniteCenter(center) ? center : null;
}

function readHeadGazeCenter(scene: HTMLElement) {
  const runtimeCameraPose = getPcEditorRuntimeState().cameraPose?.center;

  if (typeof window === "undefined") {
    return isFiniteCenter(runtimeCameraPose) ? runtimeCameraPose : null;
  }

  const sceneCamera = (scene as AFrameSceneWithCamera).camera;
  const camera = scene.querySelector("[camera]") as AFrameEntityWithObject3D | null;
  const Vector3 = (window as AFrameWindowWithThree).AFRAME?.THREE?.Vector3;

  if (!Vector3) {
    return isFiniteCenter(runtimeCameraPose) ? runtimeCameraPose : null;
  }

  (scene as AFrameSceneWithCamera).object3D?.updateMatrixWorld?.(true);
  sceneCamera?.updateMatrixWorld?.(true);
  camera?.object3D?.updateMatrixWorld?.(true);

  const xrManager = (scene as AFrameSceneWithCamera).renderer?.xr;
  const xrCamera = sceneCamera && xrManager?.isPresenting === true
    ? xrManager.getCamera?.(sceneCamera)
    : null;
  xrCamera?.updateMatrixWorld?.(true);

  const direction =
    xrCamera?.getWorldDirection?.(new Vector3()) ??
    sceneCamera?.getWorldDirection?.(new Vector3()) ??
    camera?.object3D?.getWorldDirection?.(new Vector3());
  const liveCenter = direction ? directionToViewCenter(direction) : null;

  return liveCenter ?? (isFiniteCenter(runtimeCameraPose) ? runtimeCameraPose : null);
}

function rateChipTargetFromElement(element: HTMLElement | null): SpatialRateChipTarget | null {
  const hitElement = element?.closest("[data-hybrid-control-id], [data-testid]");

  if (!(hitElement instanceof HTMLElement)) {
    return null;
  }

  const controlId = hitElement.dataset.hybridControlId;
  const testId = hitElement.dataset.testid;

  if (controlId === "playbackRate" || testId === "hybrid-player-playback-rate" || testId === "spatial-native-player-playback-rate") {
    return "playback";
  }

  if (controlId === "recordingRate" || testId === "hybrid-player-recording-rate" || testId === "spatial-native-player-recording-rate") {
    return "recording";
  }

  if (controlId === "effectSpeed" || testId === "hybrid-player-effect-speed" || testId === "spatial-native-player-effect-speed") {
    return "effect";
  }

  return null;
}

function rateChipTargetFromEvent(event: Event): SpatialRateChipTarget | null {
  return rateChipTargetFromElement(event.target instanceof HTMLElement ? event.target : null);
}

function readThumbstickMagnitude(event: Event, direction: "down" | "left" | "right" | "up") {
  const detail = (event as CustomEvent<Record<string, unknown>>).detail;

  if (!detail || typeof detail !== "object") {
    return null;
  }

  const directAxis = direction === "left" || direction === "right" ? detail.x : detail.y;
  if (typeof directAxis === "number" && Number.isFinite(directAxis)) {
    return Math.abs(directAxis);
  }

  const axis = detail.axis;
  if (Array.isArray(axis)) {
    const value = direction === "left" || direction === "right" ? axis[0] : axis[1];

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.abs(value);
    }
  }

  return null;
}

function normalizeAxis(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < VR_AXIS_DEADZONE) {
    return 0;
  }

  const sign = value < 0 ? -1 : 1;
  return sign * clampNumber((Math.abs(value) - VR_AXIS_DEADZONE) / (1 - VR_AXIS_DEADZONE), 0, 1);
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

function readAFrameControllerAxes(scene: HTMLElement, hand: "left" | "right") {
  const controller = findAFrameControllerElement(scene, hand);
  const componentNames = [
    "tracked-controls",
    "oculus-touch-controls",
    "vive-controls",
    "windows-motion-controls",
    "laser-controls"
  ];
  let bestAxes: ControllerAxes | null = null;

  for (const componentName of componentNames) {
    const axes = readPrimaryThumbstickAxes(controller?.components?.[componentName]?.controller?.gamepad);

    if (!axes) {
      continue;
    }

    if (!bestAxes || axes.magnitude > bestAxes.magnitude) {
      bestAxes = axes;
    }
  }

  return bestAxes;
}

function strongestControllerAxes(...candidates: Array<ControllerAxes | null>) {
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

function readXrControllerGamepad(scene: HTMLElement, hand: "left" | "right") {
  const session = (scene as AFrameSceneWithXrSession).xrSession;

  if (!session) {
    return null;
  }

  for (const inputSource of Array.from(session.inputSources ?? []) as XrInputSourceWithGamepad[]) {
    if (inputSource.handedness === hand && inputSource.gamepad) {
      return inputSource.gamepad;
    }
  }

  return null;
}

function findAFrameControllerElement(scene: HTMLElement, hand: "left" | "right") {
  const byId = scene.querySelector(`#${hand}-controller`);
  if (byId instanceof HTMLElement) {
    return byId as AFrameEntityWithObject3D;
  }

  const candidates = Array.from(scene.querySelectorAll("[hand], [data-hand]"));
  const match = candidates.find((element) =>
    element instanceof HTMLElement &&
    (element.getAttribute("hand") === hand || element.dataset.hand === hand)
  );

  return match instanceof HTMLElement ? match as AFrameEntityWithObject3D : null;
}

function collectQuestControllerEventTargets(scene: HTMLElement) {
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

function readGamepadButtonPressed(gamepad: Gamepad | null, index: number) {
  const button = gamepad?.buttons[index];

  return button?.pressed === true || (typeof button?.value === "number" && button.value > 0.55);
}

function readAFrameTrackedButtonPressed(scene: HTMLElement, hand: "left" | "right", index: number) {
  const controller = findAFrameControllerElement(scene, hand);
  const trackedControls = controller?.components?.["tracked-controls"];
  const state = trackedControls?.buttonStates?.[String(index)];

  if (state) {
    return state.pressed === true || (state.value ?? 0) > 0.55;
  }

  return readGamepadButtonPressed(trackedControls?.controller?.gamepad ?? null, index);
}

function readQuestButtonPressed(scene: HTMLElement, hand: "left" | "right", buttonId: ControllerButtonId) {
  const gamepad = readXrControllerGamepad(scene, hand);
  const readButton = (index: number) =>
    gamepad ? readGamepadButtonPressed(gamepad, index) : readAFrameTrackedButtonPressed(scene, hand, index);

  switch (buttonId) {
    case "trigger":
      return readButton(0);
    case "grip":
      return readButton(1);
    case "x":
      return hand === "left" && readButton(4);
    case "y":
      return hand === "left" && readButton(5);
    case "a":
      return hand === "right" && readButton(4);
    case "b":
      return hand === "right" && readButton(5);
    default:
      return false;
  }
}

function rateStepFromThumbstick(event: Event, direction: "down" | "up") {
  const magnitude = readThumbstickMagnitude(event, direction);

  return magnitude !== null && magnitude >= 0.75 ? VR_RATE_LARGE_STEP : VR_RATE_SMALL_STEP;
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

function writeControllerButtonState({
  action,
  buttonId,
  hand,
  pressed
}: {
  action: string;
  buttonId: string;
  hand: "left" | "right";
  pressed: boolean;
}) {
  const currentButtons = getPcEditorRuntimeState().input.vrControllers[hand]?.buttons ?? {};
  const buttons = {
    ...currentButtons,
    [buttonId]: {
      pressed,
      touched: pressed,
      value: pressed ? 1 : 0
    }
  };

  setPcEditorVrControllerState(hand, { buttons });
  setPcEditorControlPressed({
    action,
    id: `vr-${hand}-${buttonId}`,
    pressed,
    sourceKind: "xr-runtime"
  });
}

function emitXrRuntimeEvent(
  emitEvent: ReturnType<typeof usePcEditorEventEmitter>,
  event: Pick<PcEditorEventInput, "payload" | "type">,
  id: string,
  phase?: "change" | "end" | "start"
) {
  emitEvent({
    ...event,
    meta: phase ? { phase } : undefined,
    source: {
      device: "quest",
      id,
      kind: "xr-runtime"
    }
  });
}

function isRuntimeControllerButtonPressed(hand: "left" | "right", buttonId: string) {
  return getPcEditorRuntimeState().input.vrControllers[hand]?.buttons[buttonId]?.pressed === true;
}

function useQuestControllerBindingAdapter({
  emitEvent,
  enabled,
  maskControlsEnabled = true,
  sceneRef
}: {
  emitEvent: ReturnType<typeof usePcEditorEventEmitter>;
  enabled: boolean;
  maskControlsEnabled?: boolean;
  sceneRef: RefObject<HTMLElement | null>;
}) {
  const activeRateChipRef = useRef<ActiveRateChipState | null>(null);
  const axisFrameRef = useRef<number | null>(null);
  const axisLastTimeRef = useRef<number | null>(null);
  const axisMotionIdsRef = useRef<Record<AxisMotionKind, string | null>>({
    center: null,
    fov: null,
    roll: null
  });
  const centerAxisFilterRef = useRef(createLineRippleFilterState());
  const centerAxisVelocityRef = useRef<PcMotionVector>({ pitch: 0, yaw: 0 });
  const fovAxisVelocityRef = useRef(0);
  const rollAxisVelocityRef = useRef(0);
  const bulletTimeActiveRef = useRef(false);
  const bulletTimeRestoreRateRef = useRef<number | null>(null);
  const controllerAxesFromEventRef = useRef<Partial<Record<"left" | "right", ControllerAxesSample>>>({});
  const dualTriggerArmedRef = useRef(false);
  const eventDrivenButtonsRef = useRef<Record<string, boolean>>({});
  const gripPhysicalPressedRef = useRef<Record<"left" | "right", boolean>>({ left: false, right: false });
  const gripToggleActiveRef = useRef<Record<"left" | "right", boolean>>({ left: false, right: false });
  const heldButtonsRef = useRef<Record<string, boolean>>({});
  const headFollowActiveRef = useRef(false);
  const headFollowCenterRef = useRef<{ pitch: number; yaw: number } | null>(null);
  const headFollowFrameRef = useRef<number | null>(null);
  const headFollowLastTimeRef = useRef<number | null>(null);
  const headFollowMotionIdRef = useRef<string | null>(null);
  const headFollowSourceIdRef = useRef("vr-dual-grip-head-follow");
  const headFollowTargetRef = useRef<{ pitch: number; yaw: number } | null>(null);
  const headFollowVelocityRef = useRef<PcMotionVector>({ pitch: 0, yaw: 0 });
  const lastGripToggleAtRef = useRef<Record<"left" | "right", number>>({ left: 0, right: 0 });
  const lastContinuousAxisAtRef = useRef(0);
  const rateAnimationFrameRef = useRef<number | null>(null);
  const rateAxisLastTickAtRef = useRef(0);
  const rateLastEmittedRef = useRef<Partial<Record<SpatialRateChipTarget, number>>>({});
  const rateTargetRef = useRef<Partial<Record<SpatialRateChipTarget, number>>>({});
  const simpleLeftAxisRef = useRef<ControllerAxes>({ magnitude: 0, x: 0, y: 0 });
  const simpleRightAxisRef = useRef<ControllerAxes>({ magnitude: 0, x: 0, y: 0 });
  const suppressRateChipClickTargetRef = useRef<SpatialRateChipTarget | null>(null);
  const suppressRateChipClickUntilRef = useRef(0);
  const suppressRayClickUntilRef = useRef(0);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!enabled || !scene) {
      return undefined;
    }

    const suppressRayClick = (event: Event) => {
      if (performance.now() > suppressRayClickUntilRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const suppressAdjustedRateChipClick = (event: Event) => {
      const target = rateChipTargetFromEvent(event);

      if (
        performance.now() > suppressRateChipClickUntilRef.current ||
        !target ||
        target !== suppressRateChipClickTargetRef.current
      ) {
        return;
      }

      suppressRateChipClickTargetRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleSpatialPointerDown = (event: Event) => {
      const target = rateChipTargetFromEvent(event);

      if (!target) {
        return;
      }

      activeRateChipRef.current = {
        adjusted: false,
        target
      };
      rateTargetRef.current[target] = undefined;
    };

    const handleSpatialPointerUp = () => {
      if (activeRateChipRef.current?.adjusted) {
        suppressRateChipClickTargetRef.current = activeRateChipRef.current.target;
        suppressRateChipClickUntilRef.current = performance.now() + VR_RATE_CLICK_SUPPRESS_MS;
      }

      activeRateChipRef.current = null;
    };

    const cancelRateAnimation = () => {
      if (rateAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(rateAnimationFrameRef.current);
        rateAnimationFrameRef.current = null;
      }
    };

    const readCurrentRate = (target: SpatialRateChipTarget) => {
      const runtime = getPcEditorRuntimeState();

      if (target === "playback") {
        return runtime.playback?.playbackRate ?? DEFAULT_BULLET_TIME_RESTORE_RATE;
      }

      if (target === "recording") {
        return runtime.rates.recordingRate;
      }

      return runtime.rates.effectSpeed;
    };

    const emitRateSet = (target: SpatialRateChipTarget, rate: number, phase: "change" | "end" | "start") => {
      const roundedRate = Number(clampNumber(rate, target === "playback" ? BULLET_TIME_PLAYBACK_RATE : VR_RATE_MIN, VR_RATE_MAX).toFixed(3));
      const event =
        target === "playback"
          ? {
              type: "player.playback.rate.set" as const,
              payload: { playbackRate: roundedRate }
            }
          : target === "recording"
            ? {
                type: "player.recording.rate.set" as const,
                payload: { recordingRate: roundedRate }
              }
            : {
                type: "editor.effects.speed.set" as const,
                payload: { effectSpeed: roundedRate }
              };

      rateLastEmittedRef.current[target] = roundedRate;
      emitXrRuntimeEvent(emitEvent, event, `vr-rate-chip-${target}`, phase);
    };

    const smoothRateSet = (target: SpatialRateChipTarget, targetRate: number) => {
      cancelRateAnimation();

      const startRate = rateLastEmittedRef.current[target] ?? readCurrentRate(target);
      const startTime = performance.now();
      const clampedTargetRate = clampNumber(targetRate, VR_RATE_MIN, VR_RATE_MAX);

      const tick = (time: number) => {
        const progress = clampNumber((time - startTime) / VR_RATE_SMOOTH_MS, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const nextRate = startRate + (clampedTargetRate - startRate) * eased;

        emitRateSet(target, nextRate, progress >= 1 ? "end" : "change");

        if (progress < 1) {
          rateAnimationFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        rateAnimationFrameRef.current = null;
      };

      emitRateSet(target, startRate, "start");
      rateAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    const adjustActiveRateChip = (event: Event, direction: "down" | "up") => {
      const activeRateChip = activeRateChipRef.current;

      if (!activeRateChip) {
        return false;
      }

      const step = rateStepFromThumbstick(event, direction);
      const directionSign = direction === "up" ? 1 : -1;
      const currentTargetRate = rateTargetRef.current[activeRateChip.target] ?? readCurrentRate(activeRateChip.target);
      const targetRate = clampNumber(currentTargetRate + directionSign * step, VR_RATE_MIN, VR_RATE_MAX);

      activeRateChip.adjusted = true;
      rateTargetRef.current[activeRateChip.target] = targetRate;

      if (activeRateChip.target === "playback") {
        bulletTimeActiveRef.current = false;
        bulletTimeRestoreRateRef.current = null;
        setPcEditorRateState({
          bulletTimeActive: false,
          frontendPlaybackRate: DEFAULT_BULLET_TIME_RESTORE_RATE
        });
      }

      smoothRateSet(activeRateChip.target, targetRate);
      return true;
    };

    const adjustActiveRateChipByAxis = (axisY: number, time: number) => {
      const activeRateChip = activeRateChipRef.current;

      if (!activeRateChip || Math.abs(axisY) <= 0) {
        return false;
      }

      if (time - rateAxisLastTickAtRef.current < VR_RATE_AXIS_TICK_MS) {
        return true;
      }

      const step = Math.abs(axisY) >= 0.75 ? VR_RATE_LARGE_STEP : VR_RATE_SMALL_STEP;
      const directionSign = axisY < 0 ? 1 : -1;
      const currentTargetRate = rateTargetRef.current[activeRateChip.target] ?? readCurrentRate(activeRateChip.target);
      const targetRate = clampNumber(currentTargetRate + directionSign * step, VR_RATE_MIN, VR_RATE_MAX);

      rateAxisLastTickAtRef.current = time;
      activeRateChip.adjusted = true;
      rateTargetRef.current[activeRateChip.target] = targetRate;

      if (activeRateChip.target === "playback") {
        bulletTimeActiveRef.current = false;
        bulletTimeRestoreRateRef.current = null;
        setPcEditorRateState({
          bulletTimeActive: false,
          frontendPlaybackRate: DEFAULT_BULLET_TIME_RESTORE_RATE
        });
      }

      smoothRateSet(activeRateChip.target, targetRate);
      return true;
    };

    const readRuntimeCenter = () => getPcEditorRuntimeState().viewTarget?.center ?? getPcEditorRuntimeState().cropMask?.center ?? { pitch: 0, yaw: 0 };

    const readRuntimeFovH = () => getPcEditorRuntimeState().viewTarget?.fov.h ?? getPcEditorRuntimeState().cropMask?.fov.h ?? 90;

    const readRuntimeRoll = () => getPcEditorRuntimeState().viewTarget?.roll ?? getPcEditorRuntimeState().cropMask?.roll ?? 0;

    const isControllerButtonHeld = (hand: "left" | "right", buttonId: string) =>
      heldButtonsRef.current[`${hand}:${buttonId}`] === true || isRuntimeControllerButtonPressed(hand, buttonId);

    const readControllerAxes = (hand: "left" | "right") => {
      const eventAxes = controllerAxesFromEventRef.current[hand];

      if (eventAxes && performance.now() - eventAxes.at <= VR_EVENT_AXIS_TTL_MS) {
        return eventAxes;
      }

      return strongestControllerAxes(
        readAFrameControllerAxes(scene, hand),
        readXrControllerAxes(scene, hand)
      );
    };

    const axisMotionId = (kind: AxisMotionKind) => {
      const currentId = axisMotionIdsRef.current[kind];

      if (currentId) {
        return {
          id: currentId,
          phase: "change" as const
        };
      }

      const id = `vr-axis-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      axisMotionIdsRef.current[kind] = id;
      if (kind === "center") {
        resetLineRippleFilter(centerAxisFilterRef.current, readRuntimeCenter());
      }
      return {
        id,
        phase: "start" as const
      };
    };

    const emitCenterSet = (pitch: number, yaw: number, commit: boolean, phase: "change" | "end" | "start", motionId: string) => {
      emitXrRuntimeEvent(emitEvent, {
        type: "editor.viewport.center.set",
        payload: {
          commit,
          motionId,
          pitch: clampNumber(pitch, -88, 88),
          yaw: normalizeYaw(yaw)
        }
      }, "vr-left-grip-left-stick-mask-move", phase);
    };

    const writeVrViewTarget = (
      update: (current: {
        center: { pitch: number; yaw: number };
        fov: { h: number; v: number };
        locked: boolean;
        maskOpacity: number;
        roll: number;
        videoTimeMs: number;
      }) => {
        center: { pitch: number; yaw: number };
        fov: { h: number; v: number };
        locked: boolean;
        maskOpacity: number;
        roll: number;
        videoTimeMs: number;
      }
    ) => {
      const runtime = getPcEditorRuntimeState();
      const viewTarget = runtime.viewTarget;
      const cropMask = runtime.cropMask;
      const fallbackFovH = viewTarget?.fov.h ?? cropMask?.fov.h ?? 90;
      const current = {
        center: viewTarget?.center ?? cropMask?.center ?? { pitch: 0, yaw: 0 },
        fov: viewTarget?.fov ?? cropMask?.fov ?? {
          h: fallbackFovH,
          v: verticalFovFromHorizontal(fallbackFovH)
        },
        locked: viewTarget?.locked ?? cropMask?.locked ?? false,
        maskOpacity: viewTarget?.maskOpacity ?? cropMask?.maskOpacity ?? 0.74,
        roll: viewTarget?.roll ?? cropMask?.roll ?? 0,
        videoTimeMs: runtime.playback?.currentTimeMs ?? viewTarget?.videoTimeMs ?? cropMask?.videoTimeMs ?? 0
      };
      const next = update(current);
      const fovH = clampNumber(next.fov.h, PC_EDITOR_MIN_VIEWPORT_FOV_H, PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H);

      setPcEditorViewTarget({
        center: {
          pitch: clampNumber(next.center.pitch, -88, 88),
          yaw: normalizeYaw(next.center.yaw)
        },
        fov: {
          h: fovH,
          v: verticalFovFromHorizontal(fovH)
        },
        input: "controller",
        // Direct VR mask edits must own the crop target. If the mask remains
        // unlocked, the A-Frame mask component re-centers it to headset gaze on
        // every tick, which looks like a tiny nudge followed by a snap back.
        locked: true,
        maskOpacity: clampNumber(next.maskOpacity, VR_MASK_OPACITY_MIN, VR_MASK_OPACITY_MAX),
        roll: next.roll,
        source: "controller",
        videoTimeMs: runtime.playback?.currentTimeMs ?? next.videoTimeMs
      });
    };

    const writeVrCenterDelta = (pitchDelta: number, yawDelta: number) => {
      if (Math.abs(pitchDelta) <= 0.001 && Math.abs(yawDelta) <= 0.001) {
        return;
      }

      dispatchVrMaskCenterStep(pitchDelta, yawDelta);
    };

    const writeVrFovDelta = (delta: number) => {
      if (Math.abs(delta) <= 0.001) {
        return;
      }

      dispatchVrMaskFovStep(delta);
    };

    const writeVrOpacityDelta = (delta: number) => {
      if (Math.abs(delta) <= 0.0001) {
        return;
      }

      writeVrViewTarget((current) => ({
        ...current,
        maskOpacity: current.maskOpacity + delta
      }));
    };

    const startVrMaskProbe = () => {
      if (!isVrMaskProbeEnabled()) {
        return null;
      }

      const runtime = getPcEditorRuntimeState();
      const base = runtime.viewTarget?.center ?? runtime.cropMask?.center ?? { pitch: 0, yaw: 0 };
      const baseOpacity = runtime.viewTarget?.maskOpacity ?? runtime.cropMask?.maskOpacity ?? 0.74;
      const startedAt = performance.now();
      let frame: number | null = null;

      const tick = (time: number) => {
        const elapsedSeconds = (time - startedAt) / 1000;
        const phase = elapsedSeconds * Math.PI * 0.55;
        const yawOffset = Math.sin(phase) * 24;
        const pitchOffset = Math.sin(phase * 0.67) * 8;
        const opacityOffset = Math.sin(phase * 1.15) * 0.18;

        writeVrViewTarget((current) => ({
          ...current,
          center: {
            pitch: base.pitch + pitchOffset,
            yaw: base.yaw + yawOffset
          },
          maskOpacity: baseOpacity + opacityOffset
        }));
        frame = window.requestAnimationFrame(tick);
      };

      frame = window.requestAnimationFrame(tick);
      return () => {
        if (frame !== null) {
          window.cancelAnimationFrame(frame);
        }
      };
    };

    const emitHeadGazeCenterSet = (center: { pitch: number; yaw: number }, commit: boolean, phase: "change" | "end" | "start") => {
      emitXrRuntimeEvent(emitEvent, {
        type: "editor.viewport.center.set",
        payload: {
          commit,
          input: "head_gaze",
          motionId: headFollowMotionIdRef.current,
          pitch: clampNumber(center.pitch, -88, 88),
          yaw: normalizeYaw(center.yaw)
        }
      }, headFollowSourceIdRef.current, phase);
    };

    const emitFovSet = (fovH: number, commit: boolean, phase: "change" | "end" | "start", motionId: string) => {
      emitXrRuntimeEvent(emitEvent, {
        type: "editor.viewport.fov.set",
        payload: {
          commit,
          fovH,
          motionId
        }
      }, "vr-left-grip-left-stick-fov", phase);
    };

    const emitRollSet = (roll: number, commit: boolean, phase: "change" | "end" | "start", motionId: string) => {
      emitXrRuntimeEvent(emitEvent, {
        type: "editor.viewport.roll.set",
        payload: {
          commit,
          motionId,
          roll
        }
      }, "vr-left-grip-right-stick-roll", phase);
    };

    const stopAxisMotion = (kind: AxisMotionKind) => {
      const motionId = axisMotionIdsRef.current[kind];

      if (!motionId) {
        if (kind === "center") {
          centerAxisVelocityRef.current = { pitch: 0, yaw: 0 };
          resetLineRippleFilter(centerAxisFilterRef.current);
        } else if (kind === "fov") {
          fovAxisVelocityRef.current = 0;
        } else {
          rollAxisVelocityRef.current = 0;
        }
        return;
      }

      if (kind === "center") {
        const center = readRuntimeCenter();
        emitCenterSet(center.pitch, center.yaw, true, "end", motionId);
        centerAxisVelocityRef.current = { pitch: 0, yaw: 0 };
        resetLineRippleFilter(centerAxisFilterRef.current);
      } else if (kind === "fov") {
        emitFovSet(readRuntimeFovH(), true, "end", motionId);
        fovAxisVelocityRef.current = 0;
      } else {
        emitRollSet(readRuntimeRoll(), true, "end", motionId);
        rollAxisVelocityRef.current = 0;
      }

      axisMotionIdsRef.current[kind] = null;
    };

    const adjustMaskOpacityByAxis = (axisY: number, deltaSeconds: number) => {
      const runtime = getPcEditorRuntimeState();
      const frontendRate = getPcEditorFrontendPlaybackRate();
      const currentOpacity = runtime.viewTarget?.maskOpacity ?? runtime.cropMask?.maskOpacity ?? 0.74;
      const opacity = clampNumber(
        currentOpacity + (axisY < 0 ? 1 : -1) * Math.abs(axisY) * VR_MASK_OPACITY_SPEED_PER_SECOND * deltaSeconds * frontendRate,
        VR_MASK_OPACITY_MIN,
        VR_MASK_OPACITY_MAX
      );

      emitXrRuntimeEvent(emitEvent, {
        type: "editor.mask.opacity.set",
        payload: {
          durationMs: 0,
          opacity
        }
      }, "vr-right-grip-right-stick-mask-opacity", "change");
    };

    const adjustMaskOpacityBySmoothedAxis = (axisY: number, deltaSeconds: number) => {
      if (Math.abs(axisY) <= 0 || deltaSeconds <= 0) {
        return;
      }

      writeVrOpacityDelta((axisY < 0 ? 1 : -1) * Math.abs(axisY) * VR_SIMPLE_OPACITY_SPEED_PER_SECOND * deltaSeconds);
    };

    const smoothSimpleAxis = (current: ControllerAxes, target: ControllerAxes | null) => {
      const nextX = current.x + ((target?.x ?? 0) - current.x) * VR_SIMPLE_AXIS_SMOOTH_ALPHA;
      const nextY = current.y + ((target?.y ?? 0) - current.y) * VR_SIMPLE_AXIS_SMOOTH_ALPHA;
      const x = Math.abs(nextX) < VR_SIMPLE_AXIS_STOP_EPSILON ? 0 : nextX;
      const y = Math.abs(nextY) < VR_SIMPLE_AXIS_STOP_EPSILON ? 0 : nextY;

      return {
        magnitude: Math.hypot(x, y),
        x,
        y
      };
    };

    const isDualGripPressed = () => isControllerButtonHeld("left", "grip") && isControllerButtonHeld("right", "grip");

    const isHeadFollowWanted = () => {
      const leftGripPressed = isControllerButtonHeld("left", "grip");
      const rightGripPressed = isControllerButtonHeld("right", "grip");

      if (!leftGripPressed) {
        return false;
      }

      const leftAxes = readControllerAxes("left");
      if (leftAxes && leftAxes.magnitude > 0) {
        return false;
      }

      const rightAxes = readControllerAxes("right");
      if (rightGripPressed && rightAxes && rightAxes.magnitude > 0) {
        return false;
      }

      headFollowSourceIdRef.current = rightGripPressed ? "vr-dual-grip-head-follow" : "vr-left-grip-head-drag";
      return true;
    };

    const stopHeadFollowFrame = () => {
      if (headFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(headFollowFrameRef.current);
        headFollowFrameRef.current = null;
      }
    };

    const emitHeadFollowCenter = (commit: boolean, phase: "change" | "end" | "start", frameTime = performance.now()) => {
      const center = readHeadGazeCenter(scene);

      if (!center) {
        return false;
      }

      if (!commit) {
        const lastTarget = headFollowTargetRef.current;
        if (lastTarget && angularCenterDistanceDeg(lastTarget, center) > 90) {
          headFollowTargetRef.current = center;
          return true;
        }

        headFollowTargetRef.current = center;
        const current = headFollowCenterRef.current ?? readRuntimeCenter();
        const lastTime = headFollowLastTimeRef.current ?? frameTime;
        const deltaSeconds = Math.min(0.05, Math.max(0, (frameTime - lastTime) / 1000));
        const step = stepTowardTarget({
          config: VR_HEAD_FOLLOW_CONFIG,
          current,
          deltaSeconds,
          target: center,
          velocity: headFollowVelocityRef.current
        });

        headFollowCenterRef.current = step.center;
        headFollowLastTimeRef.current = frameTime;
        headFollowVelocityRef.current = step.velocity;
        emitHeadGazeCenterSet(step.center, false, phase);
        return true;
      }

      emitHeadGazeCenterSet(headFollowCenterRef.current ?? headFollowTargetRef.current ?? readRuntimeCenter(), true, phase);

      return true;
    };

    const stopHeadFollow = (commit: boolean) => {
      stopHeadFollowFrame();

      if (headFollowActiveRef.current && commit) {
        emitHeadFollowCenter(true, "end");
      }

      headFollowActiveRef.current = false;
      headFollowCenterRef.current = null;
      headFollowMotionIdRef.current = null;
      headFollowLastTimeRef.current = null;
      headFollowTargetRef.current = null;
      headFollowVelocityRef.current = { pitch: 0, yaw: 0 };
    };

    const tickHeadFollow = (time: number) => {
      if (!isHeadFollowWanted()) {
        stopHeadFollow(true);
        return;
      }

      emitHeadFollowCenter(false, "change", time);
      headFollowFrameRef.current = window.requestAnimationFrame(tickHeadFollow);
    };

    const syncHeadFollow = () => {
      if (!isHeadFollowWanted()) {
        stopHeadFollow(true);
        return;
      }

      if (headFollowFrameRef.current !== null) {
        return;
      }

      headFollowActiveRef.current = true;
      headFollowCenterRef.current = readRuntimeCenter();
      headFollowLastTimeRef.current = performance.now();
      headFollowTargetRef.current = null;
      headFollowVelocityRef.current = { pitch: 0, yaw: 0 };
      headFollowMotionIdRef.current = `vr-head-follow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      emitHeadFollowCenter(false, "start", headFollowLastTimeRef.current);
      headFollowFrameRef.current = window.requestAnimationFrame(tickHeadFollow);
    };

    const writeButton = (event: Event, buttonId: string, pressed: boolean, action: string) => {
      const hand = readControllerHand(event);

      eventDrivenButtonsRef.current[`${hand}:${buttonId}`] = true;
      heldButtonsRef.current[`${hand}:${buttonId}`] = pressed;
      writeControllerButtonState({
        action,
        buttonId,
        hand,
        pressed
      });
    };

    const setGripToggleMode = (hand: "left" | "right", active: boolean) => {
      gripToggleActiveRef.current[hand] = active;
      heldButtonsRef.current[`${hand}:grip`] = active;
      writeControllerButtonState({
        action: "grip-mode-toggle",
        buttonId: "grip",
        hand,
        pressed: active
      });
    };

    const toggleGripMode = (event: Event) => {
      const hand = readControllerHand(event);
      const now = performance.now();

      if (now - (lastGripToggleAtRef.current[hand] ?? 0) < VR_GRIP_TOGGLE_DEBOUNCE_MS) {
        return;
      }

      lastGripToggleAtRef.current[hand] = now;
      gripPhysicalPressedRef.current[hand] = true;
      eventDrivenButtonsRef.current[`${hand}:grip`] = true;
      setGripToggleMode(hand, !gripToggleActiveRef.current[hand]);
      syncHeadFollow();
    };

    const markGripReleased = (event: Event) => {
      gripPhysicalPressedRef.current[readControllerHand(event)] = false;
    };

    const syncDualTriggerPlayback = () => {
      const leftTriggerPressed = isControllerButtonHeld("left", "trigger");
      const rightTriggerPressed = isControllerButtonHeld("right", "trigger");
      const bothPressed = leftTriggerPressed && rightTriggerPressed;

      if (bothPressed && !dualTriggerArmedRef.current) {
        dualTriggerArmedRef.current = true;
        suppressRayClickUntilRef.current = performance.now() + DUAL_TRIGGER_CLICK_SUPPRESS_MS;
        emitXrRuntimeEvent(emitEvent, dualTriggerPlaybackEvent(), "dual-trigger-playback-toggle", "start");
        return;
      }

      if (!bothPressed && dualTriggerArmedRef.current) {
        dualTriggerArmedRef.current = false;
        suppressRayClickUntilRef.current = performance.now() + DUAL_TRIGGER_CLICK_SUPPRESS_MS;
      }
    };

    const toggleBulletTime = () => {
      const playbackRate = getPcEditorRuntimeState().playback?.playbackRate ?? DEFAULT_BULLET_TIME_RESTORE_RATE;

      if (bulletTimeActiveRef.current) {
        const restoreRate = bulletTimeRestoreRateRef.current ?? DEFAULT_BULLET_TIME_RESTORE_RATE;

        bulletTimeActiveRef.current = false;
        bulletTimeRestoreRateRef.current = null;
        setPcEditorRateState({
          bulletTimeActive: false,
          frontendPlaybackRate: DEFAULT_BULLET_TIME_RESTORE_RATE
        });
        emitXrRuntimeEvent(emitEvent, {
          type: "player.playback.rate.set",
          payload: { playbackRate: restoreRate }
        }, "quest-a-bullet-time", "end");
        return;
      }

      bulletTimeActiveRef.current = true;
      bulletTimeRestoreRateRef.current =
        playbackRate > BULLET_TIME_PLAYBACK_RATE + 0.01 ? playbackRate : DEFAULT_BULLET_TIME_RESTORE_RATE;
      setPcEditorRateState({
        bulletTimeActive: true,
        frontendPlaybackRate: BULLET_TIME_PLAYBACK_RATE
      });
      emitXrRuntimeEvent(emitEvent, {
        type: "player.playback.rate.set",
        payload: { playbackRate: BULLET_TIME_PLAYBACK_RATE }
      }, "quest-a-bullet-time", "start");
    };

    const writeMomentaryButton = (event: Event, buttonId: string, action: string) => {
      const hand = readControllerHand(event);

      writeControllerButtonState({
        action,
        buttonId,
        hand,
        pressed: true
      });
      window.setTimeout(() => {
        writeControllerButtonState({
          action,
          buttonId,
          hand,
          pressed: false
        });
      }, 80);
      return hand;
    };

    const emitEventFromAction = (action: Spatial3DUiAction, id: string, phase?: "change" | "end" | "start") => {
      const event = eventFromSpatialAction(action);

      if (event) {
        emitXrRuntimeEvent(emitEvent, event, id, phase);
      }
    };

    const closeEffectsRing = () => {
      emitEventFromAction({ type: "effects.shortcut.key.down", key: "Escape" }, "quest-b-effects-ring-close", "end");
      setPcEditorEffectInput({ mode: "hidden" });
    };

    const syncPolledButton = (
      hand: "left" | "right",
      buttonId: ControllerButtonId,
      action: string,
      onDown?: () => void,
      onUp?: () => void
    ) => {
      const pressed = readQuestButtonPressed(scene, hand, buttonId);

      if (pressed === null) {
        return;
      }

      const wasPressed = isRuntimeControllerButtonPressed(hand, buttonId);
      const eventDriven = eventDrivenButtonsRef.current[`${hand}:${buttonId}`] === true;

      if (eventDriven && !pressed && wasPressed) {
        return;
      }

      if (pressed === wasPressed) {
        return;
      }

      writeControllerButtonState({
        action,
        buttonId,
        hand,
        pressed
      });
      heldButtonsRef.current[`${hand}:${buttonId}`] = pressed;

      if (pressed) {
        onDown?.();
      } else {
        onUp?.();
      }
    };

    const syncPolledControllerButtons = () => {
      syncPolledButton("left", "trigger", "trigger");
      syncPolledButton("right", "trigger", "trigger");
      syncPolledButton("left", "grip", "grip");
      syncPolledButton("right", "grip", "grip");
      syncPolledButton("right", "a", "bullet-time", toggleBulletTime);
      syncPolledButton("left", "x", "discard-toggle", () => {
        emitEventFromAction({ type: "timeline.discard.begin" }, "quest-x-discard-toggle", "change");
      });
      syncPolledButton("left", "y", "mask-opacity");
      syncPolledButton("right", "b", "effects-ring", () => {
        emitEventFromAction({ type: "effects.shortcut.open" }, "quest-b-effects-ring", "start");
      }, closeEffectsRing);
      syncDualTriggerPlayback();
    };

    const syncPolledGripToggle = (hand: "left" | "right") => {
      const pressed = readQuestButtonPressed(scene, hand, "grip");

      if (pressed === null) {
        return;
      }

      const wasPressed = gripPhysicalPressedRef.current[hand] === true;
      gripPhysicalPressedRef.current[hand] = pressed;

      if (!pressed || wasPressed) {
        return;
      }

      const now = performance.now();
      if (now - (lastGripToggleAtRef.current[hand] ?? 0) < VR_GRIP_TOGGLE_DEBOUNCE_MS) {
        return;
      }

      lastGripToggleAtRef.current[hand] = now;
      setGripToggleMode(hand, !gripToggleActiveRef.current[hand]);
    };

    const adjustMaskOpacity = (direction: "down" | "up") => {
      if (!maskControlsEnabled) {
        return;
      }

      writeVrOpacityDelta(direction === "up" ? VR_MASK_OPACITY_STEP : -VR_MASK_OPACITY_STEP);
    };

    const handleThumbstick = (event: Event, direction: "down" | "left" | "right" | "up") => {
      const hand = writeMomentaryButton(event, `thumbstick-${direction}`, `thumbstick-${direction}`);

      if (performance.now() - lastContinuousAxisAtRef.current < VR_AXIS_DISCRETE_SUPPRESS_MS) {
        return;
      }

      if (hand === "right" && (direction === "up" || direction === "down") && adjustActiveRateChip(event, direction)) {
        return;
      }

      if (!maskControlsEnabled) {
        return;
      }

      if (hand === "left") {
        writeVrCenterDelta(
          direction === "up" ? 5 : direction === "down" ? -5 : 0,
          direction === "right" ? 5 : direction === "left" ? -5 : 0
        );
        return;
      }

      if (hand === "right" && (direction === "up" || direction === "down")) {
        writeVrFovDelta(direction === "up" ? -5 : 5);
      }
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
      controllerAxesFromEventRef.current[readControllerHand(event)] = {
        at: performance.now(),
        magnitude: Math.hypot(x, y),
        x,
        y
      };
    };

    const stopAxisSampler = () => {
      if (axisFrameRef.current !== null) {
        window.cancelAnimationFrame(axisFrameRef.current);
        axisFrameRef.current = null;
      }

      axisLastTimeRef.current = null;
    };

    const tickControllerAxes = (time: number) => {
      syncPolledControllerButtons();

      const lastTime = axisLastTimeRef.current ?? time;
      const deltaSeconds = Math.min(VR_AXIS_MAX_DELTA_SECONDS, Math.max(0, (time - lastTime) / 1000));
      axisLastTimeRef.current = time;

      const leftAxes = readControllerAxes("left");
      const rightAxes = readControllerAxes("right");
      let emittedContinuousAxis = false;
      simpleLeftAxisRef.current = smoothSimpleAxis(simpleLeftAxisRef.current, leftAxes);
      simpleRightAxisRef.current = smoothSimpleAxis(simpleRightAxisRef.current, rightAxes);

      const rightYActive = rightAxes ? Math.abs(rightAxes.y) > 0 : false;

      if (rightAxes && activeRateChipRef.current && rightYActive) {
        emittedContinuousAxis = adjustActiveRateChipByAxis(rightAxes.y, time) || emittedContinuousAxis;
        simpleRightAxisRef.current = { magnitude: 0, x: 0, y: 0 };
      } else if (maskControlsEnabled) {
        const leftAxis = simpleLeftAxisRef.current;
        const rightAxis = simpleRightAxisRef.current;

        if (leftAxis.magnitude > 0 && deltaSeconds > 0) {
          writeVrCenterDelta(
            -leftAxis.y * VR_SIMPLE_CENTER_SPEED_DEG_PER_SECOND * deltaSeconds,
            leftAxis.x * VR_SIMPLE_CENTER_SPEED_DEG_PER_SECOND * deltaSeconds
          );
          emittedContinuousAxis = true;
        }

        if (Math.abs(rightAxis.y) > 0 && deltaSeconds > 0) {
          writeVrFovDelta(rightAxis.y * VR_FOV_SPEED_DEG_PER_SECOND * deltaSeconds);
          emittedContinuousAxis = true;
        }
      }

      if (emittedContinuousAxis) {
        lastContinuousAxisAtRef.current = performance.now();
      }

      axisFrameRef.current = window.requestAnimationFrame(tickControllerAxes);
    };

    const handlers: Array<[string, (event: Event) => void]> = [
      ["triggerdown", (event) => {
        writeButton(event, "trigger", true, "trigger");
        syncDualTriggerPlayback();
      }],
      ["triggerup", (event) => {
        writeButton(event, "trigger", false, "trigger");
        syncDualTriggerPlayback();
      }],
      ["gripdown", (event) => {
        writeButton(event, "grip", true, "grip");
      }],
      ["gripup", (event) => {
        writeButton(event, "grip", false, "grip");
      }],
      ["squeezestart", (event) => {
        writeButton(event, "grip", true, "grip");
      }],
      ["squeezeend", (event) => {
        writeButton(event, "grip", false, "grip");
      }],
      ["abuttondown", (event) => {
        writeButton(event, "a", true, "bullet-time");
        toggleBulletTime();
      }],
      ["abuttonup", (event) => writeButton(event, "a", false, "bullet-time")],
      ["xbuttondown", (event) => {
        writeButton(event, "x", true, "discard-toggle");
        emitEventFromAction({ type: "timeline.discard.begin" }, "quest-x-discard-toggle", "change");
      }],
      ["xbuttonup", (event) => {
        writeButton(event, "x", false, "discard-toggle");
      }],
      ["ybuttondown", (event) => {
        writeButton(event, "y", true, "mask-opacity");
      }],
      ["ybuttonup", (event) => writeButton(event, "y", false, "mask-opacity")],
      ["bbuttondown", (event) => {
        writeButton(event, "b", true, "effects-ring");
        emitEventFromAction({ type: "effects.shortcut.open" }, "quest-b-effects-ring", "start");
      }],
      ["bbuttonup", (event) => {
        writeButton(event, "b", false, "effects-ring");
        closeEffectsRing();
      }],
      ["thumbstickup", (event) => handleThumbstick(event, "up")],
      ["thumbstickdown", (event) => handleThumbstick(event, "down")],
      ["thumbstickleft", (event) => handleThumbstick(event, "left")],
      ["thumbstickright", (event) => handleThumbstick(event, "right")],
      ["thumbstickmoved", handleAxesMove],
      ["axismove", handleAxesMove]
    ];

    scene.addEventListener("click", suppressRayClick, true);
    scene.addEventListener("click", suppressAdjustedRateChipClick, true);
    scene.addEventListener("mousedown", suppressRayClick, true);
    scene.addEventListener("mousedown", handleSpatialPointerDown, true);
    scene.addEventListener("mouseup", suppressRayClick, true);
    scene.addEventListener("mouseup", handleSpatialPointerUp, true);
    const controllerEventTargets = collectQuestControllerEventTargets(scene);
    const handledControllerEvents = new WeakSet<Event>();
    const controllerHandlers = handlers.map(([eventName, handler]) => [
      eventName,
      (event: Event) => {
        if (handledControllerEvents.has(event)) {
          return;
        }

        handledControllerEvents.add(event);
        handler(event);
      }
    ] as [string, (event: Event) => void]);

    controllerEventTargets.forEach((target) => {
      controllerHandlers.forEach(([eventName, handler]) => target.addEventListener(eventName, handler));
    });
    const stopVrMaskProbe = maskControlsEnabled ? startVrMaskProbe() : null;
    axisFrameRef.current = window.requestAnimationFrame(tickControllerAxes);
    return () => {
      scene.removeEventListener("click", suppressRayClick, true);
      scene.removeEventListener("click", suppressAdjustedRateChipClick, true);
      scene.removeEventListener("mousedown", suppressRayClick, true);
      scene.removeEventListener("mousedown", handleSpatialPointerDown, true);
      scene.removeEventListener("mouseup", suppressRayClick, true);
      scene.removeEventListener("mouseup", handleSpatialPointerUp, true);
      controllerEventTargets.forEach((target) => {
        controllerHandlers.forEach(([eventName, handler]) => target.removeEventListener(eventName, handler));
      });
      controllerAxesFromEventRef.current = {};
      gripPhysicalPressedRef.current = { left: false, right: false };
      gripToggleActiveRef.current = { left: false, right: false };
      heldButtonsRef.current = {};
      simpleLeftAxisRef.current = { magnitude: 0, x: 0, y: 0 };
      simpleRightAxisRef.current = { magnitude: 0, x: 0, y: 0 };
      stopAxisSampler();
      cancelRateAnimation();
      stopHeadFollow(false);
      stopVrMaskProbe?.();
    };
  }, [emitEvent, enabled, maskControlsEnabled, sceneRef]);
}

export function PlayerV2Spatial3DUiLayer({
  activeSource,
  autoRenderEnabled,
  discardActive,
  discardMessage,
  playlistOpen,
  playlistSources,
  recordingActive,
  renderExportId,
  renderMessage,
  renderStatus,
  sceneRef,
  sourceLabel,
  sourceMessage,
  sourceStatus
}: PlayerV2Spatial3DUiLayerProps) {
  const emitEvent = usePcEditorEventEmitter();
  const effectCatalog = usePcEditorEffectCatalogState();
  const effectInput = usePcEditorEffectInput();
  const cameraPose = usePcEditorCameraPose();
  const playback = usePcEditorPlaybackState();
  const rates = usePcEditorRateState();
  const viewTarget = usePcEditorViewTarget();
  const xrSession = usePcEditorXrSession();
  const leftController = usePcEditorVrControllerState("left");
  const rightController = usePcEditorVrControllerState("right");
  const enabled = xrSession?.presenting === true;

  const spatialModel = useMemo(
    () => ({
      activeSourceId: activeSource.id,
      autoRenderEnabled,
      currentTimeMs: playback?.currentTimeMs ?? 0,
      discardActive,
      discardMessage,
      durationMs: playback?.durationMs ?? activeSource.durationMs ?? 0,
      effectSpeed: rates.effectSpeed,
      effectCategories: effectCatalog.categories,
      effectShortcutMode: effectInput?.mode ?? "hidden",
      isPlaying: playback?.isPlaying ?? false,
      maskLocked: viewTarget?.locked,
      maskOpacity: viewTarget?.maskOpacity ?? 0.7,
      playbackRate: playback?.playbackRate ?? 1,
      playlistOpen,
      playlistSources,
      recordingActive,
      recordingRate: rates.recordingRate,
      renderExportId,
      renderMessage,
      renderReady: renderStatus === "done" && Boolean(renderExportId),
      renderStatus,
      sourceResolution: activeSource.resolution ?? sourceLabel,
      title: activeSource.title ?? sourceLabel
    }),
    [
      activeSource,
      autoRenderEnabled,
      discardActive,
      discardMessage,
      effectCatalog.categories,
      effectInput?.mode,
      playback,
      playlistOpen,
      playlistSources,
      rates.effectSpeed,
      rates.recordingRate,
      recordingActive,
      renderExportId,
      renderMessage,
      renderStatus,
      sourceLabel,
      viewTarget?.locked,
      viewTarget?.maskOpacity
    ]
  );

  const emitSpatialEvent = useCallback(
    (action: Spatial3DUiAction) => {
      if (action.type === "effects.select") {
        setPcEditorEffectInput({
          categoryId: action.categoryId,
          effectId: action.effectId,
          eventName: action.eventName ?? action.effectId,
          label: action.label,
          mode: "selected",
          previewTarget: action.previewTarget
        });
      } else if (action.type === "effects.hold.start") {
        setPcEditorEffectInput({
          categoryId: action.categoryId,
          effectId: action.effectId,
          eventName: action.eventName ?? action.effectId,
          label: action.label,
          mode: "holding",
          previewTarget: action.previewTarget,
          startedAtMs: performance.now()
        });
      } else if (action.type === "effects.hold.end") {
        setPcEditorEffectInput({
          categoryId: action.categoryId,
          effectId: action.effectId,
          eventName: action.eventName ?? action.effectId,
          label: action.label,
          mode: "selected",
          previewTarget: action.previewTarget
        });
      }

      const event = eventFromSpatialAction(action);

      if (!event) {
        return;
      }

      emitEvent({
        ...event,
        source: {
          device: "quest",
          id: `spatial-3d-ui:${action.type}`,
          kind: "vr-ray"
        }
      });
    },
    [emitEvent]
  );

  useQuestControllerBindingAdapter({
    emitEvent,
    enabled,
    maskControlsEnabled: false,
    sceneRef
  });

  if (!enabled) {
    return null;
  }

  return createElement(
    Fragment,
    null,
    createElement("a-entity", {
      "data-discard-active": discardActive ? "true" : "false",
      "data-effect-catalog-count": String(effectCatalog.categories.reduce((count, category) => count + category.effects.length, 0)),
      "data-effect-mode": effectInput?.mode ?? "hidden",
      "data-head-pitch": String(cameraPose?.center.pitch ?? ""),
      "data-head-yaw": String(cameraPose?.center.yaw ?? ""),
      "data-mask-fov": String(viewTarget?.fov.h ?? ""),
      "data-mask-locked": viewTarget?.locked ? "true" : "false",
      "data-mask-opacity": String(viewTarget?.maskOpacity ?? ""),
      "data-mask-pitch": String(viewTarget?.center.pitch ?? ""),
      "data-mask-yaw": String(viewTarget?.center.yaw ?? ""),
      "data-playback-rate": String(playback?.playbackRate ?? 1),
      "data-recording-active": recordingActive ? "true" : "false",
      "data-left-a-pressed": leftController?.buttons.a?.pressed ? "true" : "false",
      "data-left-b-pressed": leftController?.buttons.b?.pressed ? "true" : "false",
      "data-left-grip-pressed": leftController?.buttons.grip?.pressed ? "true" : "false",
      "data-left-trigger-pressed": leftController?.buttons.trigger?.pressed ? "true" : "false",
      "data-left-x-pressed": leftController?.buttons.x?.pressed ? "true" : "false",
      "data-left-y-pressed": leftController?.buttons.y?.pressed ? "true" : "false",
      "data-right-a-pressed": rightController?.buttons.a?.pressed ? "true" : "false",
      "data-right-b-pressed": rightController?.buttons.b?.pressed ? "true" : "false",
      "data-right-grip-pressed": rightController?.buttons.grip?.pressed ? "true" : "false",
      "data-right-trigger-pressed": rightController?.buttons.trigger?.pressed ? "true" : "false",
      "data-right-x-pressed": rightController?.buttons.x?.pressed ? "true" : "false",
      "data-right-y-pressed": rightController?.buttons.y?.pressed ? "true" : "false",
      "data-testid": "player-v2-immersive-state"
    }),
    createElement(AFrameSpatial3DUi, {
      model: spatialModel,
      onAction: emitSpatialEvent,
      playlistOpen,
      playlistSwitchingEnabled: true,
      showEffectRingMenu: true,
      showRingMenuDemo: false,
      showWorkbench: true
    })
  );
}
