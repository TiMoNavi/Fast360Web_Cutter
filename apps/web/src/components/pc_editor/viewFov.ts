export const EDITOR_OUTPUT_ASPECT_RATIO = 16 / 9;
export const PC_EDITOR_MIN_VIEWPORT_FOV_H = 35;
export const PC_EDITOR_EXTENDED_MAX_VIEWPORT_FOV_H = 154;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function verticalFovFromHorizontal(
  horizontalFov: number,
  aspectRatio = EDITOR_OUTPUT_ASPECT_RATIO
) {
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : EDITOR_OUTPUT_ASPECT_RATIO;
  const verticalFov = 2 * Math.atan(Math.tan((horizontalFov * DEG_TO_RAD) / 2) / safeAspect) * RAD_TO_DEG;
  return Number(verticalFov.toFixed(2));
}
