"use client";

import { createElement } from "react";

export const PC_MASK_BACKGROUND_HIT_ATTRIBUTE = "data-pc-mask-background-hit";

export function AFrameMaskBackgroundTarget() {
  return createElement("a-sphere", {
    className: "clickable",
    [PC_MASK_BACKGROUND_HIT_ATTRIBUTE]: "true",
    "data-testid": "pc-mask-background-hit-target",
    geometry: "primitive: sphere; radius: 4.05; segmentsWidth: 64; segmentsHeight: 32",
    material: "shader: flat; color: #ffffff; opacity: 0.001; transparent: true; side: back; depthWrite: false"
  });
}
