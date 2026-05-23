import type { WebXrSemanticEvent } from "../types";

type Binding = {
  eventName: string;
  semanticEvent: WebXrSemanticEvent;
};

const CONTROLLER_BINDINGS: Binding[] = [
  { eventName: "triggerdown", semanticEvent: { type: "controllerAimStart" } },
  { eventName: "triggerup", semanticEvent: { type: "controllerAimEnd" } },
  { eventName: "gripdown", semanticEvent: { type: "controllerAimStart" } },
  { eventName: "gripup", semanticEvent: { type: "controllerAimEnd" } },
  { eventName: "thumbstickup", semanticEvent: { type: "nudgeFov", deltaH: -5 } },
  { eventName: "thumbstickdown", semanticEvent: { type: "nudgeFov", deltaH: 5 } },
  { eventName: "abuttondown", semanticEvent: { type: "cutHere" } },
  { eventName: "bbuttondown", semanticEvent: { type: "flushPath", reason: "live" } },
  { eventName: "pinchstarted", semanticEvent: { type: "toggleLock" } },
  { eventName: "pinchended", semanticEvent: { type: "flushPath", reason: "lock" } }
];

export function bindAFrameInputEvents(sceneEl: HTMLElement, dispatch: (event: WebXrSemanticEvent) => void) {
  const removers = CONTROLLER_BINDINGS.map(({ eventName, semanticEvent }) => {
    const listener = () => dispatch(semanticEvent);
    sceneEl.addEventListener(eventName, listener);
    return () => sceneEl.removeEventListener(eventName, listener);
  });

  return () => {
    removers.forEach((remove) => remove());
  };
}
