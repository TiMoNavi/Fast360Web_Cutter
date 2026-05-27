import { sendViewPathPatch } from "@/lib/api";
import type { ViewPathPatch, ViewPathPoint } from "@/lib/path-protocol";
import type { PathPatchSender, TimelinePatchReason } from "../types";

type PendingPathBatch = {
  patch: ViewPathPatch;
  status: "pending" | "sending";
};

export type PathPatchQueueOptions = {
  replacePaddingMs?: number;
  sendPatch?: PathPatchSender;
  takeId?: string;
};

const DEFAULT_REPLACE_PADDING_MS = 200;
const POINT_TIME_MATCH_EPSILON_MS = 1;

function defaultTakeId() {
  return `take_${Date.now().toString(36)}`;
}

function sortPoints(points: ViewPathPoint[]) {
  return [...points].sort((a, b) => a.tMs - b.tMs || a.seq - b.seq);
}

function pointTimesMatch(leftMs: number, rightMs: number) {
  return Math.abs(leftMs - rightMs) <= POINT_TIME_MATCH_EPSILON_MS;
}

function upsertPoint(points: ViewPathPoint[], point: ViewPathPoint) {
  const existingIndex = points.findIndex((candidate) => pointTimesMatch(candidate.tMs, point.tMs));
  if (existingIndex >= 0) {
    points[existingIndex] = point;
    return;
  }

  points.push(point);
  points.sort((a, b) => a.tMs - b.tMs || a.seq - b.seq);
}

export class PathPatchQueue {
  private readonly batches: PendingPathBatch[] = [];
  private readonly bufferedPoints: ViewPathPoint[] = [];
  private readonly replacePaddingMs: number;
  private readonly sendPatch: PathPatchSender;
  private readonly takeId: string;
  private pathRevision = 0;
  private sending = false;
  lastAcceptedPathPatch: import("../types").TimelineBridgeStatus["lastAcceptedPathPatch"] = null;
  lastError: string | null = null;

  constructor(
    private readonly videoId: string,
    private readonly sessionId: string,
    options: PathPatchQueueOptions = {}
  ) {
    this.replacePaddingMs = options.replacePaddingMs ?? DEFAULT_REPLACE_PADDING_MS;
    this.sendPatch = options.sendPatch ?? sendViewPathPatch;
    this.takeId = options.takeId ?? defaultTakeId();
  }

  addPoint(point: ViewPathPoint) {
    const pendingBatch = this.batches.find((batch) => {
      if (batch.status !== "pending") {
        return false;
      }
      return point.tMs >= batch.patch.replaceRange.startMs && point.tMs < batch.patch.replaceRange.endMs;
    });

    if (pendingBatch) {
      upsertPoint(pendingBatch.patch.points, point);
      pendingBatch.patch.replaceRange.startMs = Math.min(pendingBatch.patch.replaceRange.startMs, point.tMs);
      pendingBatch.patch.replaceRange.endMs = Math.max(
        pendingBatch.patch.replaceRange.endMs,
        point.tMs + this.replacePaddingMs,
        pendingBatch.patch.replaceRange.startMs + 1
      );
      return;
    }

    upsertPoint(this.bufferedPoints, point);
  }

  pendingPointCount() {
    return this.bufferedPoints.length;
  }

  queuedBatchCount() {
    return this.batches.length;
  }

  currentRevision() {
    return this.pathRevision;
  }

  buildPatch(reason: TimelinePatchReason): ViewPathPatch | null {
    if (!this.bufferedPoints.length) {
      return null;
    }

    const points = sortPoints(this.bufferedPoints);
    const startMs = points[0].tMs;
    const maxPointTime = points[points.length - 1].tMs;
    const endMs = Math.max(startMs + 1, maxPointTime + this.replacePaddingMs);

    return {
      pathRevision: ++this.pathRevision,
      points,
      replaceRange: {
        endMs,
        reason,
        startMs
      },
      sessionId: this.sessionId,
      takeId: this.takeId,
      version: 1,
      videoId: this.videoId
    };
  }

  queueFlush(reason: TimelinePatchReason) {
    const patch = this.buildPatch(reason);
    if (!patch) {
      return null;
    }

    this.bufferedPoints.length = 0;
    this.batches.push({ patch, status: "pending" });
    return patch;
  }

  async flush(reason: TimelinePatchReason) {
    this.queueFlush(reason);
    await this.drain();
  }

  async drain() {
    if (this.sending) {
      return;
    }

    this.sending = true;
    try {
      for (const batch of this.batches) {
        if (batch.status === "sending") {
          continue;
        }

        batch.status = "sending";
        try {
          const response = await this.sendPatch(this.sessionId, batch.patch);
          const firstPoint = batch.patch.points[0];
          const lastPoint = batch.patch.points[batch.patch.points.length - 1];
          this.lastAcceptedPathPatch = {
            acceptedPoints:
              typeof response.acceptedPoints === "number"
                ? response.acceptedPoints
                : batch.patch.points.length,
            firstPoint: firstPoint
              ? {
                  center: firstPoint.center,
                  fov: firstPoint.fov,
                  tMs: firstPoint.tMs
                }
              : undefined,
            lastPoint: lastPoint
              ? {
                  center: lastPoint.center,
                  fov: lastPoint.fov,
                  tMs: lastPoint.tMs
                }
              : undefined,
            pathRevision: batch.patch.pathRevision,
            replaceRange: batch.patch.replaceRange,
            status: typeof response.status === "string" ? response.status : undefined
          };
          const index = this.batches.indexOf(batch);
          if (index >= 0) {
            this.batches.splice(index, 1);
          }
          this.lastError = null;
        } catch (error) {
          batch.status = "pending";
          this.lastError = error instanceof Error ? error.message : String(error);
          break;
        }
      }
    } finally {
      this.sending = false;
    }
  }
}
