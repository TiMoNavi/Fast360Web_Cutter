"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { usePcEditorBindingEmitter } from "../bindings";
import { usePcEditorViewTarget } from "../state";
import { usePcEditorUiEventEmitter } from "./usePcEditorUiEventEmitter";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type DiscardRange = {
  endMs: number;
  startMs: number;
};

export type PcWorkbenchPanelState = {
  autoRenderEnabled?: boolean;
  discardActive?: boolean;
  discardLastRange?: DiscardRange | null;
  discardMessage?: string;
  exportDetailUrl?: string | null;
  exportDownloadUrl?: string | null;
  maskLocked?: boolean;
  maskOpacity?: number;
  maskRoll?: number;
  renderExportId?: string | null;
  renderMessage?: string;
  renderStatus?: "idle" | "rendering" | "done" | "error" | string;
};

export function PcWorkbenchPanel({
  discardActive = false,
  discardLastRange = null,
  discardMessage = "Idle. No discard range is active.",
  exportDetailUrl,
  exportDownloadUrl,
  maskLocked,
  maskOpacity: controlledMaskOpacity,
  maskRoll,
  renderExportId,
  renderMessage,
  renderStatus = "idle"
}: PcWorkbenchPanelState = {}) {
  const emitBound = usePcEditorBindingEmitter("pc-workbench-panel", { legacyCommandFallback: false });
  const emit = usePcEditorUiEventEmitter("pc-workbench-panel", { legacyCommandFallback: false });
  const viewTarget = usePcEditorViewTarget();
  const [collapsed, setCollapsed] = useState(false);
  const [maskOpacity, setMaskOpacity] = useState(0.74);
  const [locked, setLocked] = useState(true);
  const discardPointerActiveRef = useRef(false);

  const formatTime = (ms: number) => {
    const safeMs = Math.max(0, Math.floor(ms));
    const totalSeconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (typeof controlledMaskOpacity === "number") {
      setMaskOpacity(controlledMaskOpacity);
    } else if (typeof viewTarget?.maskOpacity === "number") {
      setMaskOpacity(viewTarget.maskOpacity);
    }
  }, [controlledMaskOpacity, viewTarget?.maskOpacity]);

  useEffect(() => {
    if (typeof maskLocked === "boolean") {
      setLocked(maskLocked);
    } else if (typeof viewTarget?.locked === "boolean") {
      setLocked(viewTarget.locked);
    }
  }, [maskLocked, viewTarget?.locked]);

  const setCollapsedAndEmit = (nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed);
    emit({
      event: { type: "ui.panel.workbench.collapse.set", payload: { collapsed: nextCollapsed } },
      fallbackCommand: { collapsed: nextCollapsed, type: "panel.workbench.collapse.set" }
    });
  };

  const setMaskOpacityAndEmit = (opacity: number, durationMs?: number) => {
    setMaskOpacity(opacity);
    emitBound({
      fallbackCommand: { durationMs, opacity, type: "mask.opacity.set" },
      payload: { durationMs, opacity },
      trigger: { kind: "ui", target: "mask-opacity-slider", action: "change" }
    });
  };

  const emitDiscardBegin = () => {
    emitBound({
      trigger: { kind: "ui", target: "discard-button", action: "pointerdown" },
      fallbackEvent: { type: "editor.timeline.discard.begin" }
    });
  };

  const emitDiscardEnd = () => {
    emitBound({
      trigger: { kind: "ui", target: "discard-button", action: "pointerup" },
      fallbackEvent: { type: "editor.timeline.discard.end" }
    });
  };

  const finishDiscardPointer = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    if (!discardPointerActiveRef.current) {
      return;
    }

    discardPointerActiveRef.current = false;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    emitDiscardEnd();
  };

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
          onClick={() => setCollapsedAndEmit(!collapsed)}
          type="button"
        >
          <span className="xr-button-label">{collapsed ? ">" : "<"}</span>
        </button>
      </div>
      <div aria-hidden={collapsed} className="xr-pc-workbench-body">
        <div className="xr-pc-workbench-controls">
          <button
            data-testid="xr-pc-fov-in"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-fov-in", action: "click" },
                fallbackCommand: { delta: -5, type: "mask.fov.step" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">+</span>
            <span className="xr-button-key">Q</span>
          </button>
          <button
            data-testid="xr-pc-fov-out"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-fov-out", action: "click" },
                fallbackCommand: { delta: 5, type: "mask.fov.step" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">-</span>
            <span className="xr-button-key">E</span>
          </button>
          <button
            data-testid="xr-pc-yaw-left"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-yaw-left", action: "click" },
                fallbackCommand: { delta: -5, type: "mask.yaw.step" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Yaw -</span>
            <span className="xr-button-key">A</span>
          </button>
          <button
            data-testid="xr-pc-yaw-right"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-yaw-right", action: "click" },
                fallbackCommand: { delta: 5, type: "mask.yaw.step" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Yaw +</span>
            <span className="xr-button-key">D</span>
          </button>
          <button
            data-testid="xr-pc-pitch-up"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-pitch-up", action: "click" },
                fallbackCommand: { delta: 5, type: "mask.pitch.step" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Pitch +</span>
            <span className="xr-button-key">W</span>
          </button>
          <button
            data-testid="xr-pc-pitch-down"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-pitch-down", action: "click" },
                fallbackCommand: { delta: -5, type: "mask.pitch.step" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Pitch -</span>
            <span className="xr-button-key">S</span>
          </button>
          <button
            data-testid="xr-pc-roll-counterclockwise"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-roll-counterclockwise", action: "click" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Roll -</span>
            <span className="xr-button-key">[</span>
          </button>
          <button
            data-testid="xr-pc-roll-clockwise"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "viewport-roll-clockwise", action: "click" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Roll +</span>
            <span className="xr-button-key">]</span>
          </button>
          <button
            data-testid="xr-pc-flush"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "flush-button", action: "click" },
                fallbackCommand: { type: "timeline.flush" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Flush</span>
            <span className="xr-button-key">F</span>
          </button>
          <button
            data-testid="xr-pc-cut"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "cut-button", action: "click" },
                fallbackCommand: { type: "timeline.cut" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">Cut</span>
            <span className="xr-button-key">UI</span>
          </button>
          <button
            data-testid="xr-pc-lock-toggle"
            onClick={() => {
              const nextLocked = !locked;
              setLocked(nextLocked);
              emitBound({
                trigger: { kind: "ui", target: "viewport-lock-toggle", action: "click" },
                payload: { locked: nextLocked },
                fallbackCommand: { locked: nextLocked, type: "mask.lock.set" }
              });
            }}
            type="button"
          >
            <span className="xr-button-label">{locked ? "Unlock" : "Lock"}</span>
            <span className="xr-button-key">L</span>
          </button>
        </div>
        <section className="xr-pc-mask-menu" data-testid="aframe-crop-mask-controls">
          <h3>Mask</h3>
          <div className="xr-pc-mask-opacity-row">
            <label htmlFor="aframe-crop-mask-opacity">Opacity</label>
            <input
              data-testid="aframe-crop-mask-opacity"
              id="aframe-crop-mask-opacity"
              max="0.95"
              min="0"
              onChange={(event) => setMaskOpacityAndEmit(Number(event.target.value))}
              step="0.01"
              style={{ "--mask-progress": String((maskOpacity / 0.95) * 100) } as StyleWithVars}
              type="range"
              value={maskOpacity}
            />
          </div>
          <div className="xr-pc-workbench-controls">
            <button
              data-testid="aframe-crop-mask-fade-out"
              onClick={() => {
                setMaskOpacity(0);
                emitBound({
                  trigger: { kind: "ui", target: "mask-opacity-clear", action: "click" },
                  fallbackCommand: { durationMs: 700, opacity: 0, type: "mask.opacity.set" }
                });
              }}
              type="button"
            >
              <span className="xr-button-label">Clear</span>
            </button>
            <button
              data-testid="aframe-crop-mask-fade-in"
              onClick={() => {
                setMaskOpacity(0.74);
                emitBound({
                  trigger: { kind: "ui", target: "mask-opacity-deepen", action: "click" },
                  fallbackCommand: { durationMs: 900, opacity: 0.74, type: "mask.opacity.set" }
                });
              }}
              type="button"
            >
              <span className="xr-button-label">Deepen</span>
            </button>
          </div>
        </section>

        <section className="xr-pc-crop-workflow" data-status={renderStatus} data-testid="xr-pc-crop-workflow">
          <h3>Crop workflow</h3>
          <div className="xr-pc-workbench-controls">
            <button
              data-testid="xr-pc-start-crop"
              onClick={() =>
                emitBound({
                  trigger: { kind: "ui", target: "crop-start", action: "click" },
                  fallbackCommand: { type: "crop.start" }
                })
              }
              type="button"
            >
              <span className="xr-button-label">Start crop</span>
              <span className="xr-button-key">record</span>
            </button>
            <button
              data-testid="xr-pc-end-crop"
              onClick={() =>
                emitBound({
                  trigger: { kind: "ui", target: "crop-end", action: "click" },
                  fallbackCommand: { type: "crop.end" }
                })
              }
              type="button"
            >
              <span className="xr-button-label">End crop</span>
              <span className="xr-button-key">seal</span>
            </button>
          </div>
          <p className="xr-pc-crop-status">{renderMessage ?? "Ready to record a crop path."}</p>
          {renderExportId ? (
            <div className="xr-pc-workbench-controls">
              {exportDetailUrl ? (
                <a className="xr-pc-download-link" data-testid="xr-pc-export-detail" href={exportDetailUrl}>
                  <span className="xr-button-label">Export detail</span>
                  <span className="xr-button-key">{renderExportId}</span>
                </a>
              ) : null}
              {exportDownloadUrl ? (
                <a className="xr-pc-download-link" data-testid="xr-pc-export-download" href={exportDownloadUrl}>
                  <span className="xr-button-label">Download MP4</span>
                  <span className="xr-button-key">ready</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="xr-pc-discard-workflow" data-active={discardActive ? "true" : "false"} data-testid="xr-pc-discard-hint">
          <h3>Discard</h3>
          <div className="xr-pc-discard-hold">
            <button
              aria-label="Hold to discard playback"
              className="xr-pc-discard-button"
              data-active={discardActive ? "true" : "false"}
              data-testid="xr-pc-discard-button"
              onContextMenu={(event) => event.preventDefault()}
              onLostPointerCapture={() => {
                if (discardPointerActiveRef.current) {
                  discardPointerActiveRef.current = false;
                  emitDiscardEnd();
                }
              }}
              onPointerCancel={(event) => finishDiscardPointer(event)}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                event.preventDefault();
                discardPointerActiveRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                emitDiscardBegin();
              }}
              onPointerUp={(event) => finishDiscardPointer(event)}
              type="button"
            >
              <span className="xr-button-label">Del</span>
              <span className="xr-button-key">{discardActive ? "Release" : "Hold"}</span>
            </button>
            <span>{discardActive ? "Release to finish discard range" : "Hold while playing to discard this segment"}</span>
          </div>
          <p>{discardMessage}</p>
          {discardLastRange ? (
            <p className="xr-pc-discard-last">
              Last discard {formatTime(discardLastRange.startMs)}-{formatTime(discardLastRange.endMs)}
            </p>
          ) : null}
        </section>

        <dl className="xr-pc-workbench-stats" data-testid="xr-pc-workbench-stats">
          <div>
            <dt>Yaw</dt>
            <dd>{(viewTarget?.center.yaw ?? 0).toFixed(2)} deg</dd>
          </div>
          <div>
            <dt>Pitch</dt>
            <dd>{(viewTarget?.center.pitch ?? 0).toFixed(2)} deg</dd>
          </div>
          <div>
            <dt>FOV</dt>
            <dd>{Math.round(viewTarget?.fov.h ?? 90)} deg</dd>
          </div>
          <div>
            <dt>Roll</dt>
            <dd>{(viewTarget?.roll ?? maskRoll ?? 0).toFixed(2)} deg</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>0</dd>
          </div>
        </dl>
        <pre data-testid="xr-pc-last-patch">null</pre>
        <section data-testid="xr-pc-events-list">
          <h3>Clip events</h3>
          <p>No timeline events in this UI-only panel.</p>
        </section>
      </div>
    </aside>
  );
}
