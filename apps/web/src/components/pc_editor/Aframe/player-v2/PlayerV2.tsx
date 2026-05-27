"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PcEditorEventRoot } from "@/components/pc_editor/composition";
import type { PcEditorPlayerModel } from "@/components/pc_editor/data/buildPcEditorSessionModel";
import { useAFrameTimelineBridge } from "@/components/pc_editor/data/timeline-bridge";
import { usePcEditorEventEmitter, usePcEditorEventSubscription } from "@/components/pc_editor/events";
import { apiUrl } from "@/lib/api";
import {
  playerV2KeyboardBindings,
  useKeyboardEventBindings,
  usePcViewportKeyboardFov,
  usePcViewportKeyboardMotion,
  useSphereFovWheelBinding
} from "@/components/pc_editor/interactions";
import { useAFrameRuntime } from "@/components/pc_editor/webxr/useAFrameRuntime";
import {
  AFrameCropViewportRig,
  createPcCameraOperations,
  PcTrajectoryRippleCorrector,
  type PcMaskOperations,
  type PcTrajectoryRippleCorrectorHandle,
  type PcViewCenter,
  registerAFrameCropViewportMaskComponents,
  usePcEdgePan,
  usePcMaskPointerInput,
  usePcMaskRayTargetInput
} from "@/components/pc_editor/mask_controller";
import {
  PcEditorRuntimeStateRoot,
  getPcEditorRuntimeState,
  setPcEditorDiscardState,
  setPcEditorEditorUiState,
  setPcEditorPlaybackState,
  setPcEditorRenderState,
  setPcEditorSphereViewState,
  setPcEditorViewTarget,
  setPcEditorXrSessionState,
  usePcEditorRateState,
  usePcEditorSphereView,
  usePcEditorXrSession,
  usePlayerV2State
} from "@/components/pc_editor/state";
import { PC_EDITOR_RATE_DEFAULT, formatRate } from "@/components/pc_editor/controls/operations/rateCurve";
import { AFrame360VideoPlayer, type AFrame360VideoPlayerHandle } from "../360video_player";
import { useMetaImmersiveMode } from "../immersive_mode";
import {
  PcEffectsPanelSimple,
  PcEffectPreview,
  PcExportReadyPrompt,
  PcPlayerControlsSimple,
  PcWorkbenchPanelSimple
} from "@/components/pc_editor/UI";
import { PcPlaylistPanel } from "@/components/pc_editor/playlist";
import { DEFAULT_PLAYER_V2_DISCARD_STATE, usePlayerV2Workflows } from "@/components/pc_editor/workflows";
import {
  AFrameProjectionFlightPreview,
  AFrameViewportMaskEffectPreview,
  PcEditorEffectInputController,
  ViewportPathMotionPreviewController
} from "@/components/pc_editor/effects";
import pcEditorUiStyles from "@/components/pc_editor/UI/PcWebXrEditor.module.css";
import { PlayerV2Spatial3DUiLayer } from "./immersive-ui";
import { XrHud } from "./ui/XrHud";
import styles from "./PlayerV2.module.css";

export type PlayerV2Props = {
  model: PcEditorPlayerModel;
};

const VIDEO_SPHERE_RADIUS = 60;
const PLAYER_V2_RECORDING_WATCHDOG_MS = 10 * 60_000;

function readNumberPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readForceImmersiveUiParam() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("forceImmersiveUi") === "1";
}

function readDebugImmersiveParam() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("xrDebug") === "1" || params.get("debugImmersive") === "1";
}

export function PlayerV2({ model }: PlayerV2Props) {
  return (
    <PcEditorEventRoot bridgeLegacyCommands={false}>
      <PcEditorRuntimeStateRoot>
        <PlayerV2Content model={model} />
      </PcEditorRuntimeStateRoot>
    </PcEditorEventRoot>
  );
}

