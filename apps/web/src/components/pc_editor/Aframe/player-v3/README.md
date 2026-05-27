# A-Frame Player V2

This folder is the clean component home for the new `/xr/player-v2` interface.

```text
player-v2/
  PlayerV2.tsx              React state shell and layout composition
  webxr/
    XrCropMask.tsx          Crop mask entity wrapper
    cropMaskComponents.ts   A-Frame component registration using AFRAME.THREE
  ui/
    XrHud.tsx               XR status and entry controls
    player/                 Playback controls
    editor/                 Edit/workbench panels
```

Core layering:

- Next route loads the player model on the server.
- `PlayerV2` owns React playback/editor state.
- `PlayerV2` uses `@/components/pc_editor/Aframe/360video_player/AFrame360VideoPlayer` for the scene + video + videosphere playback layer.
- External UI talks to the player through `AFrame360VideoPlayerHandle` commands and `onPlaybackStateChange` events.
- A-Frame creates the Three renderer internally; custom crop components use `AFRAME.THREE` for geometry, shader uniforms, and scene objects.
- WebXR enters through `@/components/pc_editor/Aframe/immersive_mode/useMetaImmersiveMode`, which uses the Meta compatibility path in `meta/`.
