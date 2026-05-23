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
  onSemanticEvent?: (event: WebXrSemanticEvent) => void;
  playbackRate?: number;
  recordingRate?: number;
  tickIntervalMs?: number;
  viewTargetSource?: "xr-pose" | "crop-mask";
};

const DEFAULT_TICK_INTERVAL_MS = 100;

function eventToReason(event: WebXrSemanticEvent): TimelinePatchReason | null {
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
  private readonly tickIntervalMs: number;
  private tickTimer: number | null = null;
  private readonly viewTargetSource: "xr-pose" | "crop-mask";
  private viewState: ViewTargetState = defaultViewTargetState();

  constructor(
    private readonly context: TimelineBridgeContext,
    options: AFrameTimelineBridgeOptions = {}
  ) {
    this.onSemanticEvent = options.onSemanticEvent;
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
    this.tryBindAFrameInputEvents();
    this.tickTimer = window.setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);
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
    void this.handleEvent(event);
  }

  private bindSemanticEvents() {
    this.semanticUnbinders.push(bindSemanticTimelineEvents(window, (event) => this.dispatch(event)));
    const sceneEl = this.context.refs.scene();
    this.bindSceneSemanticEvents(sceneEl);
  }

  private bindCropMaskEvents() {
    if (this.viewTargetSource !== "crop-mask" || this.cropMaskUnbind) {
      return;
    }

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{
        center?: { yaw?: number; pitch?: number };
        fov?: { h?: number; v?: number };
        locked?: boolean;
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
        smoothFollow: Boolean(detail.smoothFollow)
      };
    };

    window.addEventListener("webxr:crop-mask-change", listener);
    this.cropMaskUnbind = () => window.removeEventListener("webxr:crop-mask-change", listener);
  }

  private tryBindAFrameInputEvents() {
    const sceneEl = this.context.refs.scene();
    if (!sceneEl) {
      return;
    }

    this.bindSceneSemanticEvents(sceneEl);

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

    this.viewState = reduceViewTargetState(this.viewState, event);
    const reason = eventToReason(event);

    if (reason && this.sampler.forceReasonForEvent(reason)) {
      await this.forceSampleAndFlush(reason, undefined, eventSampleTimeMs(event));
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

  private async tick() {
    this.tryBindAFrameInputEvents();
    const pose = this.viewTargetSource === "crop-mask" ? null : this.readActivePose();
    if (pose) {
      this.viewState = reduceViewTargetState(this.viewState, {
        pose,
        type: "setViewTarget"
      });
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

  private async forceSampleAndFlush(reason: TimelinePatchReason, event?: WebXrSemanticEvent, sampleTimeMs?: number | null) {
    if (event) {
      this.viewState = reduceViewTargetState(this.viewState, event);
    }

    const video = this.context.refs.video();
    if (!video) {
      return;
    }

    const videoTimeMs = typeof sampleTimeMs === "number" && Number.isFinite(sampleTimeMs)
      ? sampleTimeMs
      : video.currentTime * 1000;
    const result = this.sampler.record(this.viewState, videoTimeMs, true);
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
}
