import type { ExportStatus, WebXrPlayerSession } from "@/lib/api";
import {
  finalizePcEditorRecordingTransport,
  getPcEditorExportStatusTransport,
  switchPcEditorPlayerSessionTransport
} from "../transport";

export type PcEditorPlayerSession = WebXrPlayerSession;

export type PcEditorRenderRequestResult = {
  exportId: string;
};

export type PcEditorExportStatus = ExportStatus;

export async function switchPcEditorSourceSession(sourceId: string): Promise<PcEditorPlayerSession> {
  if (!sourceId) {
    throw new Error("Source id is required.");
  }

  return switchPcEditorPlayerSessionTransport(sourceId);
}

export async function requestPcEditorRender({
  endMs,
  sessionId,
  startMs
}: {
  endMs?: number;
  sessionId: string;
  startMs?: number;
}): Promise<PcEditorRenderRequestResult> {
  if (!sessionId) {
    throw new Error("No timeline session id is available.");
  }

  const result = await finalizePcEditorRecordingTransport(sessionId, { endMs, startMs });
  const exportId = typeof result.exportId === "string" ? result.exportId : null;

  if (!exportId) {
    throw new Error("Render finished without an export id.");
  }

  return { exportId };
}

export async function getPcEditorExportStatus(exportId: string): Promise<PcEditorExportStatus> {
  if (!exportId) {
    throw new Error("Export id is required.");
  }

  return getPcEditorExportStatusTransport(exportId);
}
