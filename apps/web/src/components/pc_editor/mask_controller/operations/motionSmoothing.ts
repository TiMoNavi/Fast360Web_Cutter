export type PcMotionCenter = {
  pitch: number;
  yaw: number;
};

export type PcMotionVector = {
  pitch: number;
  yaw: number;
};

type PcMotionDirection3 = {
  x: number;
  y: number;
  z: number;
};

export type PcMotionConfig = {
  accelerationDegPerSecond2: number;
  brakeDegPerSecond2: number;
  maxSpeedDegPerSecond: number;
  settleDistanceDeg: number;
  settleSpeedDegPerSecond: number;
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export type PcLineRippleFilterState = {
  anchor: PcMotionCenter | null;
  direction: PcMotionVector | null;
  filteredDelta: PcMotionVector;
};

export const PC_DEFAULT_MOTION_CONFIG: PcMotionConfig = {
  accelerationDegPerSecond2: 420,
  brakeDegPerSecond2: 620,
  maxSpeedDegPerSecond: 160,
  settleDistanceDeg: 0.018,
  settleSpeedDegPerSecond: 0.08
};

export const PC_FAST_MOTION_CONFIG: PcMotionConfig = {
  accelerationDegPerSecond2: 920,
  brakeDegPerSecond2: 1250,
  maxSpeedDegPerSecond: 360,
  settleDistanceDeg: 0.016,
  settleSpeedDegPerSecond: 0.1
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

export function normalizeMotionCenter(center: PcMotionCenter): PcMotionCenter {
  return {
    pitch: normalizePitch(center.pitch),
    yaw: normalizeYaw(center.yaw)
  };
}

export function shortestYawDelta(fromYaw: number, toYaw: number) {
  let delta = normalizeYaw(toYaw) - normalizeYaw(fromYaw);
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  return delta;
}

export function deltaToCenter(from: PcMotionCenter, to: PcMotionCenter): PcMotionVector {
  return {
    pitch: normalizePitch(to.pitch) - normalizePitch(from.pitch),
    yaw: shortestYawDelta(from.yaw, to.yaw)
  };
}

export function addMotionDelta(center: PcMotionCenter, delta: PcMotionVector): PcMotionCenter {
  return normalizeMotionCenter({
    pitch: center.pitch + delta.pitch,
    yaw: center.yaw + delta.yaw
  });
}

function centerToDirection(center: PcMotionCenter): PcMotionDirection3 {
  const normalized = normalizeMotionCenter(center);
  const pitchRad = normalized.pitch * DEG_TO_RAD;
  const yawRad = normalized.yaw * DEG_TO_RAD;
  const cosPitch = Math.cos(pitchRad);

  return {
    x: Math.sin(yawRad) * cosPitch,
    y: Math.sin(pitchRad),
    z: -Math.cos(yawRad) * cosPitch
  };
}

function directionToCenter(direction: PcMotionDirection3): PcMotionCenter {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;

  return normalizeMotionCenter({
    pitch: Math.asin(clampNumber(y, -1, 1)) * RAD_TO_DEG,
    yaw: Math.atan2(x, -z) * RAD_TO_DEG
  });
}

function dotDirections(a: PcMotionDirection3, b: PcMotionDirection3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossDirections(a: PcMotionDirection3, b: PcMotionDirection3): PcMotionDirection3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalizeDirection(direction: PcMotionDirection3): PcMotionDirection3 {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;

  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length
  };
}

function scaleDirection(direction: PcMotionDirection3, scale: number): PcMotionDirection3 {
  return {
    x: direction.x * scale,
    y: direction.y * scale,
    z: direction.z * scale
  };
}

function addDirections(a: PcMotionDirection3, b: PcMotionDirection3): PcMotionDirection3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z
  };
}

