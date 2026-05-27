# A-Frame Player V2

This folder is the clean component home for the new `/xr/player-v2` interface.

```text
player-v2/
  PlayerV2.tsx              React state shell and layout composition
  ui/
    XrHud.tsx               XR status and entry controls
```

Core layering:

- Next route loads the player model on the server.
- `PlayerV2` owns composition and migration fallback state; shared live values live in the runtime state pool.
- `PlayerV2` uses `@/components/pc_editor/Aframe/360video_player/AFrame360VideoPlayer` for the scene + video + videosphere playback layer.
- Player V2 uses `@/components/pc_editor/mask_controller/AFrameCropViewportRig` for the spherical crop mask.
- Mask runtime changes are written directly by the mask controller into runtime `cropMask`, `viewTarget`, and `maskViewportBounds`.
- UI talks to playback, mask, source, timeline, and render behavior through events/workflows, not direct sibling calls.
- A-Frame creates the Three renderer internally; mask controller components use `AFRAME.THREE` for geometry, shader uniforms, and scene objects.
- WebXR enters through `@/components/pc_editor/Aframe/immersive_mode/useMetaImmersiveMode`, which uses the Meta compatibility path in `meta/`.
