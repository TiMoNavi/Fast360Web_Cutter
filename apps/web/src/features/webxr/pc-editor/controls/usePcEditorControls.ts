"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import type { CropMaskState } from "../webxr/AFrameCropViewportMask";
import type { TimelineBridgeStatus } from "../data/timeline-bridge";
import type { AFrame360PlaybackState, AFrame360VideoCommand, AFrame360VideoCommandPayload } from "./types";
import type { PcTrajectoryRippleCorrectorHandle, PcViewCenter } from "./PcTrajectoryRippleCorrector";
import { usePcEdgePan } from "./inputs/usePcEdgePan";
import { usePcKeyboardShortcuts, type PcDiscardNotice, type PcDiscardNoticePatch } from "./inputs/usePcKeyboardShortcuts";
import { usePcMaskPointerInput } from "./inputs/usePcMaskPointerInput";
import { usePcWheelZoom } from "./inputs/usePcWheelZoom";
import { createPcCameraOperations } from "./operations/cameraOperations";
import { createPcMaskOperations } from "./operations/maskOperations";
import { createPcPlaybackOperations } from "./operations/playbackOperations";
import { PC_EDITOR_RATE_DEFAULT, rateFromAdaptiveWheel, type PcRateWheelTarget } from "./operations/rateCurve";
import { createPcRecordingOperations } from "./operations/recordingOperations";
import { createPcTimelineOperations, type PcTimelineStatusSource } from "./operations/timelineOperations";

export const PC_EDITOR_MASK_DRAG_KEY_LABEL = "Ctrl";

const DEFAULT_DISCARD_NOTICE: PcDiscardNotice = {
  active: false,
  lastRange: null,
  message: "Play the video and hold Del to mark a discard range.",
  tone: "idle",
  visible: false
};

