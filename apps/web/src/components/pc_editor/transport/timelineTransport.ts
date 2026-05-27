import {
  sendEffectEventsPatch,
  sendPlaybackClientState,
  sendViewPathPatch
} from "@/lib/api";
import type {
  EffectEventsPatch,
  PlaybackClientState,
  ViewPathPatch
} from "@/lib/path-protocol";

export async function sendPcEditorViewPathPatchTransport(
  sessionId: string,
  patch: ViewPathPatch
): Promise<Record<string, unknown>> {
  return sendViewPathPatch(sessionId, patch);
}

export async function sendPcEditorEffectEventsPatchTransport(
  sessionId: string,
  patch: EffectEventsPatch
): Promise<Record<string, unknown>> {
  return sendEffectEventsPatch(sessionId, patch);
}

export async function sendPcEditorPlaybackClientStateTransport(
  sessionId: string,
  state: PlaybackClientState
): Promise<Record<string, unknown>> {
  return sendPlaybackClientState(sessionId, state);
}
