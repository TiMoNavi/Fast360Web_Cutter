# PC WebXR Editor

`/xr/videos/:videoId/session/:sessionId` is the product PC WebXR Editor surface. Keep the URL stable; organize the implementation here.

## Layers

```text
pc-editor/
  data/      session model, video source mapping, timeline bridge transport
  webxr/     A-Frame runtime, scene, videosphere, crop mask, Meta XR compatibility
  ui/        2D screen-space player UI, workbench, opacity controls, debug state
  controls/  semantic editor operations plus PC input adapters
```

`PcWebXrEditor.tsx` should remain the top-level composition point. Do not add new interaction logic directly to it.

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
