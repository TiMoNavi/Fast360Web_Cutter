"use client";

import { createElement } from "react";
import { AFrameVrCropViewportMask, type AFrameVrCropViewportMaskProps } from "./AFrameVrCropViewportMask";

export type AFrameVrMaskRigProps = AFrameVrCropViewportMaskProps;

export function AFrameVrMaskRig(props: AFrameVrMaskRigProps) {
  return createElement(
    "a-entity",
    {
      "data-testid": "vr-crop-viewport-rig",
      "vr-crop-viewport-player-rig": ""
    },
    createElement(AFrameVrCropViewportMask, props)
  );
}
