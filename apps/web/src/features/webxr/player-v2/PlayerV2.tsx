"use client";

import { useRef, useState, useEffect } from "react";
import type { PcEditorPlayerModel } from "../pc-editor/data/buildPcEditorSessionModel";
import { XrScene } from "./webxr/XrScene";
import { XrVideoSphere } from "./webxr/XrVideoSphere";
import { XrCropMask } from "./webxr/XrCropMask";
import { registerCropMaskComponents } from "./webxr/cropMaskComponents";
import { PlayerControls } from "./ui/player/PlayerControls";
import { EditorWorkbench } from "./ui/editor/EditorWorkbench";
import { XrHud } from "./ui/XrHud";
import styles from "./PlayerV2.module.css";

export type PlayerV2Props = {
  model: PcEditorPlayerModel;
};

export function PlayerV2({ model }: PlayerV2Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<HTMLElement>(null);

  // Register crop mask A-Frame components
  useEffect(() => {
    registerCropMaskComponents();
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [fov, setFov] = useState(90);
  const [maskCenter, setMaskCenter] = useState({ yaw: 0, pitch: 0 });
  const [maskOpacity, setMaskOpacity] = useState(0.7);
  const [xrStatus, setXrStatus] = useState("Ready");

  const videoId = "player-v2-video";
  const sourceUrl = model.currentSource.sourceUrl;

  return (
    <main className={styles.root}>
      <div className={styles.xrStage} data-testid="player-v2-xr-stage">
        <XrScene
          videoElement={videoRef.current}
          onSceneReady={(scene) => {
            sceneRef.current = scene;
            setXrStatus("Scene ready");
          }}
          onSessionStart={() => setXrStatus("XR session active")}
          onSessionEnd={() => setXrStatus("XR session ended")}
        >
          <XrVideoSphere
            videoId={videoId}
            videoRef={videoRef}
            sourceUrl={sourceUrl}
          />
          <XrCropMask
            center={maskCenter}
            fov={{ h: fov, v: fov * 0.5625 }}
            opacity={maskOpacity}
            sourceVideoId={videoId}
          />
        </XrScene>
      </div>

      <div className={styles.uiOverlay} data-testid="player-v2-ui-overlay">
        <XrHud
          status={xrStatus}
          onStartXr={() => {
            setXrStatus("Starting XR...");
          }}
        />

        <PlayerControls
          isPlaying={isPlaying}
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onSeek={(timeMs) => setCurrentTimeMs(timeMs)}
          onTogglePlaylist={() => console.log("Toggle playlist")}
        />

        <EditorWorkbench
          fov={fov}
          onFovChange={(newFov) => setFov(newFov)}
          onStartCrop={() => console.log("Start crop")}
          onEndCrop={() => console.log("End crop")}
        />
      </div>
    </main>
  );
}
