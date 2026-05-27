"use client";

import { createElement, useEffect, useRef, type ReactNode } from "react";
import { useAFrameRuntime } from "@/components/aframe/useAFrameRuntime";

type XrSceneProps = {
  videoElement?: HTMLVideoElement | null;
  onSceneReady?: (scene: HTMLElement) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  children?: ReactNode;
};

export function XrScene({
  videoElement,
  onSceneReady,
  onSessionStart,
  onSessionEnd,
  children
}: XrSceneProps) {
  const { ready: aframeReady } = useAFrameRuntime();
  const sceneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aframeReady || !sceneRef.current) return;

    const scene = sceneRef.current;
    onSceneReady?.(scene);

    const handleEnterVR = () => onSessionStart?.();
    const handleExitVR = () => onSessionEnd?.();

    scene.addEventListener("enter-vr", handleEnterVR);
    scene.addEventListener("exit-vr", handleExitVR);

    return () => {
      scene.removeEventListener("enter-vr", handleEnterVR);
      scene.removeEventListener("exit-vr", handleExitVR);
    };
  }, [aframeReady, onSceneReady, onSessionStart, onSessionEnd]);

  if (!aframeReady) {
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
      "device-orientation-permission-ui": "enabled: true"
    },
    createElement(
      "a-entity",
      { id: "camera-rig" },
      createElement("a-camera", {
        id: "main-camera",
        position: "0 1.6 0",
        "look-controls": "enabled: true"
      })
    ),
    children
  );
}
