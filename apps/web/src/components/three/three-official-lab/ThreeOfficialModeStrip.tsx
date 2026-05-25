"use client";

type ThreeOfficialModeStripProps = {
  followMode: string;
  leftGripModifier: boolean;
  locked: boolean;
  pendingEdit: boolean;
  uiMode: string;
};

export function ThreeOfficialModeStrip({
  followMode,
  leftGripModifier,
  locked,
  pendingEdit,
  uiMode
}: ThreeOfficialModeStripProps) {
  return (
    <>
      <strong>{uiMode}</strong>
      <span>{pendingEdit ? "PENDING" : "READY"}</span>
      <span>{locked ? "LOCKED" : "UNLOCKED"}</span>
      <span>{leftGripModifier ? "OPACITY" : followMode === "controller_ray" ? "RIGHT GRIP" : followMode === "head_gaze" ? "HEAD GAZE" : "STANDBY"}</span>
    </>
  );
}
