# WebXR Playback Stage Record

> Legacy note: this file is kept as a stage record. The current organized documentation starts at [`../project-docs/README.md`](../project-docs/README.md). If this file conflicts with `project-docs/` or current code, use the newer source.

This record is the current source of truth for the WebXR playback stage after the component isolation pass.

## Current Route Ownership

```text
/xr/hello
Real Meta Quest / WebXR playback entry.
Uses MetaWebXrPlayer.
No desktop simulator, no mock-xr UI, no WebXRBinding fallback.

/xr/playback-lab
Development and regression-test entry.
Uses WebXrPlaybackLab.
Contains desktop stereo simulator, mock-xr automation, MP4/HLS switching, debug log, and XRWebGLBinding fallback.

/xr/dev-check
Browser WebXR environment check.

/xr/workbench
UI prototype for the future WebXR cutting workstation.
```

The important rule: `/xr/hello` is for real Quest testing; `/xr/playback-lab` is for local adapters, mocks, and smoke tests.

## Component Boundaries

Playback code now lives under:

```text
apps/web/src/components/xr/
```

Key components and helpers:

```text
MetaWebXrPlayer.tsx
Real Quest / Meta WebXR player.
Owns navigator.xr.requestSession("immersive-vr") and renderer.xr.setSession(session).
Does not include desktop simulator, mock sessions, or emulator fallback.

WebXrPlaybackLab.tsx
Development lab for desktop simulator, mock-xr, HLS switching, detailed logs, and emulator fallback.

VideoSphereScene.ts
Three.js scene wrapper.
Owns WebGLRenderer, camera, VideoTexture, inside-out sphere, resize handling, and optional desktop stereo controls.

videoSources.ts
Separated source loaders.
createMp4VideoSource handles direct MP4.
createHlsVideoSource handles native HLS or hls.js.

webXrLabCompat.ts
Lab-only compatibility shim for the Chrome/Meta emulator XRWebGLBinding issue.

XrDebugLog.tsx
Debug log renderer used by the playback lab.

types.ts
Shared playback source/status/session types.
```

`apps/web/src/components/HelloWebXR.tsx` is now only a compatibility export to `MetaWebXrPlayer`. New code should import the isolated components directly.

## Real Meta WebXR Path

`/xr/hello` is intentionally small and production-shaped.

Responsibilities:

```text
Create a 360 video source.
Create VideoSphereScene with desktop controls disabled.
Check secure context, navigator.xr, and immersive-vr support.
On user gesture, play the video and request immersive-vr.
Pass the real XRSession directly to Three.js WebXRManager.
Expose minimal status for headset testing.
```

Not allowed in this path:

```text
mock-xr fake sessions
desktop StereoCamera simulator
mouse/WASD local camera adapter
XRWebGLBinding fallback shim
HLS/MP4 source test switching controls
debug log panel by default
```

The real-device entry currently uses the local MP4 fixture:

```text
/api/sample-video
```

Later, replace this with the real video source URL returned by the backend without changing the scene/player structure.

## Playback Lab Path

`/xr/playback-lab` owns all test and compatibility behavior that should not leak into the real Quest route.

Responsibilities:

```text
Desktop stereo preview via StereoCamera.
Mouse drag and WASD/arrow-key view controls.
mock-xr=1 automation mode.
MP4 and HLS source switching.
Detailed debug log.
XRWebGLBinding fallback for desktop emulator compatibility.
```

This route is the target for browser smoke tests that do not require a headset.

## Video Source Model

MP4 and HLS are separate implementations, but both produce the same runtime handle:

```ts
type VideoSourceHandle = {
  videoElement: HTMLVideoElement;
  status: "loading" | "ready" | "playing" | "blocked" | "error";
  play: () => Promise<void>;
  dispose: () => void;
};
```

MP4 source:

```text
createMp4VideoSource
HTMLVideoElement.src = /api/sample-video
Browser performs Range requests.
```

