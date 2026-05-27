# A-Frame 360 Video Player

Reusable 360 video playback component copied out of the old `/xr/player` pattern.

It packages:

- A-Frame runtime scene creation through `AFrameScene`
- hidden HTML `<video>` loading
- `<a-videosphere>` mapping for equirectangular 360 playback
- playback state events for play, pause, metadata, and time updates
- child slot support for nested A-Frame entities such as crop masks or controller UI
- imperative handle commands for external UI: `play`, `pause`, `togglePlay`, `seekTo`, `setMuted`

Use this folder for the 360 playback layer. Keep Meta session compatibility in the parent `Aframe` folder so player shells can decide when to enter VR.
