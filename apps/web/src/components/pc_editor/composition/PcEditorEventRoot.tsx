"use client";

import type { ReactNode } from "react";
import { PcEditorEventProvider, type PcEditorEventBus } from "../events";
import { PcEditorCommandEventBridge } from "./PcEditorCommandEventBridge";

export function PcEditorEventRoot({
  bridgeLegacyCommands = true,
  bus,
  children
}: {
  bridgeLegacyCommands?: boolean;
  bus?: PcEditorEventBus;
  children: ReactNode;
}) {
  return (
    <PcEditorEventProvider bus={bus}>
      {bridgeLegacyCommands ? <PcEditorCommandEventBridge /> : null}
      {children}
    </PcEditorEventProvider>
  );
}
