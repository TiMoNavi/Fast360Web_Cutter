import {
  createPcEditorEvent,
  type PcEditorEvent,
  type PcEditorEventInput,
  type PcEditorEventName
} from "./eventTypes";

export type PcEditorEventHandler = (event: PcEditorEvent) => void;

export type PcEditorEventBus = {
  emit: (event: PcEditorEvent | PcEditorEventInput) => PcEditorEvent;
  on: (type: PcEditorEventName, handler: PcEditorEventHandler) => () => void;
  onAny: (handler: PcEditorEventHandler) => () => void;
};

export function createPcEditorEventBus(): PcEditorEventBus {
  const listeners = new Map<PcEditorEventName, Set<PcEditorEventHandler>>();
  const anyListeners = new Set<PcEditorEventHandler>();

  return {
    emit(input) {
      const event = createPcEditorEvent(input);
      const typedListeners = listeners.get(event.type);

      if (typedListeners) {
        for (const listener of Array.from(typedListeners)) {
          listener(event);
        }
      }

      for (const listener of Array.from(anyListeners)) {
        listener(event);
      }

      return event;
    },
    on(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }

      listeners.get(type)?.add(handler);
      return () => listeners.get(type)?.delete(handler);
    },
    onAny(handler) {
      anyListeners.add(handler);
      return () => anyListeners.delete(handler);
    }
  };
}
