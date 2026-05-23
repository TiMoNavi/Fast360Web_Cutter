import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";

const MASK_EDGE_PAN_ZONE_PX = 132;
const MASK_EDGE_PAN_MAX_DEG_PER_SECOND = 46;

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeYaw(yaw: number) {
  let nextYaw = yaw;
  while (nextYaw > 180) {
    nextYaw -= 360;
  }
  while (nextYaw < -180) {
    nextYaw += 360;
  }
  return Object.is(nextYaw, -0) ? 0 : Number(nextYaw.toFixed(3));
}

export function normalizePitch(pitch: number) {
  return Number(clampNumber(pitch, -85, 85).toFixed(3));
}

export function normalizeViewCenter(center: PcViewCenter): PcViewCenter {
  return {
    pitch: normalizePitch(center.pitch),
    yaw: normalizeYaw(center.yaw)
  };
}

export function edgeAxisSpeed(position: number, size: number, invert = false) {
  const zone = Math.min(MASK_EDGE_PAN_ZONE_PX, Math.max(48, size * 0.28));
  let intensity = 0;

  if (position < zone) {
    intensity = -Math.pow((zone - position) / zone, 1.65);
  } else if (position > size - zone) {
    intensity = Math.pow((position - (size - zone)) / zone, 1.65);
  }

  return (invert ? -intensity : intensity) * MASK_EDGE_PAN_MAX_DEG_PER_SECOND;
}

export function screenPointToViewCenter({
  cameraLook,
  horizontalFov,
  stage,
  x,
  y
}: {
  cameraLook: PcViewCenter;
  horizontalFov: number;
  stage: HTMLElement;
  x: number;
  y: number;
}) {
  const bounds = stage.getBoundingClientRect();
  const localX = clampNumber(x - bounds.left, 0, bounds.width);
  const localY = clampNumber(y - bounds.top, 0, bounds.height);
  const normalizedX = bounds.width ? (localX / bounds.width - 0.5) * 2 : 0;
  const normalizedY = bounds.height ? (localY / bounds.height - 0.5) * 2 : 0;
  const aspectRatio = bounds.width && bounds.height ? bounds.width / bounds.height : 16 / 9;
  const verticalFov = horizontalFov;
  const verticalFovRad = verticalFov * Math.PI / 180;
  const pitchRad = cameraLook.pitch * Math.PI / 180;
  const yawRad = cameraLook.yaw * Math.PI / 180;
  const halfHeight = Math.tan(verticalFovRad / 2);
  const cameraX = normalizedX * halfHeight * aspectRatio;
  const cameraY = -normalizedY * halfHeight;
  const cameraZ = -1;
  const cosPitch = Math.cos(pitchRad);
  const sinPitch = Math.sin(pitchRad);
  const cosYaw = Math.cos(yawRad);
  const sinYaw = Math.sin(yawRad);
  const pitchedY = cameraY * cosPitch - cameraZ * sinPitch;
  const pitchedZ = cameraY * sinPitch + cameraZ * cosPitch;
  const worldX = cameraX * cosYaw - pitchedZ * sinYaw;
  const worldY = pitchedY;
  const worldZ = cameraX * sinYaw + pitchedZ * cosYaw;
  const length = Math.hypot(worldX, worldY, worldZ) || 1;
  const directionX = worldX / length;
  const directionY = worldY / length;
  const directionZ = worldZ / length;

  return normalizeViewCenter({
    pitch: Math.asin(clampNumber(directionY, -1, 1)) * 180 / Math.PI,
    yaw: Math.atan2(directionX, -directionZ) * 180 / Math.PI
  });
}
