# Web App

Next.js app for both flat mobile web and WebXR entrypoints.

## Routes

```text
/
Project landing / route index for core demos and XR entrypoints.

/mobile/login
Flat web login/register page with safe next-path redirect.

/mobile/videos
Flat web video library with public demos, upload, video cards, source downloads, and latest export links.

/mobile/demo/:sampleId
Public 360 sample detail, tutorial, QR entry, and start-demo flow.

/mobile/videos/:videoId
Video detail with 360 preview, metadata, Quest QR link, session actions, and latest export status.

/mobile/account/exports
Export history with status summaries, source-video links, ready downloads, and share actions.

/mobile/exports/:exportId
Export detail with output preview, metadata, failure reason, and MP4 download.

/mobile/favorites
Current quick-access collection view for ready videos and ready exports. Persistent favorites are not wired yet.

/mobile/account/settings
Account settings placeholder for account, export defaults, and WebXR preferences.

/xr/videos
WebXR video list / compatibility entry.

/xr/videos/:videoId/session/:sessionId
Transitional explicit-session WebXR deep link used by compatibility and E2E flows.

/xr/dev-check
WebXR browser capability check placeholder.

/xr/hello
Quest / Meta WebXR playback entry. Uses the real browser WebXR session path and excludes desktop simulator/mock controls.

/xr/playback-lab
Desktop playback lab for simulator, MP4/HLS switching, mock-xr smoke tests, debug logs, and emulator fallback.

/xr/player
Current WebXR PC editor product entry. It restores the backend active player session and switches sessions through `/api/xr/player-session` when the user changes videos.
```

## Environment

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Docs

```text
../../docs/specs/mobile-web.md
../../docs/project-docs/01-module-expectations/web.md
../../docs/project-docs/02-current-state/web.md
../../docs/specs/webxr.md
../../docs/records/webxr-playback-stage.md
```
