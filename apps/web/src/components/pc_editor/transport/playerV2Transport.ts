import {
  finalizeRecording,
  getExportStatus,
  renderTest,
  switchWebXrPlayerSession,
  type ExportStatus,
  type WebXrPlayerSession
} from "@/lib/api";

export type PcEditorRenderTestResponse = Record<string, unknown>;

export async function switchPcEditorPlayerSessionTransport(sourceId: string): Promise<WebXrPlayerSession> {
  return switchWebXrPlayerSession(sourceId);
}

export async function requestPcEditorRenderTestTransport(sessionId: string): Promise<PcEditorRenderTestResponse> {
  return renderTest(sessionId);
}

export async function finalizePcEditorRecordingTransport(
  sessionId: string,
  payload: { endMs?: number; startMs?: number } = {}
): Promise<PcEditorRenderTestResponse> {
  return finalizeRecording(sessionId, payload);
}

export async function getPcEditorExportStatusTransport(exportId: string): Promise<ExportStatus> {
  return getExportStatus(exportId);
}
