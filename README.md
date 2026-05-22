# The Invisible Director

WebXR 360 video reframing prototype.

## Current Scope

This repository is currently a working MVP scaffold for the first closed loop:

```text
apps/web
Next.js mobile web and WebXR routes for login, upload, session creation, fixed-path test processing, and export download.

apps/api
FastAPI backend for auth, upload, path patch storage, per-frame 360 remap smoke rendering, and export download.

docs
Architecture notes, implementation specs, and stage records.

references/github
Local shallow clones of reference open-source projects.
```

Documentation starts at:

```text
docs/README.md
```

Current test loop:

```text
/mobile/login -> /mobile/videos -> /mobile/videos/:videoId
-> /xr/videos/:videoId/session/:sessionId
-> fixed orbit render-test -> /mobile/exports/:exportId download
```

## Run

Install frontend dependencies:

```bash
npm install
```

Run the minimal web app locally:

```bash
npm run dev:web
```

Open:

```text
http://localhost:3000
```

Run the web app on the local network, for example for Quest Browser or a phone on the same Wi-Fi:

```bash
npm run dev:web:host
```

If Next.js reports stale `.next` module errors, start from a clean cache:

```bash
npm run dev:web:host:clean
```

Then open this machine's LAN IP at port 3000, for example:

```text
http://192.168.1.23:3000
```

Check the web app:

```bash
npm run typecheck:web
npm run build:web
```

Run local HTTPS for WebXR secure-context testing:

```bash
npm run dev:web:https
```

Open the WebXR environment check page:

```text
http://localhost:3000/xr/dev-check
```

Open the Quest / Meta WebXR playback entry:

```text
http://localhost:3000/xr/hello
```

Open the desktop playback lab for simulator, HLS switching, mock sessions, and smoke testing:

```text
http://localhost:3000/xr/playback-lab
http://localhost:3000/xr/playback-lab?mock-xr=1
```

Use the `Start Simulator` button on `/xr/playback-lab` for the built-in desktop headset simulator. It renders a left-eye/right-eye split view and lets you drag the mouse or use WASD/arrow keys to simulate head movement. The `/xr/hello` route is intentionally kept close to the real Quest path and no longer carries the desktop simulator or mock session UI.

For desktop WebXR simulation, install Meta Immersive Web Emulator in Chrome or Edge, then open DevTools and use the WebXR panel to enable a simulated headset.

Install backend dependencies:

```bash
python -m venv .venv
.venv\Scripts\pip install -r apps/api/requirements.txt
```

Run the API:

```bash
npm run dev:api
```

Prepare a small 360 sample video for upload testing:

```bash
npm run sample:video
```

The sample is written to:

```text
storage/sample-videos/pano.mp4
```
