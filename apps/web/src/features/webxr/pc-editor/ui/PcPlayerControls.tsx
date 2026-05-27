"use client";

import type { CSSProperties } from "react";
import type { AFrame360PlaybackState, AFrame360VideoSource } from "../controls/types";
import type { PcRateWheelTarget } from "../controls/operations/rateCurve";
import { formatRate } from "../controls/operations/rateCurve";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type PcPlayerControlsProps = {
  domPlaylistOpen: boolean;
  effectSpeed: number;
  onCloseOverlays: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onResetPlaybackRate: () => void;
  onResetEffectSpeed: () => void;
  onResetRecordingRate: () => void;
  onSeekTo: (timeMs: number) => void;
  onSelectSource: (source: AFrame360VideoSource) => void;
  onTogglePlay: () => void;
  onTogglePlaylist: () => void;
  onToggleRecording: () => void;
  playbackState: AFrame360PlaybackState;
  progressPercent: number;
  rateWheelTarget: PcRateWheelTarget;
  recordingRate: number;
  recordingToggleDisabled?: boolean;
  recordingTogglePaused?: boolean;
  recordingToggleActive: boolean;
  singleSourceTitle: string;
};

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PcPlayerControls({
  domPlaylistOpen,
  effectSpeed,
  onCloseOverlays,
  onNext,
  onPrevious,
  onResetPlaybackRate,
  onResetEffectSpeed,
  onResetRecordingRate,
  onSeekTo,
  onSelectSource,
  onTogglePlay,
  onTogglePlaylist,
  onToggleRecording,
  playbackState,
  progressPercent,
  rateWheelTarget,
  recordingRate,
  recordingToggleActive,
  recordingToggleDisabled = false,
  recordingTogglePaused = false,
  singleSourceTitle
}: PcPlayerControlsProps) {
  return (
    <>
      <div className="player-ui-status-strip xr-session-player-ui-status" data-testid="xr-session-player-ui-status" aria-live="polite">
        <span className="player-ui-status-prompt">&gt;</span>
        <span>WEBXR SESSION</span>
        <span>{playbackState.status}</span>
        <span>{playbackState.currentSource?.kind.toUpperCase() ?? "MP4"}</span>
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
          <span>{formatTime(playbackState.currentTimeMs)}</span>
          <input
            aria-label="Playback progress"
            data-testid="xr-session-player-progress"
            max={Math.max(playbackState.durationMs, 1)}
            min="0"
            onChange={(event) => onSeekTo(Number(event.currentTarget.value))}
            style={{ "--player-progress": `${progressPercent}%` } as StyleWithVars}
            type="range"
            value={playbackState.currentTimeMs}
          />
          <span>{formatTime(playbackState.durationMs)}</span>
        </div>
        <div className="player-ui-main-controls">
          <button className="player-ui-icon-button" type="button" onClick={onPrevious} aria-label="Previous video">
            <span className="xr-button-label">{"\u23EE"}</span>
          </button>
          <button
            className="player-ui-primary-button player-ui-icon-button"
            type="button"
            onClick={onTogglePlay}
            aria-label={playbackState.isPlaying ? "Pause video" : "Play video"}
          >
            <span className="xr-button-label">{playbackState.isPlaying ? "\u23F8" : "\u25B6"}</span>
            <span className="xr-button-key">Space</span>
          </button>
          <button className="player-ui-icon-button" type="button" onClick={onNext} aria-label="Next video">
            <span className="xr-button-label">{"\u23ED"}</span>
          </button>
          <div className="player-ui-title-block">
            <strong>{playbackState.currentSource?.title ?? singleSourceTitle}</strong>
            <span>
              {playbackState.currentSource?.resolution ?? "360 source"} / play {formatRate(playbackState.playbackRate)}x / rec {formatRate(recordingRate)}x
            </span>
          </div>
          <button
            className={recordingToggleActive ? "player-ui-record-button active" : "player-ui-record-button"}
            data-testid="xr-session-recording-toggle"
            disabled={recordingToggleDisabled}
            type="button"
            onClick={onToggleRecording}
            aria-label={recordingToggleActive ? "End recording" : "Start recording"}
          >
            <span className="xr-button-label">{recordingToggleActive ? "结束录制" : "开始录制"}</span>
            <span className="xr-button-key">{recordingToggleActive && recordingTogglePaused ? "Paused" : "Record"}</span>
          </button>
          <button
            className={rateWheelTarget === "playback" ? "player-ui-rate-button active" : "player-ui-rate-button"}
            data-testid="xr-session-playback-rate"
            type="button"
            onClick={onResetPlaybackRate}
          >
            <span className="xr-button-label">Play {formatRate(playbackState.playbackRate)}x</span>
            <span className="xr-button-key">Hold Z + wheel</span>
          </button>
          <button
            className={rateWheelTarget === "recording" ? "player-ui-rate-button active" : "player-ui-rate-button"}
            data-testid="xr-session-recording-rate"
            type="button"
            onClick={onResetRecordingRate}
          >
            <span className="xr-button-label">Record {formatRate(recordingRate)}x</span>
            <span className="xr-button-key">Hold X + wheel</span>
          </button>
          <button
            className={rateWheelTarget === "effect-speed" ? "player-ui-rate-button active" : "player-ui-rate-button"}
            data-testid="xr-session-effect-speed"
            type="button"
            onClick={onResetEffectSpeed}
          >
            <span className="xr-button-label">FX {formatRate(effectSpeed)}x</span>
            <span className="xr-button-key">Hold C + wheel</span>
          </button>
          <button className="player-ui-icon-button" type="button" onClick={onCloseOverlays} aria-label="Player options">
            <span className="xr-button-label">{"\u2699"}</span>
          </button>
          <button
            className={domPlaylistOpen ? "active player-ui-icon-button" : "player-ui-icon-button"}
            type="button"
            onClick={onTogglePlaylist}
            aria-label="Toggle playlist"
          >
            <span className="xr-button-label">{"\u2630"}</span>
            <span className="xr-button-key">P</span>
          </button>
        </div>
      </section>
      <aside
        className={domPlaylistOpen ? "player-ui-playlist xr-session-player-playlist open" : "player-ui-playlist xr-session-player-playlist"}
        data-testid="xr-session-player-playlist"
      >
        <div className="player-ui-playlist-shine" aria-hidden="true" />
        <div className="player-ui-playlist-head">
          <span>&gt; MEDIA LIST</span>
          <button type="button" onClick={onCloseOverlays} aria-label="Close playlist">
            {"\u00D7"}
          </button>
        </div>
        <div className="player-ui-playlist-scroll">
          {playbackState.sources.map((source) => (
            <button
              className={source.id === playbackState.selectedSourceId ? "player-ui-playlist-item active" : "player-ui-playlist-item"}
              key={source.id}
              type="button"
              onClick={() => onSelectSource(source)}
            >
              <span
                className="player-ui-thumb"
                style={{ "--thumb-accent": source.id === playbackState.selectedSourceId ? "#00ffff" : "#ff00ff" } as StyleWithVars}
              >
                {source.thumbnailUrl ? <img alt="" src={source.thumbnailUrl} /> : null}
                <span>{source.kind.toUpperCase()}</span>
              </span>
              <span className="player-ui-playlist-copy">
                <strong>{source.title}</strong>
                <span>
                  {formatTime(source.durationMs ?? 0)} / {source.resolution ?? "360"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
