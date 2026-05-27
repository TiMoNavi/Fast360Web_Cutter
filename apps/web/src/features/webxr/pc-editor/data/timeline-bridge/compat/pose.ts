import type { AFrameEntityLike, Vector3Like, ViewInputSource, ViewTargetPose } from "../types";

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number) {
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
  return Object.is(nextYaw, -0) ? 0 : nextYaw;
}

export function normalizePitch(pitch: number) {
  return clamp(pitch, -85, 85);
}

function vectorToPose(direction: Vector3Like, input: ViewInputSource): ViewTargetPose {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;

  return {
    input,
    yaw: normalizeYaw(Math.atan2(x, -z) * RAD_TO_DEG),
    pitch: normalizePitch(Math.asin(clamp(y, -1, 1)) * RAD_TO_DEG)
  };
}

type DirectionTarget = Vector3Like & {
  normalize: () => DirectionTarget;
  set: (x: number, y: number, z: number) => DirectionTarget;
};

type AFrameThreeGlobal = typeof globalThis & {
  AFRAME?: {
    THREE?: {
      Vector3?: new () => DirectionTarget;
    };
  };
};

function createDirectionTarget(): DirectionTarget {
  const Vector3Constructor = (globalThis as AFrameThreeGlobal).AFRAME?.THREE?.Vector3;

  if (Vector3Constructor) {
    return new Vector3Constructor();
  }

  return {
    x: 0,
    y: 0,
    z: -1,
    normalize() {
      const length = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= length;
      this.y /= length;
      this.z /= length;
      return this;
    },
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  };
}

function readWorldDirection(entityEl: AFrameEntityLike | null): Vector3Like | null {
  const getWorldDirection = entityEl?.object3D?.getWorldDirection;

  if (!getWorldDirection) {
    return null;
  }

  return getWorldDirection.call(entityEl.object3D, createDirectionTarget());
}

export function readHeadsetPose(cameraEl: AFrameEntityLike | null): ViewTargetPose | null {
  const direction = readWorldDirection(cameraEl);
  return direction ? vectorToPose(direction, "head_gaze") : null;
}

export function readControllerTarget(controllerEl: AFrameEntityLike | null): ViewTargetPose | null {
  const direction = readWorldDirection(controllerEl);
  return direction ? vectorToPose(direction, "controller_ray") : null;
}
