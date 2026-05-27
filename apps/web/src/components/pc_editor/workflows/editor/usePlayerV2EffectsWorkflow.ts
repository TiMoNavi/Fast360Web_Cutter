"use client";

import { useRef } from "react";
import type { EffectEventName } from "@/lib/path-protocol";
import type { AFrameTimelineBridge, ViewTargetState } from "../../data/timeline-bridge";
import { usePcEditorEventSubscription } from "../../events";
import {
  compileEffectHoldEndDraft,
  compileEffectSelectDraft,
  compileViewPathMotionDraft,
  effectEventDraftToTimelineEvent,
  type PcEditorEffectRenderStage,
  viewPathRangeDraftToTimelineEvent
} from "../../effects";
import { getPcEditorRuntimeState } from "../../state";
import { resolvePlayerV2Effect } from "./playerV2EffectCatalog";

type ActiveHoldEffect = {
  categoryId: string;
  conflictGroup?: string | null;
  effectSpeed: number;
  effectId: string;
  eventName: EffectEventName;
  label: string;
  params: Record<string, unknown>;
  renderFallback?: "ignore" | "warn" | "fail" | null;
  startedAtMs: number;
  startViewState: ViewTargetState;
  startVideoTimeMs: number;
};

function cloneViewTargetState(state: ViewTargetState): ViewTargetState {
  return {
    ...state,
    center: { ...state.center },
    fov: { ...state.fov }
  };
}

function readRuntimeViewState(timelineBridge: AFrameTimelineBridge): ViewTargetState {
  const runtimeViewTarget = getPcEditorRuntimeState().viewTarget;

  if (!runtimeViewTarget) {
    return cloneViewTargetState(timelineBridge.getState());
  }

  const bridgeState = timelineBridge.getState();

  return {
    ...bridgeState,
    center: { ...runtimeViewTarget.center },
    fov: { ...runtimeViewTarget.fov },
    input: runtimeViewTarget.input === "controller" ? "controller_ray" : "head_gaze",
    locked: runtimeViewTarget.locked
  };
}

function readRuntimeVideoTimeMs(timelineBridge: AFrameTimelineBridge) {
  return getPcEditorRuntimeState().playback?.currentTimeMs ?? timelineBridge.getCurrentVideoTimeMs();
}

