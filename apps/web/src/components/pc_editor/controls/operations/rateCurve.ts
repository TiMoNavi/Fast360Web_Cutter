export const PC_EDITOR_RATE_MIN = 0.1;
export const PC_EDITOR_RATE_MAX = 5;
export const PC_EDITOR_RATE_DEFAULT = 1;
const PC_EDITOR_RATE_DEFAULT_SNAP_LOG_DISTANCE = Math.log(1.035);

export type PcRateWheelTarget = "effect-speed" | "mask-opacity" | "playback" | "recording" | null;

export function clampRate(rate: number) {
  return Math.min(PC_EDITOR_RATE_MAX, Math.max(PC_EDITOR_RATE_MIN, rate));
}

export function formatRate(rate: number) {
  const fixed = rate < 1 ? rate.toFixed(2) : rate.toFixed(1);
  return fixed.replace(/\.0$/, "").replace(/0$/, "");
}

export function rateFromAdaptiveWheel(currentRate: number, deltaY: number) {
  const current = clampRate(currentRate);
  const direction = deltaY < 0 ? 1 : -1;
  const wheelUnits = Math.min(6, Math.max(0.25, Math.abs(deltaY) / 100));
  const distanceFromDefault =
    current >= PC_EDITOR_RATE_DEFAULT
      ? (current - PC_EDITOR_RATE_DEFAULT) / (PC_EDITOR_RATE_MAX - PC_EDITOR_RATE_DEFAULT)
      : (PC_EDITOR_RATE_DEFAULT - current) / (PC_EDITOR_RATE_DEFAULT - PC_EDITOR_RATE_MIN);
  const edgeGain = Math.pow(Math.min(1, Math.max(0, distanceFromDefault)), 1.35);
  const logStep = (0.018 + edgeGain * 0.095) * wheelUnits;
  const next = clampRate(current * Math.exp(direction * logStep));
  const movingTowardDefault =
    (current > PC_EDITOR_RATE_DEFAULT && direction < 0) ||
    (current < PC_EDITOR_RATE_DEFAULT && direction > 0);
  const crossedDefault =
    (current > PC_EDITOR_RATE_DEFAULT && next < PC_EDITOR_RATE_DEFAULT) ||
    (current < PC_EDITOR_RATE_DEFAULT && next > PC_EDITOR_RATE_DEFAULT);

  if (movingTowardDefault && (crossedDefault || Math.abs(Math.log(next)) <= PC_EDITOR_RATE_DEFAULT_SNAP_LOG_DISTANCE)) {
    return PC_EDITOR_RATE_DEFAULT;
  }

  return next;
}
