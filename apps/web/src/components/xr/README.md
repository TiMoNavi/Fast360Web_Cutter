# Legacy WebXR Components

This folder contains the older Three.js / pmndrs WebXR playback and workbench prototype code.

The current product WebXR surface is now:

```text
apps/web/src/features/webxr/pc-editor/
/xr/player
```

`/xr/videos/:videoId/session/:sessionId` remains as a transitional deep link for explicit-session tests and debugging.

Keep these components for dev/legacy routes and smoke coverage:

```text
/xr/hello
/xr/playback-lab
/xr/workbench
/xr/dev-check
```

New product code should not import from this folder. Put new WebXR editor work under `features/webxr/pc-editor/`, split across `data/`, `webxr/`, `ui/`, and `controls/`.
