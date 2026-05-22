# WebXR Workbench UI Prototype

> Legacy note: this file is kept as a prototype stage record. The current organized documentation starts at [`../project-docs/README.md`](../project-docs/README.md). If this file conflicts with `project-docs/` or current code, use the newer source.

Date: 2026-05-23

## Current Effect

`/xr/workbench` is a visual prototype for the WebXR editing workspace. It uses vanilla Three.js plus `@pmndrs/uikit`, with local mock data only. It does not call the real video API and does not replace the current WebXR cut-session route.

The current visual direction is a light spatial UI inspired by Vision Pro:

- White and light gray translucent glass panels.
- Borderless fogged side surfaces at roughly 90% transparency, so they read as atmosphere rather than opaque cards.
- Mostly white/gray icon buttons and toggles, kept intentionally opaque so the actual controls remain legible in headset.
- Buttons are now treated as a separate raised layer above the fogged glass: bright white body, gray cast shadow, black icon/text, and a slight positive Z lift.
- A pale wireframe 360 sphere in the background to imply the video field.
- A light grid floor to give the UI spatial grounding.

The main viewing area is intentionally kept open. The UI avoids placing a large panel in the center, because that area will be occupied by the actual 360 video view.

## Layout

The prototype uses a three-part spatial workbench:

- Left side panel: media library.
  - Mock video list.
  - Current session context.
  - Historical take list.
  - Refresh control and scrollable list area.

- Right side panel: action desk.
  - Low-frequency actions such as export, effect menus, mask style, and session menu.
  - Parameter area for FOV, lock, smooth follow, mask opacity, save state, export state, and sampling state.

- Lower center console: tilted control desk.
  - A long, low, slightly tilted console below the viewing area.
  - Time readout, current rate, current FOV, save state, sampling state, export state, and edit feedback.
  - A pale blue layered-ring visual element, intended to become the always-near timeline/status surface rather than a blocking HUD.
  - The deck is visually closer to a flat control table than a vertical floating window.
  - A raised `Edit Ring` button floats above the deck. Pressing it opens the first radial action prototype.

- Thin transport bar above the lower center console:
  - Height-limited navigation strip.
  - Shows only video progress, previous, play/pause, and next.
  - Does not include Cut, rate, FOV, save, export, or parameter controls.

The center of the user's view remains mostly clear for the future `VideoSphereScene` / 360 playback surface.

The planned first production layout keeps high-frequency editing off the side panels. The side panels provide context and low-frequency settings; the thin transport bar provides video navigation; the lower desk provides edit state and timeline feedback; the center view shows only the 360 video, viewfinder, reticle, and crop mask.

## Interaction Model

All state is local mock state:

- Selecting a mock video updates the active title and duration.
- Play advances the mock timeline in the render loop.
- The thin transport progress bar can seek the mock time.
- Refresh shows a local refresh state and timestamp.
- Save, discard, export, and menu open mock UI states.
- Grid, safe frame, lock, smooth follow, FOV, and sampling are visual-only controls for now.
- The lower console has a mock radial edit ring:
  - Press `Edit Ring` to expand six actions around the pale blue center rings.
  - Hover or drag into a ring action to highlight it.
  - Release or click the action to commit the local mock command.
  - Current actions are Cut, discard/restore, lock/unlock, pause/resume sampling, rewind 5 seconds, and save.
  - Discard mode switches playback to 5x and restores the previous speed when toggled off.

Pointer input is currently forwarded from the browser canvas into the Three.js scene with `@pmndrs/pointer-events`. XR controller rays are not wired yet.

The page now has a real immersive WebXR entry path:

- The Three.js renderer enables `renderer.xr`.
- The renderer uses a `local-floor` reference space.
- The DOM overlay exposes an `Enter VR` button.
- `navigator.xr.requestSession("immersive-vr")` is used when available.
- `setRendererSessionWithLabFallback` is reused so the same session path can work with the Meta/WebXR emulator compatibility layer.

This fixes the earlier prototype problem where the workbench was only a desktop canvas and could not follow headset rotation. In a real Quest Browser or compatible emulator session, the camera should now be driven by the WebXR session instead of the fixed desktop preview camera.

The target WebXR interaction model favors press-drag-release actions over repeated button clicks:

