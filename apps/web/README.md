# Web App Scaffold

Next.js placeholder app for both flat mobile web and WebXR entrypoints.

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
```

## Environment

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Notes

This app currently contains only placeholder screens and shared protocol TypeScript types. Upload UI, WebXR rendering, and API calls are not wired yet.
