"use client";

import styles from "../../PlayerV3.module.css";

type PlayerControlsProps = {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  onTogglePlay: () => void;
  onSeek: (timeMs: number) => void;
  onTogglePlaylist: () => void;
};

export function PlayerControls({
  isPlaying,
  currentTimeMs,
  durationMs,
  onTogglePlay,
  onSeek,
  onTogglePlaylist
}: PlayerControlsProps) {
  return (
    <div className={styles.playerControls}>
      <div className={styles.playerControlsProgress}>
        <input
          aria-label="Progress"
          max={Math.max(durationMs, 1)}
          min="0"
          onChange={(event) => onSeek(Number(event.target.value))}
          type="range"
          value={currentTimeMs}
        />
      </div>
      <div className={styles.playerControlsButtons}>
        <button type="button" onClick={onTogglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onTogglePlaylist}>
          Playlist
        </button>
      </div>
    </div>
  );
}
