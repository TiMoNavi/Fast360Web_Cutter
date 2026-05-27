"use client";

// Legacy migration bridge. New PC Editor code should emit PcEditorEventBus events
// and use the runtime state pool instead of adding new command-bus commands.
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

export const PC_EDITOR_COMMAND_EVENT = "pc-editor:command";

export type PcEditorCommand =
  | { type: "crop.autoRender.set"; enabled: boolean }
  | { type: "crop.end" }
  | { type: "crop.render" }
  | { type: "crop.start" }
  | { type: "effects.category.toggle"; categoryId: string; open: boolean }
  | { type: "effects.select"; categoryId: string; effectId: string; label: string }
  | { type: "effects.speed.reset" }
  | { type: "mask.fov.step"; delta: number }
  | { type: "mask.lock.set"; locked: boolean }
  | { type: "mask.opacity.set"; durationMs?: number; opacity: number }
  | { type: "mask.pitch.step"; delta: number }
  | { type: "mask.yaw.step"; delta: number }
  | { type: "overlays.close" }
  | { type: "panel.effects.collapse.set"; collapsed: boolean }
  | { type: "panel.workbench.collapse.set"; collapsed: boolean }
  | { type: "player.next" }
  | { type: "player.playPause.toggle" }
  | { type: "player.playbackRate.reset" }
  | { type: "player.previous" }
  | { type: "player.recordingRate.reset" }
  | { type: "player.seekTo"; timeMs: number }
  | { type: "playlist.toggle" }
  | { type: "timeline.cut" }
  | { type: "timeline.discard.begin" }
  | { type: "timeline.discard.end" }
  | { type: "timeline.flush" };

export type PcEditorCommandListener = (command: PcEditorCommand) => void;

export type PcEditorCommandBus = {
  emit: (command: PcEditorCommand) => void;
  subscribe: (listener: PcEditorCommandListener) => () => void;
};

type PcEditorCommandEvent = CustomEvent<PcEditorCommand>;

function createCommandEvent(command: PcEditorCommand): PcEditorCommandEvent {
  return new CustomEvent<PcEditorCommand>(PC_EDITOR_COMMAND_EVENT, {
    detail: command
  });
}

export function createPcEditorCommandBus(): PcEditorCommandBus {
  const target = new EventTarget();

  return {
    emit(command) {
      target.dispatchEvent(createCommandEvent(command));

      if (typeof window !== "undefined") {
        window.dispatchEvent(createCommandEvent(command));
      }
    },
    subscribe(listener) {
      const handleCommand = (event: Event) => {
        listener((event as PcEditorCommandEvent).detail);
      };

      target.addEventListener(PC_EDITOR_COMMAND_EVENT, handleCommand);
      return () => target.removeEventListener(PC_EDITOR_COMMAND_EVENT, handleCommand);
    }
  };
}

export const pcEditorCommandBus = createPcEditorCommandBus();

export function emitPcEditorCommand(command: PcEditorCommand) {
  pcEditorCommandBus.emit(command);
}

export function subscribePcEditorCommand(listener: PcEditorCommandListener) {
  return pcEditorCommandBus.subscribe(listener);
}

const PcEditorCommandBusContext = createContext<PcEditorCommandBus>(pcEditorCommandBus);

export function PcEditorCommandProvider({
  bus,
  children
}: {
  bus?: PcEditorCommandBus;
  children: ReactNode;
}) {
  const scopedBus = useMemo(() => bus ?? createPcEditorCommandBus(), [bus]);

  return (
    <PcEditorCommandBusContext.Provider value={scopedBus}>
      {children}
    </PcEditorCommandBusContext.Provider>
  );
}

export function usePcEditorCommandEmitter() {
  return useContext(PcEditorCommandBusContext).emit;
}

export function usePcEditorCommandSubscription(listener: PcEditorCommandListener) {
  const bus = useContext(PcEditorCommandBusContext);
  const listenerRef = useRef(listener);

  listenerRef.current = listener;

  useEffect(() => {
    return bus.subscribe((command) => listenerRef.current(command));
  }, [bus]);
}
