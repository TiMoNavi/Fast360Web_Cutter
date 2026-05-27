"use client";

import { useCallback } from "react";
import { useOptionalPcEditorEventEmitter, type PcEditorEventInput } from "../events";
import { usePcEditorCommandEmitter, type PcEditorCommand } from "./PcEditorCommandBus";

export type PcEditorUiEventEmission = {
  event: Pick<PcEditorEventInput, "payload" | "type">;
  fallbackCommand?: PcEditorCommand;
  sourceId?: string;
};

type UsePcEditorUiEventEmitterOptions = {
  legacyCommandFallback?: boolean;
};

export function usePcEditorUiEventEmitter(
  defaultSourceId = "pc-editor-ui",
  { legacyCommandFallback = true }: UsePcEditorUiEventEmitterOptions = {}
) {
  const emitCommand = usePcEditorCommandEmitter();
  const emitEvent = useOptionalPcEditorEventEmitter();

  return useCallback(
    ({ event, fallbackCommand, sourceId }: PcEditorUiEventEmission) => {
      if (emitEvent) {
        emitEvent({
          ...event,
          source: {
            kind: "ui",
            id: sourceId ?? defaultSourceId,
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
