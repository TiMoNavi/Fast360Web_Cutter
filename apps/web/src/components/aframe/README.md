# A-Frame Dev and Compatibility Components

The product PC WebXR Editor lives in:

```text
apps/web/src/features/webxr/pc-editor/
```

Most playback/crop/timeline exports in this folder are compatibility wrappers for dev/legacy routes such as:

```text
/xr/aframe-player
/xr/player-ui-lab
```

New product editor code should import from `@/features/webxr/pc-editor`. Keep this folder available for smoke tests, login experiments, and older lab pages.
