"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AFrameTimelineBridge, TimelinePatchReason } from "../../data/timeline-bridge";
import { usePcEditorEventEmitter, usePcEditorEventSubscription } from "../../events";
import { getPcEditorRuntimeState } from "../../state";
import {
  PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H,
  PC_EDITOR_MIN_VIEWPORT_FOV_H
} from "../../viewFov";

export type PlayerV2DiscardRange = {
  endMs: number;
  startMs: number;
};

export type PlayerV2DiscardState = {
  active: boolean;
  lastRange: PlayerV2DiscardRange | null;
  message: string;
  tone: "idle" | "active" | "success" | "warning";
};

export const DEFAULT_PLAYER_V2_DISCARD_STATE: PlayerV2DiscardState = {
  active: false,
  lastRange: null,
  message: "Hold Del while playing to mark a discard range.",
  tone: "idle"
};

type DiscardHoldState = {
  startMs: number;
};

function readFlushReason(payload: unknown): TimelinePatchReason {
  if (!payload || typeof payload !== "object") {
    return "live";
  }

  const reason = (payload as Record<string, unknown>).reason;
  return reason === "live" ||
    reason === "replay" ||
    reason === "discard" ||
    reason === "restore" ||
    reason === "cut" ||
    reason === "fov" ||
    reason === "lock"
    ? reason
    : "live";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readNumberPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBooleanPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function readCurrentViewCenter(timelineBridge: AFrameTimelineBridge) {
  return getPcEditorRuntimeState().viewTarget?.center ?? timelineBridge.getState().center;
}

function readCurrentViewRollAfterStep(timelineBridge: AFrameTimelineBridge, delta: number, eventAt: number) {
  const runtimeViewTarget = getPcEditorRuntimeState().viewTarget;
  if (runtimeViewTarget && runtimeViewTarget.updatedAt >= eventAt) {
    return runtimeViewTarget.roll;
  }

  return timelineBridge.getState().roll + delta;
}

function readCurrentVideoTimeMs(timelineBridge: AFrameTimelineBridge) {
  return Math.max(0, Math.round(getPcEditorRuntimeState().playback?.currentTimeMs ?? timelineBridge.getCurrentVideoTimeMs()));
}

function formatDiscardTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function usePlayerV2TimelineWorkflow({
  autoRenderEnabled,
  enabled,
  onDiscardStateChange,
  timelineBridge
}: {
  autoRenderEnabled: boolean;
  enabled: boolean;
  onDiscardStateChange?: (state: PlayerV2DiscardState) => void;
  timelineBridge: AFrameTimelineBridge;
}) {
  const emit = usePcEditorEventEmitter();
  const discardHoldRef = useRef<DiscardHoldState | null>(null);
  const onDiscardStateChangeRef = useRef(onDiscardStateChange);
  const recordingStartMsRef = useRef<number | null>(null);

  onDiscardStateChangeRef.current = onDiscardStateChange;

  const setDiscardState = useCallback((state: PlayerV2DiscardState) => {
    onDiscardStateChangeRef.current?.(state);
  }, []);

  const finishDiscardRange = useCallback(
    async (mode: "release" | "cancel" = "release") => {
      const hold = discardHoldRef.current;

      if (!hold) {
        return;
      }

      discardHoldRef.current = null;
      const endMs = Math.max(hold.startMs + 1, readCurrentVideoTimeMs(timelineBridge));
      await timelineBridge.dispatch({
        type: "restoreRange",
        startMs: hold.startMs,
        endMs
      });
      setDiscardState({
        active: false,
        lastRange: {
          endMs,
          startMs: hold.startMs
        },
        message: `Marked discard ${formatDiscardTime(hold.startMs)}-${formatDiscardTime(endMs)}.`,
        tone: mode === "cancel" ? "warning" : "success"
      });
    },
    [setDiscardState, timelineBridge]
  );

  usePcEditorEventSubscription("editor.timeline.cut", () => {
    if (!enabled) {
      return;
    }

    void timelineBridge.dispatch({ type: "cutHere" });
  });

  usePcEditorEventSubscription("editor.timeline.flush", (event) => {
    if (!enabled) {
      return;
    }

    void timelineBridge.dispatch({ type: "flushPath", reason: readFlushReason(event.payload) });
  });

  usePcEditorEventSubscription("editor.crop.start", () => {
    recordingStartMsRef.current = readCurrentVideoTimeMs(timelineBridge);
  });

  usePcEditorEventSubscription("editor.viewport.fov.step", (event) => {
    if (!enabled) {
      return;
    }

    const delta = readNumberPayload(event.payload, "delta");
    const commit = readBooleanPayload(event.payload, "commit") ?? true;
    if (delta === null) {
      return;
    }

    if (!commit) {
      return;
    }

    void timelineBridge.dispatch({ type: "nudgeFov", deltaH: delta });
  });

  usePcEditorEventSubscription("editor.viewport.fov.set", (event) => {
    if (!enabled) {
      return;
    }

    const fovH = readNumberPayload(event.payload, "fovH") ?? readNumberPayload(event.payload, "fov");
    const commit = readBooleanPayload(event.payload, "commit") ?? true;
    if (fovH === null) {
      return;
    }

    if (!commit) {
      return;
    }

    void timelineBridge.dispatch({
      type: "setFov",
      h: clamp(fovH, PC_EDITOR_MIN_VIEWPORT_FOV_H, PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H)
    });
  });

  usePcEditorEventSubscription("editor.viewport.center.step", (event) => {
    if (!enabled) {
      return;
    }

    const pitchDelta = readNumberPayload(event.payload, "pitchDelta") ?? 0;
    const yawDelta = readNumberPayload(event.payload, "yawDelta") ?? 0;
    const commit = readBooleanPayload(event.payload, "commit") ?? true;
    if (pitchDelta === 0 && yawDelta === 0) {
      return;
    }

    const center = readCurrentViewCenter(timelineBridge);
    void timelineBridge.dispatch({
      type: "setViewTarget",
      flushReason: "lock",
      force: commit,
      ignoreLock: true,
      pose: {
        input: "head_gaze",
        pitch: clamp(center.pitch + pitchDelta, -88, 88),
        yaw: center.yaw + yawDelta
      }
    });
  });

  usePcEditorEventSubscription("editor.viewport.center.set", (event) => {
    if (!enabled) {
      return;
    }

    const pitch = readNumberPayload(event.payload, "pitch");
    const yaw = readNumberPayload(event.payload, "yaw");
    const commit = readBooleanPayload(event.payload, "commit") ?? true;
    if (pitch === null && yaw === null) {
      return;
    }

    const center = readCurrentViewCenter(timelineBridge);
    void timelineBridge.dispatch({
      type: "setViewTarget",
      flushReason: "lock",
      force: commit,
      ignoreLock: true,
      pose: {
        input: "head_gaze",
        pitch: pitch === null ? center.pitch : clamp(pitch, -88, 88),
        yaw: yaw === null ? center.yaw : yaw
      }
    });
  });

  usePcEditorEventSubscription("editor.viewport.roll.step", (event) => {
    if (!enabled) {
      return;
    }

    const delta = readNumberPayload(event.payload, "delta");
    const commit = readBooleanPayload(event.payload, "commit") ?? true;
    if (delta === null || !commit) {
      return;
    }

    void timelineBridge.dispatch({ type: "setRoll", roll: readCurrentViewRollAfterStep(timelineBridge, delta, event.meta.at) });
  });

  usePcEditorEventSubscription("editor.viewport.roll.set", (event) => {
    if (!enabled) {
      return;
    }

    const roll = readNumberPayload(event.payload, "roll");
    const commit = readBooleanPayload(event.payload, "commit") ?? true;
    if (roll === null || !commit) {
      return;
    }

    void timelineBridge.dispatch({ type: "setRoll", roll });
  });

  usePcEditorEventSubscription("editor.crop.end", async (event) => {
    if (!enabled) {
      return;
    }

    const recordingStartMs = recordingStartMsRef.current;
    const recordingEndMs = readCurrentVideoTimeMs(timelineBridge);
    const center = readCurrentViewCenter(timelineBridge);
    await timelineBridge.dispatch({
      type: "setViewTarget",
      flushReason: "lock",
      force: true,
      ignoreLock: true,
      pathAnchor: true,
      pose: {
        input: "head_gaze",
        pitch: center.pitch,
        yaw: center.yaw
      }
    });

    if (autoRenderEnabled || readBooleanPayload(event.payload, "renderAfterEnd") === true) {
      emit({
        type: "editor.render.request",
        payload: {
          endMs: recordingEndMs,
          ...(recordingStartMs !== null ? { startMs: recordingStartMs } : {})
        },
        source: {
          kind: "workflow",
          id: "player-v2-auto-render",
          device: "pc"
        }
      });
    }

    recordingStartMsRef.current = null;
  });

  usePcEditorEventSubscription("editor.timeline.discard.begin", () => {
    if (discardHoldRef.current) {
      return;
    }

    const playback = getPcEditorRuntimeState().playback;
    if (playback && !playback.isPlaying) {
      setDiscardState({
        ...DEFAULT_PLAYER_V2_DISCARD_STATE,
        message: "Play the video, then hold Del to mark discarded playback.",
        tone: "warning"
      });
      return;
    }

    const startMs = readCurrentVideoTimeMs(timelineBridge);
    discardHoldRef.current = { startMs };
    setDiscardState({
      active: true,
      lastRange: null,
      message: `Discarding from ${formatDiscardTime(startMs)}. Release Del to restore the timeline.`,
      tone: "active"
    });
    void timelineBridge.dispatch({ type: "discardRange", startMs });
  });

  usePcEditorEventSubscription("editor.timeline.discard.end", () => {
    void finishDiscardRange("release");
  });

  useEffect(() => {
    const handleBlur = () => {
      void finishDiscardRange("cancel");
    };

    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
      void finishDiscardRange("cancel");
    };
  }, [finishDiscardRange]);
}