function PlayerV2Content({ model }: PlayerV2Props) {
  const cameraRef = useRef<HTMLElement | null>(null);
  const playerRef = useRef<AFrame360VideoPlayerHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const cameraLookRef = useRef<PcViewCenter>({ pitch: 0, yaw: 0 });
  const maskCenterRef = useRef<PcViewCenter>({ pitch: 0, yaw: 0 });
  const trajectoryCorrectorRef = useRef<PcTrajectoryRippleCorrectorHandle | null>(null);
  const [maskDragging, setMaskDragging] = useState(false);
  const [cropMaskRuntimeReady, setCropMaskRuntimeReady] = useState(false);
  const [discardState, setDiscardState] = useState(DEFAULT_PLAYER_V2_DISCARD_STATE);
  const aframeRuntime = useAFrameRuntime();
  const emitEvent = usePcEditorEventEmitter();
  const xrSession = usePcEditorXrSession();
  const sphereView = usePcEditorSphereView();
  const rates = usePcEditorRateState();
  const { setters, view } = usePlayerV2State(model);
  const forceImmersiveUi = readForceImmersiveUiParam();
  const debugImmersive = readDebugImmersiveParam();
  const immersive3DUiEnabled = xrSession?.presenting === true || forceImmersiveUi;
  const effectSpeed = rates.effectSpeed;
  const recordingRate = rates.recordingRate;
  const sphereFov = sphereView?.fov ?? 90;
  const sphereFovRef = useRef(sphereFov);
  const playbackRateRef = useRef(PC_EDITOR_RATE_DEFAULT);
  const handleSphereFovWheel = useSphereFovWheelBinding({
    enabled: true
  });

  useEffect(() => {
    if (!aframeRuntime.ready) {
      setCropMaskRuntimeReady(false);
      return;
    }

    registerAFrameCropViewportMaskComponents();
    setCropMaskRuntimeReady(true);
  }, [aframeRuntime.ready]);

  useEffect(() => {
    if (aframeRuntime.error) {
      setters.setXrStatus(aframeRuntime.error);
    }
  }, [aframeRuntime.error, setters]);

  useEffect(() => {
    sphereFovRef.current = sphereFov;
    cameraRef.current?.setAttribute("camera", `fov: ${sphereFov}`);
  }, [sphereFov]);

  useEffect(() => {
    if (getPcEditorRuntimeState().sphereView) {
      return;
    }

    setPcEditorSphereViewState({
      fov: 90,
      source: "workflow"
    });
  }, []);

  useEffect(() => {
    if (getPcEditorRuntimeState().viewTarget) {
      return;
    }

    setPcEditorViewTarget({
      center: view.maskCenter,
      fov: {
        h: view.fov,
        v: view.fov
      },
      input: "workflow",
      locked: view.maskLocked,
      maskOpacity: view.maskOpacity,
      roll: view.maskRoll,
      source: "workflow",
      videoTimeMs: view.currentTimeMs
    });
  }, [view.currentTimeMs, view.fov, view.maskCenter, view.maskLocked, view.maskOpacity, view.maskRoll]);

  useEffect(() => {
    setPcEditorPlaybackState({
      currentTimeMs: 0,
      durationMs: view.activeSource.durationMs ?? 0,
      isPlaying: false,
      playbackRate: playbackRateRef.current,
      sourceId: view.activeSource.id,
      status: "ready"
    });
  }, [view.activeSource.durationMs, view.activeSource.id]);

  useEffect(() => {
    setPcEditorEditorUiState({
      autoRenderEnabled: view.autoRenderEnabled,
      playlistOpen: view.playlistOpen,
      recordingActive: view.recordingActive
    });
  }, [view.autoRenderEnabled, view.playlistOpen, view.recordingActive]);

  useEffect(() => {
    if (!view.recordingActive) {
      return;
    }

    const timeout = window.setTimeout(() => {
      emitEvent({
        type: "editor.crop.end",
        payload: {
          maxDurationMs: PLAYER_V2_RECORDING_WATCHDOG_MS,
          reason: "recording-timeout",
          renderAfterEnd: true
        },
        source: {
          kind: "system",
          id: "player-v2-recording-watchdog",
          device: "pc"
        }
      });
    }, PLAYER_V2_RECORDING_WATCHDOG_MS);

    return () => window.clearTimeout(timeout);
  }, [emitEvent, view.recordingActive]);

  useEffect(() => {
    setPcEditorRenderState({
      downloadReady: view.renderStatus === "done" && Boolean(view.renderExportId),
      exportId: view.renderExportId,
      message: view.renderMessage,
      status: view.renderStatus
    });
  }, [view.renderExportId, view.renderMessage, view.renderStatus]);

  useEffect(() => {
    setPcEditorDiscardState(discardState);
  }, [discardState]);

  useEffect(() => {
    playbackRateRef.current = getPcEditorRuntimeState().playback?.playbackRate ?? PC_EDITOR_RATE_DEFAULT;
  }, [view.currentTimeMs, view.isPlaying]);

  useKeyboardEventBindings({
    bindings: playerV2KeyboardBindings,
    enabled: true
  });
  usePcViewportKeyboardMotion({ enabled: true });
  usePcViewportKeyboardFov({ enabled: true });

  useEffect(() => {
    maskCenterRef.current = view.maskCenter;
    trajectoryCorrectorRef.current?.sync({
      camera: cameraLookRef.current,
      mask: view.maskCenter
    });
  }, [view.maskCenter.pitch, view.maskCenter.yaw]);

  const emitMaskGestureCenter = useCallback(
    (center: PcViewCenter, phase: "change" | "end" = "end") => {
      emitEvent({
        type: "editor.viewport.center.set",
        payload: {
          ...center,
          commit: phase === "end"
        },
        source: {
          kind: "gesture",
          id: "pc-mask-pointer",
          device: "pc"
        },
        meta: {
          phase
        }
      });
    },
    [emitEvent]
  );

  const emitCameraGestureCenter = useCallback(
    (center: PcViewCenter, phase: "change" | "end" = "end") => {
      emitEvent({
        type: "editor.camera.center.set",
        payload: {
          ...center,
          commit: phase === "end"
        },
        source: {
          kind: "gesture",
          id: "pc-camera-pointer",
          device: "pc"
        },
        meta: {
          phase
        }
      });
    },
    [emitEvent]
  );

  const maskOperations = useMemo<PcMaskOperations>(
    () => ({
      bindMaskAndCameraBy(deltaYaw, deltaPitch, durationMs = 130) {
        trajectoryCorrectorRef.current?.bindMove({ pitch: deltaPitch, yaw: deltaYaw }, durationMs);
      },
      moveMaskBy(deltaYaw, deltaPitch, durationMs = 220) {
        const center = maskCenterRef.current;
        trajectoryCorrectorRef.current?.moveMaskTo({
          pitch: center.pitch + deltaPitch,
          yaw: center.yaw + deltaYaw
        }, durationMs);
      },
      moveMaskTo(center, durationMs = 220) {
        trajectoryCorrectorRef.current?.moveMaskTo(center, durationMs);
      },
      trackMaskToCenter(center, durationMs = 180) {
        trajectoryCorrectorRef.current?.trackMaskToCenter(center, durationMs);
      },
      nudgePreviewCenterBy(deltaYaw, deltaPitch) {
        emitEvent({
          type: "editor.viewport.center.step",
          payload: { pitchDelta: deltaPitch, yawDelta: deltaYaw },
          source: {
            kind: "gesture",
            id: "pc-mask-pointer",
            device: "pc"
          }
        });
      },
      setPreviewCenter(center) {
        emitMaskGestureCenter(center);
      },
      setPreviewFov(fovH) {
        emitEvent({
          type: "editor.viewport.fov.set",
          payload: { fovH },
          source: {
            kind: "gesture",
            id: "pc-mask-pointer",
            device: "pc"
          }
        });
      },
      setPreviewLocked(locked) {
        emitEvent({
          type: "editor.viewport.lock.set",
          payload: { locked },
          source: {
            kind: "gesture",
            id: "pc-mask-pointer",
            device: "pc"
          }
        });
      },
      setPreviewMaskOpacity(opacity, durationMs = 0) {
        emitEvent({
          type: "editor.mask.opacity.set",
          payload: { durationMs, opacity },
          source: {
            kind: "gesture",
            id: "pc-mask-pointer",
            device: "pc"
          }
        });
      },
      stopMotion() {
        trajectoryCorrectorRef.current?.stop();
      },
      syncMotionState(state) {
        trajectoryCorrectorRef.current?.sync(state);
      }
    }),
    [emitEvent, emitMaskGestureCenter]
  );

  const cameraOperations = useMemo(
    () => createPcCameraOperations({
      cameraLookRef,
      cameraRef
    }),
    []
  );

  usePcEditorEventSubscription("editor.camera.center.set", (event) => {
    const pitch = readNumberPayload(event.payload, "pitch");
    const yaw = readNumberPayload(event.payload, "yaw");
    if (pitch === null && yaw === null) {
      return;
    }

    const current = cameraLookRef.current;
    const nextCenter = {
      pitch: pitch === null ? current.pitch : pitch,
      yaw: yaw === null ? current.yaw : yaw
    };
    cameraOperations.setCameraCenter(nextCenter);
    trajectoryCorrectorRef.current?.syncCamera(nextCenter);
  });

  const maskPlaybackState = useMemo(() => ({ fov: view.fov }), [view.fov]);
  const edgePan = usePcEdgePan({
    cameraLookRef,
    mask: maskOperations,
    maskDragging,
    pcWorkbench: true,
    playbackState: maskPlaybackState,
    sceneRef
  });
  const pointerInput = usePcMaskPointerInput({
    cameraLookRef,
    cropMaskState: { center: view.maskCenter },
    edgePan,
    mask: maskOperations,
    maskDragArmed: false,
    maskDragging,
    playbackState: maskPlaybackState,
    sceneRef,
    setCameraCenter: (center, options) => emitCameraGestureCenter(center, options?.phase ?? (options?.commit ? "end" : "change")),
    setMaskDragging
  });

  usePcMaskRayTargetInput({
    mask: maskOperations,
    sceneReady: view.sceneReady,
    sceneRef
  });

  const videoId = "player-v2-video";
  const immersiveMode = useMetaImmersiveMode({
    beforeEnter: () => playerRef.current?.play().catch(() => undefined),
    debugImmersive,
    sceneReady: view.sceneReady,
    sceneRef
  });

  useEffect(() => {
    setPcEditorXrSessionState({
      canEnter: immersiveMode.canEnter,
      message: immersiveMode.message,
      presenting: forceImmersiveUi || immersiveMode.sessionState === "presenting",
      sessionState: forceImmersiveUi ? "presenting" : immersiveMode.sessionState
    });
  }, [forceImmersiveUi, immersiveMode.canEnter, immersiveMode.message, immersiveMode.sessionState]);

  const timelineBridge = useAFrameTimelineBridge({
    bindControllerInputEvents: false,
    cameraRef,
    enabled: Boolean(view.recordingActive && view.activeSession.sessionId && view.activeSession.videoId),
    legacyCropMaskWindowEvents: false,
    legacyWindowSemanticEvents: false,
    sceneRef,
    sessionId: view.activeSession.sessionId,
    videoId: view.activeSession.videoId,
    videoRef,
    viewTargetSource: "crop-mask"
  });

  useEffect(() => {
    timelineBridge.setRecordingRate(recordingRate);
  }, [recordingRate, timelineBridge]);

  usePlayerV2Workflows({
    activeSourceId: view.activeSource.id,
    autoRenderEnabled: view.autoRenderEnabled,
    playerRef,
    playlistSources: model.playlistSources,
    sessionId: view.activeSession.sessionId,
    setActiveSession: setters.setActiveSession,
    setActiveSource: setters.setActiveSource,
    setAutoRenderEnabled: setters.setAutoRenderEnabled,
    setRecordingActive: setters.setRecordingActive,
    setRenderExportId: setters.setRenderExportId,
    setRenderMessage: setters.setRenderMessage,
    setRenderStatus: setters.setRenderStatus,
    setPlaylistOpen: setters.setPlaylistOpen,
    setSourceMessage: setters.setSourceMessage,
    setSourceStatus: setters.setSourceStatus,
    setDiscardState,
    timelineBridge,
    timelineEnabled: view.recordingActive
  });

  const renderExportDownloadUrl = view.renderExportId
    ? apiUrl(`/api/exports/${encodeURIComponent(view.renderExportId)}/download`)
    : null;
  const renderExportDetailUrl = view.renderExportId
    ? `/mobile/exports/${encodeURIComponent(view.renderExportId)}`
    : null;

  return (
    <main className={`${styles.root} ${pcEditorUiStyles.root}`}>
      <PcTrajectoryRippleCorrector
        enabled
        onCameraCenter={emitCameraGestureCenter}
        onMaskCenter={emitMaskGestureCenter}
        ref={trajectoryCorrectorRef}
      />
      <PcEditorEffectInputController enabled={immersive3DUiEnabled} />
      <ViewportPathMotionPreviewController />
      {debugImmersive && immersive3DUiEnabled ? (
        <div className={styles.stereoDebugView} data-testid="player-v2-debug-stereo-view" aria-hidden="true">
          <div data-testid="player-v2-debug-stereo-left" />
          <div data-testid="player-v2-debug-stereo-right" />
        </div>
      ) : null}
      <div
        className={styles.xrStage}
        data-testid="player-v2-xr-stage"
        onClickCapture={pointerInput.handleMaskClickCapture}
        onMouseDownCapture={pointerInput.handleMaskMouseDownCapture}
        onPointerCancel={pointerInput.stopMaskPointerDrag}
        onPointerDown={pointerInput.handleMaskPointerDown}
        onPointerDownCapture={pointerInput.handleMaskPointerDownCapture}
        onPointerLeave={pointerInput.handleMaskPointerLeave}
        onPointerMove={pointerInput.handleMaskPointerMove}
        onPointerUp={pointerInput.handleMaskPointerUp}
        onWheel={handleSphereFovWheel}
      >
        {cropMaskRuntimeReady ? (
          <AFrame360VideoPlayer
            cameraRef={cameraRef}
            ref={playerRef}
            onSceneReady={(scene) => {
              sceneRef.current = scene;
              cameraRef.current?.setAttribute("camera", `fov: ${sphereFovRef.current}`);
              setters.setSceneReady(true);
              setters.setXrStatus("Scene ready");
            }}
            onSessionStart={() => setters.setXrStatus("XR session active")}
            onSessionEnd={() => setters.setXrStatus("XR session ended")}
            onPlaybackStateChange={(state) => {
              playbackRateRef.current = state.playbackRate;
              setPcEditorPlaybackState({
                currentTimeMs: state.currentTimeMs,
                durationMs: state.durationMs,
                isPlaying: state.isPlaying,
                playbackRate: state.playbackRate,
                readyState: state.readyState,
                sourceId: view.activeSource.id,
                status: state.isPlaying ? "playing" : state.readyState > 0 ? "paused" : "idle"
              });
            }}
            radius={VIDEO_SPHERE_RADIUS}
            sourceUrl={view.sourceUrl}
            videoId={videoId}
            videoRef={videoRef}
          >
            <AFrameCropViewportRig
              center={view.maskCenter}
              fovH={view.fov}
              legacyWindowCommands={false}
              locked={view.maskLocked}
              opacity={view.maskOpacity}
              roll={view.maskRoll}
              sourceVideoId={videoId}
            />
            <AFrameViewportMaskEffectPreview />
            <AFrameProjectionFlightPreview
              cameraRef={cameraRef}
              sceneRef={sceneRef}
              sphereRadius={VIDEO_SPHERE_RADIUS}
            />
            <PlayerV2Spatial3DUiLayer
              activeSource={view.activeSource}
              autoRenderEnabled={view.autoRenderEnabled}
              discardActive={discardState.active}
              discardMessage={discardState.message}
              playlistOpen={view.playlistOpen}
              playlistSources={model.playlistSources}
              recordingActive={view.recordingActive}
              renderExportId={view.renderExportId}
              renderMessage={view.renderMessage}
              renderStatus={view.renderStatus}
              sceneRef={sceneRef}
              sourceLabel={view.sourceLabel}
              sourceMessage={view.sourceMessage}
              sourceStatus={view.sourceStatus}
            />
          </AFrame360VideoPlayer>
        ) : null}
      </div>

      {!immersive3DUiEnabled ? <div className={styles.uiOverlay} data-testid="player-v2-ui-overlay">
        <XrHud
          disabled={!immersiveMode.canEnter || immersiveMode.sessionState === "requesting" || immersiveMode.sessionState === "presenting"}
          status={immersiveMode.message || view.xrStatus}
          onStartXr={() => void immersiveMode.enterImmersiveVr()}
        />

        {discardState.active ? (
          <div
            className="xr-pc-discard-toast"
            data-testid="xr-pc-discard-toast"
            data-tone="active"
            role="status"
            aria-live="assertive"
          >
            <span>DISCARD ACTIVE</span>
            <strong>当前播放内容将被放弃</strong>
          </div>
        ) : null}

        <PcPlayerControlsSimple
          currentTimeMs={view.currentTimeMs}
          durationMs={view.durationMs}
          effectSpeedLabel={formatRate(effectSpeed)}
          isPlaying={view.isPlaying}
          mediaKind={view.sourceUrl.endsWith(".m3u8") ? "HLS" : "MP4"}
          recordingRateLabel={formatRate(recordingRate)}
          playlistOpen={view.playlistOpen}
          recordingActive={view.recordingActive}
          status={view.sourceStatus === "switching" ? "switching" : view.isPlaying ? "playing" : "paused"}
          subtitle={`${view.sourceLabel} / mask FOV ${Math.round(view.fov)} / roll ${Math.round(view.maskRoll)} deg / sphere FOV ${Math.round(sphereFov)} / mask ${Math.round(view.maskOpacity * 100)}% / export ${view.renderLabel}${view.renderExportId ? ` ${view.renderExportId}` : ""}`}
          title={view.activeSource.title ?? "Session source"}
        />

        <PcPlaylistPanel
          activeSourceId={view.activeSource.id}
          message={view.sourceMessage}
          open={view.playlistOpen}
          sources={model.playlistSources}
          status={view.sourceStatus}
        />

        <PcWorkbenchPanelSimple
          autoRenderEnabled={view.autoRenderEnabled}
          exportDetailUrl={renderExportDetailUrl}
          exportDownloadUrl={renderExportDownloadUrl}
          maskLocked={view.maskLocked}
          maskOpacity={view.maskOpacity}
          maskRoll={view.maskRoll}
          renderExportId={view.renderExportId}
          renderMessage={view.renderMessage}
          renderStatus={view.renderStatus}
          discardActive={discardState.active}
          discardLastRange={discardState.lastRange}
          discardMessage={discardState.message}
        />
        <PcEffectsPanelSimple />
        <PcEffectPreview legacyDomEvents={false} />
        <PcExportReadyPrompt enabled={immersiveMode.sessionState !== "presenting"} />
      </div> : null}
    </main>
  );
}
