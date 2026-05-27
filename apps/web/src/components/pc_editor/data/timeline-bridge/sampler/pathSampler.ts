import type { ViewPathPoint } from "@/lib/path-protocol";
import type { TimelinePatchReason, ViewTargetState } from "../types";

export type PathSamplerOptions = {
  flushIntervalMs?: number;
  maxBufferedPoints?: number;
  sampleIntervalMs?: number;
};

export type SampleResult =
  | {
      point: ViewPathPoint;
      shouldFlush: boolean;
    }
  | {
      point: null;
      shouldFlush: false;
    };

export type RecordSampleOptions = {
  ensureAfterLastSample?: boolean;
  preserveUnchanged?: boolean;
  skipUnchanged?: boolean;
};

const DEFAULT_SAMPLE_INTERVAL_MS = 200;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const DEFAULT_MAX_BUFFERED_POINTS = 10;

type CreatePointOptions = {
  cut?: boolean;
  interpolation?: ViewPathPoint["interpolation"];
  transitionMs?: number;
};

export class PathSampler {
  private bufferedPointCount = 0;
  private lastFlushVideoTimeMs: number | null = null;
  private lastSampleStateKey: string | null = null;
  private lastSampleVideoTimeMs: number | null = null;
  private seq = 0;
  readonly flushIntervalMs: number;
  readonly maxBufferedPoints: number;
  readonly sampleIntervalMs: number;

  constructor(options: PathSamplerOptions = {}) {
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxBufferedPoints = options.maxBufferedPoints ?? DEFAULT_MAX_BUFFERED_POINTS;
    this.sampleIntervalMs = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  }

  record(
    state: ViewTargetState,
    videoTimeMs: number,
    force = false,
    options: RecordSampleOptions = {}
  ): SampleResult {
    if (state.samplingPaused) {
      return { point: null, shouldFlush: false };
    }

    const stateKey = sampleStateKey(state);
    if (
      force &&
      options.skipUnchanged &&
      !options.preserveUnchanged &&
      this.lastSampleStateKey === stateKey
    ) {
      return { point: null, shouldFlush: false };
    }

    let tMs = Math.max(0, Math.round(videoTimeMs));
    if (force && options.ensureAfterLastSample && this.lastSampleVideoTimeMs !== null && tMs <= this.lastSampleVideoTimeMs) {
      tMs = this.lastSampleVideoTimeMs + 1;
    }

    if (!force && this.lastSampleVideoTimeMs !== null && tMs - this.lastSampleVideoTimeMs < this.sampleIntervalMs) {
      return { point: null, shouldFlush: false };
    }

    this.lastSampleVideoTimeMs = tMs;
    this.lastSampleStateKey = stateKey;
    this.lastFlushVideoTimeMs ??= tMs;
    this.bufferedPointCount += 1;

    const point = this.createPoint(state, tMs);

    const shouldFlush =
      force ||
      this.bufferedPointCount >= this.maxBufferedPoints ||
      tMs - this.lastFlushVideoTimeMs >= this.flushIntervalMs;

    return { point, shouldFlush };
  }

  createPoint(state: ViewTargetState, videoTimeMs: number, options: CreatePointOptions = {}): ViewPathPoint {
    const tMs = Math.max(0, Math.round(videoTimeMs));
    const cut = options.cut ?? state.cut;

    return {
      center: {
        yaw: state.center.yaw,
        pitch: state.center.pitch
      },
      cut,
      enabled: state.enabled,
      fov: {
        h: state.fov.h,
        v: state.fov.v
      },
      input: state.input,
      interpolation: options.interpolation ?? (cut ? "hold" : "linear"),
      locked: state.locked,
      roll: state.roll,
      seq: ++this.seq,
      smoothFollow: state.smoothFollow,
      tMs,
      transitionMs: options.transitionMs ?? 0
    };
  }

  markFlushed() {
    this.bufferedPointCount = 0;
    this.lastFlushVideoTimeMs = this.lastSampleVideoTimeMs;
  }

  forceReasonForEvent(reason: TimelinePatchReason) {
    return reason === "cut" || reason === "discard" || reason === "restore" || reason === "fov" || reason === "lock";
  }
}

function sampleStateKey(state: ViewTargetState) {
  return [
    roundKey(state.center.yaw),
    roundKey(state.center.pitch),
    roundKey(state.fov.h),
    roundKey(state.fov.v),
    roundKey(state.roll),
    state.enabled ? 1 : 0,
    state.cut ? 1 : 0,
    state.locked ? 1 : 0,
    state.smoothFollow ? 1 : 0,
    state.input
  ].join("|");
}

function roundKey(value: number) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0;
}
