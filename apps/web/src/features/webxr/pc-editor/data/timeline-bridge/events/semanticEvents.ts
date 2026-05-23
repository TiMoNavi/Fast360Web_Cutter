import type { WebXrSemanticEvent } from "../types";

export const WEBXR_TIMELINE_EVENT = "webxr:timeline-event";

export function isWebXrSemanticEvent(value: unknown): value is WebXrSemanticEvent {
  return Boolean(value && typeof value === "object" && "type" in value && typeof value.type === "string");
}

export function dispatchWebXrTimelineEvent(event: WebXrSemanticEvent, target: EventTarget = window) {
  target.dispatchEvent(
    new CustomEvent<WebXrSemanticEvent>(WEBXR_TIMELINE_EVENT, {
      detail: event
    })
  );
}

export function bindSemanticTimelineEvents(
  target: EventTarget,
  dispatch: (event: WebXrSemanticEvent) => void
) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (isWebXrSemanticEvent(detail)) {
      dispatch(detail);
    }
  };

  target.addEventListener(WEBXR_TIMELINE_EVENT, listener);
  return () => target.removeEventListener(WEBXR_TIMELINE_EVENT, listener);
}
