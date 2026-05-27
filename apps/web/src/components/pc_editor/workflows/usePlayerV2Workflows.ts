"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { PcEditorPlayerSession } from "../backend";
import type { AFrame360VideoPlayerHandle } from "../Aframe/360video_player";
import type { AFrame360VideoSource } from "../controls/types";
import type { AFrameTimelineBridge } from "../data/timeline-bridge";
import { usePlayerV2EffectsWorkflow } from "./editor/usePlayerV2EffectsWorkflow";
import { usePlayerV2EditorPreviewWorkflow } from "./editor/usePlayerV2EditorPreviewWorkflow";
import { usePlayerV2RenderWorkflow, type PlayerV2RenderStatus } from "./editor/usePlayerV2RenderWorkflow";
import { usePlayerV2TimelineWorkflow, type PlayerV2DiscardState } from "./editor/usePlayerV2TimelineWorkflow";
import { usePlayerPlaybackWorkflow } from "./player/usePlayerPlaybackWorkflow";
import { usePlayerSourceWorkflow, type PlayerV2SourceStatus } from "./player/usePlayerSourceWorkflow";

export function usePlayerV2Workflows({
  activeSourceId,
  autoRenderEnabled,
  playerRef,
  playlistSources,
  sessionId,
  setActiveSession,
  setActiveSource,
  setAutoRenderEnabled,
  setRecordingActive,
  setRenderExportId,
  setRenderMessage,
  setRenderStatus,
  setPlaylistOpen,
  setSourceMessage,
  setSourceStatus,
  setDiscardState,
  timelineBridge,
  timelineEnabled
}: {
  activeSourceId: string;
  autoRenderEnabled: boolean;
  playerRef: RefObject<AFrame360VideoPlayerHandle | null>;
  playlistSources: AFrame360VideoSource[];
  sessionId: string;
  setActiveSession: Dispatch<SetStateAction<PcEditorPlayerSession>>;
  setActiveSource: Dispatch<SetStateAction<AFrame360VideoSource>>;
  setAutoRenderEnabled: Dispatch<SetStateAction<boolean>>;
  setRecordingActive: Dispatch<SetStateAction<boolean>>;
  setRenderExportId: Dispatch<SetStateAction<string | null>>;
  setRenderMessage: Dispatch<SetStateAction<string>>;
  setRenderStatus: Dispatch<SetStateAction<PlayerV2RenderStatus>>;
  setPlaylistOpen: Dispatch<SetStateAction<boolean>>;
  setSourceMessage: Dispatch<SetStateAction<string>>;
  setSourceStatus: Dispatch<SetStateAction<PlayerV2SourceStatus>>;
  setDiscardState?: Dispatch<SetStateAction<PlayerV2DiscardState>>;
  timelineBridge: AFrameTimelineBridge;
  timelineEnabled: boolean;
}) {
  usePlayerPlaybackWorkflow({ playerRef });
  usePlayerV2EditorPreviewWorkflow({
    setAutoRenderEnabled,
    setRecordingActive
  });
  usePlayerV2TimelineWorkflow({
    autoRenderEnabled,
    enabled: timelineEnabled,
    onDiscardStateChange: setDiscardState,
    timelineBridge
  });
  usePlayerV2EffectsWorkflow({ timelineBridge });
  usePlayerV2RenderWorkflow({
    sessionId,
    setRenderExportId,
    setRenderMessage,
    setRenderStatus
  });
  usePlayerSourceWorkflow({
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
  });
}
