export type ThreeOfficialBgmChoice = "ambient-pulse" | "kick-guide" | "none";
export type ThreeOfficialCropWorkflowStatus = "done" | "ending" | "idle" | "ready" | "recording" | "rendering";

export function cropWorkflowLabel(status: ThreeOfficialCropWorkflowStatus) {
  if (status === "recording") {
    return "RECORDING";
  }
  if (status === "ending") {
    return "SEALING";
  }
  if (status === "ready") {
    return "READY TO RENDER";
  }
  if (status === "rendering") {
    return "RENDERING";
  }
  if (status === "done") {
    return "EXPORT READY";
  }
  return "IDLE";
}

export function bgmLabel(choice: ThreeOfficialBgmChoice) {
  if (choice === "ambient-pulse") {
    return "Ambient pulse";
  }
  if (choice === "kick-guide") {
    return "Kick guide";
  }
  return "No BGM";
}

export function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
