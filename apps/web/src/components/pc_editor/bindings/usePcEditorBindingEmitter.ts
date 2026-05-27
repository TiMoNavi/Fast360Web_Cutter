"use client";

import { useCallback } from "react";
import { useOptionalPcEditorEventEmitter, type PcEditorEventInput } from "../events";
import { usePcEditorCommandEmitter, type PcEditorCommand } from "../UI/PcEditorCommandBus";
import { defaultPcEditorBindings } from "./defaultBindings";
import { resolvePcEditorBinding } from "./resolveBinding";
import type { PcEditorBinding, PcEditorTriggerDescriptor } from "./bindingTypes";

export type PcEditorBoundTriggerEmission = {
  bindings?: PcEditorBinding[];
  fallbackCommand?: PcEditorCommand;
  fallbackEvent?: Pick<PcEditorEventInput, "payload" | "type">;
  payload?: unknown;
  sourceId?: string;
  trigger: PcEditorTriggerDescriptor;
};

type UsePcEditorBindingEmitterOptions = {
  legacyCommandFallback?: boolean;
};

export function usePcEditorBindingEmitter(
  defaultSourceId = "pc-editor-binding",
  { legacyCommandFallback = true }: UsePcEditorBindingEmitterOptions = {}
) {
  const emitCommand = usePcEditorCommandEmitter();
  const emitEvent = useOptionalPcEditorEventEmitter();

  return useCallback(
    ({
      bindings = defaultPcEditorBindings,
      fallbackCommand,
      fallbackEvent,
      payload,
      sourceId,
      trigger
    }: PcEditorBoundTriggerEmission) => {
      const binding = resolvePcEditorBinding(trigger, bindings);
      const event = binding
        ? {
            type: binding.event.type,
            payload: payload ?? binding.event.payload
          }
        : fallbackEvent;

      if (emitEvent && event) {
        emitEvent({
          ...event,
          source: {
            kind: trigger.kind === "ui" ? "ui" : trigger.kind,
            id: sourceId ?? `${defaultSourceId}:${trigger.target}`,
            device: "pc"
          }
        });
        return;
      }

      if (legacyCommandFallback && fallbackCommand) {
        emitCommand(fallbackCommand);
      }
    },
    [defaultSourceId, emitCommand, emitEvent, legacyCommandFallback]
  );
}