type UsePcEditorControlsOptions = {
  cameraRef: RefObject<HTMLElement | null>;
  cropMaskState: CropMaskState;
  pcWorkbench: boolean;
  playbackState: AFrame360PlaybackState;
  runCommand: (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => void | Promise<void>;
  sceneRef: RefObject<HTMLElement | null>;
  setCropMaskState: Dispatch<SetStateAction<CropMaskState>>;
  setTimelineStatus: Dispatch<SetStateAction<TimelineBridgeStatus | null>>;
  timelineBridge: PcTimelineStatusSource;
  trajectoryCorrectorRef: RefObject<PcTrajectoryRippleCorrectorHandle | null>;
};

export function usePcEditorControls({
  cameraRef,
  cropMaskState,
  pcWorkbench,
  playbackState,
  runCommand,
  sceneRef,
  setCropMaskState,
  setTimelineStatus,
  timelineBridge,
  trajectoryCorrectorRef
}: UsePcEditorControlsOptions) {
  const fovAnimationRef = useRef<number | null>(null);
  const discardNoticeTimerRef = useRef<number | null>(null);
  const smoothFlushTimerRef = useRef<number | null>(null);
  const cameraLookRef = useRef<PcViewCenter>({ pitch: 0, yaw: 0 });
  const [domPlaylistOpen, setDomPlaylistOpen] = useState(false);
  const [discardNotice, setDiscardNotice] = useState<PcDiscardNotice>(DEFAULT_DISCARD_NOTICE);
  const [maskDragging, setMaskDragging] = useState(false);
  const [rateWheelTarget, setRateWheelTarget] = useState<PcRateWheelTarget>(null);
  const rateWheelTargetRef = useRef<PcRateWheelTarget>(null);
  const [effectSpeed, setEffectSpeed] = useState(PC_EDITOR_RATE_DEFAULT);
  const [recordingRate, setRecordingRate] = useState(PC_EDITOR_RATE_DEFAULT);
  const setActiveRateWheelTarget = useCallback((target: PcRateWheelTarget) => {
    rateWheelTargetRef.current = target;
    setRateWheelTarget(target);
  }, []);
  const updateDiscardNotice = useCallback((patch: PcDiscardNoticePatch, autoHideMs?: number) => {
    if (discardNoticeTimerRef.current !== null) {
      window.clearTimeout(discardNoticeTimerRef.current);
      discardNoticeTimerRef.current = null;
    }

    setDiscardNotice((notice) => ({
      ...notice,
      ...patch
    }));

    if (autoHideMs) {
      discardNoticeTimerRef.current = window.setTimeout(() => {
        setDiscardNotice((notice) => (notice.active ? notice : { ...notice, visible: false }));
        discardNoticeTimerRef.current = null;
      }, autoHideMs);
    }
  }, []);

  const timeline = useMemo(() => createPcTimelineOperations({
    setTimelineStatus,
    timelineBridge
  }), [setTimelineStatus, timelineBridge]);

  const mask = useMemo(() => createPcMaskOperations({
    cropMaskState,
    fovAnimationRef,
    setCropMaskState,
    smoothFlushTimerRef,
    timeline,
    trajectoryCorrectorRef
  }), [cropMaskState, setCropMaskState, timeline, trajectoryCorrectorRef]);

  const camera = useMemo(() => createPcCameraOperations({
    cameraLookRef,
    cameraRef
  }), [cameraRef]);

  const playback = useMemo(() => createPcPlaybackOperations({
    playbackState,
    runCommand,
    setDomPlaylistOpen
  }), [playbackState, runCommand]);

  const recording = useMemo(() => createPcRecordingOperations({
    setRecordingRate
  }), []);
  const adjustEffectSpeedByWheel = useCallback((deltaY: number) => {
    setEffectSpeed((speed) => rateFromAdaptiveWheel(speed, deltaY));
  }, []);
  const resetEffectSpeed = useCallback(() => {
    setEffectSpeed(PC_EDITOR_RATE_DEFAULT);
  }, []);

  const handleStageWheel = usePcWheelZoom({
    mask,
    maskOpacity: cropMaskState.maskOpacity,
    onEffectSpeedWheel: adjustEffectSpeedByWheel,
    pcWorkbench,
    playback,
    rateWheelTarget,
    rateWheelTargetRef,
    recording,
    runCommand
  });
  const edgePan = usePcEdgePan({
    cameraLookRef,
    mask,
    maskDragging,
    pcWorkbench,
    playbackState,
    sceneRef
  });
  const pointerInput = usePcMaskPointerInput({
    cameraLookRef,
    cropMaskState,
    edgePan,
    mask,
    maskDragArmed: false,
    maskDragging,
    playbackState,
    sceneRef,
    setCameraCenter: camera.setCameraCenter,
    setMaskDragging
  });

  usePcKeyboardShortcuts({
    cropMaskState,
    mask,
    onDiscardNotice: updateDiscardNotice,
    pcWorkbench,
    playback,
    playbackState,
    rateWheelTargetRef,
    setRateWheelTarget: setActiveRateWheelTarget,
    timeline
  });

  useEffect(() => {
    trajectoryCorrectorRef.current?.sync({
      camera: cameraLookRef.current,
      mask: cropMaskState.center
    });
  }, [cropMaskState.center.pitch, cropMaskState.center.yaw, trajectoryCorrectorRef]);

  useEffect(() => () => {
    if (fovAnimationRef.current !== null) {
      window.cancelAnimationFrame(fovAnimationRef.current);
      fovAnimationRef.current = null;
    }
    if (discardNoticeTimerRef.current !== null) {
      window.clearTimeout(discardNoticeTimerRef.current);
      discardNoticeTimerRef.current = null;
    }
    if (smoothFlushTimerRef.current !== null) {
      window.clearTimeout(smoothFlushTimerRef.current);
      smoothFlushTimerRef.current = null;
    }
  }, []);

  const progressPercent =
    playbackState.durationMs > 0
      ? Math.min(100, Math.max(0, (playbackState.currentTimeMs / playbackState.durationMs) * 100))
      : 0;

  return {
    cameraLookRef,
    closeDomOverlays: playback.closeDomOverlays,
    cutHere: timeline.cutHere,
    discardNotice,
    domPlaylistOpen,
    edgePanActive: edgePan.edgePanActive,
    effectSpeed,
    flushTimeline: timeline.flushTimeline,
    handleMaskPointerDown: pointerInput.handleMaskPointerDown,
    handleMaskPointerLeave: pointerInput.handleMaskPointerLeave,
    handleMaskPointerMove: pointerInput.handleMaskPointerMove,
    handleMaskPointerUp: pointerInput.handleMaskPointerUp,
    handleStageWheel,
    maskDragArmed: false,
    maskDragging,
    progressPercent,
    rateWheelTarget,
    recordingRate,
    pauseSampling: timeline.pauseSampling,
    resetPlaybackRate: playback.resetPlaybackRate,
    resetEffectSpeed,
    resetRecordingRate: recording.resetRecordingRate,
    resumeSampling: timeline.resumeSampling,
    selectSource: playback.selectSource,
    setCameraCenter: camera.setCameraCenter,
    setPlaybackRate: playback.setPlaybackRate,
    setPreviewCenter: mask.setPreviewCenter,
    setPreviewFov: mask.setPreviewFov,
    setPreviewLocked: mask.setPreviewLocked,
    setPreviewMaskOpacity: mask.setPreviewMaskOpacity,
    smoothMaskMove: mask.moveMaskBy,
    stopMaskPointerDrag: pointerInput.stopMaskPointerDrag,
    toggleDomPlaylist: playback.toggleDomPlaylist
  };
}
