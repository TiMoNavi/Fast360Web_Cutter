"use client";

import type { Dispatch, SetStateAction } from "react";
import { getPcEditorExportStatus, requestPcEditorRender } from "../../backend";
import { usePcEditorEventEmitter, usePcEditorEventSubscription } from "../../events";

export type PlayerV2RenderStatus = "idle" | "rendering" | "done" | "error";

const EXPORT_POLL_INTERVAL_MS = 1500;
const EXPORT_POLL_TIMEOUT_MS = 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForExportReady(exportId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= EXPORT_POLL_TIMEOUT_MS) {
    const status = await getPcEditorExportStatus(exportId);

    if (status.downloadReady || status.status === "ready") {
      return status;
    }

    if (status.status === "failed") {
      throw new Error(status.errorMessage || "Export failed.");
    }

    await sleep(EXPORT_POLL_INTERVAL_MS);
  }

  throw new Error("Export status polling timed out.");
}

export function usePlayerV2RenderWorkflow({
  sessionId,
  setRenderExportId,
  setRenderMessage,
  setRenderStatus
}: {
  sessionId: string;
  setRenderExportId: Dispatch<SetStateAction<string | null>>;
  setRenderMessage: Dispatch<SetStateAction<string>>;
  setRenderStatus: Dispatch<SetStateAction<PlayerV2RenderStatus>>;
}) {
  const emit = usePcEditorEventEmitter();

  usePcEditorEventSubscription("editor.render.request", async () => {
    if (!sessionId) {
      setRenderExportId(null);
      setRenderStatus("error");
      setRenderMessage("No timeline session id is available.");
      return;
    }

    setRenderExportId(null);
    setRenderStatus("rendering");
    setRenderMessage("Backend render-test is running...");

    try {
      const { exportId } = await requestPcEditorRender({ sessionId });
      const exportStatus = await waitForExportReady(exportId);

      setRenderExportId(exportId);
      setRenderStatus("done");
      setRenderMessage("Export ready.");
      emit({
        type: "editor.render.completed",
        payload: {
          downloadReady: exportStatus.downloadReady,
          exportId,
          status: exportStatus.status
        },
        source: {
          kind: "workflow",
          id: "player-v2-render-workflow",
          device: "pc"
        }
      });
    } catch (error) {
      setRenderExportId(null);
      setRenderStatus("error");
      setRenderMessage(error instanceof Error ? error.message : "Render failed.");
    }
  });
}