function readRuntimeEffectSpeed() {
  return getPcEditorRuntimeState().rates.effectSpeed;
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

function readRenderFallbackPayload(payload: unknown) {
  const value = readStringPayload(payload, "renderFallback");
  return value === "ignore" || value === "warn" || value === "fail" ? value : null;
}

function readRenderStagePayload(payload: unknown): PcEditorEffectRenderStage | null {
  const value = readStringPayload(payload, "renderStage");
  return value === "pre_remap_equirect" ||
    value === "post_remap_frame" ||
    value === "viewport_path" ||
    value === "overlay_frame" ||
    value === "audio_timeline" ||
    value === "xr_runtime_only" ||
    value === "marker_only"
    ? value
    : null;
}

export function usePlayerV2EffectsWorkflow({
  timelineBridge
}: {
  timelineBridge: AFrameTimelineBridge;
}) {
  const activeHoldRef = useRef<ActiveHoldEffect | null>(null);

  usePcEditorEventSubscription("editor.effects.select", (event) => {
    const effectId = readStringPayload(event.payload, "effectId");

    if (!effectId) {
      return;
    }

    const categoryId = readStringPayload(event.payload, "categoryId") ?? "uncategorized";
    const label = readStringPayload(event.payload, "label") ?? effectId;
    const effect = resolvePlayerV2Effect(effectId);
    const catalogEventName = readStringPayload(event.payload, "eventName");
    const catalogParams = readRecordPayload(event.payload, "params");
    const catalogDurationMs = readNumberPayload(event.payload, "durationMs");
    const conflictGroup = readStringPayload(event.payload, "conflictGroup");
    const renderFallback = readRenderFallbackPayload(event.payload);
    const renderStage = readRenderStagePayload(event.payload);
    const effectSpeed = readRuntimeEffectSpeed();
    const viewPathDraft = compileViewPathMotionDraft({
      durationMs: catalogDurationMs,
      effectSpeed,
      effectId,
      fallbackDurationMs: effect.durationMs,
      params: catalogParams ?? effect.params,
      renderStage,
      timeline: {
        currentVideoTimeMs: readRuntimeVideoTimeMs(timelineBridge),
        viewState: readRuntimeViewState(timelineBridge)
      }
    });

    if (viewPathDraft) {
      void timelineBridge.dispatch(viewPathRangeDraftToTimelineEvent(viewPathDraft));
      return;
    }

    const draft = compileEffectSelectDraft({
      categoryId,
      conflictGroup,
      durationMs: catalogDurationMs,
      effectSpeed,
      effectId,
      eventName: catalogEventName,
      fallbackDurationMs: effect.durationMs,
      fallbackEventName: effect.eventName,
      fallbackParams: effect.params,
      label,
      params: catalogParams,
      renderFallback,
      renderStage
    });

    timelineBridge.dispatch(effectEventDraftToTimelineEvent(draft));
  });

  usePcEditorEventSubscription("editor.effects.hold.start", (event) => {
    const effectId = readStringPayload(event.payload, "effectId");

    if (!effectId) {
      return;
    }

    const categoryId = readStringPayload(event.payload, "categoryId") ?? "uncategorized";
    const label = readStringPayload(event.payload, "label") ?? effectId;
    const effect = resolvePlayerV2Effect(effectId);
    const catalogEventName = readStringPayload(event.payload, "eventName");
    const catalogParams = readRecordPayload(event.payload, "params");
    const conflictGroup = readStringPayload(event.payload, "conflictGroup");
    const renderFallback = readRenderFallbackPayload(event.payload);

    activeHoldRef.current = {
      categoryId,
      conflictGroup,
      effectSpeed: readRuntimeEffectSpeed(),
      effectId,
      eventName: (catalogEventName ?? effect.eventName) as EffectEventName,
      label,
      params: {
        ...(effect.params ?? {}),
        ...(catalogParams ?? {})
      },
      renderFallback,
      startedAtMs: performance.now(),
      startViewState: readRuntimeViewState(timelineBridge),
      startVideoTimeMs: readRuntimeVideoTimeMs(timelineBridge)
    };
  });

  usePcEditorEventSubscription("editor.effects.hold.end", (event) => {
    const effectId = readStringPayload(event.payload, "effectId");
    const active = activeHoldRef.current;

    if (!active || (effectId && active.effectId !== effectId)) {
      return;
    }

    activeHoldRef.current = null;
    const payloadDurationMs = readNumberPayload(event.payload, "durationMs");
    const wallDurationMs = Math.round(performance.now() - active.startedAtMs);
    const currentVideoTimeMs = readRuntimeVideoTimeMs(timelineBridge);
    const videoAdvancedMs = Math.max(0, currentVideoTimeMs - active.startVideoTimeMs);
    const durationMs = Math.max(160, videoAdvancedMs > 0 ? videoAdvancedMs : payloadDurationMs ?? wallDurationMs);
    const fadeMs = Math.min(320, Math.max(80, Math.round(durationMs * 0.28)));
    const shouldBridgePausedEdit = videoAdvancedMs < Math.min(250, durationMs * 0.5);

    void (async () => {
      if (shouldBridgePausedEdit) {
        await timelineBridge.dispatch({
          endMs: active.startVideoTimeMs + durationMs,
          endState: readRuntimeViewState(timelineBridge),
          interpolation: "fast",
          reason: "lock",
          startMs: active.startVideoTimeMs,
          startState: active.startViewState,
          transitionMs: durationMs,
          type: "createViewPathRange"
        });
      }

      const draft = compileEffectHoldEndDraft({
        categoryId: active.categoryId,
        conflictGroup: active.conflictGroup,
        durationMs,
        effectSpeed: active.effectSpeed,
        effectId: active.effectId,
        endMs: active.startVideoTimeMs + durationMs,
        eventName: active.eventName,
        fadeMs,
        label: active.label,
        params: active.params,
        renderFallback: active.renderFallback,
        startMs: active.startVideoTimeMs
      });

      await timelineBridge.dispatch(effectEventDraftToTimelineEvent(draft));
    })();
  });
}
