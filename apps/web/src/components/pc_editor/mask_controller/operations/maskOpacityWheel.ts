export const MASK_OPACITY_MIN = 0;
export const MASK_OPACITY_MAX = 0.95;

export function clampMaskOpacity(opacity: number) {
  return Math.min(MASK_OPACITY_MAX, Math.max(MASK_OPACITY_MIN, opacity));
}

export function maskOpacityFromWheel(currentOpacity: number, deltaY: number) {
  const direction = deltaY < 0 ? 1 : -1;
  const wheelUnits = Math.min(8, Math.max(0.5, Math.abs(deltaY) / 120));

  return clampMaskOpacity(currentOpacity + direction * 0.035 * wheelUnits);
}
