import type { ViewPathPatch, ViewPathPoint } from "@/lib/path-protocol";
import type { ViewTargetPose, WebXrSemanticEvent } from "@/features/webxr/pc-editor/data/timeline-bridge";
import { verticalFovFromHorizontal } from "@/features/webxr/pc-editor/viewFov";
import { SPHERE_SMOOTH_MOVE_MS } from "./constants";
import type { LabBackendBinding, LabEffectLogItem, LabRecordingSample, WorkflowEffectAction } from "./types";

export function createRecordingSample({
  currentTimeMs,
  fovH,
  pose,
  reason,
  seq
}: {
  currentTimeMs: number;
  fovH: number;
  pose: ViewTargetPose;
  reason: string;
  seq: number;
}): LabRecordingSample {
  return {
    fovH: Number(fovH.toFixed(2)),
    fovV: Number(verticalFovFromHorizontal(fovH).toFixed(2)),
    input: pose.input,
    pitch: Number(pose.pitch.toFixed(2)),
    reason,
    seq,
    tMs: currentTimeMs,
    yaw: Number(pose.yaw.toFixed(2))
  };
}

export function buildBackendPathPatch({
  binding,
  locked,
  nextPathRevision,
  reason,
  samples,
  takeId
}: {
  binding: LabBackendBinding;
  locked: boolean;
  nextPathRevision: number;
  reason: ViewPathPatch["replaceRange"]["reason"];
  samples: LabRecordingSample[];
  takeId: string;
}): ViewPathPatch | null {
  if (!samples.length) {
    return null;
  }

  let previousTime = -1;
  const points: ViewPathPoint[] = samples.map((sample, index) => {
    const tMs = Math.max(sample.tMs, previousTime + 1);
    previousTime = tMs;
    return {
      center: {
        pitch: sample.pitch,
        yaw: sample.yaw
      },
      cut: index === 0 && reason === "cut",
      enabled: true,
      fov: {
        h: sample.fovH,
        v: sample.fovV
      },
      input: sample.input === "controller_ray" ? "controller_ray" : "head_gaze",
      interpolation: "linear",
      locked,
      roll: 0,
      seq: index + 1,
      smoothFollow: sample.reason !== "SPHERE CTRL CLICK",
      tMs,
      transitionMs: sample.reason === "start" ? 0 : SPHERE_SMOOTH_MOVE_MS
    };
  });
  const startMs = points[0]?.tMs ?? 0;
  const endMs = Math.max(startMs + 1, (points.at(-1)?.tMs ?? startMs) + 200);

  return {
    pathRevision: nextPathRevision,
    points,
    replaceRange: {
      endMs,
      reason,
      startMs
    },
    sessionId: binding.sessionId,
    takeId,
    version: 1,
    videoId: binding.videoId
  };
}

export function workflowEffectForAction(action: WorkflowEffectAction) {
  return action === "effectWhite"
    ? { displayName: "White flash", durationMs: 520, effectType: "transition.flash_white" as const }
    : action === "effectVhs"
      ? { displayName: "VHS blank", durationMs: 860, effectType: "black.solid" as const }
      : { displayName: "Black fade", durationMs: 860, effectType: "transition.fade_black" as const };
}

export function createWorkflowEffectLogItem(action: WorkflowEffectAction, seq: number): LabEffectLogItem {
  const effect = workflowEffectForAction(action);
  return {
    displayName: effect.displayName,
    effectType: effect.effectType,
    seq
  };
}

export function createWorkflowEffectSemanticEvent(action: WorkflowEffectAction): Extract<WebXrSemanticEvent, { type: "createEffectEvent" }> {
  const effect = workflowEffectForAction(action);
  return {
    type: "createEffectEvent",
    displayName: effect.displayName,
    durationMs: effect.durationMs,
    effectType: effect.effectType,
    params: {
      source: "three-official-spatial-controls"
    },
    renderPolicy: {
      fallback: "warn"
    }
  };
}
