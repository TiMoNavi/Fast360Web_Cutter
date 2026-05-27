import { persistPcEditorEffectEventsPatch } from "../../../backend";
import type { EffectEvent, EffectEventsPatch } from "@/lib/path-protocol";
import type { EffectPatchSender } from "../types";

export type EffectEventQueueOptions = {
  defaultDurationMs?: number;
  sendPatch?: EffectPatchSender;
};

type EffectEventDraft = Omit<EffectEvent, "seq" | "startMs" | "endMs"> & {
  durationMs?: number;
  endMs?: number;
  startMs: number;
};

const DEFAULT_EFFECT_DURATION_MS = 1000;

export class EffectEventQueue {
  private effectRevision = 0;
  private pending = 0;
  private seq = 0;
  private readonly defaultDurationMs: number;
  private readonly sendPatch: EffectPatchSender;
  lastError: string | null = null;

  constructor(
    private readonly videoId: string,
    private readonly sessionId: string,
    options: EffectEventQueueOptions = {}
  ) {
    this.defaultDurationMs = options.defaultDurationMs ?? DEFAULT_EFFECT_DURATION_MS;
    this.sendPatch = options.sendPatch ?? persistPcEditorEffectEventsPatch;
  }

  pendingCount() {
    return this.pending;
  }

  buildPatch(event: EffectEventDraft): EffectEventsPatch {
    const startMs = Math.max(0, Math.round(event.startMs));
    const endMs = Math.max(startMs + 1, Math.round(event.endMs ?? startMs + (event.durationMs ?? this.defaultDurationMs)));
    const { durationMs: _durationMs, endMs: _endMs, startMs: _startMs, ...eventFields } = event;
    const effectEvent: EffectEvent = {
      ...eventFields,
      endMs,
      seq: ++this.seq,
      startMs
    } as EffectEvent;

    return {
      effectRevision: ++this.effectRevision,
      events: [effectEvent],
      replaceRange: {
        endMs,
        reason: "effect",
        startMs
      },
      sessionId: this.sessionId,
      version: 1,
      videoId: this.videoId
    };
  }

  async send(event: EffectEventDraft) {
    const patch = this.buildPatch(event);
    this.pending += 1;
    try {
      await this.sendPatch(this.sessionId, patch);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.pending = Math.max(0, this.pending - 1);
    }
  }
}
