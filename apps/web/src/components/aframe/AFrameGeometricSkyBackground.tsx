"use client";

import { Fragment, createElement } from "react";

type AFrameGeometricSkyBackgroundProps = {
  assetId?: string;
  src?: string;
};

const DEFAULT_ASSET_ID = "geometric-360-sky";
const DEFAULT_SRC = "/assets/xr/geometric-360.svg";

export function AFrameGeometricSkyBackground({
  assetId = DEFAULT_ASSET_ID,
  src = DEFAULT_SRC
}: AFrameGeometricSkyBackgroundProps) {
  return createElement(
    Fragment,
    null,
    createElement(
      "a-assets",
      null,
      createElement("img", {
        id: assetId,
        src,
        alt: ""
      })
    ),
    createElement("a-sky", {
      "data-testid": "aframe-geometric-sky-background",
      src: `#${assetId}`,
      rotation: "0 -90 0",
      radius: "32"
    })
  );
}