- Hold the right-hand `A` button, or press and hold the right thumbstick, to open the edit radial menu.
- Drag toward a wedge to preview the selected action, then release to confirm it.
- Drag back to the center dead zone or press `B` to cancel without changing the path.
- The first radial menu wedges are Cut, discard/restore, lock/unlock, pause/resume sampling, jump back 5 seconds, and save.
- When the thumbstick is not pressed, right-stick up/down adjusts FOV and right-stick left/right changes playback rate.
- Discard mode switches playback to 5x; restore returns to the previous rate unless the user explicitly picked a new rate.

The target crop preview uses a frosted gray spherical mask over the video sphere with a 16:9 rectangular opening. The opening center maps to `ViewPathPoint.center.yaw/pitch`, and its size maps to `ViewPathPoint.fov.h/fov.v`. Mask opacity and preview effects remain frontend-only preview state unless a future protocol explicitly promotes them.

Controller ownership:

- Trigger held: viewfinder follows the smoothed controller ray or head gaze.
- Trigger released: current yaw, pitch, and FOV are locked.
- Grip drag: move the viewfinder/mask as a single object for fast repositioning.

## Implementation Notes

Key files:

- `apps/web/app/xr/workbench/page.tsx`
- `apps/web/src/components/XrWorkbenchDemo.tsx`
- `apps/web/app/globals.css`
- `apps/web/e2e/webxr-smoke.spec.ts`

New dependencies:

- `@pmndrs/uikit`
- `@pmndrs/uikit-default`
- `@pmndrs/uikit-lucide`
- `@pmndrs/pointer-events`

The UIKit root is a Three.js object in the scene. The left and right panels use absolute positioning inside the UIKit root, while the lower console is a separate tilted panel. The prototype uses English labels inside the 3D UI because the default MSDF font stack is safer for Latin glyphs; the DOM overlay and test state can keep Chinese labels.

Rendering choices for this iteration:

- `renderer.xr.enabled = true`
- `renderer.xr.setReferenceSpaceType("local-floor")`
- `renderer.localClippingEnabled = true`
- `renderer.setTransparentSort(reversePainterSortStable)`
- Scene fog and pale background reinforce the bright frosted look.
- Large side panels use very low alpha and no visible border.
- Buttons, toggles, and selected media cards use stronger opacity for interaction clarity.
- Raised controls use `transformTranslateZ` and `zIndexOffset` so buttons sit above their background surfaces. Gray underlay capsules simulate cast shadows without expensive real-time blur.

## Current Limitations

- This is not connected to real `/api/videos`.
- It does not load a real `VideoTexture`.
- It can request immersive WebXR, but headset/device tuning still needs a real Quest Browser pass.
- It does not use Quest controller rays yet; mouse/canvas pointer events are wired first.
- The radial menu is a UIKit prototype using capsule actions arranged around the center ring. It is not yet a true wedge mesh and does not read `XRInputSource.gamepad` directly.
- The light glass style is intentionally approximate; real Vision Pro blur is not available as cheap true backdrop blur inside WebGL.
- The central ring console is decorative plus control-oriented for now; it is not driven by real timeline or path data yet.

## Next Steps

Recommended next iteration:

1. Replace the background wireframe sphere with the real `VideoSphereScene`, while keeping the central view clear.
2. Move the left/right panels farther outward or make them summonable if they still feel too visible inside headset.
3. Connect the lower console to real player state: play, pause, duration, current time, playback rate.
4. Add XR controller ray pointers using the existing pointer-event foundation and WebXR `XRInputSource.gamepad` data.
5. Turn the blue ring console into a real timeline/status surface: current cut point, sampling activity, path confidence, and export status.
6. Implement the edit radial menu with wedge highlight, release-to-confirm, and center-cancel behavior.
7. Add the frosted crop mask and 16:9 viewfinder opening, backed by `ViewPathPoint.center` and `ViewPathPoint.fov`.
8. Revisit typography with a CJK-capable font path if Chinese labels are required inside the 3D UI.

## Verification

Last verified:

```text
npm run clean:web
npm run typecheck:web
npm run build:web
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm --workspace apps/web run smoke:webxr
```

Result:

```text
7 passed
```

Note: `localhost:3000` had a stale Next.js dev process during this pass, so the clean verification server was started on `127.0.0.1:3001`.