HLS source:

```text
createHlsVideoSource
If native HLS is supported, assign the .m3u8 URL directly.
Otherwise use hls.js.
Destroy hls.js during source disposal.
```

The 360 scene only sees an `HTMLVideoElement`, so it does not care whether the source is MP4, native HLS, or hls.js.

## 360 Scene Model

The reusable scene wrapper builds:

```text
THREE.WebGLRenderer with xr.enabled = true
PerspectiveCamera
HTMLVideoElement -> THREE.VideoTexture
Inside-out SphereGeometry
Optional reference markers
Optional desktop stereo controls
```

The inside-out sphere remains the core 360 playback primitive:

```text
HTMLVideoElement
-> THREE.VideoTexture
-> SphereGeometry scaled by (-1, 1, 1)
-> user/headset camera at the sphere center
```

In real WebXR mode, head pose comes from the browser/headset. Local yaw/pitch controls are only enabled in the playback lab.

## Local Fixture APIs

The sample APIs remain available as development fixtures:

```text
GET /api/sample-video
Serves storage/sample-videos/pano.mp4 with Range support.

GET /api/sample-stream/index.m3u8
GET /api/sample-stream/segment_*.ts
Serves generated HLS VOD files with Range support.
```

Generate HLS fixtures:

```powershell
npm.cmd run sample:stream
```

Output:

```text
storage/sample-streams/pano-hls/index.m3u8
storage/sample-streams/pano-hls/segment_000.ts
...
```

These fixture routes are not the final production video library contract. They exist so playback and stream behavior can be tested before real uploaded video URLs are wired into the player.

## Smoke Coverage

The smoke suite should cover:

```text
/api/sample-video Range returns 206.
/api/sample-stream playlist returns HLS content.
/api/sample-stream TS segment Range returns 206.
/xr/hello renders the real Meta player and excludes lab-only controls.
/xr/playback-lab starts desktop stereo playback.
/xr/playback-lab switches from MP4 to HLS.
/xr/playback-lab?mock-xr=1 completes mock Enter VR.
```

Run:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
npm.cmd --workspace apps/web run smoke:webxr
```

## Local Verification 2026-05-23

Verified on Windows / PowerShell with the current Web app state:

```text
npm.cmd run build:web
npm.cmd run typecheck:web
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3002'
npm.cmd --workspace apps/web run smoke:webxr
```

Result:

```text
build:web passed.
typecheck:web passed when run after build or after a clean Next.js cache.
smoke:webxr passed 7/7 against a fresh dev server on http://127.0.0.1:3002.
```

Observed local pitfall:

```text
An older next start process on http://127.0.0.1:3000 can keep a stale static manifest after a rebuild.
When that happens, /_next/static chunks may return 400 and /xr/workbench renders only SSR text without its canvas.
Use a fresh dev server port, or restart the old next start process after build:web.
```

Recommended full local verification flow:

```powershell
npm.cmd run reset:web
npm.cmd run typecheck:web
npm.cmd run build:web
npm.cmd run reset:web
npm.cmd --workspace apps/web run dev -- --port 3000 --hostname 127.0.0.1
```

## Current Limitations

```text
/xr/hello still uses the sample MP4 fixture rather than a real videoId source URL.
HLS is VOD-style fake streaming, not live streaming.
The real Quest path has not yet been merged into /xr/videos/:videoId/session/:sessionId.
View-path sampling and controller interactions are not part of this playback isolation pass.
The lab fallback should stay lab-only unless a real Quest Browser regression proves it is needed.
```

## Next Integration Step

The next implementation step should wire the isolated playback pieces into the real session route:

```text
/xr/videos/:videoId/session/:sessionId
```

That route should load video metadata from the backend, choose the correct MP4 or HLS source URL, and pass it into `MetaWebXrPlayer` or the underlying source/scene components. Playback should remain separate from future path sampling and controller editing logic.