function rotateDirectionAroundAxis(direction: PcMotionDirection3, axis: PcMotionDirection3, angleRad: number): PcMotionDirection3 {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const cross = crossDirections(axis, direction);
  const axisDot = dotDirections(axis, direction);

  return normalizeDirection(addDirections(
    addDirections(
      scaleDirection(direction, cos),
      scaleDirection(cross, sin)
    ),
    scaleDirection(axis, axisDot * (1 - cos))
  ));
}

export function sphericalDistanceDeg(from: PcMotionCenter, to: PcMotionCenter) {
  const fromDirection = centerToDirection(from);
  const toDirection = centerToDirection(to);
  const dot = clampNumber(dotDirections(fromDirection, toDirection), -1, 1);

  return Math.acos(dot) * RAD_TO_DEG;
}

export function slerpMotionCenter(from: PcMotionCenter, to: PcMotionCenter, t: number): PcMotionCenter {
  const amount = clampNumber(t, 0, 1);
  const fromDirection = centerToDirection(from);
  const toDirection = centerToDirection(to);
  const dot = clampNumber(dotDirections(fromDirection, toDirection), -1, 1);

  if (dot > 0.9995) {
    return directionToCenter(normalizeDirection({
      x: fromDirection.x + (toDirection.x - fromDirection.x) * amount,
      y: fromDirection.y + (toDirection.y - fromDirection.y) * amount,
      z: fromDirection.z + (toDirection.z - fromDirection.z) * amount
    }));
  }

  if (dot < -0.9995) {
    let axis = crossDirections(fromDirection, { x: 0, y: 1, z: 0 });
    if (Math.hypot(axis.x, axis.y, axis.z) < 0.0001) {
      axis = crossDirections(fromDirection, { x: 1, y: 0, z: 0 });
    }
    return directionToCenter(rotateDirectionAroundAxis(fromDirection, normalizeDirection(axis), Math.PI * amount));
  }

  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  const fromScale = Math.sin((1 - amount) * omega) / sinOmega;
  const toScale = Math.sin(amount * omega) / sinOmega;

  return directionToCenter(normalizeDirection(addDirections(
    scaleDirection(fromDirection, fromScale),
    scaleDirection(toDirection, toScale)
  )));
}

export function vectorLength(vector: PcMotionVector) {
  return Math.hypot(vector.yaw, vector.pitch);
}

export function scaleVector(vector: PcMotionVector, scale: number): PcMotionVector {
  return {
    pitch: vector.pitch * scale,
    yaw: vector.yaw * scale
  };
}

export function normalizeVector(vector: PcMotionVector): PcMotionVector {
  const length = vectorLength(vector);
  if (length <= 0.000001) {
    return { pitch: 0, yaw: 0 };
  }
  return scaleVector(vector, 1 / length);
}

export function dotVectors(a: PcMotionVector, b: PcMotionVector) {
  return a.yaw * b.yaw + a.pitch * b.pitch;
}

