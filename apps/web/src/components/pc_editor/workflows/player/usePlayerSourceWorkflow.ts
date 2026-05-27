"use client";

import type { Dispatch, SetStateAction } from "react";
import { switchPcEditorSourceSession, type PcEditorPlayerSession } from "../../backend";
import type { AFrame360VideoSource } from "../../controls/types";
import { usePcEditorEventSubscription } from "../../events";
import { setPcEditorPlaybackState } from "../../state";
import type { PlayerV2RenderStatus } from "../editor/usePlayerV2RenderWorkflow";

export type PlayerV2SourceStatus = "ready" | "switching" | "error";

function readStringPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function findRelativeSource({
  activeSourceId,
  offset,
  sources
}: {
  activeSourceId: string;
  offset: -1 | 1;
  sources: AFrame360VideoSource[];
}) {
  if (sources.length === 0) {
    return null;
  }

  const currentIndex = Math.max(0, sources.findIndex((source) => source.id === activeSourceId));
  const nextIndex = (currentIndex + offset + sources.length) % sources.length;
  return sources[nextIndex] ?? null;
}

export function usePlayerSourceWorkflow({
  activeSourceId,
  playlistSources,
  setActiveSession,
  setActiveSource,
  setPlaylistOpen,
  setRecordingActive,
  setRenderExportId,
  setRenderMessage,
  setRenderStatus,
  setSourceMessage,
  setSourceStatus
}: {
  activeSourceId: string;
  playlistSources: AFrame360VideoSource[];
  setActiveSession: Dispatch<SetStateAction<PcEditorPlayerSession>>;
  setActiveSource: Dispatch<SetStateAction<AFrame360VideoSource>>;
  setPlaylistOpen: Dispatch<SetStateAction<boolean>>;
  setRecordingActive: Dispatch<SetStateAction<boolean>>;
  setRenderExportId: Dispatch<SetStateAction<string | null>>;
  setRenderMessage: Dispatch<SetStateAction<string>>;
  setRenderStatus: Dispatch<SetStateAction<PlayerV2RenderStatus>>;
  setSourceMessage: Dispatch<SetStateAction<string>>;
  setSourceStatus: Dispatch<SetStateAction<PlayerV2SourceStatus>>;
}) {
  const switchSource = async (sourceId: string) => {
    const nextSource = playlistSources.find((source) => source.id === sourceId);

    if (!nextSource) {
      setSourceStatus("error");
      setSourceMessage(`Source not found: ${sourceId}`);
      return;
    }

    setRecordingActive(false);
    setRenderExportId(null);
    setRenderStatus("idle");
    setRenderMessage("Render idle.");
    setSourceStatus("switching");
    setSourceMessage(`Switching to ${nextSource.title}...`);
    setPcEditorPlaybackState({
      currentTimeMs: 0,
      durationMs: nextSource.durationMs ?? 0,
      isPlaying: false,
      sourceId: nextSource.id,
      status: "loading"
    });

    try {
      const nextSession = await switchPcEditorSourceSession(sourceId);
      setActiveSession(nextSession);
      setActiveSource(nextSource);
      setSourceStatus("ready");
      setSourceMessage(`Source ready: ${nextSource.title}`);
      setPcEditorPlaybackState({
        currentTimeMs: 0,
        durationMs: nextSource.durationMs ?? 0,
        isPlaying: false,
        sourceId: nextSource.id,
        status: "ready"
      });
    } catch (error) {
      setSourceStatus("error");
      setSourceMessage(error instanceof Error ? error.message : "Failed to switch source.");
      setPcEditorPlaybackState({
        currentTimeMs: 0,
        durationMs: nextSource.durationMs ?? 0,
        isPlaying: false,
        sourceId: nextSource.id,
        status: "error"
      });
    }
  };

  usePcEditorEventSubscription("player.source.select", (event) => {
    const sourceId = readStringPayload(event.payload, "sourceId");

    if (!sourceId) {
      return;
    }

    setPlaylistOpen(false);
    void switchSource(sourceId);
  });

  usePcEditorEventSubscription("player.source.next", () => {
    const nextSource = findRelativeSource({ activeSourceId, offset: 1, sources: playlistSources });

    if (nextSource) {
      void switchSource(nextSource.id);
    }
  });

  usePcEditorEventSubscription("player.source.previous", () => {
    const nextSource = findRelativeSource({ activeSourceId, offset: -1, sources: playlistSources });

    if (nextSource) {
      void switchSource(nextSource.id);
    }
  });

  usePcEditorEventSubscription("player.playlist.open", () => {
    setPlaylistOpen(true);
  });

  usePcEditorEventSubscription("player.playlist.close", () => {
    setPlaylistOpen(false);
  });

  usePcEditorEventSubscription("player.playlist.toggle", () => {
    setPlaylistOpen((value) => !value);
  });
}
