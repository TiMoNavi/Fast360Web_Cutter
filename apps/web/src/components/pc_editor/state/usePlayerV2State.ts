"use client";

import { useState } from "react";
import type { PcEditorPlayerModel } from "../data/buildPcEditorSessionModel";
import type { PlayerV2RenderStatus, PlayerV2SourceStatus } from "../workflows";
import { usePcEditorPlaybackState, usePcEditorViewTarget } from "./runtimeStateStore";

export function usePlayerV2State(model: PcEditorPlayerModel) {
  const runtimePlayback = usePcEditorPlaybackState();
  const runtimeViewTarget = usePcEditorViewTarget();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [activeSession, setActiveSession] = useState(model.session);
  const [activeSource, setActiveSource] = useState(model.currentSource);
  const [fov, setFov] = useState(90);
  const [maskCenter, setMaskCenter] = useState({ yaw: 0, pitch: 0 });
  const [maskLocked, setMaskLocked] = useState(true);
  const [maskOpacity, setMaskOpacity] = useState(0.7);
  const [maskRoll, setMaskRoll] = useState(0);
  const [recordingActive, setRecordingActive] = useState(false);
  const [autoRenderEnabled, setAutoRenderEnabled] = useState(false);
  const [renderExportId, setRenderExportId] = useState<string | null>(null);
  const [renderMessage, setRenderMessage] = useState("Render idle.");
  const [renderStatus, setRenderStatus] = useState<PlayerV2RenderStatus>("idle");
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("Source ready.");
  const [sourceStatus, setSourceStatus] = useState<PlayerV2SourceStatus>("ready");
  const [xrStatus, setXrStatus] = useState("Ready");
  const [sceneReady, setSceneReady] = useState(false);

  const renderLabel = renderStatus === "idle" ? "idle" : renderMessage;
  const sourceLabel = sourceStatus === "ready" ? activeSource.title ?? "Session source" : sourceMessage;
  const sourceUrl = activeSource.sourceUrl;
  const resolvedFov = runtimeViewTarget?.fov.h ?? fov;
  const resolvedMaskCenter = runtimeViewTarget?.center ?? maskCenter;
  const resolvedMaskLocked = runtimeViewTarget?.locked ?? maskLocked;
  const resolvedMaskOpacity = runtimeViewTarget?.maskOpacity ?? maskOpacity;
  const resolvedMaskRoll = runtimeViewTarget?.roll ?? maskRoll;

  return {
    setters: {
      setActiveSession,
      setActiveSource,
      setAutoRenderEnabled,
      setCurrentTimeMs,
      setDurationMs,
      setFov,
      setIsPlaying,
      setMaskCenter,
      setMaskLocked,
      setMaskOpacity,
      setMaskRoll,
      setPlaylistOpen,
      setRecordingActive,
      setRenderExportId,
      setRenderMessage,
      setRenderStatus,
      setSceneReady,
      setSourceMessage,
      setSourceStatus,
      setXrStatus
    },
    view: {
      activeSession,
      activeSource,
      autoRenderEnabled,
      currentTimeMs: runtimePlayback?.currentTimeMs ?? currentTimeMs,
      durationMs: runtimePlayback?.durationMs ?? durationMs,
      fov: resolvedFov,
      isPlaying: runtimePlayback?.isPlaying ?? isPlaying,
      maskCenter: resolvedMaskCenter,
      maskLocked: resolvedMaskLocked,
      maskOpacity: resolvedMaskOpacity,
      maskRoll: resolvedMaskRoll,
      playlistOpen,
      recordingActive,
      renderExportId,
      renderLabel,
      renderMessage,
      renderStatus,
      sceneReady,
      sourceLabel,
      sourceMessage,
      sourceStatus,
      sourceUrl,
      xrStatus
    }
  };
}
