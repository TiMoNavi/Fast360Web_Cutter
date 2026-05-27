"use client";

import type { Dispatch, SetStateAction } from "react";
import { usePcEditorEventEmitter, usePcEditorEventSubscription } from "../../events";
import {
  getPcEditorRuntimeState,
  setPcEditorRateState,
  setPcEditorSphereViewState,
  setPcEditorViewTarget,
  type PcEditorViewTargetRuntimeState
} from "../../state";
import { PC_EDITOR_RATE_DEFAULT, clampRate } from "../../controls/operations/rateCurve";
import {
  PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H,
  PC_EDITOR_MIN_VIEWPORT_FOV_H,
  verticalFovFromHorizontal
} from "../../viewFov";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRoll(roll: number) {
  let nextRoll = roll;
  while (nextRoll > 180) {
    nextRoll -= 360;
  }
  while (nextRoll < -180) {
    nextRoll += 360;
  }
  return Object.is(nextRoll, -0) ? 0 : Number(nextRoll.toFixed(3));
}

function readBooleanPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function readNumberPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function writeWorkflowViewTarget(
  update: (current: Omit<PcEditorViewTargetRuntimeState, "updatedAt">) => Omit<PcEditorViewTargetRuntimeState, "updatedAt">
) {
  const runtime = getPcEditorRuntimeState();
  const current: Omit<PcEditorViewTargetRuntimeState, "updatedAt"> = runtime.viewTarget
    ? {
        center: runtime.viewTarget.center,
        fov: runtime.viewTarget.fov,
        input: runtime.viewTarget.input,
        locked: runtime.viewTarget.locked,
        ...(typeof runtime.viewTarget.maskOpacity === "number" ? { maskOpacity: runtime.viewTarget.maskOpacity } : {}),
        roll: runtime.viewTarget.roll,
        source: runtime.viewTarget.source,
        videoTimeMs: runtime.viewTarget.videoTimeMs
      }
    : {
        center: { pitch: 0, yaw: 0 },
        fov: { h: 90, v: 90 },
        input: "workflow",
        locked: true,
        maskOpacity: 0.74,
        roll: runtime.cropMask?.roll ?? 0,
        source: "workflow",
        videoTimeMs: runtime.playback?.currentTimeMs ?? 0
      };

  setPcEditorViewTarget({
    ...update(current),
    input: "workflow",
    source: "workflow",
    videoTimeMs: runtime.playback?.currentTimeMs ?? current.videoTimeMs
  });
}

function writeWorkflowSphereFov(update: (currentFov: number) => number) {
  const current = getPcEditorRuntimeState().sphereView;
  const nextFov = clamp(update(current?.fov ?? 90), 25, 175);

  setPcEditorSphereViewState({
    fov: Number(nextFov.toFixed(2)),
    source: "workflow"
  });
}

