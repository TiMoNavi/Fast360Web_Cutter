"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  usePcEditorEventEmitter,
  usePcEditorEventSubscription,
  type PcEditorEventInput
} from "../../../events";
import {
  MAX_CROP_FOV_H,
  verticalFovFromHorizontal
} from "../../../mask_controller";
import {
  getPcEditorRuntimeState,
  setPcEditorSphereViewState,
  setPcEditorViewTarget,
  setPcEditorXrCameraRigPose,
  usePcEditorXrCameraRigPose,
  type PcEditorVector3,
  type PcEditorViewTargetRuntimeState,
  type PcEditorXrCameraRigPoseRuntimeState
} from "../../../state";

type AFrameEntityElement = HTMLElement & {
  components?: {
    "look-controls"?: {
      pitchObject?: {
        rotation?: {
          x: number;
        };
      };
      yawObject?: {
        rotation?: {
          y: number;
        };
      };
    };
  };
  object3D?: {
    position?: PcEditorVector3;
    rotation?: PcEditorVector3;
  };
};

type XrCameraRigPosePayload = Omit<PcEditorXrCameraRigPoseRuntimeState, "updatedAt">;
type XrViewportMaskPayload = Omit<PcEditorViewTargetRuntimeState, "updatedAt">;
type PcEditorEventEmitter = (event: PcEditorEventInput) => unknown;
type ProjectionFlightPreset = {
  defaultDurationMs: number;
  defaultMaskPitch: number;
  defaultPeakAtMs: number;
  defaultPreviewFov: number;
  defaultPreviewPitch: number;
  defaultFlightHeight: (sphereRadius: number) => number;
  effectId: string;
  eventName: string;
  rigId: string;
};

type AFrameLittlePlanetFlightPreviewProps = {
  cameraRef: RefObject<HTMLElement | null>;
  sceneRef: RefObject<HTMLElement | null>;
  sphereRadius?: number;
};

const DEFAULT_DURATION_MS = 1600;
const DEFAULT_PEAK_AT_MS = 560;
const DEFAULT_SPHERE_RADIUS = 60;
const DEFAULT_PEAK_FOV = 138;
const DEFAULT_MASK_LOOK_DOWN_PITCH = -88;
const DEG_TO_RAD = Math.PI / 180;

const LITTLE_PLANET_FLIGHT_PRESET: ProjectionFlightPreset = {
  defaultDurationMs: DEFAULT_DURATION_MS,
  defaultFlightHeight: (sphereRadius) => sphereRadius * 0.78,
  defaultMaskPitch: DEFAULT_MASK_LOOK_DOWN_PITCH,
  defaultPeakAtMs: DEFAULT_PEAK_AT_MS,
  defaultPreviewFov: DEFAULT_PEAK_FOV,
  defaultPreviewPitch: -90,
  effectId: "little-planet",
  eventName: "frame.little_planet_pullback",
  rigId: "little-planet-flight"
};

const CRYSTAL_BALL_FLIGHT_PRESET: ProjectionFlightPreset = {
  defaultDurationMs: 1900,
  defaultFlightHeight: (sphereRadius) => sphereRadius * 0.56,
  defaultMaskPitch: -78,
  defaultPeakAtMs: 760,
  defaultPreviewFov: 145,
  defaultPreviewPitch: -82,
  effectId: "crystal-ball",
  eventName: "frame.crystal_ball_pull",
  rigId: "crystal-ball-flight"
};

const PROJECTION_FLIGHT_PRESETS = [
  LITTLE_PLANET_FLIGHT_PRESET,
  CRYSTAL_BALL_FLIGHT_PRESET
];
const DEFAULT_DOLLY_ZOOM_DURATION_MS = 1700;
const DEFAULT_DOLLY_ZOOM_PEAK_AT_MS = 820;
const DEFAULT_DOLLY_ZOOM_DISTANCE = -6.5;
const DEFAULT_DOLLY_ZOOM_FOV = 64;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * clamp(progress, 0, 1);
}

