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

const DEFAULT_SAMPLE_INTERVAL_MS = 200;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const DEFAULT_MAX_BUFFERED_POINTS = 10;

export class PathSampler {
  private bufferedPointCount = 0;
  private lastFlushVideoTimeMs: number | null = null;
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

  record(state: ViewTargetState, videoTimeMs: number, force = false): SampleResult {
    if (state.samplingPaused) {
      return { point: null, shouldFlush: false };
    }

    const tMs = Math.max(0, Math.round(videoTimeMs));
    if (!force && this.lastSampleVideoTimeMs !== null && tMs - this.lastSampleVideoTimeMs < this.sampleIntervalMs) {
      return { point: null, shouldFlush: false };
    }

    this.lastSampleVideoTimeMs = tMs;
    this.lastFlushVideoTimeMs ??= tMs;
    this.bufferedPointCount += 1;

    const point: ViewPathPoint = {
      center: {
        yaw: state.center.yaw,
        pitch: state.center.pitch
      },
      cut: state.cut,
      enabled: state.enabled,
      fov: {
        h: state.fov.h,
        v: state.fov.v
      },
      input: state.input,
      interpolation: state.cut ? "hold" : "linear",
      locked: state.locked,
      roll: state.roll,
      seq: ++this.seq,
      smoothFollow: state.smoothFollow,
      tMs,
      transitionMs: state.cut ? 0 : 0
    };

    const shouldFlush =
      force ||
      this.bufferedPointCount >= this.maxBufferedPoints ||
      tMs - this.lastFlushVideoTimeMs >= this.flushIntervalMs;

    return { point, shouldFlush };
  }

  markFlushed() {
    this.bufferedPointCount = 0;
    this.lastFlushVideoTimeMs = this.lastSampleVideoTimeMs;
  }

  forceReasonForEvent(reason: TimelinePatchReason) {
    return reason === "cut" || reason === "discard" || reason === "restore" || reason === "fov" || reason === "lock";
  }
}
