"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { usePcEditorBindingEmitter } from "../bindings";
import { usePcEditorPlaybackState, usePcEditorRateState } from "../state";
import { formatRate } from "../controls/operations/rateCurve";
import { usePcEditorUiEventEmitter } from "./usePcEditorUiEventEmitter";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

export type PcPlayerControlsState = {
  currentTimeMs?: number;
  durationMs?: number;
  isPlaying?: boolean;
  mediaKind?: string;
  playlistOpen?: boolean;
  recordingActive?: boolean;
  recordingPaused?: boolean;
  effectSpeedLabel?: string;
  recordingRateLabel?: string;
  playbackRateLabel?: string;
  status?: string;
  subtitle?: string;
  title?: string;
};

type PcPlayerControlsProps = PcPlayerControlsState & {
  state?: PcPlayerControlsState;
};

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function resolveState(props: PcPlayerControlsProps): Required<PcPlayerControlsState> {
  const merged = {
    ...props,
    ...props.state
  };

  return {
    currentTimeMs: merged.currentTimeMs ?? 0,
    durationMs: merged.durationMs ?? 0,
    effectSpeedLabel: merged.effectSpeedLabel ?? "1.00",
    isPlaying: merged.isPlaying ?? false,
    mediaKind: merged.mediaKind ?? "MP4",
    playbackRateLabel: merged.playbackRateLabel ?? "1.00",
    playlistOpen: merged.playlistOpen ?? false,
    recordingActive: merged.recordingActive ?? false,
    recordingPaused: merged.recordingPaused ?? false,
    recordingRateLabel: merged.recordingRateLabel ?? "1.00",
    status: merged.status ?? (merged.isPlaying ? "playing" : "paused"),
    subtitle: merged.subtitle ?? "360 source / play 1.00x / rec 1.00x",
    title: merged.title ?? "Session source"
  };
}

