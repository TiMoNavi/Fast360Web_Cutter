# Legacy WebXR Components

This folder contains the existing Three.js / pmndrs WebXR playback and workbench prototype code.

The next WebXR direction is documented as an A-Frame-based design under:

```text
docs/project-docs/01-module-expectations/webxr/
```

For new A-Frame experiments, use separate components outside this legacy folder. The first minimal A-Frame sphere player lives in:

```text
apps/web/src/components/aframe/AFrameVideoSpherePlayer.tsx
apps/web/app/xr/aframe-player/page.tsx
```

Do not delete or rewrite these legacy components until the A-Frame path has replaced the existing smoke coverage and business playback route.