function easeOutCubic(progress: number) {
  const t = clamp(progress, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(progress: number) {
  const t = clamp(progress, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function readStringPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readNumberPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRecordPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readNumberParam(params: Record<string, unknown> | null, key: string, fallback: number) {
  const value = params?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrFallback(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readVector(value: unknown, fallback: PcEditorVector3): PcEditorVector3 {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const raw = value as Record<string, unknown>;
  return {
    x: numberOrFallback(raw.x, fallback.x),
    y: numberOrFallback(raw.y, fallback.y),
    z: numberOrFallback(raw.z, fallback.z)
  };
}

function cloneVector(vector: PcEditorVector3): PcEditorVector3 {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

function lerpVector(from: PcEditorVector3, to: PcEditorVector3, progress: number): PcEditorVector3 {
  return {
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
    z: lerp(from.z, to.z, progress)
  };
}

function addVector(from: PcEditorVector3, delta: PcEditorVector3): PcEditorVector3 {
  return {
    x: from.x + delta.x,
    y: from.y + delta.y,
    z: from.z + delta.z
  };
}

function cameraForwardOffset(yaw: number, distance: number): PcEditorVector3 {
  const yawRad = yaw * DEG_TO_RAD;

  return {
    x: -Math.sin(yawRad) * distance,
    y: 0,
    z: -Math.cos(yawRad) * distance
  };
}

function normalizeYaw(yaw: number) {
  return ((((yaw + 180) % 360) + 360) % 360) - 180;
}

function lerpAngleDegrees(from: number, to: number, progress: number) {
  const delta = normalizeYaw(to - from);
  return normalizeYaw(from + delta * clamp(progress, 0, 1));
}

function projectionFlightPresetForEvent(payload: unknown) {
  const effectId = readStringPayload(payload, "effectId");
  const eventName = readStringPayload(payload, "eventName");

  return PROJECTION_FLIGHT_PRESETS.find((preset) =>
    effectId === preset.effectId || eventName === preset.eventName
  ) ?? null;
}

function isDollyZoomEvent(payload: unknown) {
  const effectId = readStringPayload(payload, "effectId");
  const eventName = readStringPayload(payload, "eventName");

  return effectId === "dolly-zoom" || eventName === "frame.dolly_zoom";
}

function defaultRigPose(): XrCameraRigPosePayload {
  const runtime = getPcEditorRuntimeState();
  const cameraPose = runtime.cameraPose;
  const fov = runtime.xrCameraRigPose?.fov ?? runtime.sphereView?.fov ?? 90;

  return {
    active: false,
    cameraRotation: {
      x: cameraPose?.center.pitch ?? 0,
      y: cameraPose?.center.yaw ?? 0,
      z: 0
    },
    fov,
    id: "default",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    source: "workflow"
  };
}

function currentRigPose(): XrCameraRigPosePayload {
  const current = getPcEditorRuntimeState().xrCameraRigPose;

  if (!current) {
    return defaultRigPose();
  }

  return {
    active: current.active,
    cameraRotation: cloneVector(current.cameraRotation),
    fov: current.fov,
    id: current.id,
    position: cloneVector(current.position),
    rotation: cloneVector(current.rotation),
    source: current.source
  };
}

function defaultViewportMask(): XrViewportMaskPayload {
  const runtime = getPcEditorRuntimeState();
  const cropMask = runtime.cropMask;
  const fovH = cropMask?.fov.h ?? 90;

  return {
    center: cropMask?.center ?? { pitch: 0, yaw: 0 },
    fov: cropMask?.fov ?? {
      h: fovH,
      v: verticalFovFromHorizontal(fovH)
    },
    input: cropMask?.input ?? "workflow",
    locked: cropMask?.locked ?? true,
    maskOpacity: cropMask?.maskOpacity ?? 0.74,
    roll: cropMask?.roll ?? 0,
    source: "workflow",
    videoTimeMs: runtime.playback?.currentTimeMs ?? cropMask?.videoTimeMs ?? 0
  };
}

function currentViewportMask(): XrViewportMaskPayload {
  const runtime = getPcEditorRuntimeState();
  const current = runtime.viewTarget;

  if (!current) {
    return defaultViewportMask();
  }

  return {
    center: { ...current.center },
    fov: { ...current.fov },
    input: current.input,
    locked: current.locked,
    ...(typeof current.maskOpacity === "number" ? { maskOpacity: current.maskOpacity } : {}),
    roll: current.roll,
    source: current.source,
    videoTimeMs: runtime.playback?.currentTimeMs ?? current.videoTimeMs
  };
}

function writeViewportMask(payload: XrViewportMaskPayload) {
  const runtime = getPcEditorRuntimeState();
  const fovH = clamp(payload.fov.h, 35, MAX_CROP_FOV_H);

  setPcEditorViewTarget({
    ...payload,
    center: {
      pitch: clamp(payload.center.pitch, -88, 88),
      yaw: normalizeYaw(payload.center.yaw)
    },
    fov: {
      h: Number(fovH.toFixed(2)),
      v: Number(verticalFovFromHorizontal(fovH).toFixed(2))
    },
    input: "workflow",
    locked: true,
    source: "workflow",
    videoTimeMs: runtime.playback?.currentTimeMs ?? payload.videoTimeMs
  });
}

function viewportMaskAt(
  from: XrViewportMaskPayload,
  to: XrViewportMaskPayload,
  progress: number
): XrViewportMaskPayload {
  const fovH = lerp(from.fov.h, to.fov.h, progress);

  return {
    ...from,
    center: {
      pitch: lerp(from.center.pitch, to.center.pitch, progress),
      yaw: lerpAngleDegrees(from.center.yaw, to.center.yaw, progress)
    },
    fov: {
      h: fovH,
      v: verticalFovFromHorizontal(fovH)
    },
    input: "workflow",
    locked: true,
    source: "workflow"
  };
}

function emitAtomicPose(
  emit: PcEditorEventEmitter,
  payload: XrCameraRigPosePayload,
  phase: "start" | "change" | "end",
  sourceId = "projection-flight-preview"
) {
  emit({
    type: "editor.xr.camera_rig.pose.set",
    payload,
    source: {
      kind: "workflow",
      id: sourceId
    },
    meta: { phase }
  });
}

function vectorAttribute(vector: PcEditorVector3) {
  return `${vector.x.toFixed(4)} ${vector.y.toFixed(4)} ${vector.z.toFixed(4)}`;
}

function setEntityPosition(entity: AFrameEntityElement | null, position: PcEditorVector3) {
  if (!entity) {
    return;
  }

  entity.setAttribute("position", vectorAttribute(position));
  if (entity.object3D?.position) {
    entity.object3D.position.x = position.x;
    entity.object3D.position.y = position.y;
    entity.object3D.position.z = position.z;
  }
}

function setEntityRotationDegrees(entity: AFrameEntityElement | null, rotation: PcEditorVector3) {
  if (!entity) {
    return;
  }

  entity.setAttribute("rotation", vectorAttribute(rotation));
  if (entity.object3D?.rotation) {
    entity.object3D.rotation.x = rotation.x * DEG_TO_RAD;
    entity.object3D.rotation.y = rotation.y * DEG_TO_RAD;
    entity.object3D.rotation.z = rotation.z * DEG_TO_RAD;
  }

  const lookControls = entity.components?.["look-controls"];
  if (lookControls?.pitchObject?.rotation) {
    lookControls.pitchObject.rotation.x = rotation.x * DEG_TO_RAD;
  }
  if (lookControls?.yawObject?.rotation) {
    lookControls.yawObject.rotation.y = rotation.y * DEG_TO_RAD;
  }
}

function normalizePosePayload(payload: unknown): XrCameraRigPosePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const raw = payload as Record<string, unknown>;
  const fallback = defaultRigPose();
  const fov = raw.fov;

  return {
    active: raw.active === true,
    cameraRotation: readVector(raw.cameraRotation, fallback.cameraRotation),
    ...(typeof fov === "number" && Number.isFinite(fov) ? { fov } : {}),
    id: typeof raw.id === "string" ? raw.id : undefined,
    position: readVector(raw.position, fallback.position),
    rotation: readVector(raw.rotation, fallback.rotation),
    source: raw.source === "gesture" || raw.source === "xr-runtime" ? raw.source : "workflow"
  };
}

function LittlePlanetFlightEventController({ sphereRadius = DEFAULT_SPHERE_RADIUS }: { sphereRadius?: number }) {
  const emit = usePcEditorEventEmitter();
  const animationRef = useRef<number | null>(null);
  const restorePoseRef = useRef<XrCameraRigPosePayload | null>(null);
  const restoreMaskRef = useRef<XrViewportMaskPayload | null>(null);

  useEffect(() => () => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }

    if (restorePoseRef.current) {
      emitAtomicPose(emit, restorePoseRef.current, "end");
      restorePoseRef.current = null;
    }

    if (restoreMaskRef.current) {
      writeViewportMask(restoreMaskRef.current);
      restoreMaskRef.current = null;
    }
  }, [emit]);

  usePcEditorEventSubscription("editor.effects.select", (event) => {
    const preset = projectionFlightPresetForEvent(event.payload);

    if (!preset) {
      return;
    }

    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (restorePoseRef.current) {
      emitAtomicPose(emit, restorePoseRef.current, "end");
    }
    if (restoreMaskRef.current) {
      writeViewportMask(restoreMaskRef.current);
    }

    const params = readRecordPayload(event.payload, "params");
    const durationMs = Math.max(
      520,
      readNumberPayload(event.payload, "durationMs") ?? readNumberParam(params, "durationMs", preset.defaultDurationMs)
    );
    const peakAtMs = clamp(
      readNumberParam(params, "peakAtMs", preset.defaultPeakAtMs),
      120,
      durationMs - 120
    );
    const peakHeight = clamp(
      readNumberParam(params, "previewFlightHeight", preset.defaultFlightHeight(sphereRadius)),
      2,
      Math.max(2, sphereRadius - 2)
    );
    const peakFov = clamp(
      readNumberParam(params, "previewFov", readNumberParam(params, "peakSphereFov", preset.defaultPreviewFov)),
      75,
      160
    );
    const peakPitch = clamp(readNumberParam(params, "previewPitch", preset.defaultPreviewPitch), -95, -60);
    const maskPeakAtMs = clamp(
      readNumberParam(params, "previewMaskPeakAtMs", peakAtMs),
      120,
      durationMs - 120
    );
    const maskPeakFov = clamp(
      readNumberParam(params, "previewMaskFov", MAX_CROP_FOV_H),
      35,
      MAX_CROP_FOV_H
    );
    const maskPeakPitch = clamp(
      readNumberParam(params, "previewMaskPitch", preset.defaultMaskPitch),
      -88,
      -45
    );
    const start = currentRigPose();
    const startMask = currentViewportMask();
    const target: XrCameraRigPosePayload = {
      active: true,
      cameraRotation: {
        x: peakPitch,
        y: start.cameraRotation.y,
        z: 0
      },
      fov: peakFov,
      id: preset.rigId,
      position: {
        x: 0,
        y: peakHeight,
        z: 0
      },
      rotation: cloneVector(start.rotation),
      source: "workflow"
    };
    const targetMask: XrViewportMaskPayload = {
      ...startMask,
      center: {
        pitch: maskPeakPitch,
        yaw: startMask.center.yaw
      },
      fov: {
        h: maskPeakFov,
        v: verticalFovFromHorizontal(maskPeakFov)
      },
      input: "workflow",
      locked: true,
      source: "workflow"
    };
    const startedAt = performance.now();

    restorePoseRef.current = {
      ...start,
      active: false,
      id: `${preset.rigId}-restore`
    };
    restoreMaskRef.current = {
      ...startMask,
      center: { ...startMask.center },
      fov: { ...startMask.fov }
    };
    emitAtomicPose(emit, start, "start", `${preset.rigId}-preview`);
    writeViewportMask(startMask);

    const poseAt = (progress: number): XrCameraRigPosePayload => ({
      active: progress > 0,
      cameraRotation: lerpVector(start.cameraRotation, target.cameraRotation, progress),
      fov: lerp(start.fov ?? 90, target.fov ?? DEFAULT_PEAK_FOV, progress),
      id: preset.rigId,
      position: lerpVector(start.position, target.position, progress),
      rotation: lerpVector(start.rotation, target.rotation, progress),
      source: "workflow"
    });
    const maskAt = (elapsed: number): XrViewportMaskPayload => {
      if (elapsed <= maskPeakAtMs) {
        return viewportMaskAt(startMask, targetMask, easeOutCubic(elapsed / maskPeakAtMs));
      }

      const returnProgress = easeInOutQuad((elapsed - maskPeakAtMs) / Math.max(durationMs - maskPeakAtMs, 1));
      return viewportMaskAt(targetMask, startMask, returnProgress);
    };

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      writeViewportMask(maskAt(elapsed));

      if (elapsed <= peakAtMs) {
        emitAtomicPose(emit, poseAt(easeOutCubic(elapsed / peakAtMs)), "change", `${preset.rigId}-preview`);
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (elapsed < durationMs) {
        const descent = easeInOutQuad((elapsed - peakAtMs) / Math.max(durationMs - peakAtMs, 1));
        emitAtomicPose(emit, poseAt(1 - descent), "change", `${preset.rigId}-preview`);
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (restorePoseRef.current) {
        emitAtomicPose(emit, restorePoseRef.current, "end", `${preset.rigId}-preview`);
      }
      if (restoreMaskRef.current) {
        writeViewportMask(restoreMaskRef.current);
      }
      restorePoseRef.current = null;
      restoreMaskRef.current = null;
      animationRef.current = null;
    };

    animationRef.current = window.requestAnimationFrame(tick);
  });

  return null;
}

function DollyZoomFlightEventController({ sphereRadius = DEFAULT_SPHERE_RADIUS }: { sphereRadius?: number }) {
  const emit = usePcEditorEventEmitter();
  const animationRef = useRef<number | null>(null);
  const restorePoseRef = useRef<XrCameraRigPosePayload | null>(null);
  const restoreMaskRef = useRef<XrViewportMaskPayload | null>(null);

  useEffect(() => () => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }

    if (restorePoseRef.current) {
      emitAtomicPose(emit, restorePoseRef.current, "end", "dolly-zoom-flight-preview");
      restorePoseRef.current = null;
    }

    if (restoreMaskRef.current) {
      writeViewportMask(restoreMaskRef.current);
      restoreMaskRef.current = null;
    }
  }, [emit]);

  usePcEditorEventSubscription("editor.effects.select", (event) => {
    if (!isDollyZoomEvent(event.payload)) {
      return;
    }

    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (restorePoseRef.current) {
      emitAtomicPose(emit, restorePoseRef.current, "end", "dolly-zoom-flight-preview");
    }
    if (restoreMaskRef.current) {
      writeViewportMask(restoreMaskRef.current);
    }

    const params = readRecordPayload(event.payload, "params");
    const durationMs = Math.max(
      520,
      readNumberPayload(event.payload, "durationMs") ?? readNumberParam(params, "durationMs", DEFAULT_DOLLY_ZOOM_DURATION_MS)
    );
    const peakAtMs = clamp(
      readNumberParam(params, "peakAtMs", DEFAULT_DOLLY_ZOOM_PEAK_AT_MS),
      120,
      durationMs - 120
    );
    const start = currentRigPose();
    const startMask = currentViewportMask();
    const dollyDistance = clamp(
      readNumberParam(params, "previewDollyDistance", DEFAULT_DOLLY_ZOOM_DISTANCE),
      -Math.max(2, sphereRadius * 0.35),
      Math.max(2, sphereRadius * 0.35)
    );
    const targetFov = clamp(
      readNumberParam(params, "previewFov", readNumberParam(params, "peakSphereFov", DEFAULT_DOLLY_ZOOM_FOV)),
      45,
      150
    );
    const peakFovDelta = readNumberParam(params, "peakDeltaFovH", -18);
    const maskFovDelta = readNumberParam(params, "previewMaskFovDelta", peakFovDelta);
    const maskPeakFov = clamp(
      readNumberParam(params, "previewMaskFov", startMask.fov.h + maskFovDelta),
      35,
      MAX_CROP_FOV_H
    );
    const target: XrCameraRigPosePayload = {
      active: true,
      cameraRotation: cloneVector(start.cameraRotation),
      fov: targetFov,
      id: "dolly-zoom-flight",
      position: addVector(start.position, cameraForwardOffset(start.cameraRotation.y, dollyDistance)),
      rotation: cloneVector(start.rotation),
      source: "workflow"
    };
    const targetMask: XrViewportMaskPayload = {
      ...startMask,
      center: { ...startMask.center },
      fov: {
        h: maskPeakFov,
        v: verticalFovFromHorizontal(maskPeakFov)
      },
      input: "workflow",
      locked: true,
      source: "workflow"
    };
    const startedAt = performance.now();

    restorePoseRef.current = {
      ...start,
      active: false,
      id: "dolly-zoom-flight-restore"
    };
    restoreMaskRef.current = {
      ...startMask,
      center: { ...startMask.center },
      fov: { ...startMask.fov }
    };
    emitAtomicPose(emit, start, "start", "dolly-zoom-flight-preview");
    writeViewportMask(startMask);

    const poseAt = (progress: number): XrCameraRigPosePayload => ({
      active: progress > 0,
      cameraRotation: lerpVector(start.cameraRotation, target.cameraRotation, progress),
      fov: lerp(start.fov ?? 90, target.fov ?? DEFAULT_DOLLY_ZOOM_FOV, progress),
      id: "dolly-zoom-flight",
      position: lerpVector(start.position, target.position, progress),
      rotation: lerpVector(start.rotation, target.rotation, progress),
      source: "workflow"
    });
    const maskAt = (elapsed: number): XrViewportMaskPayload => {
      if (elapsed <= peakAtMs) {
        return viewportMaskAt(startMask, targetMask, easeInOutQuad(elapsed / peakAtMs));
      }

      const returnProgress = easeInOutQuad((elapsed - peakAtMs) / Math.max(durationMs - peakAtMs, 1));
      return viewportMaskAt(targetMask, startMask, returnProgress);
    };

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      writeViewportMask(maskAt(elapsed));

      if (elapsed <= peakAtMs) {
        emitAtomicPose(emit, poseAt(easeInOutQuad(elapsed / peakAtMs)), "change", "dolly-zoom-flight-preview");
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (elapsed < durationMs) {
        const retreat = easeInOutQuad((elapsed - peakAtMs) / Math.max(durationMs - peakAtMs, 1));
        emitAtomicPose(emit, poseAt(1 - retreat), "change", "dolly-zoom-flight-preview");
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (restorePoseRef.current) {
        emitAtomicPose(emit, restorePoseRef.current, "end", "dolly-zoom-flight-preview");
      }
      if (restoreMaskRef.current) {
        writeViewportMask(restoreMaskRef.current);
      }
      restorePoseRef.current = null;
      restoreMaskRef.current = null;
      animationRef.current = null;
    };

    animationRef.current = window.requestAnimationFrame(tick);
  });

  return null;
}

function XrCameraRigPoseStateBridge() {
  usePcEditorEventSubscription("editor.xr.camera_rig.pose.set", (event) => {
    const pose = normalizePosePayload(event.payload);

    if (!pose) {
      return;
    }

    setPcEditorXrCameraRigPose(pose);
    if (typeof pose.fov === "number") {
      setPcEditorSphereViewState({
        fov: pose.fov,
        source: pose.source === "gesture" ? "gesture" : "workflow"
      });
    }
  });

  return null;
}

function AFrameXrCameraRigPoseApplier({
  cameraRef,
  sceneRef
}: {
  cameraRef: RefObject<HTMLElement | null>;
  sceneRef: RefObject<HTMLElement | null>;
}) {
  const pose = usePcEditorXrCameraRigPose();

  useEffect(() => {
    if (!pose) {
      return;
    }

    const camera = cameraRef.current as AFrameEntityElement | null;
    const rig = (camera?.parentElement ?? sceneRef.current?.querySelector("#camera-rig")) as AFrameEntityElement | null;

    if (!camera || !rig) {
      return;
    }

    setEntityPosition(rig, pose.position);
    setEntityRotationDegrees(rig, pose.rotation);
    setEntityRotationDegrees(camera, pose.cameraRotation);
    if (typeof pose.fov === "number") {
      camera.setAttribute("camera", `fov: ${pose.fov.toFixed(2)}`);
    }
  }, [cameraRef, pose, sceneRef]);

  return null;
}

export function AFrameProjectionFlightPreview({
  cameraRef,
  sceneRef,
  sphereRadius = DEFAULT_SPHERE_RADIUS
}: AFrameLittlePlanetFlightPreviewProps) {
  return (
    <>
      <LittlePlanetFlightEventController sphereRadius={sphereRadius} />
      <DollyZoomFlightEventController sphereRadius={sphereRadius} />
      <XrCameraRigPoseStateBridge />
      <AFrameXrCameraRigPoseApplier cameraRef={cameraRef} sceneRef={sceneRef} />
    </>
  );
}

export function AFrameLittlePlanetFlightPreview(props: AFrameLittlePlanetFlightPreviewProps) {
  return <AFrameProjectionFlightPreview {...props} />;
}
