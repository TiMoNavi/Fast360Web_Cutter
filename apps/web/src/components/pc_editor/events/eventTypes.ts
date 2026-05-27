export type PcEditorEventName =
  | "player.playback.play"
  | "player.playback.pause"
  | "player.playback.toggle"
  | "player.playback.seek"
  | "player.playback.rate.set"
  | "player.playback.rate.reset"
  | "player.recording.rate.set"
  | "player.recording.rate.reset"
  | "player.source.select"
  | "player.source.next"
  | "player.source.previous"
  | "player.source.reload"
  | "player.playlist.open"
  | "player.playlist.close"
  | "player.playlist.toggle"
  | "editor.crop.start"
  | "editor.crop.end"
  | "editor.viewport.fov.set"
  | "editor.viewport.fov.step"
  | "editor.viewport.roll.set"
  | "editor.viewport.roll.step"
  | "editor.viewport.center.set"
  | "editor.viewport.center.step"
  | "editor.viewport.bounds.set"
  | "editor.viewport.lock.set"
  | "editor.camera.center.set"
  | "editor.xr.camera_rig.pose.set"
  | "editor.sphere.fov.set"
  | "editor.sphere.fov.step"
  | "editor.mask.opacity.set"
  | "editor.mask.visible.set"
  | "editor.timeline.cut"
  | "editor.timeline.flush"
  | "editor.timeline.sampling.pause"
  | "editor.timeline.sampling.resume"
  | "editor.timeline.discard.begin"
  | "editor.timeline.discard.end"
  | "editor.timeline.restore.range"
  | "editor.effects.blur.add"
  | "editor.effects.color.add"
  | "editor.effects.transition.add"
  | "editor.effects.params.set"
  | "editor.effects.select"
  | "editor.effects.hold.start"
  | "editor.effects.hold.end"
  | "editor.effects.category.toggle"
  | "editor.effects.speed.set"
  | "editor.effects.speed.reset"
  | "editor.effects.shortcut.open"
  | "editor.effects.shortcut.key.down"
  | "editor.effects.shortcut.key.up"
  | "editor.effects.bgm.set"
  | "editor.effects.bgm.clear"
  | "editor.render.request"
  | "editor.render.completed"
  | "editor.render.cancel"
  | "editor.render.auto.set"
  | "ui.panel.effects.toggle"
  | "ui.panel.effects.collapse.set"
  | "ui.panel.effects.category.toggle"
  | "ui.panel.workbench.toggle"
  | "ui.panel.workbench.collapse.set"
  | "ui.overlay.close"
  | "xr.session.enter"
  | "xr.session.exit"
  | "xr.session.started"
  | "xr.session.ended"
  | "system.error";

export type PcEditorEventSourceKind =
  | "ui"
  | "keyboard"
  | "vr-ray"
  | "gesture"
  | "xr-runtime"
  | "workflow"
  | "system";

export type PcEditorEventSource = {
  device?: "pc" | "quest" | "mobile";
  id?: string;
  kind: PcEditorEventSourceKind;
};

export type PcEditorEventMeta = {
  at: number;
  id: string;
  phase?: "start" | "change" | "end";
  repeat?: boolean;
  traceId?: string;
};

export type PcEditorEvent<TPayload = unknown, TName extends PcEditorEventName = PcEditorEventName> = {
  meta: PcEditorEventMeta;
  payload?: TPayload;
  source: PcEditorEventSource;
  type: TName;
};

export type PcEditorEventInput<TPayload = unknown, TName extends PcEditorEventName = PcEditorEventName> = {
  meta?: Partial<PcEditorEventMeta>;
  payload?: TPayload;
  source?: Partial<PcEditorEventSource> & Pick<PcEditorEventSource, "kind">;
  type: TName;
};

function createEventId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `pc-editor-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createPcEditorEvent(input: PcEditorEvent | PcEditorEventInput): PcEditorEvent {
  const event = input as PcEditorEvent;

  if (event.meta?.id && event.source?.kind) {
    return event;
  }

  const fallbackSource: PcEditorEventSource = {
    kind: "system",
    id: "pc-editor-event-bus"
  };

  return {
    type: input.type,
    payload: input.payload,
    source: {
      ...fallbackSource,
      ...(input.source ?? {})
    },
    meta: {
      at: Date.now(),
      id: createEventId(),
      ...(input.meta ?? {})
    }
  };
}
