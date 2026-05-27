import type { PcEditorBinding } from "./bindingTypes";

export const defaultPcEditorBindings: PcEditorBinding[] = [
  {
    id: "player.playback.toggle.keyboard",
    trigger: { kind: "keyboard", target: "Space", action: "keydown" },
    event: { type: "player.playback.toggle" },
    ignoreRepeat: true,
    preventDefault: true
  },
  {
    id: "player.playback.toggle.ui",
    trigger: { kind: "ui", target: "player-play-toggle", action: "click" },
    event: { type: "player.playback.toggle" }
  },
  {
    id: "player.playback.toggle.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-player-play-toggle", action: "select" },
    event: { type: "player.playback.toggle" }
  },
  {
    id: "player.playback.toggle.dual-trigger",
    trigger: { kind: "xr-runtime", target: "dual-trigger", action: "press" },
    event: { type: "player.playback.toggle" }
  },
  {
    id: "player.playback.seek.ui",
    trigger: { kind: "ui", target: "player-progress", action: "change" },
    event: { type: "player.playback.seek" }
  },
  {
    id: "player.playback.seek.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-player-progress", action: "change" },
    event: { type: "player.playback.seek" }
  },
  {
    id: "editor.crop.start.player-ui",
    trigger: { kind: "ui", target: "player-record-start", action: "click" },
    event: { type: "editor.crop.start" }
  },
  {
    id: "editor.crop.start.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-player-record-start", action: "select" },
    event: { type: "editor.crop.start" }
  },
  {
    id: "editor.crop.end.player-ui",
    trigger: { kind: "ui", target: "player-record-end", action: "click" },
    event: { type: "editor.crop.end" }
  },
  {
    id: "editor.crop.end.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-player-record-end", action: "select" },
    event: { type: "editor.crop.end" }
  },
  {
    id: "player.source.previous.ui",
    trigger: { kind: "ui", target: "player-previous", action: "click" },
    event: { type: "player.source.previous" }
  },
  {
    id: "player.source.previous.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-player-previous", action: "select" },
    event: { type: "player.source.previous" }
  },
  {
    id: "player.source.next.ui",
    trigger: { kind: "ui", target: "player-next", action: "click" },
    event: { type: "player.source.next" }
  },
  {
    id: "player.source.next.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-player-next", action: "select" },
    event: { type: "player.source.next" }
  },
  {
    id: "player.source.select.ui",
    trigger: { kind: "ui", target: "playlist-source-select", action: "click" },
    event: { type: "player.source.select" }
  },
  {
    id: "player.source.select.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-playlist-source-select", action: "select" },
    event: { type: "player.source.select" }
  },
  {
    id: "player.playlist.toggle.ui",
    trigger: { kind: "ui", target: "playlist-toggle", action: "click" },
    event: { type: "player.playlist.toggle" }
  },
  {
    id: "player.playlist.toggle.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-playlist-toggle", action: "select" },
    event: { type: "player.playlist.toggle" }
  },
  {
    id: "player.playlist.close.ui",
    trigger: { kind: "ui", target: "playlist-close", action: "click" },
    event: { type: "player.playlist.close" }
  },
  {
    id: "player.playlist.close.spatial-ui",
    trigger: { kind: "vr-ray", target: "spatial-playlist-close", action: "select" },
    event: { type: "player.playlist.close" }
  },
  {
    id: "timeline.flush.keyboard",
    trigger: { kind: "keyboard", target: "KeyF", action: "keydown" },
    event: { type: "editor.timeline.flush", payload: { reason: "live" } },
    ignoreRepeat: true,
    preventDefault: true
  },
  {
    id: "timeline.discard.begin.keyboard",
    trigger: { kind: "keyboard", target: "Delete", action: "keydown" },
    event: { type: "editor.timeline.discard.begin" },
    ignoreRepeat: true,
    preventDefault: true
  },
  {
    id: "timeline.discard.end.keyboard",
    trigger: { kind: "keyboard", target: "Delete", action: "keyup" },
    event: { type: "editor.timeline.discard.end" },
    preventDefault: true
  },
  {
    id: "crop.start.keyboard",
    trigger: { kind: "keyboard", target: "KeyR", action: "keydown", modifiers: { shift: true } },
    event: { type: "editor.crop.start" },
    ignoreRepeat: true,
    preventDefault: true
  },
  {
    id: "crop.end.keyboard",
    trigger: { kind: "keyboard", target: "KeyR", action: "keydown" },
    event: { type: "editor.crop.end" },
    ignoreRepeat: true,
    preventDefault: true
  },
  {
    id: "player.playlist.toggle.keyboard",
    trigger: { kind: "keyboard", target: "KeyP", action: "keydown" },
    event: { type: "player.playlist.toggle" },
    ignoreRepeat: true,
    preventDefault: true
  },
  {
    id: "viewport.fov.decrease.keyboard",
    trigger: { kind: "keyboard", target: "KeyQ", action: "keydown" },
    event: { type: "editor.viewport.fov.step", payload: { delta: -5 } },
    preventDefault: true
  },
  {
    id: "viewport.fov.increase.keyboard",
    trigger: { kind: "keyboard", target: "KeyE", action: "keydown" },
    event: { type: "editor.viewport.fov.step", payload: { delta: 5 } },
    preventDefault: true
  },
  {
    id: "viewport.roll.counterclockwise.keyboard",
    trigger: { kind: "keyboard", target: "BracketLeft", action: "keydown" },
    event: { type: "editor.viewport.roll.step", payload: { delta: -5 } },
    preventDefault: true
  },
  {
    id: "viewport.roll.clockwise.keyboard",
    trigger: { kind: "keyboard", target: "BracketRight", action: "keydown" },
    event: { type: "editor.viewport.roll.step", payload: { delta: 5 } },
    preventDefault: true
  },
  {
    id: "viewport.yaw.decrease.keyboard",
    trigger: { kind: "keyboard", target: "KeyA", action: "keydown" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: 0, yawDelta: -5 } },
    preventDefault: true
  },
  {
    id: "viewport.yaw.increase.keyboard",
    trigger: { kind: "keyboard", target: "KeyD", action: "keydown" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: 0, yawDelta: 5 } },
    preventDefault: true
  },
  {
    id: "viewport.pitch.increase.keyboard",
    trigger: { kind: "keyboard", target: "KeyW", action: "keydown" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: 5, yawDelta: 0 } },
    preventDefault: true
  },
  {
    id: "viewport.pitch.decrease.keyboard",
    trigger: { kind: "keyboard", target: "KeyS", action: "keydown" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: -5, yawDelta: 0 } },
    preventDefault: true
  },
  {
    id: "viewport.fov.decrease.ui",
    trigger: { kind: "ui", target: "viewport-fov-in", action: "click" },
    event: { type: "editor.viewport.fov.step", payload: { delta: -5 } }
  },
  {
    id: "viewport.fov.increase.ui",
    trigger: { kind: "ui", target: "viewport-fov-out", action: "click" },
    event: { type: "editor.viewport.fov.step", payload: { delta: 5 } }
  },
  {
    id: "viewport.yaw.decrease.ui",
    trigger: { kind: "ui", target: "viewport-yaw-left", action: "click" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: 0, yawDelta: -5 } }
  },
  {
    id: "viewport.yaw.increase.ui",
    trigger: { kind: "ui", target: "viewport-yaw-right", action: "click" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: 0, yawDelta: 5 } }
  },
  {
    id: "viewport.pitch.increase.ui",
    trigger: { kind: "ui", target: "viewport-pitch-up", action: "click" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: 5, yawDelta: 0 } }
  },
  {
    id: "viewport.pitch.decrease.ui",
    trigger: { kind: "ui", target: "viewport-pitch-down", action: "click" },
    event: { type: "editor.viewport.center.step", payload: { pitchDelta: -5, yawDelta: 0 } }
  },
  {
    id: "viewport.roll.counterclockwise.ui",
    trigger: { kind: "ui", target: "viewport-roll-counterclockwise", action: "click" },
    event: { type: "editor.viewport.roll.step", payload: { delta: -5 } }
  },
  {
    id: "viewport.roll.clockwise.ui",
    trigger: { kind: "ui", target: "viewport-roll-clockwise", action: "click" },
    event: { type: "editor.viewport.roll.step", payload: { delta: 5 } }
  },
  {
    id: "viewport.lock.set.ui",
    trigger: { kind: "ui", target: "viewport-lock-toggle", action: "click" },
    event: { type: "editor.viewport.lock.set" }
  },
  {
    id: "mask.opacity.slider.ui",
    trigger: { kind: "ui", target: "mask-opacity-slider", action: "change" },
    event: { type: "editor.mask.opacity.set" }
  },
  {
    id: "mask.opacity.clear.ui",
    trigger: { kind: "ui", target: "mask-opacity-clear", action: "click" },
    event: { type: "editor.mask.opacity.set", payload: { durationMs: 700, opacity: 0 } }
  },
  {
    id: "mask.opacity.deepen.ui",
    trigger: { kind: "ui", target: "mask-opacity-deepen", action: "click" },
    event: { type: "editor.mask.opacity.set", payload: { durationMs: 900, opacity: 0.74 } }
  },
  {
    id: "crop.start.ui",
    trigger: { kind: "ui", target: "crop-start", action: "click" },
    event: { type: "editor.crop.start" }
  },
  {
    id: "crop.end.ui",
    trigger: { kind: "ui", target: "crop-end", action: "click" },
    event: { type: "editor.crop.end" }
  },
  {
    id: "render.auto.set.ui",
    trigger: { kind: "ui", target: "render-auto-toggle", action: "change" },
    event: { type: "editor.render.auto.set" }
  },
  {
    id: "render.request.ui",
    trigger: { kind: "ui", target: "render-request", action: "click" },
    event: { type: "editor.render.request" }
  },
  {
    id: "timeline.cut.ui",
    trigger: { kind: "ui", target: "cut-button", action: "click" },
    event: { type: "editor.timeline.cut" }
  },
  {
    id: "timeline.flush.ui",
    trigger: { kind: "ui", target: "flush-button", action: "click" },
    event: { type: "editor.timeline.flush", payload: { reason: "live" } }
  },
  {
    id: "timeline.discard.begin.ui",
    trigger: { kind: "ui", target: "discard-button", action: "pointerdown" },
    event: { type: "editor.timeline.discard.begin" }
  },
  {
    id: "timeline.discard.end.ui",
    trigger: { kind: "ui", target: "discard-button", action: "pointerup" },
    event: { type: "editor.timeline.discard.end" }
  },
  {
    id: "timeline.cut.vr",
    trigger: { kind: "vr-ray", target: "cut-target", action: "select" },
    event: { type: "editor.timeline.cut" }
  }
];
