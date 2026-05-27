"use client";

import { useMemo, useState } from "react";
import { usePcEditorEventSubscription } from "../../events";

type ExportPromptState = {
  exportId: string;
};

function readExportId(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>).exportId;
  return typeof value === "string" && value ? value : null;
}

export function PcExportReadyPrompt({ enabled = true }: { enabled?: boolean }) {
  const [prompt, setPrompt] = useState<ExportPromptState | null>(null);

  usePcEditorEventSubscription("editor.render.completed", (event) => {
    if (!enabled) {
      return;
    }

    const exportId = readExportId(event.payload);

    if (!exportId) {
      return;
    }

    setPrompt({ exportId });
  });

  const detailUrl = useMemo(
    () => (prompt ? `/mobile/exports/${encodeURIComponent(prompt.exportId)}` : "#"),
    [prompt]
  );

  if (!prompt) {
    return null;
  }

  return (
    <div className="xr-pc-export-prompt" data-testid="xr-pc-export-prompt" role="dialog" aria-modal="true" aria-labelledby="xr-pc-export-prompt-title">
      <div className="xr-pc-export-prompt-panel">
        <p className="xr-pc-workbench-kicker">Export ready</p>
        <h2 id="xr-pc-export-prompt-title">View export result?</h2>
        <p>{prompt.exportId}</p>
        <div className="xr-pc-export-prompt-actions">
          <a className="xr-pc-download-link" data-testid="xr-pc-export-prompt-view" href={detailUrl}>
            <span className="xr-button-label">View</span>
            <span className="xr-button-key">exports</span>
          </a>
          <button className="xr-pc-download-link" data-testid="xr-pc-export-prompt-dismiss" onClick={() => setPrompt(null)} type="button">
            <span className="xr-button-label">Later</span>
            <span className="xr-button-key">stay here</span>
          </button>
        </div>
      </div>
    </div>
  );
}
