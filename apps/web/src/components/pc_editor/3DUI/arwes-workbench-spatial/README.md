# Arwes Workbench Spatial Migration

Source UI:

- `/xr/arwes-workbench-plane-lab`
- `apps/web/src/components/ArwesWorkbenchPlaneLab.tsx`
- `apps/web/src/components/ArwesWorkbenchPlaneLab.module.css`

Player V3 spatial entry:

- `/xr/player-v3`
- `ArwesWorkbenchSpatialTable.tsx`
- The old standalone `/xr/arwes-workbench-spatial-v1` route is not used for validation.

E2E visual probe:

- `apps/web/e2e/player-v3-arwes-workbench.spec.ts`
- Captures `arwes-flat-source.png` and `player-v3-arwes-table.png`.
- Asserts that `/xr/player-v3` does not load the older `arwes-spatial-desk-root` implementation.
- Asserts that the old `PcPlayerControlsSimple` and `HybridSkinPlayerBar` are temporarily not rendered.
- Asserts that base / control / text canvases all contain painted pixels.
- Waits for the A-Frame scene and table planes to have real meshes, then samples the WebGL framebuffer for neon table pixels so a blank screenshot fails the test.

## Current Phase

This is the first visual migration pass. The flat Arwes workbench is converted into a world-space A-Frame surface. The canvas source stays 10:3, while the current spatial table is deliberately stretched wider to read more like a desk/workbench in `/xr/player-v3`.

```text
base canvas:
  glass panel, large frame, grid, section containers

control canvas:
  CUT core, direct buttons, workflow buttons, module buttons, framing screen

text canvas:
  titles, telemetry, button labels, status text
```

The three canvases are mounted as separate transparent planes inside the existing player-v3 A-Frame scene. The table is a world-space object, not a camera-locked screen-space overlay:

```text
base plane    z 0
control plane z 0.014
text plane    z 0.028
hit plane     z 0.04
```

The current desktop pose prioritizes e2e screenshot readability. The XR pose is prepared as a later table-like target below headset origin:

```text
desktop preview:
  position 0 1.05 -0.95
  rotation -58 0 0

XR target:
  position 0 0.92 -0.72
  rotation -72 0 0
```

This keeps the same rule we learned from the player migration: do not expect HTMLMesh or direct DOM capture to preserve complex Arwes gradients, frames, filters, pseudo-elements, and text effects reliably in immersive VR. Convert the visual skin into explicit spatial layers first, then bind interactions.

## Not Done Yet

The current version is not a full interaction port.

Still pending:

- per-button hit planes
- hover / pressed / active state repaint
- controller ray closed loop
- spatial UI grab / move / pin behavior
- mapping each flat `data-action` to real pc-editor commands
- native text replacement for labels that need maximum sharpness
- separate popout module panel for `MORE` actions

## Next Conversion Steps

1. Add rect-based hit planes from `arwesWorkbenchRegions`.
2. Repaint only the control layer on hover / pressed.
3. Split text that must stay crisp into native A-Frame text.
4. Move module `MORE` into a second world-space child panel.
5. Bind real command bus actions after the visual layer is stable.
