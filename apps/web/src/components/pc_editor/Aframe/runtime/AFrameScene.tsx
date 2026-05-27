"use client";

import { createElement, useEffect, useRef, type ReactNode, type Ref } from "react";
import { useAFrameRuntime } from "../../webxr/useAFrameRuntime";

type AFrameSceneProps = {
  cameraChildren?: ReactNode;
  cameraRef?: Ref<HTMLElement>;
  children?: ReactNode;
  cursor?: string;
  embedded?: boolean;
  onSceneReady?: (scene: HTMLElement) => void;
  onSessionEnd?: () => void;
  onSessionStart?: () => void;
  lookControls?: string;
  raycaster?: string;
  renderer?: string;
  webxr?: string;
};

export function AFrameScene({
  cameraChildren,
  cameraRef,
  children,
  cursor = "rayOrigin: mouse",
  embedded = true,
  lookControls = "enabled: true; mouseEnabled: false; touchEnabled: false; pointerLockEnabled: false",
  onSceneReady,
  onSessionEnd,
  onSessionStart,
  raycaster = "objects: .clickable; recursive: true; interval: 0",
  renderer = "colorManagement: true",
  webxr = "optionalFeatures: local-floor"
}: AFrameSceneProps) {
  const { ready: aframeReady } = useAFrameRuntime();
  const sceneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aframeReady || !sceneRef.current) {
      return undefined;
    }

    const scene = sceneRef.current;
    const handleEnterVr = () => onSessionStart?.();
    const handleExitVr = () => onSessionEnd?.();

    onSceneReady?.(scene);
    scene.addEventListener("enter-vr", handleEnterVr);
    scene.addEventListener("exit-vr", handleExitVr);

    return () => {
      scene.removeEventListener("enter-vr", handleEnterVr);
      scene.removeEventListener("exit-vr", handleExitVr);
    };
  }, [aframeReady, onSceneReady, onSessionEnd, onSessionStart]);

  if (!aframeReady) {
    return null;
  }

  return createElement(
    "a-scene",
    {
      ref: sceneRef,
      cursor,
      embedded,
      raycaster,
      renderer,
      "device-orientation-permission-ui": "enabled: true",
      "xr-mode-ui": "enabled: false",
      webxr
    },
    createElement(
      "a-entity",
      { id: "camera-rig" },
      createElement("a-camera", {
        ref: cameraRef,
        id: "main-camera",
        position: "0 1.6 0",
        "look-controls": lookControls,
        "wasd-controls": "enabled: false"
      },
      createElement("a-cursor", {
        color: "#ffffff",
        fuse: "false",
        opacity: "0.62",
        raycaster: "objects: .clickable; recursive: true; far: 8; interval: 0"
      }),
      cameraChildren)
    ),
    createElement("a-entity", {
      "data-hand": "left",
      id: "left-controller",
      "laser-controls": "hand: left",
      line: "color: #dcecff; opacity: 0.55",
      raycaster: "objects: .clickable; recursive: true; far: 8; interval: 0"
    }),
    createElement("a-entity", {
      "data-hand": "right",
      id: "right-controller",
      "laser-controls": "hand: right",
      line: "color: #dcecff; opacity: 0.55",
      raycaster: "objects: .clickable; recursive: true; far: 8; interval: 0"
    }),
    children
  );
}
