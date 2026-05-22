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

POST /api/cut-sessions
GET  /api/cut-sessions/:sessionId
PUT  /api/cut-sessions/:sessionId/config
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

The MVP stores data in `storage/app.db`, uploaded videos in `storage/videos`, render outputs in `storage/exports`, temporary render files in `storage/tmp`, and sample videos in `storage/sample-videos`.

All video, session, and export endpoints require the `tid_session` cookie created by the auth endpoints.

Uploads use `UploadFile` today. Supported suffixes are `.mp4`, `.mov`, `.m4v`, `.webm`, and `.mkv`; the default upload limit is 2GB and can be changed with `VIDEO_UPLOAD_MAX_BYTES`.

`effect-events` stores decoupled render events by `eventName`, `startMs`, `endMs`, and `params`. The first supported event names are `fadeBlack`, `fadeOutBlack`, `fadeInBlack`, and `highlight`.

`render-test` is a synchronous development endpoint. It reads stored `ViewPathPoint` rows, interpolates yaw / pitch / FOV per output frame, applies stored effect events, and runs an OpenCV remap from equirectangular 360 video to a capped 1280x720 H.264 MP4 smoke render. The production queue-based 60-second renderer is still future work.

Backend planning and current implementation notes live in `../../docs/specs/backend.md`.
