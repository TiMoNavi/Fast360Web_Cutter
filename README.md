# The Invisible Director

WebXR 360-degree video reframing prototype. The project lets a user upload an
equirectangular video, open an editor in desktop/mobile/WebXR contexts, record
view-path edits, and render a flat MP4 export from the chosen 360 view.

The repository is arranged so a new contributor can clone it, install
dependencies, run both services, and test the loop with committed sample media.

## What is in the repo

```text
apps/web
  Next.js app for mobile pages, desktop editor labs, WebXR routes, and E2E tests.

apps/api
  FastAPI backend for auth, uploads, session state, view-path/effect patches,
  smoke rendering, music tracks, and export download.

docs
  Architecture notes, current-state docs, test plans, and user-facing guides.

scripts
  Local setup, sample media, cache cleanup, and E2E helper scripts.

storage/sample-videos
  Small committed 360-degree sample clips used for onboarding and testing.
```

Runtime data is deliberately excluded from git: local databases, uploaded
videos, generated exports, logs, Next.js caches, reference clones, and local
HTTPS certificates.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Python 3.11 or newer
- FFmpeg available on `PATH`
- Git

For headset testing, use a browser/device that supports WebXR. For local Quest
testing on another device, both devices need to be on the same network, or you
can use Android `adb reverse`.

## Quick Start

Install JavaScript dependencies from the repo root:

```bash
npm install
```

Create the API virtual environment and install Python dependencies:

```powershell
python -m venv .venv
.venv\Scripts\pip install -r apps/api/requirements.txt
```

Optional, refresh the tiny baseline pano sample:

```bash
npm run sample:video
```

Start the API in one terminal:

```bash
npm run dev:api
```

Start the web app in another terminal:

```bash
npm run dev:web
```

Open the app:

```text
http://localhost:3000
```

The API stores local state in `storage/app.db` and media under `storage/`.
Those files are generated at runtime and are not committed.

## Environment

The web app reads the API base URL from:

```text
apps/web/.env.local
```

Create it from the example if you need to override the default:

```powershell
Copy-Item apps\web\.env.local.example apps\web\.env.local
```

Default value:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Sample 360 Media

Small samples are committed under:

```text
storage/sample-videos/
```

Useful files:

```text
storage/sample-videos/pano.mp4
storage/sample-videos/equirect-grid.mp4
storage/sample-videos/public-360/elevr-relaxatron-mono-960x480-8s.mp4
storage/sample-videos/public-360/valiant-overpass-mono-960x480-4s.mp4
storage/sample-videos/public-360/videojs-shark-mono-960x480-8s.mp4
```

The larger local 4K samples are ignored. Source and license notes for public
clips live in `storage/sample-videos/public-360/SOURCES.md`.

## Main Routes

```text
/mobile/login
  Register or log in.

/mobile/videos
  Upload and browse videos.

/mobile/videos/:videoId
  Video detail page with XR/session links.

/mobile/account/exports
  Export list and download/share entry point.

/xr/videos/:videoId/session/:sessionId
  WebXR editing session.

/xr/three-official-interactive-lab
  Desktop Three.js interaction lab used for current editor iteration.

/xr/dev-check
  Browser/WebXR capability check.
```

## Common Commands

```bash
npm run dev:web          # Next.js dev server on localhost
npm run dev:web:host     # Next.js dev server on the LAN
npm run dev:web:clean    # Clear web caches, then start Next.js
npm run dev:web:https    # Local HTTPS dev server for secure-context testing
npm run dev:api          # FastAPI dev server
npm run typecheck:web    # TypeScript check
npm run build:web        # Next.js production build
npm run test:web         # Web typecheck + build
npm run check:api        # Python compile check
```

## Testing a Fresh Clone

1. Start `npm run dev:api`.
2. Start `npm run dev:web`.
3. Open `http://localhost:3000/mobile/login`.
4. Register a local account.
5. Upload one of the committed sample videos from `storage/sample-videos`.
6. Open the video detail page, create/open a cut session, edit the view path,
   and run the render-test/export flow.
7. Download the generated MP4 from the mobile export page.

For Quest Browser or phone testing, start the web app with:

```bash
npm run dev:web:host
```

Then open this computer's LAN IP at port `3000`, for example:

```text
http://192.168.1.23:3000
```

## Verification Before Pushing

Run these checks before opening a PR or sharing a build:

```bash
npm run typecheck:web
npm run build:web
npm run check:api
```

If a Next.js cache becomes stale, reset it:

```bash
npm run reset:web
```

## Git Hygiene

Keep committed files focused on source, documentation, tests, scripts, and small
sample assets. Do not commit:

```text
node_modules/
apps/web/.next*/
storage/app.db
storage/videos/
storage/exports/
storage/tmp/
logs/
.tmp/
apps/web/certificates/
docs/hackathon-narrative/submission/presentation/
```

Local HTTPS certificates can be regenerated as needed and should remain local.
