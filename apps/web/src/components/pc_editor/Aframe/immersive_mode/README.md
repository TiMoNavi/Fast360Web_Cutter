# Immersive Mode

Meta Quest WebXR entry helpers for A-Frame scenes.

Responsibilities:

- enforce HTTPS before VR entry
- check `navigator.xr`
- check `immersive-vr` support
- bind the XR session to the A-Frame/Three renderer through `requestMetaXrSession`

This layer exposes state and commands only. Feature UI should render its own buttons and labels.
