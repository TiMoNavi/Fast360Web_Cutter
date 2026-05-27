"use client";

import { useEffect, useMemo, type RefObject } from "react";
import { AFrameTimelineBridge } from "./AFrameTimelineBridge";
import type { AFrameEntityLike, TimelineBridgeElementRefs, WebXrSemanticEvent } from "./types";

type UseAFrameTimelineBridgeOptions = {
  bindControllerInputEvents?: boolean;
  cameraRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  legacyCropMaskWindowEvents?: boolean;
  legacyWindowSemanticEvents?: boolean;
  leftControllerRef?: RefObject<HTMLElement | null>;
  onSemanticEvent?: (event: WebXrSemanticEvent) => void;
  playbackRate?: number;
  recordingRate?: number;
  rightControllerRef?: RefObject<HTMLElement | null>;
  sceneRef: RefObject<HTMLElement | null>;
  sessionId: string;
  videoId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  viewTargetSource?: "xr-pose" | "crop-mask";
};

function asAFrameEntity(element: HTMLElement | null): AFrameEntityLike | null {
  return element as AFrameEntityLike | null;
}

export function useAFrameTimelineBridge({
  bindControllerInputEvents,
  cameraRef,
  enabled = true,
  legacyCropMaskWindowEvents,
  legacyWindowSemanticEvents,
  leftControllerRef,
  onSemanticEvent,
  playbackRate,
  recordingRate,
  rightControllerRef,
  sceneRef,
  sessionId,
  videoId,
  videoRef,
  viewTargetSource
}: UseAFrameTimelineBridgeOptions) {
  const bridge = useMemo(() => {
    const refs: TimelineBridgeElementRefs = {
      camera: () => asAFrameEntity(cameraRef.current),
      leftController: () => asAFrameEntity(leftControllerRef?.current ?? null),
      rightController: () => asAFrameEntity(rightControllerRef?.current ?? null),
      scene: () => sceneRef.current,
      video: () => videoRef.current
    };

    return new AFrameTimelineBridge(
      {
        refs,
        sessionId,
        videoId
      },
      {
        bindControllerInputEvents,
        legacyCropMaskWindowEvents,
        legacyWindowSemanticEvents,
        onSemanticEvent,
        recordingRate,
        viewTargetSource
      }
    );
  }, [
    bindControllerInputEvents,
    cameraRef,
    legacyCropMaskWindowEvents,
    legacyWindowSemanticEvents,
    leftControllerRef,
    onSemanticEvent,
    recordingRate,
    rightControllerRef,
    sceneRef,
    sessionId,
    videoId,
    videoRef,
    viewTargetSource
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    bridge.start();
    return () => {
      bridge.stop();
    };
  }, [bridge, enabled]);

  useEffect(() => {
    if (typeof playbackRate === "number") {
      bridge.setPlaybackRate(playbackRate);
    }
  }, [bridge, playbackRate]);

  useEffect(() => {
    if (typeof recordingRate === "number") {
      bridge.setRecordingRate(recordingRate);
    }
  }, [bridge, recordingRate]);

  return bridge;
}
