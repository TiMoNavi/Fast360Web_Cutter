# A-Frame Core Components

Reusable building blocks extracted from the old `/xr/player` architecture:

- `runtime/AFrameScene` loads A-Frame, creates an embedded `<a-scene>`, installs the camera rig, and exposes scene/session lifecycle callbacks.
- `media/AFrameVideoSphere` owns the hidden HTML video element and maps it onto `<a-videosphere>` for 360 playback.
- `360video_player/AFrame360VideoPlayer` packages scene + video + videosphere playback as a reusable feature component.
- `meta/metaXrCompat` keeps the Meta Quest WebXR session path used by the old player, including the `XRWebGLBinding` to `XRWebGLLayer` fallback.
- `immersive_mode/useMetaImmersiveMode` exposes HTTPS-gated Meta VR entry state and commands without owning UI.

Feature players should compose these components instead of recreating A-Frame script loading, video assets, or Meta session binding.
