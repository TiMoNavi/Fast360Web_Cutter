"use client";

import type { MutableRefObject } from "react";
import type { AFrame360PlaybackState } from "../controls/types";
import type { TimelineBridgeStatus } from "../data/timeline-bridge";
import type { PcViewCenter } from "../controls/PcTrajectoryRippleCorrector";
import type { CropMaskState } from "../webxr/AFrameCropViewportMask";

type PcEditorDebugStateProps = {
  cameraLookRef: MutableRefObject<PcViewCenter>;
  cropMaskState: CropMaskState;
  edgePanActive: boolean;
  maskDragArmed: boolean;
  playbackState: AFrame360PlaybackState;
  recordingRate: number;
  timelineStatus: TimelineBridgeStatus | null;
};

export function PcEditorDebugState({
  cameraLookRef,
  cropMaskState,
  edgePanActive,
  maskDragArmed,
  playbackState,
  recordingRate,
  timelineStatus
}: PcEditorDebugStateProps) {
  return (
    <>
      <span className="aframe-player-test-state" data-testid="aframe-video-control-state">
        {JSON.stringify({
          currentSourceId: playbackState.currentSource?.id ?? null,
          currentSourceKind: playbackState.currentSource?.kind ?? null,
          camera: cameraLookRef.current,
          edgePanActive,
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
    </>
  );
}