export function usePlayerV2EditorPreviewWorkflow({
  setAutoRenderEnabled,
  setRecordingActive
}: {
  setAutoRenderEnabled: Dispatch<SetStateAction<boolean>>;
  setRecordingActive: Dispatch<SetStateAction<boolean>>;
}) {
  const emit = usePcEditorEventEmitter();

  usePcEditorEventSubscription("editor.crop.start", () => {
    setRecordingActive(true);
    emit({
      type: "player.playback.play",
      source: {
        kind: "workflow",
        id: "player-v2-crop-workflow",
        device: "pc"
      }
    });
  });

  usePcEditorEventSubscription("editor.crop.end", () => {
    setRecordingActive(false);
    emit({
      type: "player.playback.pause",
      source: {
        kind: "workflow",
        id: "player-v2-crop-workflow",
        device: "pc"
      }
    });
  });

  usePcEditorEventSubscription("editor.render.auto.set", (event) => {
    const enabled = readBooleanPayload(event.payload, "enabled");

    if (enabled === null) {
      return;
    }

    setAutoRenderEnabled(enabled);
  });

  usePcEditorEventSubscription("player.recording.rate.set", (event) => {
    const recordingRate = readNumberPayload(event.payload, "recordingRate");

    if (recordingRate === null) {
      return;
    }

    setPcEditorRateState({
      recordingRate: clampRate(recordingRate)
    });
  });

  usePcEditorEventSubscription("player.recording.rate.reset", () => {
    setPcEditorRateState({
      recordingRate: PC_EDITOR_RATE_DEFAULT
    });
  });

  usePcEditorEventSubscription("editor.effects.speed.set", (event) => {
    const effectSpeed = readNumberPayload(event.payload, "effectSpeed");

    if (effectSpeed === null) {
      return;
    }

    setPcEditorRateState({
      effectSpeed: clampRate(effectSpeed)
    });
  });

  usePcEditorEventSubscription("editor.effects.speed.reset", () => {
    setPcEditorRateState({
      effectSpeed: PC_EDITOR_RATE_DEFAULT
    });
  });

  usePcEditorEventSubscription("editor.viewport.fov.step", (event) => {
    const delta = readNumberPayload(event.payload, "delta");

    if (delta === null) {
      return;
    }

    writeWorkflowViewTarget((current) => {
      const nextFovH = clamp(current.fov.h + delta, PC_EDITOR_MIN_VIEWPORT_FOV_H, PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H);

      return {
        ...current,
        fov: {
          h: nextFovH,
          v: verticalFovFromHorizontal(nextFovH)
        }
      };
    });
  });

  usePcEditorEventSubscription("editor.viewport.fov.set", (event) => {
    const fovH = readNumberPayload(event.payload, "fovH") ?? readNumberPayload(event.payload, "fov");

    if (fovH === null) {
      return;
    }

    writeWorkflowViewTarget((current) => {
      const nextFovH = clamp(fovH, PC_EDITOR_MIN_VIEWPORT_FOV_H, PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H);

      return {
        ...current,
        fov: {
          h: nextFovH,
          v: verticalFovFromHorizontal(nextFovH)
        }
      };
    });
  });

  usePcEditorEventSubscription("editor.viewport.center.step", (event) => {
    const pitchDelta = readNumberPayload(event.payload, "pitchDelta") ?? 0;
    const yawDelta = readNumberPayload(event.payload, "yawDelta") ?? 0;

    if (pitchDelta === 0 && yawDelta === 0) {
      return;
    }

    writeWorkflowViewTarget((current) => ({
      ...current,
      center: {
        pitch: clamp(current.center.pitch + pitchDelta, -88, 88),
        yaw: current.center.yaw + yawDelta
      }
    }));
  });

  usePcEditorEventSubscription("editor.viewport.center.set", (event) => {
    const pitch = readNumberPayload(event.payload, "pitch");
    const yaw = readNumberPayload(event.payload, "yaw");

    if (pitch === null && yaw === null) {
      return;
    }

    writeWorkflowViewTarget((current) => ({
      ...current,
      center: {
        pitch: pitch === null ? current.center.pitch : clamp(pitch, -88, 88),
        yaw: yaw === null ? current.center.yaw : yaw
      }
    }));
  });

  usePcEditorEventSubscription("editor.viewport.roll.step", (event) => {
    const delta = readNumberPayload(event.payload, "delta");

    if (delta === null) {
      return;
    }

    writeWorkflowViewTarget((current) => ({
      ...current,
      roll: normalizeRoll(current.roll + delta)
    }));
  });

  usePcEditorEventSubscription("editor.viewport.roll.set", (event) => {
    const roll = readNumberPayload(event.payload, "roll");

    if (roll === null) {
      return;
    }

    writeWorkflowViewTarget((current) => ({
      ...current,
      roll: normalizeRoll(roll)
    }));
  });

  usePcEditorEventSubscription("editor.viewport.lock.set", (event) => {
    const locked = readBooleanPayload(event.payload, "locked");

    if (locked === null) {
      return;
    }

    writeWorkflowViewTarget((current) => ({
      ...current,
      locked
    }));
  });

  usePcEditorEventSubscription("editor.sphere.fov.step", (event) => {
    const delta = readNumberPayload(event.payload, "delta");

    if (delta === null) {
      return;
    }

    writeWorkflowSphereFov((currentFov) => currentFov + delta);
  });

  usePcEditorEventSubscription("editor.sphere.fov.set", (event) => {
    const fov = readNumberPayload(event.payload, "fov");

    if (fov === null) {
      return;
    }

    writeWorkflowSphereFov(() => fov);
  });

  usePcEditorEventSubscription("editor.mask.opacity.set", (event) => {
    const opacity = readNumberPayload(event.payload, "opacity");

    if (opacity === null) {
      return;
    }

    writeWorkflowViewTarget((current) => ({
      ...current,
      maskOpacity: clamp(opacity, 0, 0.95)
    }));
  });
}
