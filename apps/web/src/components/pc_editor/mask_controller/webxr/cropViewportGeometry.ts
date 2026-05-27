import type {
  PcEditorMaskViewportBounds,
  PcEditorViewportCorner,
  PcEditorViewportCornerId,
  PcEditorViewportRect
} from "../../state";
import type { CropMaskState } from "./AFrameCropViewportMask";

export type CropViewportCornerPose = {
  id: PcEditorViewportCornerId;
  position: {
    x: number;
    y: number;
    z: number;
  };
  positionAttribute: string;
  rotationAttribute: string;
};

export type CropViewportPlane = {
  corners: CropViewportCornerPose[];
  rotationAttribute: string;
};

const ARC_RADIUS = 3.86;
const DEG_TO_RAD = Math.PI / 180;

export function cropViewportCornerIndex(corner: PcEditorViewportCornerId) {
  return ["top-left", "top-right", "bottom-right", "bottom-left"].indexOf(corner);
}

export function vectorAttribute(x: number, y: number, z: number) {
  return `${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`;
}

export function computeCropViewportPlane(state: CropMaskState): CropViewportPlane {
  const halfH = Math.tan((state.fov.h * DEG_TO_RAD) / 2);
  const halfV = Math.tan((state.fov.v * DEG_TO_RAD) / 2);
  const rollRad = state.roll * DEG_TO_RAD;
  const rollCos = Math.cos(rollRad);
  const rollSin = Math.sin(rollRad);
  const corners: Array<{ id: PcEditorViewportCornerId; x: number; y: number }> = [
    { id: "top-left", x: -halfH, y: halfV },
    { id: "top-right", x: halfH, y: halfV },
    { id: "bottom-right", x: halfH, y: -halfV },
    { id: "bottom-left", x: -halfH, y: -halfV }
  ];

  return {
    corners: corners.map((corner) => {
      const rolledX = corner.x * rollCos + corner.y * rollSin;
      const rolledY = -corner.x * rollSin + corner.y * rollCos;
      const position = {
        x: rolledX * ARC_RADIUS,
        y: rolledY * ARC_RADIUS,
        z: -ARC_RADIUS
      };

      return {
        id: corner.id,
        position,
        positionAttribute: vectorAttribute(position.x, position.y, position.z),
        rotationAttribute: `0 0 ${(-state.roll).toFixed(3)}`
      };
    }),
    // A-Frame's positive Y rotation turns the -Z viewport opposite to the mask shader's yaw convention.
    rotationAttribute: `${state.center.pitch.toFixed(3)} ${(-state.center.yaw).toFixed(3)} 0`
  };
}

export function createRectFromCorners(corners: PcEditorViewportCorner[]): PcEditorViewportRect | undefined {
  const screenCorners = corners
    .map((corner) => corner.screen)
    .filter((corner): corner is { x: number; y: number } => Boolean(corner));

  if (screenCorners.length < 4) {
    return undefined;
  }

  const left = Math.min(...screenCorners.map((corner) => corner.x));
  const right = Math.max(...screenCorners.map((corner) => corner.x));
  const top = Math.min(...screenCorners.map((corner) => corner.y));
  const bottom = Math.max(...screenCorners.map((corner) => corner.y));

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left
  };
}

export function createCropMaskViewportBounds(
  state: CropMaskState,
  corners: PcEditorViewportCorner[]
): PcEditorMaskViewportBounds {
  return {
    center: state.center,
    corners,
    fov: state.fov,
    roll: state.roll,
    screenRect: createRectFromCorners(corners),
    source: "crop-mask-bounds",
    updatedAt: Date.now()
  };
}
