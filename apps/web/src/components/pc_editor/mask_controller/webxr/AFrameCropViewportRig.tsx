"use client";

import { createElement } from "react";
import { AFrameCropViewportArcs } from "./AFrameCropViewportArcs";
import { AFrameCropViewportBoundsBroadcaster } from "./AFrameCropViewportBoundsBroadcaster";
import { AFrameCropViewportMask, type AFrameCropViewportMaskProps } from "./AFrameCropViewportMask";
import { AFrameMaskBackgroundTarget } from "./AFrameMaskBackgroundTarget";

export type AFrameCropViewportRigProps = AFrameCropViewportMaskProps;

export function AFrameCropViewportRig(props: AFrameCropViewportRigProps) {
  const legacyWindowEvents = props.legacyWindowEvents ?? false;

  return createElement(
    "a-entity",
    {
      "pc-crop-viewport-player-rig": "",
      "data-testid": "aframe-crop-viewport-rig"
    },
    createElement(AFrameCropViewportMask, {
      ...props,
      legacyWindowEvents
    }),
    createElement(AFrameMaskBackgroundTarget),
    createElement(AFrameCropViewportBoundsBroadcaster, {
      legacyWindowEvents
    }),
    createElement(AFrameCropViewportArcs, {
      legacyWindowEvents
    })
  );
}
