import type { PcEditorEventInput } from "../events";
import type { PcEditorCommand } from "./PcEditorCommandBus";

export function mapPcEditorCommandToEvent(command: PcEditorCommand): PcEditorEventInput | null {
  switch (command.type) {
    case "crop.autoRender.set":
      return { type: "editor.render.auto.set", payload: { enabled: command.enabled } };
    case "crop.end":
      return { type: "editor.crop.end", payload: { renderAfterEnd: true } };
    case "crop.render":
      return { type: "editor.render.request" };
    case "crop.start":
      return { type: "editor.crop.start" };
    case "effects.category.toggle":
      return {
        type: "ui.panel.effects.category.toggle",
        payload: { categoryId: command.categoryId, open: command.open }
      };
    case "effects.select":
      return {
        type: "editor.effects.select",
        payload: { categoryId: command.categoryId, effectId: command.effectId, label: command.label }
      };
    case "mask.fov.step":
      return { type: "editor.viewport.fov.step", payload: { delta: command.delta } };
    case "mask.lock.set":
      return { type: "editor.viewport.lock.set", payload: { locked: command.locked } };
    case "mask.opacity.set":
      return {
        type: "editor.mask.opacity.set",
        payload: { durationMs: command.durationMs, opacity: command.opacity }
      };
    case "mask.pitch.step":
      return { type: "editor.viewport.center.step", payload: { pitchDelta: command.delta, yawDelta: 0 } };
    case "mask.yaw.step":
      return { type: "editor.viewport.center.step", payload: { pitchDelta: 0, yawDelta: command.delta } };
    case "overlays.close":
      return { type: "ui.overlay.close" };
    case "panel.effects.collapse.set":
      return { type: "ui.panel.effects.collapse.set", payload: { collapsed: command.collapsed } };
    case "panel.workbench.collapse.set":
      return { type: "ui.panel.workbench.collapse.set", payload: { collapsed: command.collapsed } };
    case "player.next":
      return { type: "player.source.next" };
    case "player.playPause.toggle":
      return { type: "player.playback.toggle" };
    case "player.playbackRate.reset":
      return { type: "player.playback.rate.reset" };
    case "player.previous":
      return { type: "player.source.previous" };
    case "player.recordingRate.reset":
      return { type: "player.recording.rate.reset" };
    case "player.seekTo":
      return { type: "player.playback.seek", payload: { timeMs: command.timeMs } };
    case "playlist.toggle":
      return { type: "player.playlist.toggle" };
    case "timeline.cut":
      return { type: "editor.timeline.cut" };
    case "timeline.discard.begin":
      return { type: "editor.timeline.discard.begin" };
    case "timeline.discard.end":
      return { type: "editor.timeline.discard.end" };
    case "timeline.flush":
      return { type: "editor.timeline.flush", payload: { reason: "live" } };
    default:
      return null;
  }
}
