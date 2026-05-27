export const PC_MASK_CENTER_FOLLOW_KEY_CODE = "KeyV";
export const PC_MASK_CENTER_FOLLOW_KEY_LABEL = "V";

let pcMaskCenterFollowModeActive = false;

export function setPcMaskCenterFollowMode(active: boolean) {
  pcMaskCenterFollowModeActive = active;
}

export function togglePcMaskCenterFollowMode() {
  pcMaskCenterFollowModeActive = !pcMaskCenterFollowModeActive;
  return pcMaskCenterFollowModeActive;
}

export function isPcMaskCenterFollowModeActive() {
  return pcMaskCenterFollowModeActive;
}

export function isPcMaskCenterFollowKeyPressed() {
  return pcMaskCenterFollowModeActive;
}