function moveToward(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

export function moveVelocityToward(
  current: PcMotionVector,
  target: PcMotionVector,
  maxDelta: number
): PcMotionVector {
  const delta = {
    pitch: target.pitch - current.pitch,
    yaw: target.yaw - current.yaw
  };
  const distance = vectorLength(delta);
  if (distance <= maxDelta || distance <= 0.000001) {
    return target;
  }
  const scale = maxDelta / distance;
  return {
    pitch: current.pitch + delta.pitch * scale,
    yaw: current.yaw + delta.yaw * scale
  };
}

export function axisVelocityStep({
  currentVelocity,
  deltaSeconds,
  targetVelocity,
  accelerationDegPerSecond2,
  brakeDegPerSecond2
}: {
  accelerationDegPerSecond2: number;
  brakeDegPerSecond2: number;
  currentVelocity: number;
  deltaSeconds: number;
  targetVelocity: number;
}) {
  const braking =
    Math.abs(targetVelocity) < 0.001 ||
    Math.sign(targetVelocity) !== Math.sign(currentVelocity);
  const maxDelta = (braking ? brakeDegPerSecond2 : accelerationDegPerSecond2) * deltaSeconds;
  return moveToward(currentVelocity, targetVelocity, maxDelta);
}

export function createLineRippleFilterState(): PcLineRippleFilterState {
  return {
    anchor: null,
    direction: null,
    filteredDelta: { pitch: 0, yaw: 0 }
  };
}

export function resetLineRippleFilter(state: PcLineRippleFilterState, anchor?: PcMotionCenter) {
  state.anchor = anchor ? normalizeMotionCenter(anchor) : null;
  state.direction = null;
  state.filteredDelta = { pitch: 0, yaw: 0 };
}

export function correctLineRippleDelta(
  state: PcLineRippleFilterState,
  rawDelta: PcMotionVector,
  options: {
    deadzoneDeg?: number;
    lineLockStrength?: number;
    lowPassAlpha?: number;
    reorientDotThreshold?: number;
  } = {}
): PcMotionVector {
  const deadzoneDeg = options.deadzoneDeg ?? 0.012;
  const lineLockStrength = clampNumber(options.lineLockStrength ?? 0.55, 0, 1);
  const lowPassAlpha = clampNumber(options.lowPassAlpha ?? 0.62, 0, 1);
  const reorientDotThreshold = options.reorientDotThreshold ?? 0.64;
  const magnitude = vectorLength(rawDelta);

  if (magnitude < deadzoneDeg) {
    return { pitch: 0, yaw: 0 };
  }

  const rawDirection = normalizeVector(rawDelta);
  if (!state.direction || dotVectors(state.direction, rawDirection) < reorientDotThreshold) {
    state.direction = rawDirection;
  }

  const along = dotVectors(rawDelta, state.direction);
  const lineDelta = scaleVector(state.direction, along);
  const corrected = {
    pitch: lineDelta.pitch * lineLockStrength + rawDelta.pitch * (1 - lineLockStrength),
    yaw: lineDelta.yaw * lineLockStrength + rawDelta.yaw * (1 - lineLockStrength)
  };

  state.filteredDelta = {
    pitch: state.filteredDelta.pitch + (corrected.pitch - state.filteredDelta.pitch) * lowPassAlpha,
    yaw: state.filteredDelta.yaw + (corrected.yaw - state.filteredDelta.yaw) * lowPassAlpha
  };

  return state.filteredDelta;
}

export function stepTowardTarget({
  config,
  current,
  deltaSeconds,
  target,
  velocity
}: {
  config: PcMotionConfig;
  current: PcMotionCenter;
  deltaSeconds: number;
  target: PcMotionCenter;
  velocity: PcMotionVector;
}): {
  center: PcMotionCenter;
  done: boolean;
  velocity: PcMotionVector;
} {
  const delta = deltaToCenter(current, target);
  const distance = sphericalDistanceDeg(current, target);
  const speed = vectorLength(velocity);

  if (
    distance <= config.settleDistanceDeg &&
    speed <= config.settleSpeedDegPerSecond
  ) {
    return {
      center: normalizeMotionCenter(target),
      done: true,
      velocity: { pitch: 0, yaw: 0 }
    };
  }

  const direction = normalizeVector(delta);
  const brakeLimitedSpeed = Math.sqrt(Math.max(0, 2 * config.brakeDegPerSecond2 * distance));
  const desiredSpeed = Math.min(config.maxSpeedDegPerSecond, brakeLimitedSpeed);
  const desiredVelocity = scaleVector(direction, desiredSpeed);
  const accelerating = dotVectors(desiredVelocity, velocity) >= 0 && vectorLength(desiredVelocity) >= speed;
  const maxVelocityDelta = (accelerating ? config.accelerationDegPerSecond2 : config.brakeDegPerSecond2) * deltaSeconds;
  const nextVelocity = moveVelocityToward(velocity, desiredVelocity, maxVelocityDelta);
  const maxStepScale = distance > 0.000001 ? Math.min(1, vectorLength(nextVelocity) * deltaSeconds / distance) : 1;

  return {
    center: slerpMotionCenter(current, target, maxStepScale),
    done: false,
    velocity: nextVelocity
  };
}
