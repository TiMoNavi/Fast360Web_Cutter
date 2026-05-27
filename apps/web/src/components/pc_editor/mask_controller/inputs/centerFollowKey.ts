import { getPcEditorRuntimeState } from "../../state";

export const PC_MASK_CENTER_FOLLOW_KEY_CODE = "KeyV";
export const PC_MASK_CENTER_FOLLOW_KEY_LABEL = "V";

export function isPcMaskCenterFollowKeyPressed() {
  const pressed = getPcEditorRuntimeState().keyboard.pressed;

  if (pressed[PC_MASK_CENTER_FOLLOW_KEY_CODE]) {
    return true;
  }

  return Object.values(pressed).some((keyState) =>
    keyState.code === PC_MASK_CENTER_FOLLOW_KEY_CODE ||
    keyState.key.toLowerCase() === "v"
  );
}
