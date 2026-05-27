import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";

const MASK_EDGE_PAN_ZONE_PX = 600;
const MASK_EDGE_PAN_MAX_DEG_PER_SECOND = 46;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export type PcSphereDirection = {
  x: number;
  y: number;
  z: number;
};

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
  return Number(clampNumber(pitch, -88, 88).toFixed(3));
}

export function normalizeViewCenter(center: PcViewCenter): PcViewCenter {
  return {
    pitch: normalizePitch(center.pitch),
    yaw: normalizeYaw(center.yaw)
  };
}

export function viewCenterToDirection(center: PcViewCenter): PcSphereDirection {
  const normalized = normalizeViewCenter(center);
  const pitchRad = normalized.pitch * DEG_TO_RAD;
  const yawRad = normalized.yaw * DEG_TO_RAD;
  const cosPitch = Math.cos(pitchRad);

  return {
    x: Math.sin(yawRad) * cosPitch,
    y: Math.sin(pitchRad),
    z: -Math.cos(yawRad) * cosPitch
  };
}

export function directionToViewCenter(direction: PcSphereDirection): PcViewCenter {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;

  return normalizeViewCenter({
    pitch: Math.asin(clampNumber(y, -1, 1)) * RAD_TO_DEG,
    yaw: Math.atan2(x, -z) * RAD_TO_DEG
  });
}

export function viewCenterToSpherePoint(center: PcViewCenter, radius: number): PcSphereDirection {
  const direction = viewCenterToDirection(center);

  return {
    x: direction.x * radius,
    y: direction.y * radius,
    z: direction.z * radius
  };
}

export function viewCenterToAFrameCameraRotation(center: PcViewCenter): PcViewCenter {
  const normalized = normalizeViewCenter(center);

  return {
    pitch: normalized.pitch,
    yaw: -normalized.yaw
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
  const verticalFovRad = verticalFov * DEG_TO_RAD;
  const pitchRad = cameraLook.pitch * DEG_TO_RAD;
  const yawRad = cameraLook.yaw * DEG_TO_RAD;
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

  return directionToViewCenter({
    x: directionX,
    y: directionY,
    z: directionZ
  });
}

export function viewCenterToScreenPoint({
  cameraLook,
  horizontalFov,
  maskCenter,
  stage
}: {
  cameraLook: PcViewCenter;
  horizontalFov: number;
  maskCenter: PcViewCenter;
  stage: HTMLElement;
}) {
  const bounds = stage.getBoundingClientRect();
  const aspectRatio = bounds.width && bounds.height ? bounds.width / bounds.height : 16 / 9;
  const pitchRad = maskCenter.pitch * DEG_TO_RAD;
  const yawRad = maskCenter.yaw * DEG_TO_RAD;
  const directionX = Math.sin(yawRad) * Math.cos(pitchRad);
  const directionY = Math.sin(pitchRad);
  const directionZ = -Math.cos(yawRad) * Math.cos(pitchRad);
  const cameraPitchRad = cameraLook.pitch * DEG_TO_RAD;
  const cameraYawRad = cameraLook.yaw * DEG_TO_RAD;
  const cosPitch = Math.cos(cameraPitchRad);
  const sinPitch = Math.sin(cameraPitchRad);
  const cosYaw = Math.cos(cameraYawRad);
  const sinYaw = Math.sin(cameraYawRad);
  const cameraX = directionX * cosYaw + directionZ * sinYaw;
  const pitchedY = directionY * cosPitch + directionZ * sinPitch;
  const pitchedZ = directionY * sinPitch - directionZ * cosPitch;
  const cameraY = pitchedY * cosPitch + pitchedZ * sinPitch;
  const cameraZ = -pitchedY * sinPitch + pitchedZ * cosPitch;

  if (cameraZ >= 0) {
    return null;
  }

  const verticalFovRad = horizontalFov * DEG_TO_RAD;
  const halfHeight = Math.tan(verticalFovRad / 2);
  const normalizedX = cameraX / (halfHeight * aspectRatio * -cameraZ);
  const normalizedY = -cameraY / (halfHeight * -cameraZ);
  const localX = (normalizedX / 2 + 0.5) * bounds.width;
  const localY = (normalizedY / 2 + 0.5) * bounds.height;

  return {
    x: localX + bounds.left,
    y: localY + bounds.top
  };
}
