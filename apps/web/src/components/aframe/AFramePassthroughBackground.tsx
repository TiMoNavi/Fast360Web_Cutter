"use client";

import { createElement } from "react";

type AFramePassthroughBackgroundProps = {
  supported: boolean;
};

export function AFramePassthroughBackground({ supported }: AFramePassthroughBackgroundProps) {
  return createElement("a-entity", {
    "data-testid": "aframe-passthrough-background",
    "data-supported": supported ? "true" : "false",
    position: "0 0 0"
  });
}
