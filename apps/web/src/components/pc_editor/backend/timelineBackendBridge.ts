import type {
  EffectEventsPatch,
  PlaybackClientState,
  ViewPathPatch
} from "@/lib/path-protocol";
import {
  sendPcEditorEffectEventsPatchTransport,
  sendPcEditorPlaybackClientStateTransport,
  sendPcEditorViewPathPatchTransport
} from "../transport";

function assertSessionId(sessionId: string) {
  if (!sessionId) {
    throw new Error("Timeline session id is required.");
  }
}

export async function persistPcEditorViewPathPatch(
  sessionId: string,
  patch: ViewPathPatch
): Promise<Record<string, unknown>> {
  assertSessionId(sessionId);
  return sendPcEditorViewPathPatchTransport(sessionId, patch);
}

export async function persistPcEditorEffectEventsPatch(
  sessionId: string,
  patch: EffectEventsPatch
): Promise<Record<string, unknown>> {
  assertSessionId(sessionId);
  return sendPcEditorEffectEventsPatchTransport(sessionId, patch);
}

export async function reportPcEditorPlaybackClientState(
  sessionId: string,
  state: PlaybackClientState
): Promise<Record<string, unknown>> {
  assertSessionId(sessionId);
  return sendPcEditorPlaybackClientStateTransport(sessionId, state);
}
