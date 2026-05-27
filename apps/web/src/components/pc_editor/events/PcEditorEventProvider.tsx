"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPcEditorEventBus, type PcEditorEventBus, type PcEditorEventHandler } from "./eventBus";
import type { PcEditorEventName } from "./eventTypes";

const PcEditorEventBusContext = createContext<PcEditorEventBus | null>(null);

export function PcEditorEventProvider({
  bus,
  children
}: {
  bus?: PcEditorEventBus;
  children: ReactNode;
}) {
  const scopedBus = useMemo(() => bus ?? createPcEditorEventBus(), [bus]);

  return (
    <PcEditorEventBusContext.Provider value={scopedBus}>
      {children}
    </PcEditorEventBusContext.Provider>
  );
}

export function usePcEditorEventBus() {
  const bus = useContext(PcEditorEventBusContext);

  if (!bus) {
    throw new Error("usePcEditorEventBus must be used inside PcEditorEventProvider.");
  }

  return bus;
}

export function useOptionalPcEditorEventBus() {
  return useContext(PcEditorEventBusContext);
}

export function usePcEditorEventEmitter() {
  return usePcEditorEventBus().emit;
}

export function useOptionalPcEditorEventEmitter() {
  return useOptionalPcEditorEventBus()?.emit ?? null;
}

export function usePcEditorEventSubscription(type: PcEditorEventName, handler: PcEditorEventHandler) {
  const bus = usePcEditorEventBus();
  const handlerRef = useRef(handler);

  handlerRef.current = handler;

  useEffect(() => {
    return bus.on(type, (event) => handlerRef.current(event));
  }, [bus, type]);
}

export function usePcEditorAnyEventSubscription(handler: PcEditorEventHandler) {
  const bus = usePcEditorEventBus();
  const handlerRef = useRef(handler);

  handlerRef.current = handler;

  useEffect(() => {
    return bus.onAny((event) => handlerRef.current(event));
  }, [bus]);
}
