import { bindAFrameInputEvents } from "./compat/inputEvents";
import { readControllerTarget, readHeadsetPose } from "./compat/pose";
import { bindSemanticTimelineEvents } from "./events/semanticEvents";
import { PathSampler } from "./sampler/pathSampler";
import {
  clearOneShotViewFlags,
  defaultViewTargetState,
  reduceViewTargetState
} from "./state/viewTargetReducer";
import { EffectEventQueue } from "./transport/effectEventQueue";
import { PathPatchQueue } from "./transport/pathPatchQueue";
import { PlaybackStateReporter } from "./transport/playbackStateReporter";
import { getPcEditorRuntimeState, setPcEditorCameraPose, setPcEditorViewTarget, subscribePcEditorRuntimeState } from "../../state";
import type {
  AFrameEntityLike,
  TimelineBridgeContext,
  TimelineBridgeStatus,
  TimelinePatchReason,
  ViewTargetPose,
  ViewTargetState,
  WebXrSemanticEvent
} from "./types";

type AFrameTimelineBridgeOptions = {
  bindControllerInputEvents?: boolean;
  legacyCropMaskWindowEvents?: boolean;
  legacyWindowSemanticEvents?: boolean;
  onSemanticEvent?: (event: WebXrSemanticEvent) => void;
  playbackRate?: number;
  recordingRate?: number;
  tickIntervalMs?: number;
  viewTargetSource?: "xr-pose" | "crop-mask";
};

const DEFAULT_TICK_INTERVAL_MS = 100;

function eventToReason(event: WebXrSemanticEvent): TimelinePatchReason | null {
  if (event.type === "setViewTarget" && event.force) {
    return event.flushReason ?? "lock";
  }
  if (event.type === "cutHere") {
    return "cut";
  }
  if (event.type === "discardRange") {
    return "discard";
  }
  if (event.type === "restoreRange") {
    return "restore";
  }
  if (event.type === "setFov" || event.type === "nudgeFov") {
    return "fov";
  }
  if (event.type === "setRoll" || event.type === "nudgeRoll") {
    return "lock";
  }
  if (event.type === "lockViewport" || event.type === "unlockViewport" || event.type === "toggleLock") {
    return "lock";
  }
  if (event.type === "flushPath") {
    return event.reason ?? "live";
  }
  return null;
}

function eventSampleTimeMs(event: WebXrSemanticEvent) {
  if (event.type === "discardRange" && typeof event.startMs === "number" && Number.isFinite(event.startMs)) {
    return event.startMs;
  }

  if (event.type === "restoreRange" && typeof event.endMs === "number" && Number.isFinite(event.endMs)) {
    return event.endMs;
  }

  return null;
}

function runtimeViewInputFromPose(pose: ViewTargetPose): "controller" | "head_gaze" {
  return pose.input === "controller_ray" ? "controller" : "head_gaze";
}

export class AFrameTimelineBridge {
  private activeControllerHand: "left" | "right" | null = null;
  private inputUnbind: (() => void) | null = null;
  private readonly pathQueue: PathPatchQueue;
  private readonly effectQueue: EffectEventQueue;
  private readonly playbackReporter: PlaybackStateReporter;
  private cropMaskUnbind: (() => void) | null = null;
  private sceneSemanticUnbind: (() => void) | null = null;
  private semanticUnbinders: Array<() => void> = [];
  private readonly sampler = new PathSampler();
  private started = false;
  private readonly onSemanticEvent?: (event: WebXrSemanticEvent) => void;
  private readonly bindControllerInputEvents: boolean;
  private readonly legacyCropMaskWindowEvents: boolean;
  private readonly legacyWindowSemanticEvents: boolean;
  private readonly tickIntervalMs: number;
  private tickTimer: number | null = null;
  private readonly viewTargetSource: "xr-pose" | "crop-mask";
  private viewState: ViewTargetState = defaultViewTargetState();

