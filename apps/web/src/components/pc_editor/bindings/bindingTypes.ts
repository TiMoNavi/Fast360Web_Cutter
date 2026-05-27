import type { PcEditorEventInput } from "../events";

export type PcEditorTriggerKind = "ui" | "keyboard" | "vr-ray" | "gesture" | "xr-runtime";

export type PcEditorTriggerDescriptor = {
  action: string;
  kind: PcEditorTriggerKind;
  modifiers?: {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
  };
  target: string;
};

export type PcEditorBinding = {
  enabledWhen?: string;
  event: Pick<PcEditorEventInput, "payload" | "type">;
  id: string;
  ignoreRepeat?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  trigger: PcEditorTriggerDescriptor;
};
