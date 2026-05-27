"use client";

import type { MutableRefObject } from "react";
import type { AFrame360PlaybackState } from "../controls/types";
import type { TimelineBridgeStatus } from "../data/timeline-bridge";
import type { PcViewCenter } from "../controls/PcTrajectoryRippleCorrector";
import type { CropMaskState } from "../webxr/AFrameCropViewportMask";
import { usePcEditorRuntimeState } from "../state";

type PcEditorDebugStateProps = {
  cameraLookRef: MutableRefObject<PcViewCenter>;
  cropMaskState: CropMaskState;
  edgePanActive: boolean;
  effectSpeed: number;
  maskDragArmed: boolean;
  playbackState: AFrame360PlaybackState;
  recordingRate: number;
  timelineStatus: TimelineBridgeStatus | null;
};

export function PcEditorDebugState({
  cameraLookRef,
  cropMaskState,
  edgePanActive,
  effectSpeed,
  maskDragArmed,
  playbackState,
  recordingRate,
  timelineStatus
}: PcEditorDebugStateProps) {
  const runtimeState = usePcEditorRuntimeState();

  return (
    <>
      <span className="aframe-player-test-state" data-testid="aframe-video-control-state">
        {JSON.stringify({
          currentSourceId: playbackState.currentSource?.id ?? null,
          currentSourceKind: playbackState.currentSource?.kind ?? null,
          camera: cameraLookRef.current,
          edgePanActive,
          effectSpeed,
          fov: playbackState.fov,
          lastCommand: playbackState.lastCommand,
          maskDragArmed,
          sourceCount: playbackState.sourceCount,
          playbackRate: playbackState.playbackRate,
          recordingRate,
          status: playbackState.status
        })}
      </span>
      <span className="aframe-player-test-state" data-testid="aframe-crop-mask-state">
        {JSON.stringify(cropMaskState)}
      </span>
      <span className="aframe-player-test-state" data-testid="aframe-timeline-bridge-state">
        {JSON.stringify(timelineStatus)}
      </span>
      <span className="aframe-player-test-state" data-testid="pc-editor-runtime-state">
        {JSON.stringify(runtimeState)}
      </span>
    </>
  );
}
