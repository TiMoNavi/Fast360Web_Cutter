# PC editor mask controller

This folder is the reusable spherical crop-mask runtime for PC Editor.

It is now used by `/xr/player-v2` through `AFrameCropViewportRig`. The module belongs to the XR Runtime/Mask Controller boundary: it renders the spherical mask and emits runtime mask state, but business behavior still flows through `PcEditorEventBus` and Player V2 workflows.

## Rendering

- `webxr/AFrameCropViewportMask.tsx` registers the A-Frame `pc-crop-viewport-mask` component.
- A-Frame component names in this module use a `pc-` prefix to avoid colliding with older player-v2/player-v3 mask copies.
- `webxr/AFrameCropViewportRig.tsx` nests the rig, the spherical mask, and the four corner handles.
- The mask is a `THREE.SphereGeometry` rendered with `THREE.BackSide`, so it sits on the inside of a sphere around the camera.
- The visible crop window is defined in the fragment shader. `uCenterYaw`, `uCenterPitch`, and `uFov` project the sphere direction into viewport space.
- The rounded corners are controlled by `uCornerRadius` in the shader:

```glsl
vec2 q = abs(viewport) - vec2(1.0) + uCornerRadius;
float roundedRectSdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCornerRadius;
```

`uFeather` softens the edge, and `uOpacity` controls the smoky spherical overlay opacity.

## Controls

- `operations/maskOperations.ts` is legacy-only support for old pages that still dispatch custom events consumed by old A-Frame mask components. Active Player V2 supplies an EventBus-backed `PcMaskOperations` adapter at the composition boundary.
- `inputs/usePcMaskPointerInput.ts` handles click-to-move, drag-to-pan, mask drag, and `V` + left pointer center-follow.
- `inputs/usePcEdgePan.ts` restores the original edge-pan support used while dragging the mask near the viewport edge.
- `inputs/usePcWheelZoom.ts` maps the wheel modifier target `mask-opacity` to opacity changes.
- `webxr/AFrameCropViewportArcs.tsx` draws the four corner handles and emits FOV changes while dragging.
- `webxr/AFrameCropViewportBoundsBroadcaster.tsx` projects the same four corner geometry to screen space and writes the live bounds into the PC editor runtime state store.
- `ui/PcMaskOpacityControls.tsx` is the simple opacity slider and fade buttons.
- The old `useCropMaskRuntimeEventBridge` window-event bridge has been removed from this module. Active Player V2 no longer round-trips mask state through `webxr:crop-mask-change`; the mask writer updates runtime state directly.

## Runtime state store

The mask controller is the source of truth for the live crop viewport. Components that need current values should read the runtime state store instead of recreating mask math locally:

```tsx
import { usePcEditorMaskViewportBounds } from "@/components/pc_editor/state";

const bounds = usePcEditorMaskViewportBounds();
```

`bounds.corners` contains the four crop corners, and `bounds.screenRect` contains the current projected screen rectangle. Effect previews use this to match the real crop-mask range.
The same store also exposes `cropMask` for the raw live mask state and `keyboard.pressed` for current key state.

In Player V2, pointer movement is connected at the composition boundary:

```text
onPointerDown / Move / Up on the XR stage
  -> usePcMaskPointerInput
  -> PcMaskOperations adapter
  -> PcTrajectoryRippleCorrector
  -> PcEditorEventBus editor.viewport.center.*
  -> Workflow State
  -> AFrameCropViewportRig
```

The public barrel is `index.ts`.

## Reusable usage

```tsx
import {
  AFrameCropViewportRig,
  registerAFrameCropViewportMaskComponents
} from "@/components/pc_editor/mask_controller";

registerAFrameCropViewportMaskComponents();

<AFrameCropViewportRig
  sourceVideoId="aframe-360-source-video"
  radius={4.2}
  opacity={0.74}
  fovH={82}
  center={{ yaw: 0, pitch: 0 }}
  locked
  cornerRadius={0.18}
  feather={0.195}
/>;
```
