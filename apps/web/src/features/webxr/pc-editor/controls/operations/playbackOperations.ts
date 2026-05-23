import type { Dispatch, SetStateAction } from "react";
import type { AFrame360PlaybackState, AFrame360VideoCommand, AFrame360VideoCommandPayload } from "../types";
import { clampRate, PC_EDITOR_RATE_DEFAULT, rateFromAdaptiveWheel } from "./rateCurve";

export type PcPlaybackOperations = {
  adjustPlaybackRateByWheel: (deltaY: number) => void;
  closeDomOverlays: () => void;
  resetPlaybackRate: () => void;
  selectSource: (sourceId: string) => void;
  setPlaybackRate: (rate: number) => void;
  setPlaybackRateByOffset: (offset: number) => void;
  toggleDomPlaylist: () => void;
  togglePlay: () => void;
};

export function createPcPlaybackOperations({
  playbackState,
  runCommand,
  setDomPlaylistOpen
}: {
  playbackState: AFrame360PlaybackState;
  runCommand: (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => void | Promise<void>;
  setDomPlaylistOpen: Dispatch<SetStateAction<boolean>>;
}): PcPlaybackOperations {
  const setPlaybackRate = (rate: number) => {
    void runCommand("set-rate", { playbackRate: clampRate(rate) });
  };

  return {
    adjustPlaybackRateByWheel(deltaY) {
      setPlaybackRate(rateFromAdaptiveWheel(playbackState.playbackRate, deltaY));
    },
    closeDomOverlays() {
      setDomPlaylistOpen(false);
      void runCommand("close-overlays");
    },
    resetPlaybackRate() {
      setPlaybackRate(PC_EDITOR_RATE_DEFAULT);
    },
    selectSource(sourceId) {
      setDomPlaylistOpen(false);
      void runCommand("select-source", { sourceId });
    },
    setPlaybackRate,
    setPlaybackRateByOffset(offset) {
      setPlaybackRate(playbackState.playbackRate + offset * 0.1);
    },
    toggleDomPlaylist() {
      setDomPlaylistOpen((open) => !open);
      void runCommand("toggle-playlist");
    },
    togglePlay() {
      void runCommand("toggle-play");
    }
  };
}
