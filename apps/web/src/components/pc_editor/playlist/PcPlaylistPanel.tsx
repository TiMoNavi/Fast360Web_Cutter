"use client";

import type { CSSProperties } from "react";
import { usePcEditorBindingEmitter } from "../bindings";
import type { AFrame360VideoSource } from "../controls/types";
import styles from "./PcPlaylistPanel.module.css";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

export type PcPlaylistPanelProps = {
  activeSourceId: string;
  message?: string;
  open: boolean;
  sources: AFrame360VideoSource[];
  status?: string;
};

function formatDuration(ms?: number) {
  if (!ms || ms <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PcPlaylistPanel({
  activeSourceId,
  message,
  open,
  sources,
  status
}: PcPlaylistPanelProps) {
  const emitBound = usePcEditorBindingEmitter("pc-playlist-panel", { legacyCommandFallback: false });

  return (
    <aside
      aria-hidden={!open}
      aria-label="Video playlist"
      className={open ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
      data-testid="xr-session-player-playlist"
    >
      <div className={styles.shine} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span>&gt; Media list</span>
          <small>{sources.length} sources</small>
        </div>
        <button
          aria-label="Close playlist"
          className={styles.closeButton}
          onClick={() =>
            emitBound({
              trigger: { kind: "ui", target: "playlist-close", action: "click" },
              fallbackEvent: { type: "player.playlist.close" }
            })
          }
          type="button"
        >
          {"\u00D7"}
        </button>
      </header>
      <div className={styles.status} data-status={status ?? "ready"}>
        {message ?? "Select a 360 source."}
      </div>
      <div className={styles.list}>
        {sources.map((source) => {
          const active = source.id === activeSourceId;

          return (
            <button
              aria-current={active ? "true" : undefined}
              className={active ? `${styles.item} ${styles.itemActive}` : styles.item}
              data-testid={`xr-session-playlist-source-${source.id}`}
              disabled={active}
              key={source.id}
              onClick={() =>
                emitBound({
                  trigger: { kind: "ui", target: "playlist-source-select", action: "click" },
                  fallbackEvent: { type: "player.source.select" },
                  payload: { sourceId: source.id },
                  sourceId: `pc-playlist-panel:${source.id}`
                })
              }
              type="button"
            >
              <span
                className={styles.thumb}
                style={{ "--thumb-accent": active ? "#00ffff" : "#ff00ff" } as StyleWithVars}
              >
                {source.thumbnailUrl ? <img alt="" src={source.thumbnailUrl} /> : null}
                <span className={styles.kind}>{source.kind.toUpperCase()}</span>
              </span>
              <span className={styles.copy}>
                <strong>{source.title}</strong>
                <span>
                  {formatDuration(source.durationMs)} / {source.resolution ?? "360"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
