# Web App

Next.js app for both flat mobile web and WebXR entrypoints.

## Routes

```text
/
Project landing / route index.

/mobile/videos
Android mobile web placeholder for upload and video list.

/mobile/videos/:videoId
Android mobile web placeholder for video detail, QR link, and cut progress.

/mobile/exports/:exportId
Android mobile web placeholder for export download.

/xr/videos
WebXR video list placeholder.

/xr/videos/:videoId/session/:sessionId
WebXR cut session placeholder.

/xr/dev-check
WebXR browser capability check placeholder.

/xr/hello
Quest / Meta WebXR playback entry. Uses the real browser WebXR session path and excludes desktop simulator/mock controls.

/xr/playback-lab
Desktop playback lab for simulator, MP4/HLS switching, mock-xr smoke tests, debug logs, and emulator fallback.
```

## Environment

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Docs

```text
../../docs/specs/mobile-web.md
../../docs/specs/webxr.md
../../docs/records/webxr-playback-stage.md
```
