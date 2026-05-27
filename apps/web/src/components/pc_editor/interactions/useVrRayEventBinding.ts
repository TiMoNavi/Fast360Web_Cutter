"use client";

import { useEffect, type RefObject } from "react";
import { defaultPcEditorBindings, resolvePcEditorBinding, type PcEditorBinding } from "../bindings";
import { usePcEditorEventEmitter } from "../events";
import { setPcEditorControlPressed } from "../state";

export type VrRayEventBindingTarget = HTMLElement | SVGElement;

const defaultVrRayEventNames = ["click"];

export function useVrRayEventBinding({
  action = "select",
  bindings = defaultPcEditorBindings,
  enabled = true,
  eventNames = defaultVrRayEventNames,
  targetId,
  targetRef
}: {
  action?: string;
  bindings?: PcEditorBinding[];
  enabled?: boolean;
  eventNames?: string[];
  targetId: string;
  targetRef: RefObject<VrRayEventBindingTarget | null>;
}) {
  const emit = usePcEditorEventEmitter();

  useEffect(() => {
    const target = targetRef.current;

    if (!enabled || !target) {
      return;
    }

    const trigger = { kind: "vr-ray" as const, target: targetId, action };
    const binding = resolvePcEditorBinding(trigger, bindings);

    if (!binding) {
      return;
    }

    const handleSelect = (event: Event) => {
      const pressed = event.type !== "selectend" && event.type !== "mouseup";

      setPcEditorControlPressed({
        action: binding.event.type,
        id: targetId,
        pressed,
        sourceKind: "vr-ray"
      });

      if (binding.preventDefault) {
        event.preventDefault();
      }

      if (binding.stopPropagation) {
        event.stopPropagation();
      }

      emit({
        type: binding.event.type,
        payload: binding.event.payload,
        source: {
          kind: "vr-ray",
          id: targetId,
          device: "quest"
        }
      });

      if (event.type === "click") {
        setPcEditorControlPressed({
          action: binding.event.type,
          id: targetId,
          pressed: false,
          sourceKind: "vr-ray"
        });
      }
    };

    for (const eventName of eventNames) {
      target.addEventListener(eventName, handleSelect);
    }

    return () => {
      for (const eventName of eventNames) {
        target.removeEventListener(eventName, handleSelect);
      }
    };
  }, [action, bindings, emit, enabled, eventNames, targetId, targetRef]);
}
