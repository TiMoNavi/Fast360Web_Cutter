export const EFFECT_SPEED_MIN = 0.1;
export const EFFECT_SPEED_MAX = 5;
export const EFFECT_SPEED_DEFAULT = 1;
export const FRONTEND_PLAYBACK_RATE_DEFAULT = 1;

export type EffectTimingInput = {
  authoredDurationMs?: number | null;
  effectSpeed?: number | null;
  fallbackDurationMs?: number | null;
  minDurationMs?: number;
  params?: Record<string, unknown> | null;
};

export type EffectTiming = {
  authoredDurationMs: number;
  effectSpeed: number;
  semanticDurationMs: number;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readNumberParam(params: Record<string, unknown> | null | undefined, key: string, fallback: number) {
  return finiteNumber(params?.[key]) ?? fallback;
}

export function clampEffectSpeed(rate: number | null | undefined) {
  const safeRate = finiteNumber(rate) ?? EFFECT_SPEED_DEFAULT;
  return Math.min(EFFECT_SPEED_MAX, Math.max(EFFECT_SPEED_MIN, safeRate));
}

export function clampFrontendPlaybackRate(rate: number | null | undefined) {
  const safeRate = finiteNumber(rate) ?? FRONTEND_PLAYBACK_RATE_DEFAULT;
  return Math.max(0.01, safeRate);
}

export function semanticDurationMs(authoredDurationMs: number, effectSpeed: number, minDurationMs = 1) {
  const safeDurationMs = Math.max(1, finiteNumber(authoredDurationMs) ?? 1);
  return Math.max(minDurationMs, Math.round(safeDurationMs / clampEffectSpeed(effectSpeed)));
}

export function scaleTemporalParams(
  params: Record<string, unknown> | null | undefined,
  effectSpeed: number | null | undefined,
  options: { excludeKeys?: string[] } = {}
) {
  if (!params) {
    return params;
  }

  const excluded = new Set(options.excludeKeys ?? []);
  const rate = clampEffectSpeed(effectSpeed);

  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (excluded.has(key) || !key.endsWith("Ms")) {
        return [key, value];
      }

      const numericValue = finiteNumber(value);
      return [key, numericValue === null ? value : semanticDurationMs(numericValue, rate)];
    })
  );
}

export function readEffectTiming({
  authoredDurationMs,
  effectSpeed,
  fallbackDurationMs,
  minDurationMs = 1,
  params
}: EffectTimingInput): EffectTiming {
  const durationMs =
    finiteNumber(authoredDurationMs) ??
    finiteNumber(params?.durationMs) ??
    finiteNumber(fallbackDurationMs) ??
    900;
  const rate = clampEffectSpeed(effectSpeed ?? finiteNumber(params?.effectSpeed));

  return {
    authoredDurationMs: durationMs,
    effectSpeed: rate,
    semanticDurationMs: semanticDurationMs(durationMs, rate, minDurationMs)
  };
}

export function previewElapsedMs(startedAtMs: number, nowMs: number, frontendPlaybackRate: number | null | undefined) {
  return Math.max(0, nowMs - startedAtMs) * clampFrontendPlaybackRate(frontendPlaybackRate);
}

export function previewClockMs(
  startedAtMs: number,
  nowMs: number,
  effectSpeed: number | null | undefined,
  frontendPlaybackRate: number | null | undefined
) {
  return previewElapsedMs(startedAtMs, nowMs, frontendPlaybackRate) * clampEffectSpeed(effectSpeed);
}
