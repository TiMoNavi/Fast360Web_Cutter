"use client";

import type { RefObject } from "react";
import type { AFrame360VideoPlayerHandle } from "../../Aframe/360video_player";
import { usePcEditorEventSubscription } from "../../events";
import { PC_EDITOR_RATE_DEFAULT, clampRate } from "../../controls/operations/rateCurve";

function readNumberPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function usePlayerPlaybackWorkflow({
  playerRef
}: {
  playerRef: RefObject<AFrame360VideoPlayerHandle | null>;
}) {
  usePcEditorEventSubscription("player.playback.play", () => {
    void playerRef.current?.play();
  });

  usePcEditorEventSubscription("player.playback.pause", () => {
    playerRef.current?.pause();
  });

  usePcEditorEventSubscription("player.playback.toggle", () => {
    void playerRef.current?.togglePlay();
  });

  usePcEditorEventSubscription("player.playback.seek", (event) => {
    const timeMs = readNumberPayload(event.payload, "timeMs");

    if (timeMs === null) {
      return;
    }

    playerRef.current?.seekTo(timeMs);
  });

  usePcEditorEventSubscription("player.playback.rate.set", (event) => {
    const playbackRate = readNumberPayload(event.payload, "playbackRate");

    if (playbackRate === null) {
      return;
    }

    playerRef.current?.setPlaybackRate(clampRate(playbackRate));
  });

  usePcEditorEventSubscription("player.playback.rate.reset", () => {
    playerRef.current?.setPlaybackRate(PC_EDITOR_RATE_DEFAULT);
  });
}
