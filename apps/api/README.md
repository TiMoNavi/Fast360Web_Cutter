# API

FastAPI backend for the shared mobile web and WebXR workflow. It currently provides auth, upload, session/config storage, path/effect patch storage, synchronous smoke rendering, export status, and export download.

## Run

```bash
python -m venv .venv
.venv\Scripts\pip install -r apps/api/requirements.txt
python -m uvicorn app.main:app --reload --app-dir apps/api
```

From the repo root you can also use:

```bash
npm run dev:api
npm run check:api
```

## Endpoints

```text
GET  /health

POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout

GET  /api/videos
POST /api/videos/upload
GET  /api/videos/:videoId

GET  /api/music-tracks
POST /api/music-tracks/upload
GET  /api/music-tracks/:musicId/download

GET  /api/xr/player-session
PUT  /api/xr/player-session

POST /api/cut-sessions
GET  /api/cut-sessions/:sessionId
PUT  /api/cut-sessions/:sessionId/config
GET  /api/cut-sessions/:sessionId/music
PUT  /api/cut-sessions/:sessionId/music
POST /api/cut-sessions/:sessionId/path-patches
POST /api/cut-sessions/:sessionId/effect-events
POST /api/cut-sessions/:sessionId/playback-state
POST /api/cut-sessions/:sessionId/abandon
POST /api/cut-sessions/:sessionId/render-test
GET  /api/cut-sessions/:sessionId/status

GET  /api/exports/:exportId
GET  /api/exports/:exportId/download
```

## Notes

The MVP stores data in `storage/app.db`, uploaded videos in `storage/videos`, uploaded music in `storage/music`, render outputs in `storage/exports`, temporary render files in `storage/tmp`, and sample videos in `storage/sample-videos`.

All video, session, and export endpoints require the `tid_session` cookie created by the auth endpoints.

On startup, the API creates a local demo account unless `DEMO_ACCOUNT_ENABLED=0`:

```text
Email: demo@example.local
Password: demo123456
```

Override these with `DEMO_ACCOUNT_EMAIL` and `DEMO_ACCOUNT_PASSWORD`. The demo
account and newly registered accounts are seeded with demo clips from
`storage/sample-videos/public-360`. Compact committed clips guarantee a fresh
clone has playable media; local 4K clips are optional and skipped when absent.

`/api/xr/player-session` is the state endpoint behind `/xr/player`. `GET` restores the current user's active WebXR cut session, falling back to the most recent valid session or creating one for an available 360 video. `PUT` accepts `{ "videoId": "..." }`, switches the active player state to that video's latest non-abandoned session, or creates a new session for that video.

Uploads use `UploadFile` today. Video import rules live in `app.video_ingest` and are numbered for extension. `.mp4` and `.m4v` are used directly when browser-compatible; `.mov`, `.webm`, `.mkv`, and non-browser-ready MP4 files are normalized into an H.264/AAC MP4 proxy while the original is kept under `storage/videos/originals`. Known camera raw suffixes such as `.insv` and `.360` return explicit conversion guidance instead of pretending to be supported. The default upload limit is 2GB and can be changed with `VIDEO_UPLOAD_MAX_BYTES`.

Music uploads also use `UploadFile`. Supported suffixes are `.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, and `.flac`; the default upload limit is 200MB and can be changed with `MUSIC_UPLOAD_MAX_BYTES`. A cut session can select one music track through `/api/cut-sessions/:sessionId/music`. First-version music playback is deliberately simple: it starts at output 0ms, plays one track straight through, trims long music to the export duration, and pads short music with silence.

`effect-events` stores decoupled render events by `eventName` or `type`, `startMs`, `endMs`, `params`, optional `displayName`, and optional `renderPolicy`. Event names are free strings so timeline fixtures can carry future effects before the renderer supports them. The first renderable names are `transition.fade_black`, `black.solid`, `transition.flash_white`, `filter.color_grade`, `highlight`, `filter.blur`, `filter.vignette`, `filter.chromatic_aberration`, `overlay.letterbox`, and `overlay.text`; unknown events are ignored unless `renderPolicy.fallback` is `fail`.

Frame effects are resolved through `app.rendering.effects` as a small effect registry. Each registered effect declares `namespace`, `phase`, `order`, `priority`, `stackMode`, and optional `conflictGroup`. Active effects are sorted by phase/order before rendering. Within the same `conflictGroup`, only the highest-priority event is applied, with later `seq/startMs` as the tie breaker. `renderPolicy.priority` and `renderPolicy.conflictGroup` can override the defaults for editor-authored events.

`app.timeline_assembler` is the first pure-Python implementation slice for `ViewPathTimeline`. It can compile linear WebXR points plus effect events and optional audio track data into a timeline dictionary with `editSegments`, `viewTracks`, `effectTracks`, `audioTracks`, `effectSystem`, coverage gaps, and build warnings. It is not wired to an HTTP export endpoint or `render-test` yet.

`render-test` is a synchronous development endpoint. It reads stored `ViewPathPoint` rows, interpolates yaw / pitch / FOV per output frame, applies stored effect events, and runs an OpenCV remap from equirectangular 360 video to a capped 1280x720 H.264 MP4 smoke render. If a session music track is enabled, render-test muxes it into the final MP4 after video rendering. The production queue-based 60-second renderer is still future work.

Backend planning and current implementation notes live in `../../docs/specs/backend.md`.
