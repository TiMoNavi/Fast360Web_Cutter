"use client";

import { createElement, type Ref } from "react";

type AFrameVideoSphereProps = {
  autoPlay?: boolean;
  crossOrigin?: "" | "anonymous" | "use-credentials";
  loop?: boolean;
  muted?: boolean;
  onLoadedMetadata?: () => void;
  onPause?: () => void;
  onPlay?: () => void;
  onTimeUpdate?: () => void;
  radius?: number;
  rotation?: string;
  sourceUrl?: string;
  videoId: string;
  videoRef?: Ref<HTMLVideoElement>;
};

export function AFrameVideoSphere({
  autoPlay = true,
  crossOrigin = "anonymous",
  loop = true,
  muted = true,
  onLoadedMetadata,
  onPause,
  onPlay,
  onTimeUpdate,
  radius = 60,
  rotation = "0 -90 0",
  sourceUrl,
  videoId,
  videoRef
}: AFrameVideoSphereProps) {
  const video = (
    <video
      autoPlay={autoPlay}
      crossOrigin={crossOrigin}
      id={videoId}
      loop={loop}
      muted={muted}
      onLoadedMetadata={onLoadedMetadata}
      onPause={onPause}
      onPlay={onPlay}
      onTimeUpdate={onTimeUpdate}
      playsInline
      preload="auto"
      ref={videoRef}
      src={sourceUrl}
      style={{ display: "none" }}
    />
  );

  return (
    <>
      {createElement("a-assets", null, video)}
      {createElement("a-videosphere", {
        radius,
        rotation,
        src: `#${videoId}`
      })}
    </>
  );
}
