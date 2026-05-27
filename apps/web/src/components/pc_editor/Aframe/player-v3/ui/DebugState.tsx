"use client";

import type { MutableRefObject } from "react";
import styles from "./DebugState.module.css";

type PcViewCenter = {
  pitch: number;
  yaw: number;
};

type CropMaskState = {
  aspect: string;
  center: {
    yaw: number;
    pitch: number;
  };
  cut: boolean;
  enabled: boolean;
  fov: {
    h: number;
    v: number;
  };
  input: "head_gaze" | "keyboard";
  locked: boolean;
  maskOpacity: number;
  roll: number;
  smoothFollow: boolean;
};

type PlaybackState = {
  currentSourceId: string | null;
  currentSourceKind: string | null;
  fov: number;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  status: string;
};

type DebugStateProps = {
  cameraLookRef?: MutableRefObject<PcViewCenter>;
  cropMaskState?: CropMaskState;
  edgePanActive?: boolean;
  maskDragArmed?: boolean;
  playbackState?: PlaybackState;
  xrStatus?: string;
};

export function DebugState({
  cameraLookRef,
  cropMaskState,
  edgePanActive,
  maskDragArmed,
  playbackState,
  xrStatus
}: DebugStateProps) {
  return (
    <div className={styles.root}>
      <span className={styles.state} data-testid="player-v2-playback-state">
        {JSON.stringify({
          currentSourceId: playbackState?.currentSourceId ?? null,
          currentSourceKind: playbackState?.currentSourceKind ?? null,
          camera: cameraLookRef?.current ?? null,
          edgePanActive: edgePanActive ?? false,
          fov: playbackState?.fov ?? 90,
          maskDragArmed: maskDragArmed ?? false,
          isPlaying: playbackState?.isPlaying ?? false,
          currentTimeMs: playbackState?.currentTimeMs ?? 0,
          durationMs: playbackState?.durationMs ?? 0,
          status: playbackState?.status ?? "idle",
          xrStatus: xrStatus ?? "unknown"
        })}
      </span>
      {cropMaskState && (
        <span className={styles.state} data-testid="player-v2-crop-mask-state">
          {JSON.stringify(cropMaskState)}
        </span>
      )}
    </div>
  );
}
