"use client";

import { useEffect } from "react";
import { defaultPcEditorBindings, resolvePcEditorBinding, type PcEditorBinding, type PcEditorTriggerDescriptor } from "../bindings";
import { usePcEditorEventEmitter } from "../events";
import { setPcEditorControlPressed, setPcEditorKeyPressed } from "../state";

export type KeyboardEventBindingTarget = Document | HTMLElement | Window;

function createKeyboardTrigger(event: KeyboardEvent, action: "keydown" | "keyup"): PcEditorTriggerDescriptor {
  return {
    kind: "keyboard",
    target: event.code || event.key,
    action,
    modifiers: {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey
    }
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function useKeyboardEventBindings({
  bindings = defaultPcEditorBindings,
  enabled = false,
  target
}: {
  bindings?: PcEditorBinding[];
  enabled?: boolean;
  target?: KeyboardEventBindingTarget | null;
} = {}) {
  const emit = usePcEditorEventEmitter();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const eventTarget = target ?? window;
    const handleKeyboardEvent = (event: KeyboardEvent, action: "keydown" | "keyup") => {
      setPcEditorKeyPressed({
        code: event.code,
        key: event.key,
        pressed: action === "keydown"
      });

      if (isEditableTarget(event.target)) {
        return;
      }

      const trigger = createKeyboardTrigger(event, action);
      const binding = resolvePcEditorBinding(trigger, bindings);
      const controlId = event.code || event.key;

      if (controlId) {
        setPcEditorControlPressed({
          ...(binding ? { action: binding.event.type } : {}),
          id: controlId,
          pressed: action === "keydown",
          sourceKind: "keyboard"
        });
      }

      if (!binding) {
        return;
      }

      if (binding.preventDefault) {
        event.preventDefault();
      }

      if (binding.stopPropagation) {
        event.stopPropagation();
      }

      if (event.repeat && binding.ignoreRepeat) {
        return;
      }

      emit({
        type: binding.event.type,
        payload: binding.event.payload,
        source: {
          kind: "keyboard",
          id: trigger.target,
          device: "pc"
        },
        meta: {
          repeat: event.repeat
        }
      });
    };

    const handleKeyDown = (event: Event) => handleKeyboardEvent(event as KeyboardEvent, "keydown");
    const handleKeyUp = (event: Event) => handleKeyboardEvent(event as KeyboardEvent, "keyup");

    eventTarget.addEventListener("keydown", handleKeyDown, true);
    eventTarget.addEventListener("keyup", handleKeyUp, true);

    return () => {
      eventTarget.removeEventListener("keydown", handleKeyDown, true);
      eventTarget.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [bindings, emit, enabled, target]);
}
