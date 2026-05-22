# WebXR Playback Component Boundaries

> Legacy note: this file is kept as historical playback-boundary material. The current organized documentation starts at [`../project-docs/README.md`](../project-docs/README.md). If this file conflicts with `project-docs/` or current code, use the newer source.

This document records the current component isolation boundary for WebXR playback. It complements the broader black-box boundary docs.

## Route Boundary

```text
/xr/hello
Real-device Meta WebXR playback route.
Only real browser WebXR session logic belongs here.

/xr/playback-lab
Development and regression route.
Desktop simulator, mock sessions, debug logs, source switching, and emulator fallbacks belong here.
```

This split prevents local adapters and testing exceptions from leaking into the Quest path.

## Component Boundary

```text
MetaWebXrPlayer
Production-shaped player for Quest / Meta WebXR.
Allowed: requestSession, renderer.xr.setSession, minimal status UI, video playback gesture.
Not allowed: mock-xr, desktop simulator, XRWebGLBinding fallback, source switching lab UI.

VideoSphereScene
Reusable Three.js 360 scene.
Allowed: renderer, camera, VideoTexture, inside-out sphere, resize, optional dev controls.
Not allowed: API calls, videoId/session business logic, path patch submission.

Mp4/Hls video source helpers
Reusable source loaders.
Allowed: HTMLVideoElement creation, HLS attach/destroy, playback status.
Not allowed: WebXR session state, Three.js rendering, business session state.

WebXrPlaybackLab
Dev/test container.
Allowed: desktop StereoCamera preview, mock-xr, fallback shim, HLS/MP4 switching, debug logs.
Not allowed: becoming the production route or being imported by mobile/business UI.
```

## Fixture Boundary

```text
/api/sample-video
/api/sample-stream/[...path]
```

These are development fixtures for playback validation. They are not the long-term production video source contract.

Production playback should eventually receive a backend-owned source URL from video/session metadata and pass that into the same source helpers.

## Import Rule

Production WebXR playback may import:

```text
MetaWebXrPlayer
VideoSphereScene
videoSources
types
```

Production WebXR playback must not import:

```text
WebXrPlaybackLab
webXrLabCompat
XrDebugLog by default
```

Smoke tests can import or route through lab behavior indirectly by visiting `/xr/playback-lab`.
