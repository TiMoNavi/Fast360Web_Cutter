"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PcEditorPlayerModel } from "@/components/pc_editor/data/buildPcEditorSessionModel";
import { AFrame360VideoPlayer, type AFrame360VideoPlayerHandle } from "../360video_player";
import { useMetaImmersiveMode } from "../immersive_mode";
import { PlayerV3SpatialUi } from "@/components/pc_editor/3DUI";
import { usePcEditorCommandSubscription, type PcEditorCommand } from "@/components/pc_editor/UI/PcEditorCommandBus";
import pcEditorUiStyles from "@/components/pc_editor/UI/PcWebXrEditor.module.css";
import { XrCropMask } from "./webxr/XrCropMask";
import { registerCropMaskComponents } from "./webxr/cropMaskComponents";
import { XrHud } from "./ui/XrHud";
import styles from "./PlayerV3.module.css";

export type PlayerV3Props = {
  model: PcEditorPlayerModel;
};

export function PlayerV3({ model }: PlayerV3Props) {
  const playerRef = useRef<AFrame360VideoPlayerHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    registerCropMaskComponents();
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [fov, setFov] = useState(90);
  const [maskCenter, setMaskCenter] = useState({ yaw: 0, pitch: 0 });
  const [maskLocked, setMaskLocked] = useState(true);
  const [maskOpacity, setMaskOpacity] = useState(0.7);
  const [recordingActive, setRecordingActive] = useState(false);
  const [autoRenderEnabled, setAutoRenderEnabled] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [xrStatus, setXrStatus] = useState("Ready");
  const [sceneReady, setSceneReady] = useState(false);

  const videoId = "player-v3-video";
  const sourceUrl = model.currentSource.sourceUrl;
  const immersiveMode = useMetaImmersiveMode({
    beforeEnter: () => playerRef.current?.play().catch(() => undefined),
    sceneReady,
    sceneRef
  });

  const handleCommand = useCallback((command: PcEditorCommand) => {
    switch (command.type) {
      case "crop.autoRender.set":
        setAutoRenderEnabled(command.enabled);
        break;
      case "crop.end":
        setRecordingActive(false);
        break;
      case "crop.start":
        setRecordingActive(true);
        break;
      case "mask.fov.step":
        setFov((value) => Math.max(35, Math.min(140, value + command.delta)));
        break;
      case "mask.lock.set":
        setMaskLocked(command.locked);
        break;
      case "mask.opacity.set":
        setMaskOpacity(Math.max(0, Math.min(0.95, command.opacity)));
        break;
      case "mask.pitch.step":
        setMaskCenter((value) => ({
          ...value,
          pitch: Math.max(-85, Math.min(85, value.pitch + command.delta))
        }));
        break;
      case "mask.yaw.step":
        setMaskCenter((value) => ({
          ...value,
          yaw: value.yaw + command.delta
        }));
        break;
      case "overlays.close":
        setPlaylistOpen(false);
        break;
      case "playlist.toggle":
        setPlaylistOpen((value) => !value);
        break;
      case "player.playPause.toggle":
        void playerRef.current?.togglePlay();
        break;
      case "player.seekTo":
        playerRef.current?.seekTo(command.timeMs);
        break;
      default:
        break;
    }
  }, []);

  const handleSpatialUiCommand = useCallback(
    (command: PcEditorCommand) => {
      if (command.type === "overlays.close" || command.type === "playlist.toggle") {
        return;
      }

      handleCommand(command);
    },
    [handleCommand]
  );

  usePcEditorCommandSubscription(handleCommand);

  return (
    <main className={`${styles.root} ${pcEditorUiStyles.root}`}>
      <div className={styles.xrStage} data-testid="player-v3-xr-stage">
        <AFrame360VideoPlayer
          ref={playerRef}
          onSceneReady={(scene) => {
            sceneRef.current = scene;
            setSceneReady(true);
            setXrStatus("Scene ready");
          }}
          onSessionStart={() => setXrStatus("XR session active")}
          onSessionEnd={() => setXrStatus("XR session ended")}
          onPlaybackStateChange={(state) => {
            setCurrentTimeMs(state.currentTimeMs);
            setDurationMs(state.durationMs);
            setIsPlaying(state.isPlaying);
          }}
          sourceUrl={sourceUrl}
          videoId={videoId}
          videoRef={videoRef}
        >
          <PlayerV3SpatialUi
            model={{
              activeSourceId: model.currentSource.id,
              autoRenderEnabled,
              currentTimeMs,
              durationMs,
              isPlaying,
              maskLocked,
              maskOpacity,
              playlistSources: model.playlistSources,
              recordingActive,
              sourceResolution: model.currentSource.resolution,
              title: model.currentSource.title
            }}
            onCommand={handleSpatialUiCommand}
            onPlaylistOpenChange={setPlaylistOpen}
            playlistOpen={playlistOpen}
          />
          <XrCropMask
            center={maskCenter}
            fov={{ h: fov, v: fov * 0.5625 }}
            opacity={maskOpacity}
            sourceVideoId={videoId}
          />
        </AFrame360VideoPlayer>
      </div>

      <div className={styles.uiOverlay} data-testid="player-v3-ui-overlay">
        <XrHud
          disabled={!immersiveMode.canEnter || immersiveMode.sessionState === "requesting" || immersiveMode.sessionState === "presenting"}
          status={immersiveMode.message || xrStatus}
          onStartXr={() => void immersiveMode.enterImmersiveVr()}
        />

      </div>
    </main>
  );
}
