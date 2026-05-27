"use client";

import { useEffect, type RefObject } from "react";
import type { AFrame360VideoCommand, AFrame360VideoCommandPayload } from "./types";
import {
  AFRAME_360_VIDEO_CONTROL_EVENT,
  commandFromKeyboard,
  type AFrame360VideoControlEventDetail
} from "./videoControlEvents";
import { setPcEditorControlPressed } from "../state";

type AFrame360VideoControlBridgeProps = {
  runCommand: (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => void | Promise<void>;
  sceneRef: RefObject<HTMLElement | null>;
};

type ControllerPlaceholderEventName =
  | "triggerdown"
  | "abuttondown"
  | "bbuttondown"
  | "thumbstickup"
  | "thumbstickdown";

const CONTROLLER_EVENT_COMMANDS: Record<ControllerPlaceholderEventName, AFrame360VideoCommand> = {
  abuttondown: "next",
  bbuttondown: "previous",
  thumbstickdown: "zoom-out",
  thumbstickup: "zoom-in",
  triggerdown: "toggle-play"
};

export function AFrame360VideoControlBridge({ runCommand, sceneRef }: AFrame360VideoControlBridgeProps) {
  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const command = commandFromKeyboard(event);

      if (!command) {
        return;
      }

      event.preventDefault();
      void runCommand(command);
    }

    function handleWindowCommand(event: Event) {
      const customEvent = event as CustomEvent<AFrame360VideoControlEventDetail>;
      const command = customEvent.detail?.command;

      if (command) {
        void runCommand(command, customEvent.detail.payload);
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener(AFRAME_360_VIDEO_CONTROL_EVENT, handleWindowCommand);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener(AFRAME_360_VIDEO_CONTROL_EVENT, handleWindowCommand);
    };
  }, [runCommand]);

  useEffect(() => {
    const sceneEl = sceneRef.current;

    if (!sceneEl) {
      return;
    }

    const removers = Object.entries(CONTROLLER_EVENT_COMMANDS).map(([eventName, command]) => {
      const listener = () => {
        setPcEditorControlPressed({
          action: command,
          id: `controller-placeholder-${eventName}`,
          pressed: true,
          sourceKind: "xr-runtime"
        });
        void runCommand(command);
        setPcEditorControlPressed({
          action: command,
          id: `controller-placeholder-${eventName}`,
          pressed: false,
          sourceKind: "xr-runtime"
        });
      };
      sceneEl.addEventListener(eventName, listener);
      return () => sceneEl.removeEventListener(eventName, listener);
    });

    return () => {
      removers.forEach((remove) => remove());
    };
  }, [runCommand, sceneRef]);

  return null;
}
