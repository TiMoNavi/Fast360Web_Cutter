"use client";

import { createElement, type RefObject } from "react";
import { AFrameSpatialPlayerControls } from "../controls/AFrameSpatialPlayerControls";
import type { AFrame360PlaybackState, AFrame360VideoCommand, AFrame360VideoCommandPayload } from "../controls/types";
import { AFrameCropViewportArcs } from "./AFrameCropViewportArcs";
import { AFrameCropViewportMask } from "./AFrameCropViewportMask";

type AFrameEditorSceneProps = {
  aframeReady: boolean;
  bindVideoRef: (element: HTMLVideoElement | null) => void;
  cameraRef: RefObject<HTMLElement | null>;
  cropMaskReady: boolean;
  leftControllerRef: RefObject<HTMLElement | null>;
  pcWorkbench: boolean;
  playbackState: AFrame360PlaybackState;
  rightControllerRef: RefObject<HTMLElement | null>;
  runCommand: (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => void | Promise<void>;
  sceneRef: RefObject<HTMLElement | null>;
  videoId: string;
};

export function AFrameEditorScene({
  aframeReady,
  bindVideoRef,
  cameraRef,
  cropMaskReady,
  leftControllerRef,
  pcWorkbench,
  playbackState,
  rightControllerRef,
  runCommand,
  sceneRef,
  videoId
}: AFrameEditorSceneProps) {
  if (!aframeReady || !cropMaskReady) {
    return null;
  }

  return createElement(
    "a-scene",
    {
      ref: sceneRef,
      embedded: true,
      renderer: "colorManagement: true",
      "xr-mode-ui": "enabled: false",
      webxr: "optionalFeatures: local-floor, bounded-floor",
      "device-orientation-permission-ui": "enabled: true",
      cursor: "rayOrigin: mouse",
      raycaster: "objects: .clickable"
    },
    createElement(
      "a-assets",
      null,
      createElement("video", {
        id: videoId,
        ref: bindVideoRef,
        preload: "auto",
        autoPlay: true,
        loop: true,
        muted: true,
        playsInline: true,
        crossOrigin: "anonymous"
      })
    ),
    createElement("a-videosphere", {
      src: `#${videoId}`,
      rotation: "0 -90 0"
    }),
    createElement(
      "a-entity",
      {
        "crop-viewport-player-rig": "",
        "data-testid": "aframe-crop-viewport-rig"
      },
      createElement(AFrameCropViewportMask, {
        sourceVideoId: videoId
      }),
      createElement(AFrameCropViewportArcs)
    ),
    pcWorkbench
      ? null
      : createElement(AFrameSpatialPlayerControls, {
          playbackState,
          runCommand
        }),
    createElement("a-entity", {
      light: "type: ambient; color: #dfe9ff; intensity: 0.56"
    }),
    createElement("a-entity", {
      light: "type: point; color: #00ffff; intensity: 0.65; distance: 4",
      position: "-0.8 1.35 -1.1"
    }),
    createElement("a-entity", {
      light: "type: point; color: #ff00ff; intensity: 0.55; distance: 4",
      position: "0.9 1.2 -1.2"
    }),
    createElement("a-entity", {
      ref: leftControllerRef,
      "laser-controls": "hand: left",
      raycaster: "objects: .clickable; far: 8",
      line: "color: #dcecff; opacity: 0.55"
    }),
    createElement("a-entity", {
      ref: rightControllerRef,
      "laser-controls": "hand: right",
      raycaster: "objects: .clickable; far: 8",
      line: "color: #dcecff; opacity: 0.55"
    }),
    createElement(
      "a-camera",
      {
        ref: cameraRef,
        position: "0 1.6 0",
        camera: `fov: ${playbackState.fov}`,
        "look-controls": "enabled: true"
      },
      createElement("a-cursor", {
        color: "#ffffff",
        opacity: "0.72",
        fuse: "false",
        raycaster: "objects: .clickable"
      })
    )
  );
}
