# PC WebXR Editor

`/xr/player` is the target product PC WebXR Editor surface. Keep the product URL stable and organize the implementation here.

Product flows should open `/xr/player`. When a user opens a specific video from a card or detail page, switch the backend active session to that video first, then let the in-page playlist/current source select the matching video.

`/xr/videos/:videoId/session/:sessionId` still exists only as a transitional deep link for explicit-session debugging and limited E2E coverage. Do not build new product assumptions around that path shape; move video/session context into the player data model or backend active-session state instead.

`/xr/player` uses `/api/xr/player-session` to restore the active session. Video switching should restore or create the selected video's own session, then update the editor's active timeline IDs.

## Layers

```text
pc-editor/
  data/      player/session model, video source mapping, timeline bridge transport
  webxr/     A-Frame runtime, scene, videosphere, crop mask, Meta XR compatibility
  ui/        2D screen-space player UI, workbench, opacity controls, debug state
  controls/  semantic editor operations plus PC input adapters
```

Current clarity check:

```text
Clear:
  data/ owns initial player/session models and timeline bridge data.
  webxr/ owns A-Frame scene primitives and crop-mask visuals.
  ui/ owns player/workbench/effects/BGM panels.
  controls/ mostly separates input adapters from semantic operations.

Still mixed:
  PcWebXrEditor.tsx still owns player-session switching, crop workflow, render workflow, and status resets.
  There is no explicit typed event layer yet; commands are split between React callbacks, A-Frame/window events, and operation callbacks.
  Backend workflow code is split between PcWebXrEditor, timeline-bridge, PcBgmControls, and src/lib/api.ts.
```

`PcWebXrEditor.tsx` should remain the top-level composition point. Do not add new interaction logic directly to it. Prefer extracting new flows into event, workflow, backend adapter, or transport modules.

Target dependency direction:

```text
visual player/editor UI
  -> interaction callbacks
  -> typed editor events
  -> workflow hooks
  -> backend adapters
  -> transport in src/lib/api.ts or timeline bridge transport
```

Visual split:

```text
player visual block:
  AFrameEditorScene, video element, videosphere, playback state, playlist, PcPlayerControls.

editor visual block:
  AFrameCropViewportMask, AFrameCropViewportArcs, PcWorkbenchPanel, PcEffectsPanel, PcEffectPreview, PcBgmControls, debug/export state.
```

## Control Boundary

Every interaction must be split into two parts:

```text
semantic operation -> input adapter
```

Examples:

```text
setPreviewFov      <- Q/E keys, workbench buttons, future VR dial
setPreviewCenter   <- W/A/S/D continuous keyboard nudge, future controller nudge
bindMaskAndCameraBy <- disabled PC gesture for now, future grab gesture
moveMaskTo         <- disabled PC gesture for now, future ray target
flushTimeline      <- F key, Flush button, automation
cutHere            <- C key, Cut button, future controller event
```

The operation lives under `controls/operations/`. The adapter lives under `controls/inputs/`. A new PC shortcut, mouse gesture, Playwright driver, or VR controller path should call an existing operation whenever possible instead of duplicating behavior.

Ctrl+drag and Ctrl+Shift+click are intentionally not wired into the active PC editor after the 2026-05-23 interaction review. Keep the operation units available, but redesign the input adapter before enabling that gesture family again.

Rate controls are continuous:

```text
Playback speed: hold T + mouse wheel, 0.1x..5x, updates local video.playbackRate.
Record speed: hold R + mouse wheel, 0.1x..5x, updates recording intent state.
```

Use `operations/rateCurve.ts` for future continuous sliders. The curve changes slowly near the default value and faster near the min/max edges.

## Data Contract

Do not change the backend wire protocol from this feature folder unless the shared contract changes first.

The editor still sends:

```text
ViewPathPatch
EffectEventsPatch
PlaybackClientState
```

In PC mode the timeline bridge uses the crop mask state as the view target source. This keeps the payload aligned with what the user sees through the fixed screen-space mask while the 360 video/camera view moves behind it.

## Legacy Wrappers

Old imports under `src/components/aframe/` are compatibility wrappers for lab routes and smoke tests. New product code should import from `@/features/webxr/pc-editor`.
