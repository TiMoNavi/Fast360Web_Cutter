"use client";

import { createElement, type Ref } from "react";

type XrVideoSphereProps = {
  videoId: string;
  videoRef: Ref<HTMLVideoElement>;
  sourceUrl?: string;
};

export function XrVideoSphere({
  videoId,
  videoRef,
  sourceUrl
}: XrVideoSphereProps) {
  return (
    <>
      <video
        crossOrigin="anonymous"
        id={videoId}
        loop
        muted
        playsInline
        ref={videoRef}
        src={sourceUrl}
        style={{ display: "none" }}
      />
      {createElement("a-videosphere", {
        rotation: "0 -90 0",
        src: `#${videoId}`
      })}
    </>
  );
}
