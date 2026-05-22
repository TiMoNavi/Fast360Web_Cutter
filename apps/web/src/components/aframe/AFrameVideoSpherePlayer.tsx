"use client";

import { createElement, useEffect, useRef, useState } from "react";

type AFrameVideoSpherePlayerProps = {
  sourceUrl?: string;
  videoId?: string;
};

const DEFAULT_SOURCE_URL = "/api/sample-video";
const DEFAULT_VIDEO_ID = "aframe-360-source-video";

export function AFrameVideoSpherePlayer({
  sourceUrl = DEFAULT_SOURCE_URL,
  videoId = DEFAULT_VIDEO_ID
}: AFrameVideoSpherePlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [aframeReady, setAframeReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAFrame() {
      try {
        await import("aframe");
        if (!cancelled) {
          setAframeReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load A-Frame.");
        }
      }
    }

    void loadAFrame();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!aframeReady) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const playPromise = video.play();
    if (playPromise) {
      void playPromise.catch(() => {
        // Muted autoplay can still be blocked in some browsers; A-Frame's VR scene remains usable.
      });
    }
  }, [aframeReady, sourceUrl]);

  if (loadError) {
    return (
      <main className="aframe-player-page">
        <div className="aframe-player-message" role="alert">
          A-Frame failed to load: {loadError}
        </div>
      </main>
    );
  }

  return (
    <main className="aframe-player-page">
      <section className="aframe-sphere-stage" data-testid="aframe-video-sphere-player">
        {!aframeReady ? <div className="aframe-player-message">Loading A-Frame sphere player...</div> : null}
        {aframeReady
          ? createElement(
              "a-scene",
              {
                embedded: true,
                renderer: "colorManagement: true",
                "vr-mode-ui": "enabled: true",
                "device-orientation-permission-ui": "enabled: true"
              },
              createElement(
                "a-assets",
                null,
                createElement("video", {
                  id: videoId,
                  ref: videoRef,
                  src: sourceUrl,
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
              createElement("a-camera", {
                position: "0 1.6 0",
                "look-controls": "enabled: true"
              })
            )
          : null}
      </section>
    </main>
  );
}
