import type { AFrame360VideoCommand, AFrame360VideoCommandPayload } from "./types";

export const AFRAME_360_VIDEO_CONTROL_EVENT = "aframe-360-video-control";

export type AFrame360VideoControlEventDetail = {
  command: AFrame360VideoCommand;
  payload?: AFrame360VideoCommandPayload;
  source?: "keyboard" | "controller-placeholder" | "dom" | "test";
};

export function dispatchAFrame360VideoCommand(
  command: AFrame360VideoCommand,
  payload?: AFrame360VideoCommandPayload,
  source: AFrame360VideoControlEventDetail["source"] = "dom"
) {
  window.dispatchEvent(
    new CustomEvent<AFrame360VideoControlEventDetail>(AFRAME_360_VIDEO_CONTROL_EVENT, {
      detail: {
        command,
        payload,
        source
      }
    })
  );
}

export function commandFromKeyboard(event: KeyboardEvent): AFrame360VideoCommand | null {
  if (event.code === "Space" || event.code === "KeyK") {
    return "toggle-play";
  }

  if (event.code === "KeyP") {
    return "play";
  }

  if (event.code === "KeyO") {
    return "pause";
  }

  if (event.code === "Equal" || event.code === "NumpadAdd") {
    return "zoom-in";
  }

  if (event.code === "Minus" || event.code === "NumpadSubtract") {
    return "zoom-out";
  }

  if (event.code === "ArrowRight" || event.code === "KeyN") {
    return "next";
  }

  if (event.code === "ArrowLeft" || event.code === "KeyB") {
    return "previous";
  }

  if (event.code === "KeyL") {
    return "reload-list";
  }

  return null;
}

export const CONTROLLER_PLACEHOLDER_BINDINGS = [
  "triggerdown: toggle-play",
  "abuttondown: next",
  "bbuttondown: previous",
  "thumbstickup: zoom-in",
  "thumbstickdown: zoom-out"
];
