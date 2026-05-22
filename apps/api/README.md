# API

FastAPI backend for shared mobile web, WebXR, upload, fixed-path smoke rendering, and export download workflows.

## Run

```bash
python -m venv .venv
.venv\Scripts\pip install -r apps/api/requirements.txt
python -m uvicorn app.main:app --reload --app-dir apps/api
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
POST /api/cut-sessions/:sessionId/playback-state
POST /api/cut-sessions/:sessionId/abandon
POST /api/cut-sessions/:sessionId/render-test
GET  /api/cut-sessions/:sessionId/status

GET  /api/exports/:exportId
GET  /api/exports/:exportId/download
```

## Notes

The MVP stores data in `storage/app.db`, uploaded videos in `storage/videos`, smoke-test exports in `storage/exports`, and sample videos in `storage/sample-videos`.

`render-test` is a synchronous development endpoint. It uses stored `ViewPathPoint` rows and chunked FFmpeg `v360` projections to export a capped 1280x720 H.264 MP4 smoke render. The production queue-based 60-second renderer is still future work.
