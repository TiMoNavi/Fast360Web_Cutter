import type { EffectEventName, EffectRenderPolicy, ViewPathPatch, ViewPathPoint } from "@/lib/path-protocol";
import type { ViewTargetState } from "../../data/timeline-bridge";
import type { PcEditorRuntimeState } from "../../state";
import type { EffectPreviewTarget } from "../preview";

export type PcEditorEffectFamily =
  | "transition"
  | "camera-motion"
  | "mask"
  | "filter"
  | "distortion"
  | "glitch"
  | "temporal"
  | "overlay"
  | "light-particle"
  | "xr-spatial"
  | "audio-beat";

export type PcEditorEffectEngine =
  | "frame-effect"
  | "view-path"
  | "mask"
  | "temporal"
  | "overlay"
  | "xr-spatial"
  | "audio";

export type PcEditorEffectPreviewAdapter = "dom" | "canvas" | "webgl" | "aframe-shader" | "aframe-entity" | "world-layer" | "symbolic" | "none";

export type PcEditorEffectPreviewAccuracy = "exact" | "approximate" | "symbolic" | "unsupported";

export type PcEditorEffectRenderStage =
  | "pre_remap_equirect"
  | "post_remap_frame"
  | "viewport_path"
  | "overlay_frame"
  | "audio_timeline"
  | "xr_runtime_only"
  | "marker_only";

export type PcEditorEffectSpec = {
  defaultDurationMs?: number;
  defaultParams?: Record<string, unknown>;
  engine: PcEditorEffectEngine;
  eventName?: EffectEventName;
  family: PcEditorEffectFamily;
  id: string;
  inputs?: {
    assets?: string[];
    state?: string[];
  };
  label: string;
  preview: {
    accuracy: PcEditorEffectPreviewAccuracy;
    pc: PcEditorEffectPreviewAdapter;
    target: EffectPreviewTarget;
    vr: PcEditorEffectPreviewAdapter;
  };
  render: {
    backendSupport: "supported" | "unsupported";
    conflictGroup?: string;
    fallback: "ignore" | "warn" | "fail";
    priority?: number;
    stage: PcEditorEffectRenderStage;
  };
};

export type EffectEventDraft = {
  displayName?: string;
  durationMs?: number;
  effectType: EffectEventName;
  endMs?: number;
  kind: "effect-event";
  params?: Record<string, unknown>;
  renderPolicy?: EffectRenderPolicy;
  startMs?: number;
};

export type ViewPathRangeDraft = {
  endMs: number;
  endState: ViewTargetState;
  interpolation?: ViewPathPoint["interpolation"];
  keyframes?: Array<{
    interpolation?: ViewPathPoint["interpolation"];
    state: ViewTargetState;
    timeMs: number;
    transitionMs?: number;
  }>;
  kind: "view-path-range";
  reason?: ViewPathPatch["replaceRange"]["reason"];
  startMs: number;
  startState: ViewTargetState;
  transitionMs?: number;
};

export type OverlayLayerDraft = {
  assetId?: string;
  kind: "overlay-layer";
  layerType: "text" | "image" | "shape" | "video";
  params?: Record<string, unknown>;
};

export type MarkerOrAudioDraft = {
  kind: "marker-audio";
  markerType: "beat" | "note" | "music" | "sound-effect";
  params?: Record<string, unknown>;
  timeMs?: number;
};

export type XrRuntimeDraft = {
  kind: "xr-runtime";
  params?: Record<string, unknown>;
  target: EffectPreviewTarget;
};

export type PcEditorCompiledEffectDraft =
  | EffectEventDraft
  | ViewPathRangeDraft
  | OverlayLayerDraft
  | MarkerOrAudioDraft
  | XrRuntimeDraft;

export type PcEditorEffectCompileContext = {
  runtime: PcEditorRuntimeState;
  timeline: {
    currentVideoTimeMs: number;
    viewState: ViewTargetState;
  };
};

export type EffectSelectCompileInput = {
  categoryId: string;
  conflictGroup?: string | null;
  durationMs?: number | null;
  effectId: string;
  eventName?: string | null;
  fallbackDurationMs?: number;
  fallbackEventName?: EffectEventName;
  fallbackParams?: Record<string, unknown>;
  label: string;
  params?: Record<string, unknown> | null;
  renderFallback?: "ignore" | "warn" | "fail" | null;
  renderStage?: PcEditorEffectRenderStage | null;
};

export type ViewPathMotionCompileInput = {
  durationMs?: number | null;
  effectSpeed?: number | null;
  effectId: string;
  fallbackDurationMs?: number;
  params?: Record<string, unknown> | null;
  renderStage?: PcEditorEffectRenderStage | null;
  timeline: {
    currentVideoTimeMs: number;
    viewState: ViewTargetState;
  };
};

export type EffectHoldEndCompileInput = {
  categoryId: string;
  conflictGroup?: string | null;
  durationMs: number;
  effectId: string;
  endMs: number;
  eventName: EffectEventName;
  fadeMs: number;
  label: string;
  params?: Record<string, unknown>;
  renderFallback?: "ignore" | "warn" | "fail" | null;
  startMs: number;
};
