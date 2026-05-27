"use client";

import { usePcEditorCommandSubscription } from "@/components/pc_editor/UI/PcEditorCommandBus";
import { mapPcEditorCommandToEvent } from "@/components/pc_editor/UI/pcEditorCommandEventMapping";
import { usePcEditorEventEmitter } from "../events";

export function PcEditorCommandEventBridge() {
  const emit = usePcEditorEventEmitter();

  usePcEditorCommandSubscription((command) => {
    const event = mapPcEditorCommandToEvent(command);

    if (!event) {
      return;
    }

    emit({
      ...event,
      source: {
        kind: "ui",
        id: "pc-editor-command-bus",
        device: "pc"
      }
    });
  });

  return null;
}
