import type { WebXrSemanticEvent } from "../types";
import { getPcEditorRuntimeState, setPcEditorControlPressed, setPcEditorVrControllerState } from "../../../state";

type Binding = {
  buttonId?: string;
  eventName: string;
  momentary?: boolean;
  pressed?: boolean;
  semanticEvent: WebXrSemanticEvent;
};

const CONTROLLER_BINDINGS: Binding[] = [
  { buttonId: "trigger", eventName: "triggerdown", pressed: true, semanticEvent: { type: "controllerAimStart" } },
  { buttonId: "trigger", eventName: "triggerup", pressed: false, semanticEvent: { type: "controllerAimEnd" } },
  { buttonId: "grip", eventName: "gripdown", pressed: true, semanticEvent: { type: "controllerAimStart" } },
  { buttonId: "grip", eventName: "gripup", pressed: false, semanticEvent: { type: "controllerAimEnd" } },
  { buttonId: "thumbstick-up", eventName: "thumbstickup", momentary: true, pressed: true, semanticEvent: { type: "nudgeFov", deltaH: -5 } },
  { buttonId: "thumbstick-down", eventName: "thumbstickdown", momentary: true, pressed: true, semanticEvent: { type: "nudgeFov", deltaH: 5 } },
  { buttonId: "a", eventName: "abuttondown", momentary: true, pressed: true, semanticEvent: { type: "cutHere" } },
  { buttonId: "b", eventName: "bbuttondown", momentary: true, pressed: true, semanticEvent: { type: "flushPath", reason: "live" } },
  { buttonId: "pinch", eventName: "pinchstarted", pressed: true, semanticEvent: { type: "toggleLock" } },
  { buttonId: "pinch", eventName: "pinchended", pressed: false, semanticEvent: { type: "flushPath", reason: "lock" } }
];

function readControllerHand(event: Event): "left" | "right" {
  const detailHand = (event as CustomEvent<{ hand?: unknown }>).detail?.hand;

  if (detailHand === "left" || detailHand === "right") {
    return detailHand;
  }

  const target = event.target instanceof HTMLElement ? event.target : null;
  const handAttribute = target?.getAttribute("hand") ?? target?.dataset.hand;

  if (handAttribute === "left" || handAttribute === "right") {
    return handAttribute;
  }

  const id = target?.id.toLowerCase() ?? "";
  return id.includes("left") ? "left" : "right";
}

function semanticEventWithHand(event: WebXrSemanticEvent, hand: "left" | "right"): WebXrSemanticEvent {
  if (event.type === "controllerAimStart" || event.type === "controllerAimEnd") {
    return {
      ...event,
      hand
    };
  }

  return event;
}

function writeControllerButtonState(hand: "left" | "right", buttonId: string, pressed: boolean, action: WebXrSemanticEvent["type"]) {
  const currentButtons = getPcEditorRuntimeState().input.vrControllers[hand]?.buttons ?? {};
  const buttons = {
    ...currentButtons,
    [buttonId]: {
      pressed,
      touched: pressed,
      value: pressed ? 1 : 0
    }
  };

  setPcEditorVrControllerState(hand, { buttons });
  setPcEditorControlPressed({
    action,
    id: `vr-${hand}-${buttonId}`,
    pressed,
    sourceKind: "xr-runtime"
  });
}

export function bindAFrameInputEvents(sceneEl: HTMLElement, dispatch: (event: WebXrSemanticEvent) => void) {
  const removers = CONTROLLER_BINDINGS.map(({ buttonId, eventName, momentary, pressed, semanticEvent }) => {
    const listener = (event: Event) => {
      const hand = readControllerHand(event);
      const nextSemanticEvent = semanticEventWithHand(semanticEvent, hand);

      if (buttonId && typeof pressed === "boolean") {
        writeControllerButtonState(hand, buttonId, pressed, nextSemanticEvent.type);
      }

      dispatch(nextSemanticEvent);

      if (buttonId && pressed && momentary) {
        writeControllerButtonState(hand, buttonId, false, nextSemanticEvent.type);
      }
    };

    sceneEl.addEventListener(eventName, listener);
    return () => sceneEl.removeEventListener(eventName, listener);
  });

  return () => {
    removers.forEach((remove) => remove());
  };
}