export function PcPlayerControls(props: PcPlayerControlsProps) {
  const emitBound = usePcEditorBindingEmitter("pc-player-controls", { legacyCommandFallback: false });
  const emit = usePcEditorUiEventEmitter("pc-player-controls", { legacyCommandFallback: false });
  const playback = usePcEditorPlaybackState();
  const rates = usePcEditorRateState();
  const view = resolveState({
    ...props,
    state: {
      ...props.state,
      effectSpeedLabel: formatRate(rates.effectSpeed),
      recordingRateLabel: formatRate(rates.recordingRate),
      ...(playback
        ? {
            currentTimeMs: playback.currentTimeMs,
            durationMs: playback.durationMs,
            isPlaying: playback.isPlaying,
            playbackRateLabel: typeof playback.playbackRate === "number" ? playback.playbackRate.toFixed(2) : props.state?.playbackRateLabel,
            status: playback.status
          }
        : {})
    }
  });
  const [draftSeekMs, setDraftSeekMs] = useState<number | null>(null);
  const currentTimeMs = draftSeekMs ?? view.currentTimeMs;
  const durationMs = Math.max(view.durationMs, 1);
  const progressPercent = Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100));

  useEffect(() => {
    setDraftSeekMs(null);
  }, [view.currentTimeMs]);

  const seekTo = (timeMs: number) => {
    setDraftSeekMs(timeMs);
    emitBound({
      trigger: { kind: "ui", target: "player-progress", action: "change" },
      fallbackCommand: { timeMs, type: "player.seekTo" },
      payload: { timeMs }
    });
  };

  return (
    <>
      <div className="player-ui-status-strip xr-session-player-ui-status" data-testid="xr-session-player-ui-status" aria-live="polite">
        <span className="player-ui-status-prompt">&gt;</span>
        <span>WEBXR SESSION</span>
        <span>{view.status}</span>
        <span>{view.mediaKind.toUpperCase()}</span>
      </div>
      <section className="player-ui-control-bar xr-session-player-ui" data-testid="xr-session-player-ui" aria-label="Player controls">
        <div className="player-ui-control-glow" aria-hidden="true" />
        <div className="player-ui-control-chrome" aria-hidden="true">
          <span className="player-ui-window-dot dot-magenta" />
          <span className="player-ui-window-dot dot-cyan" />
          <span className="player-ui-window-dot dot-orange" />
          <span className="player-ui-control-label">PLAYBACK_CORE // 2088</span>
        </div>
        <div className="player-ui-progress-row">
          <span>{formatTime(currentTimeMs)}</span>
          <input
            aria-label="Playback progress"
            data-testid="xr-session-player-progress"
            max={durationMs}
            min="0"
            onChange={(event) => seekTo(Number(event.currentTarget.value))}
            style={{ "--player-progress": `${progressPercent}%` } as StyleWithVars}
            type="range"
            value={currentTimeMs}
          />
          <span>{formatTime(view.durationMs)}</span>
        </div>
        <div className="player-ui-main-controls">
          <button
            aria-label="Previous video"
            className="player-ui-icon-button"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "player-previous", action: "click" },
                fallbackCommand: { type: "player.previous" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">{"\u23EE"}</span>
          </button>
          <button
            aria-label={view.isPlaying ? "Pause video" : "Play video"}
            className="player-ui-primary-button player-ui-icon-button"
            data-testid="xr-session-play-toggle"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "player-play-toggle", action: "click" },
                fallbackCommand: { type: "player.playPause.toggle" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">{view.isPlaying ? "\u23F8" : "\u25B6"}</span>
            <span className="xr-button-key">Space</span>
          </button>
          <button
            aria-label="Next video"
            className="player-ui-icon-button"
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "player-next", action: "click" },
                fallbackCommand: { type: "player.next" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">{"\u23ED"}</span>
          </button>
          <div className="player-ui-title-block">
            <strong>{view.title}</strong>
            <span>{view.subtitle}</span>
          </div>
          <button
            className={view.recordingActive ? "player-ui-record-button active" : "player-ui-record-button"}
            data-testid="xr-session-recording-toggle"
            onClick={() =>
              emitBound({
                trigger: {
                  kind: "ui",
                  target: view.recordingActive ? "player-record-end" : "player-record-start",
                  action: "click"
                },
                fallbackCommand: { type: view.recordingActive ? "crop.end" : "crop.start" }
              })
            }
            type="button"
            aria-label={view.recordingActive ? "End recording" : "Start recording"}
          >
            <span className="xr-button-label">{view.recordingActive ? "End record" : "Start record"}</span>
            <span className="xr-button-key">{view.recordingActive && view.recordingPaused ? "Paused" : "Record"}</span>
          </button>
          <button
            className="player-ui-rate-button"
            data-testid="xr-session-playback-rate"
            onClick={() => emit({ event: { type: "player.playback.rate.reset" }, fallbackCommand: { type: "player.playbackRate.reset" } })}
            type="button"
          >
            <span className="xr-button-label">Play {view.playbackRateLabel}x</span>
            <span className="xr-button-key">Hold Z + wheel</span>
          </button>
          <button
            className="player-ui-rate-button"
            data-testid="xr-session-recording-rate"
            onClick={() => emit({ event: { type: "player.recording.rate.reset" }, fallbackCommand: { type: "player.recordingRate.reset" } })}
            type="button"
          >
            <span className="xr-button-label">Record {view.recordingRateLabel}x</span>
            <span className="xr-button-key">Hold X + wheel</span>
          </button>
          <button
            className="player-ui-rate-button"
            data-testid="xr-session-effect-speed"
            onClick={() => emit({ event: { type: "editor.effects.speed.reset" } })}
            type="button"
          >
            <span className="xr-button-label">FX {view.effectSpeedLabel}x</span>
            <span className="xr-button-key">Hold C + wheel</span>
          </button>
          <button
            aria-label="Player options"
            className="player-ui-icon-button"
            onClick={() => emit({ event: { type: "ui.overlay.close" }, fallbackCommand: { type: "overlays.close" } })}
            type="button"
          >
            <span className="xr-button-label">{"\u2699"}</span>
          </button>
          <button
            aria-label="Toggle playlist"
            className={view.playlistOpen ? "active player-ui-icon-button" : "player-ui-icon-button"}
            onClick={() =>
              emitBound({
                trigger: { kind: "ui", target: "playlist-toggle", action: "click" },
                fallbackCommand: { type: "playlist.toggle" }
              })
            }
            type="button"
          >
            <span className="xr-button-label">{"\u2630"}</span>
            <span className="xr-button-key">P</span>
          </button>
        </div>
      </section>
    </>
  );
}
