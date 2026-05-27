import { reportPcEditorPlaybackClientState } from "../../../backend";
import type { PlaybackClientState } from "@/lib/path-protocol";
import type { PlaybackStateSender, ViewTargetState } from "../types";

export type PlaybackStateReporterOptions = {
  discardFastForwardRate?: 5;
  intervalMs?: number;
  overlayOpacity?: number;
  playbackRate?: number;
  recordingRate?: number;
  sendState?: PlaybackStateSender;
};

const DEFAULT_INTERVAL_MS = 2000;

export class PlaybackStateReporter {
  private lastPlaybackRate: number | null = null;
  private lastReportWallTimeMs = 0;
  private readonly discardFastForwardRate: 5;
  private readonly intervalMs: number;
  private readonly overlayOpacity: number;
  private playbackRate: number;
  private recordingRate: number;
  private readonly sendState: PlaybackStateSender;
  lastError: string | null = null;

  constructor(
    private readonly videoId: string,
    private readonly sessionId: string,
    options: PlaybackStateReporterOptions = {}
  ) {
    this.discardFastForwardRate = options.discardFastForwardRate ?? 5;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.overlayOpacity = options.overlayOpacity ?? 0.55;
    this.playbackRate = options.playbackRate ?? 1;
    this.recordingRate = options.recordingRate ?? 1;
    this.sendState = options.sendState ?? reportPcEditorPlaybackClientState;
  }

  setPlaybackRate(playbackRate: number) {
    this.playbackRate = playbackRate;
  }

  setRecordingRate(recordingRate: number) {
    this.recordingRate = recordingRate;
  }

  buildState(videoEl: HTMLVideoElement, viewState: ViewTargetState): PlaybackClientState {
    return {
      clientTimeMs: Date.now(),
      discardFastForwardRate: this.discardFastForwardRate,
      playbackRate: this.playbackRate,
      previousPlaybackRate: this.lastPlaybackRate ?? undefined,
      preview: {
        brightness: 1,
        contrast: 1,
        overlayOpacity: this.overlayOpacity
      },
      recording: {
        discardMode: !viewState.enabled,
        recordingRate: this.recordingRate,
        samplingPaused: viewState.samplingPaused
      },
      sessionId: this.sessionId,
      videoId: this.videoId,
      videoTimeMs: Math.max(0, Math.round(videoEl.currentTime * 1000))
    };
  }

  async maybeReport(videoEl: HTMLVideoElement | null, viewState: ViewTargetState, force = false) {
    if (!videoEl) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastReportWallTimeMs < this.intervalMs) {
      return;
    }

    const state = this.buildState(videoEl, viewState);
    try {
      await this.sendState(this.sessionId, state);
      this.lastError = null;
      this.lastPlaybackRate = state.playbackRate;
      this.lastReportWallTimeMs = now;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }
}
