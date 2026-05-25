"use client";

import type { AFrame360VideoSource } from "@/features/webxr/pc-editor/controls/types";
import type { ThreeOfficialCropWorkflowStatus } from "./format";
import { cropWorkflowLabel, formatClock } from "./format";

type ThreeOfficialPlayerPanelProps = {
  cropWorkflowStatus: ThreeOfficialCropWorkflowStatus;
  currentTimeMs: number;
  currentVideoSource: AFrame360VideoSource;
  durationMs: number;
  playbackButtonText: string;
  playbackRate: number;
  playbackStatus: string;
  playerUiVisible: boolean;
  recordingRate: number;
  seekPercent: number;
  videoIndex: number;
  videoSources: AFrame360VideoSource[];
};

export function ThreeOfficialPlayerPanel({
  cropWorkflowStatus,
  currentTimeMs,
  currentVideoSource,
  durationMs,
  playbackButtonText,
  playbackRate,
  playbackStatus,
  playerUiVisible,
  recordingRate,
  seekPercent,
  videoIndex,
  videoSources
}: ThreeOfficialPlayerPanelProps) {
  return (
    <>
      <div className="three-official-player-chrome">
        <span className="three-official-player-dot magenta" />
        <span className="three-official-player-dot cyan" />
        <span className="three-official-player-dot orange" />
        <strong>PLAYBACK CORE</strong>
        <span data-testid="three-official-player-status-strip">{playbackStatus.toUpperCase()}</span>
      </div>
      <section className="three-official-player-progress">
        <div className="three-official-player-timecode">
          <span>{formatClock(currentTimeMs)}</span>
          <h2>{currentVideoSource.title}</h2>
          <span>{formatClock(durationMs)}</span>
        </div>
        <input
          aria-label="Playback progress"
          data-player-control="seek"
          data-testid="three-official-player-progress"
          max="100"
          min="0"
          readOnly
          type="range"
          value={seekPercent}
        />
      </section>
      <div className="three-official-player-main-row">
        <section className="three-official-player-transport">
          <button data-player-action="PREV" type="button">
            <span>PREV</span>
          </button>
          <button className="primary" data-player-action="PLAY_TOGGLE" type="button">
            <strong>{playbackButtonText}</strong>
            <span>both select</span>
          </button>
          <button data-player-action="NEXT" type="button">
            <span>NEXT</span>
          </button>
        </section>
        <section className="three-official-player-now">
          <span>
            {currentVideoSource.resolution ?? "360 VIDEO"} / {currentVideoSource.kind.toUpperCase()} / play {playbackRate}x / rec {recordingRate}x
          </span>
          <select
            aria-label="Playback playlist"
            data-player-control="source-select"
            data-testid="three-official-player-playlist-select"
            onChange={() => undefined}
            value={currentVideoSource.id}
          >
            {videoSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title}
              </option>
            ))}
          </select>
        </section>
        <section className="three-official-player-edit-row">
          <button
            className={cropWorkflowStatus === "recording" ? "active record" : "record"}
            data-player-action="RECORD_TOGGLE"
            type="button"
          >
            <strong>{cropWorkflowStatus === "recording" ? "END REC" : "START REC"}</strong>
            <span>{cropWorkflowLabel(cropWorkflowStatus)}</span>
          </button>
          <button className={playbackRate === 0.5 ? "active" : ""} data-player-action="RATE_0_5" type="button">
            0.5x
          </button>
          <button className={playbackRate === 1 ? "active" : ""} data-player-action="RATE_1" type="button">
            1x
          </button>
          <button className={playbackRate === 2 ? "active" : ""} data-player-action="RATE_2" type="button">
            2x
          </button>
          <button data-player-action="RECORD_RATE_DOWN" type="button">
            Rec -
          </button>
          <button data-player-action="RECORD_RATE_RESET" type="button">
            Rec {recordingRate}x
          </button>
          <button data-player-action="RECORD_RATE_UP" type="button">
            Rec +
          </button>
        </section>
        <section className="three-official-player-list">
          {videoSources.slice(0, 2).map((source, index) => (
            <button
              className={index === videoIndex ? "active" : ""}
              data-player-action="SELECT_SOURCE"
              data-source-index={index}
              key={source.id}
              type="button"
            >
              <strong>
                {index + 1}. {source.title}
              </strong>
              <span>
                {formatClock(source.durationMs ?? 0)} / {source.resolution ?? "360"}
              </span>
            </button>
          ))}
        </section>
        <button className="three-official-player-hide" data-player-action="TOGGLE_UI" type="button">
          {playerUiVisible ? "DIM" : "RESTORE"}
        </button>
      </div>
    </>
  );
}
