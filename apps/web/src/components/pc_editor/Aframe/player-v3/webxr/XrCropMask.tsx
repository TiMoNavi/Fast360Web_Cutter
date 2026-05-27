"use client";

import { createElement } from "react";

export interface XrCropMaskProps {
  center: {
    yaw: number;
    pitch: number;
  };
  fov: {
    h: number;
    v: number;
  };
  opacity: number;
  sourceVideoId?: string;
}

export function XrCropMask({ center, fov, opacity, sourceVideoId = "aframe-360-source-video" }: XrCropMaskProps) {
  return createElement("a-entity", {
    "crop-viewport-mask": `opacity: ${opacity}; sourceVideoId: ${sourceVideoId}`,
    "data-testid": "aframe-crop-mask-preview"
  });
}
