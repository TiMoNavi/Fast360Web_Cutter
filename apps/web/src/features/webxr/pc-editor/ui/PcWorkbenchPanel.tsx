"use client";

import { useState, type CSSProperties } from "react";
import type { CropMaskState } from "../webxr/AFrameCropViewportMask";
import type { TimelineBridgeStatus } from "../data/timeline-bridge";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type PcWorkbenchPanelProps = {
  autoRenderEnabled: boolean;
  cropMaskState: CropMaskState;
  discardActive: boolean;
  discardLastRange: { endMs: number; startMs: number } | null;
  discardMessage: string;
  cropWorkflowMessage: string;
  cropWorkflowStatus: "idle" | "recording" | "ending" | "ready" | "rendering" | "done" | "error";
  exportDownloadUrl: string | null;
  isRenderDisabled?: boolean;
  onAutoRenderToggle: (enabled: boolean) => void;
  onCut: () => void;
  onEndCrop: () => void;
  onFlush: () => void;
  onFovIn: () => void;
  onFovOut: () => void;
  onLockToggle: () => void;
  onMaskOpacity: (opacity: number, durationMs?: number) => void;
  onPitchDown: () => void;
  onRenderCrop: () => void;
  onStartCrop: () => void;
  onPitchUp: () => void;
  onYawLeft: () => void;
  onYawRight: () => void;
  timelineStatus: TimelineBridgeStatus | null;
};

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PcWorkbenchPanel({
  autoRenderEnabled,
  cropMaskState,
  discardActive,
  discardLastRange,
  discardMessage,
  cropWorkflowMessage,
  cropWorkflowStatus,
  exportDownloadUrl,
  isRenderDisabled = false,
  onAutoRenderToggle,
  onCut,
  onEndCrop,
  onFlush,
  onFovIn,
  onFovOut,
  onLockToggle,
  onMaskOpacity,
  onPitchDown,
  onRenderCrop,
  onStartCrop,
  onPitchUp,
  onYawLeft,
  onYawRight,
  timelineStatus
}: PcWorkbenchPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={collapsed ? "xr-pc-workbench collapsed" : "xr-pc-workbench"} data-testid="xr-pc-workbench">
      <div className="xr-pc-workbench-header">
        <div>
          <div className="xr-pc-workbench-chrome" aria-hidden="true">
            <span className="dot-magenta" />
            <span className="dot-cyan" />
            <span className="dot-orange" />
          </div>
          <p className="xr-pc-workbench-kicker">PC framing</p>
          <h2>Session Workbench</h2>
        </div>
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand edit sidebar" : "Collapse edit sidebar"}
          className="xr-pc-sidebar-toggle"
          data-testid="xr-pc-sidebar-toggle"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          <span className="xr-button-label">{collapsed ? ">" : "<"}</span>
        </button>
      </div>
      <div aria-hidden={collapsed} className="xr-pc-workbench-body">
        <div className="xr-pc-workbench-controls">
          <button data-testid="xr-pc-fov-in" onClick={onFovIn} type="button">
            <span className="xr-button-label">+</span>
            <span className="xr-button-key">Q</span>
          </button>
          <button data-testid="xr-pc-fov-out" onClick={onFovOut} type="button">
            <span className="xr-button-label">-</span>
            <span className="xr-button-key">E</span>
          </button>
          <button data-testid="xr-pc-yaw-left" onClick={onYawLeft} type="button">
            <span className="xr-button-label">Yaw -</span>
            <span className="xr-button-key">A</span>
          </button>
          <button data-testid="xr-pc-yaw-right" onClick={onYawRight} type="button">
            <span className="xr-button-label">Yaw +</span>
            <span className="xr-button-key">D</span>
          </button>
          <button data-testid="xr-pc-pitch-up" onClick={onPitchUp} type="button">
            <span className="xr-button-label">Pitch +</span>
            <span className="xr-button-key">W</span>
          </button>
          <button data-testid="xr-pc-pitch-down" onClick={onPitchDown} type="button">
            <span className="xr-button-label">Pitch -</span>
            <span className="xr-button-key">S</span>
          </button>
          <button data-testid="xr-pc-flush" onClick={onFlush} type="button">
            <span className="xr-button-label">Flush</span>
            <span className="xr-button-key">F</span>
          </button>
          <button data-testid="xr-pc-cut" onClick={onCut} type="button">
            <span className="xr-button-label">Cut</span>
            <span className="xr-button-key">C</span>
          </button>
          <button data-testid="xr-pc-lock-toggle" onClick={onLockToggle} type="button">
            <span className="xr-button-label">{cropMaskState.locked ? "Unlock" : "Lock"}</span>
            <span className="xr-button-key">L</span>
          </button>
        </div>
        <section className="xr-pc-mask-menu" data-testid="aframe-crop-mask-controls">
          <h3>Mask</h3>
          <div className="xr-pc-mask-opacity-row">
            <label htmlFor="aframe-crop-mask-opacity">Opacity</label>
            <input
              id="aframe-crop-mask-opacity"
              data-testid="aframe-crop-mask-opacity"
              max="0.95"
              min="0"
              onChange={(event) => onMaskOpacity(Number(event.currentTarget.value))}
              step="0.01"
              style={{ "--mask-progress": String((cropMaskState.maskOpacity / 0.95) * 100) } as StyleWithVars}
              type="range"
              value={cropMaskState.maskOpacity}
            />
          </div>
          <div className="xr-pc-workbench-controls">
            <button data-testid="aframe-crop-mask-fade-out" onClick={() => onMaskOpacity(0, 700)} type="button">
              <span className="xr-button-label">Clear</span>
            </button>
            <button data-testid="aframe-crop-mask-fade-in" onClick={() => onMaskOpacity(0.74, 900)} type="button">
              <span className="xr-button-label">Deepen</span>
            </button>
          </div>
        </section>
        <section className="xr-pc-crop-workflow" data-status={cropWorkflowStatus}>
          <h3>Crop workflow</h3>
          <div className="xr-pc-workbench-controls">
            <button data-testid="xr-pc-start-crop" disabled={cropWorkflowStatus === "rendering" || cropWorkflowStatus === "ending"} onClick={onStartCrop} type="button">
              <span className="xr-button-label">Start crop</span>
              <span className="xr-button-key">record</span>
            </button>
            <button data-testid="xr-pc-end-crop" disabled={cropWorkflowStatus === "rendering" || cropWorkflowStatus === "ending"} onClick={onEndCrop} type="button">
              <span className="xr-button-label">End crop</span>
              <span className="xr-button-key">seal</span>
            </button>
            <label className="xr-auto-render-toggle">
              <input
                checked={autoRenderEnabled}
                onChange={(e) => onAutoRenderToggle(e.target.checked)}
                type="checkbox"
              />
              <span>Auto-render</span>
            </label>
            <button data-testid="xr-pc-render" disabled={isRenderDisabled || cropWorkflowStatus === "rendering" || cropWorkflowStatus === "ending"} onClick={onRenderCrop} type="button">
              <span className="xr-button-label">{cropWorkflowStatus === "rendering" ? "Rendering" : "Render"}</span>
              <span className="xr-button-key">export</span>
            </button>
            {exportDownloadUrl ? (
              <a className="xr-pc-download-link" data-testid="xr-pc-export-download" href={exportDownloadUrl}>
                Download
              </a>
            ) : null}
          </div>
          <p data-testid="xr-pc-render-status">{cropWorkflowMessage}</p>
        </section>
        <section className="xr-pc-discard-workflow" data-active={discardActive} data-testid="xr-pc-discard-hint">
          <h3>Discard</h3>
          <div className="xr-pc-discard-hold">
            <span className="xr-pc-discard-key">Del</span>
            <span>{discardActive ? "Release to finish discard range" : "Hold while playing to discard this segment"}</span>
          </div>
          <p>{discardMessage}</p>
          {discardLastRange ? (
            <p className="xr-pc-discard-last">
              Last discard {formatTime(discardLastRange.startMs)}-{formatTime(discardLastRange.endMs)}
            </p>
          ) : null}
        </section>
        <dl className="xr-pc-workbench-stats" data-testid="xr-pc-bridge-status">
          <div>
            <dt>Yaw</dt>
            <dd>{cropMaskState.center.yaw.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Pitch</dt>
            <dd>{cropMaskState.center.pitch.toFixed(2)}</dd>
          </div>
          <div>
            <dt>FOV</dt>
            <dd>{cropMaskState.fov.h.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{timelineStatus?.lastPatchRevision ?? 0}</dd>
          </div>
        </dl>
        <pre data-testid="xr-pc-last-patch">
          {JSON.stringify(timelineStatus?.lastAcceptedPathPatch ?? null)}
        </pre>
        <section data-testid="xr-pc-events-list">
          <h3>Clip events</h3>
          <p>No timeline events in this PC integration pass.</p>
        </section>
      </div>
    </aside>
  );
}