  constructor(
    private readonly context: TimelineBridgeContext,
    options: AFrameTimelineBridgeOptions = {}
  ) {
    this.bindControllerInputEvents = options.bindControllerInputEvents ?? true;
    this.onSemanticEvent = options.onSemanticEvent;
    this.legacyCropMaskWindowEvents = options.legacyCropMaskWindowEvents ?? false;
    this.legacyWindowSemanticEvents = options.legacyWindowSemanticEvents ?? false;
    this.tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
    this.viewTargetSource = options.viewTargetSource ?? "xr-pose";
    this.pathQueue = new PathPatchQueue(context.videoId, context.sessionId);
    this.effectQueue = new EffectEventQueue(context.videoId, context.sessionId);
    this.playbackReporter = new PlaybackStateReporter(context.videoId, context.sessionId, {
      playbackRate: options.playbackRate,
      recordingRate: options.recordingRate
    });
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.bindSemanticEvents();
    this.bindCropMaskEvents();
    this.syncCropMaskViewStateFromRuntime();
    this.tryBindAFrameInputEvents();
    this.tickTimer = window.setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);
    if (this.viewTargetSource === "crop-mask") {
      void this.forceSampleAndFlush("lock", undefined, undefined, { preserveUnchanged: true });
    }
  }

  stop() {
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.inputUnbind?.();
    this.inputUnbind = null;
    this.cropMaskUnbind?.();
    this.cropMaskUnbind = null;
    this.sceneSemanticUnbind?.();
    this.sceneSemanticUnbind = null;
    this.semanticUnbinders.forEach((unbind) => unbind());
    this.semanticUnbinders = [];
    this.started = false;
  }

  getState() {
    return this.viewState;
  }

  getCurrentVideoTimeMs() {
    const video = this.context.refs.video();
    return Math.max(0, Math.round((video?.currentTime ?? 0) * 1000));
  }

  getStatus(): TimelineBridgeStatus {
    return {
      lastAcceptedPathPatch: this.pathQueue.lastAcceptedPathPatch,
      lastError: this.pathQueue.lastError ?? this.effectQueue.lastError ?? this.playbackReporter.lastError,
      lastPatchRevision: this.pathQueue.currentRevision(),
      pendingEffectEvents: this.effectQueue.pendingCount(),
      pendingPathPoints: this.pathQueue.pendingPointCount(),
      queuedPathBatches: this.pathQueue.queuedBatchCount()
    };
  }

  setPlaybackRate(playbackRate: number) {
    this.playbackReporter.setPlaybackRate(playbackRate);
  }

  setRecordingRate(recordingRate: number) {
    this.playbackReporter.setRecordingRate(recordingRate);
  }

  dispatch(event: WebXrSemanticEvent) {
    this.onSemanticEvent?.(event);
    return this.handleEvent(event);
  }

  private bindSemanticEvents() {
    if (this.legacyWindowSemanticEvents) {
      this.semanticUnbinders.push(bindSemanticTimelineEvents(window, (event) => this.dispatch(event)));
    }

    const sceneEl = this.context.refs.scene();
    this.bindSceneSemanticEvents(sceneEl);
  }

  private bindCropMaskEvents() {
    if (this.viewTargetSource !== "crop-mask" || this.cropMaskUnbind) {
      return;
    }

    if (!this.legacyCropMaskWindowEvents) {
      this.cropMaskUnbind = subscribePcEditorRuntimeState(() => {
        this.syncCropMaskViewStateFromRuntime();
      });
      return;
    }

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{
        center?: { yaw?: number; pitch?: number };
        fov?: { h?: number; v?: number };
        locked?: boolean;
        roll?: number;
        smoothFollow?: boolean;
      }>).detail;

      if (!detail?.center || !detail.fov) {
        return;
      }

      this.viewState = {
        ...this.viewState,
        center: {
          yaw: Number(detail.center.yaw ?? this.viewState.center.yaw),
          pitch: Number(detail.center.pitch ?? this.viewState.center.pitch)
        },
        fov: {
          h: Number(detail.fov.h ?? this.viewState.fov.h),
          v: Number(detail.fov.v ?? this.viewState.fov.v)
        },
        input: "head_gaze",
        locked: Boolean(detail.locked),
        roll: Number(detail.roll ?? this.viewState.roll),
        smoothFollow: Boolean(detail.smoothFollow)
      };
    };

    window.addEventListener("webxr:crop-mask-change", listener);
    this.cropMaskUnbind = () => window.removeEventListener("webxr:crop-mask-change", listener);
  }

  private syncCropMaskViewStateFromRuntime() {
    if (this.viewTargetSource !== "crop-mask") {
      return;
    }

    const viewTarget = getPcEditorRuntimeState().viewTarget;
    if (!viewTarget) {
      return;
    }

    this.viewState = {
      ...this.viewState,
      center: {
        pitch: viewTarget.center.pitch,
        yaw: viewTarget.center.yaw
      },
      fov: {
        h: viewTarget.fov.h,
        v: viewTarget.fov.v
      },
      input: "head_gaze",
      locked: viewTarget.locked,
      roll: viewTarget.roll
    };
  }

  private tryBindAFrameInputEvents() {
    const sceneEl = this.context.refs.scene();
    if (!sceneEl) {
      return;
    }

    this.bindSceneSemanticEvents(sceneEl);

    if (!this.bindControllerInputEvents) {
      return;
    }

    if (this.inputUnbind) {
      return;
    }

    this.inputUnbind = bindAFrameInputEvents(sceneEl, (event) => this.dispatch(event));
  }

  private bindSceneSemanticEvents(sceneEl: HTMLElement | null) {
    if (!sceneEl || this.sceneSemanticUnbind) {
      return;
    }

    this.sceneSemanticUnbind = bindSemanticTimelineEvents(sceneEl, (event) => this.dispatch(event));
  }

  private async handleEvent(event: WebXrSemanticEvent) {
    if (this.viewTargetSource === "crop-mask") {
      this.syncCropMaskViewStateFromRuntime();
    }

    if (event.type === "controllerAimStart") {
      this.activeControllerHand = event.hand ?? "right";
      this.viewState = reduceViewTargetState(this.viewState, { type: "unlockViewport" });
      return;
    }

    if (event.type === "controllerAimEnd") {
      this.activeControllerHand = null;
      await this.forceSampleAndFlush("lock", { type: "lockViewport" });
      return;
    }

    if (event.type === "createEffectEvent") {
      await this.sendEffectEvent(event);
      return;
    }

    if (event.type === "createViewPathRange") {
      await this.createViewPathRange(event);
      return;
    }

    this.viewState = reduceViewTargetState(this.viewState, event);
    const reason = eventToReason(event);

    if (reason && this.sampler.forceReasonForEvent(reason)) {
      await this.forceSampleAndFlush(reason, event.type === "setViewTarget" ? event : undefined, eventSampleTimeMs(event));
      return;
    }

    if (event.type === "flushPath") {
      await this.pathQueue.flush(reason ?? "live");
      this.sampler.markFlushed();
    }

    if (event.type === "samplingPause" || event.type === "samplingResume") {
      await this.playbackReporter.maybeReport(this.context.refs.video(), this.viewState, true);
    }
  }

  private readActivePose(): ViewTargetPose | null {
    const controller = this.readActiveController();
    if (controller) {
      const pose = readControllerTarget(controller);
      if (pose) {
        return pose;
      }
    }

    return readHeadsetPose(this.context.refs.camera());
  }

  private readActiveController(): AFrameEntityLike | null {
    if (this.activeControllerHand === "left") {
      return this.context.refs.leftController?.() ?? null;
    }

    if (this.activeControllerHand === "right") {
      return this.context.refs.rightController?.() ?? null;
    }

    return null;
  }

  private writeRuntimePose(pose: ViewTargetPose) {
    const videoTimeMs = this.getCurrentVideoTimeMs();

    if (pose.input === "head_gaze") {
      setPcEditorCameraPose({
        center: {
          pitch: pose.pitch,
          yaw: pose.yaw
        },
        source: "headset"
      });
    }

    setPcEditorViewTarget({
      center: {
        pitch: pose.pitch,
        yaw: pose.yaw
      },
      fov: this.viewState.fov,
      input: runtimeViewInputFromPose(pose),
      locked: this.viewState.locked,
      roll: this.viewState.roll,
      source: pose.input === "controller_ray" ? "controller" : "xr-pose",
      videoTimeMs
    });
  }

  private async tick() {
    this.tryBindAFrameInputEvents();
    const headsetPose = readHeadsetPose(this.context.refs.camera());
    if (headsetPose) {
      setPcEditorCameraPose({
        center: {
          pitch: headsetPose.pitch,
          yaw: headsetPose.yaw
        },
        source: "headset"
      });
    }

    const pose = this.viewTargetSource === "crop-mask" ? null : this.readActivePose();
    if (pose) {
      this.viewState = reduceViewTargetState(this.viewState, {
        pose,
        type: "setViewTarget"
      });
      this.writeRuntimePose(pose);
    }

    const video = this.context.refs.video();
    if (!video) {
      return;
    }

    const result = this.sampler.record(this.viewState, video.currentTime * 1000);
    if (result.point) {
      this.pathQueue.addPoint(result.point);
      this.viewState = clearOneShotViewFlags(this.viewState);
    }

    if (result.shouldFlush) {
      await this.pathQueue.flush("live");
      this.sampler.markFlushed();
    } else {
      await this.pathQueue.drain();
    }

    await this.playbackReporter.maybeReport(video, this.viewState);
  }

  private async forceSampleAndFlush(
    reason: TimelinePatchReason,
    event?: WebXrSemanticEvent,
    sampleTimeMs?: number | null,
    options: { preserveUnchanged?: boolean } = {}
  ) {
    if (event) {
      this.viewState = reduceViewTargetState(this.viewState, event);
    }

    const video = this.context.refs.video();
    if (!video) {
      return;
    }

    const hasExplicitSampleTimeMs = typeof sampleTimeMs === "number" && Number.isFinite(sampleTimeMs);
    const videoTimeMs = hasExplicitSampleTimeMs
      ? sampleTimeMs
      : video.currentTime * 1000;
    const result = this.sampler.record(this.viewState, videoTimeMs, true, {
      ensureAfterLastSample: !hasExplicitSampleTimeMs,
      preserveUnchanged:
        options.preserveUnchanged ||
        (event?.type === "setViewTarget" && event.pathAnchor === true),
      skipUnchanged: true
    });
    if (result.point) {
      this.pathQueue.addPoint(result.point);
      this.viewState = clearOneShotViewFlags(this.viewState);
    }
    await this.pathQueue.flush(reason);
    this.sampler.markFlushed();
    await this.playbackReporter.maybeReport(video, this.viewState, true);
  }

  private async sendEffectEvent(event: Extract<WebXrSemanticEvent, { type: "createEffectEvent" }>) {
    const videoTimeMs = Math.max(0, Math.round((this.context.refs.video()?.currentTime ?? 0) * 1000));
    await this.effectQueue.send({
      displayName: event.displayName,
      durationMs: event.durationMs,
      enabled: true,
      eventName: event.effectType,
      params: event.params,
      renderPolicy: event.renderPolicy,
      startMs: event.startMs ?? videoTimeMs,
      endMs: event.endMs
    });
  }

  private async createViewPathRange(event: Extract<WebXrSemanticEvent, { type: "createViewPathRange" }>) {
    const startMs = Math.max(0, Math.round(event.startMs));
    const endMs = Math.max(startMs + 1, Math.round(event.endMs));
    this.pathQueue.addPoint(
      this.sampler.createPoint(event.startState, startMs, {
        interpolation: "hold",
        transitionMs: 0
      })
    );
    const keyframes = [...(event.keyframes ?? [])]
      .map((keyframe) => ({
        ...keyframe,
        timeMs: Math.max(startMs + 1, Math.min(endMs - 1, Math.round(keyframe.timeMs)))
      }))
      .sort((left, right) => left.timeMs - right.timeMs);
    for (const keyframe of keyframes) {
      this.pathQueue.addPoint(
        this.sampler.createPoint(keyframe.state, keyframe.timeMs, {
          interpolation: keyframe.interpolation ?? "fast",
          transitionMs: keyframe.transitionMs ?? Math.max(1, keyframe.timeMs - startMs)
        })
      );
    }
    this.pathQueue.addPoint(
      this.sampler.createPoint(event.endState, endMs, {
        interpolation: event.interpolation ?? "fast",
        transitionMs: event.transitionMs ?? Math.max(1, endMs - startMs)
      })
    );
    this.viewState = event.endState;
    await this.pathQueue.flush(event.reason ?? "lock");
    this.sampler.markFlushed();
    await this.playbackReporter.maybeReport(this.context.refs.video(), this.viewState, true);
  }
}
