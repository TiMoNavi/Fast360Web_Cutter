# WebXR IWE XRWebGLBinding Session Error

This note covers two recurring Meta Immersive Web Emulator / A-Frame failures:

1. `XRWebGLBinding` throws after a real WebXR session is requested.
2. The page appears to enter VR, but it is only A-Frame desktop fullscreen fallback, not the Meta emulator's binocular immersive session.

## Symptom

When opening an A-Frame WebXR page with Meta Immersive Web Emulator enabled, clicking the XR entry button can throw:

```text
Runtime TypeError
Failed to construct 'XRWebGLBinding': parameter 1 is not of type 'XRSession'.
```

Another repeated symptom:

```text
Clicking Start VR makes the page look like a 180-degree or fullscreen view,
but the Meta Immersive Web Emulator does not switch into its binocular XR view.
```

In this second case, the page may show `vr-mode`, but Meta IWE has not received a real `navigator.xr.requestSession("immersive-vr")` path.

## Current Diagnosis

This is not a login UI problem. It happens after the page has already reached the WebXR entry path.

The failure happens inside the Three.js WebXR manager used by A-Frame:

```text
WebXRManager.setSession(session)
new XRWebGLBinding(session, gl)
```

Meta IWE injects a WebXR runtime into desktop Chromium. Some browser/runtime combinations expose `XRWebGLBinding`, so Three.js chooses the WebXR Layers path. The injected session object can then fail the native `XRWebGLBinding` constructor type check.

For the fullscreen-looking failure, the root cause is different:

```text
sceneEl.enterVR()
-> A-Frame checks sceneEl.checkHeadsetConnected() || sceneEl.isMobile
-> desktop Meta IWE can still report no physical headset connected
-> A-Frame skips navigator.xr.requestSession(...)
-> A-Frame calls its desktop fullscreen fallback
```

That fallback can look like "VR started" in the page, but it is not a real Meta IWE immersive session and will not produce the emulator's proper binocular view.

## Project Fix

For A-Frame pages, install a narrow fallback around:

```text
sceneEl.renderer.xr.setSession(session)
```

The fallback:

1. Tries the normal A-Frame/Three.js path first.
2. Only catches errors mentioning both `XRWebGLBinding` and `XRSession`.
3. Temporarily masks `window.XRWebGLBinding`.
4. Retries `setSession` with the same session, forcing Three.js to use the older `XRWebGLLayer` path.
5. Restores `window.XRWebGLBinding` immediately after retry.

Implementation:

```text
apps/web/src/components/aframe/aframeXrCompat.ts
apps/web/src/components/aframe/AFrameLoginExperience.tsx
```

For `/xr/login`, do not use A-Frame's `sceneEl.enterVR()` for the primary Meta path. It can fall back to desktop fullscreen before calling WebXR. Instead, mirror the known-good Three.js playback lab path:

```text
navigator.xr.requestSession("immersive-vr", sceneEl.systems.webxr.sessionConfiguration)
sceneEl.renderer.xr.setSession(session)
sceneEl.addState("vr-mode")
sceneEl.emit("enter-vr")
```

Current implementation:

```text
apps/web/src/components/aframe/AFrameLoginExperience.tsx
apps/web/src/components/aframe/aframeXrCompat.ts
```

The Start VR path should call `requestSession("immersive-vr")` exactly once and should not call `sceneEl.enterVR()`.

The `/xr/login` HUD shows:

```text
XRWebGLBinding fallback armed
```

when the compatibility layer is installed.

## Related Prior Work

The legacy Three.js playback lab had the same class of issue and uses the same idea:

```text
apps/web/src/components/xr/webXrLabCompat.ts
```

## Resolution Record

2026-05-23 confirmation: Meta Immersive Web Emulator itself is working. The known-good baseline remains:

```text
http://127.0.0.1:3010/xr/hello
```

The login page and new A-Frame playback page were fixed by giving their primary Start VR buttons the same real Meta WebXR session path as `/xr/hello`:

```text
navigator.xr.requestSession("immersive-vr", {
  optionalFeatures: ["local-floor", "bounded-floor"]
})
sceneEl.renderer.xr.setSession(session)
renderer.xr.isPresenting === true
```

Confirmed pages:

```text
/xr/login
/xr/aframe-player
```

The important conclusion is that this was not a Meta plugin failure. The repeated failure mode was that A-Frame's convenience entry path could enter a desktop/fullscreen-looking fallback without producing Meta IWE's binocular immersive output. That fallback can still look like a 180-degree VR preview when dragged with the mouse, but it is not a successful Meta XR session.

Current policy:

```text
Use the direct requestSession -> renderer.xr.setSession path for the primary Meta Start VR button.
Keep A-Frame's enterVR path only as an explicit fallback/control comparison.
Treat Meta IWE binocular output plus renderer.xr.isPresenting: true as the acceptance signal.
```

The A-Frame built-in XR UI is therefore not banned globally. It is just not the trusted primary entry point for desktop Meta IWE regression testing, because it can hide the exact failure this document is meant to catch.

## Testing

Automated checks:

```powershell
npm.cmd run typecheck:web
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
npm.cmd --workspace apps/web run smoke:webxr
```

Manual IWE check:

1. Open Chromium with Meta Immersive Web Emulator enabled.
2. Open `http://127.0.0.1:3000/xr/login`.
3. Confirm the HUD says `XRWebGLBinding fallback armed`.
4. Sign in if required.
5. Click `Start VR`.
6. Confirm Meta IWE switches to the emulator's binocular immersive view, not just a fullscreen or 180-degree page view.
7. If `immersive-ar` is supported by the emulator profile, click `Start AR`.

Regression probe for the fullscreen fallback:

```text
Mock navigator.xr.requestSession.
Patch sceneEl.enterVR to count calls.
Click Start VR.
Expected:
- requestSession("immersive-vr") called once.
- sceneEl.renderer.xr.setSession(...) called once.
- sceneEl.enterVR() called zero times.
```

If `sceneEl.enterVR()` is called, the page may regress to A-Frame's desktop fullscreen fallback in Meta IWE.

If the `XRWebGLBinding` error still appears, check whether it happens before or after `setSession`. If it happens before `setSession`, the fallback needs to move earlier in the session entry chain.

## Lessons

Do not treat `vr-mode` state alone as proof that Meta IWE entered real WebXR. For this project, the acceptance signal is:

```text
navigator.xr.requestSession("immersive-vr") succeeds
renderer.xr.setSession(session) succeeds
renderer.xr.isPresenting is true
Meta IWE shows binocular immersive output
```

The old `sceneEl.enterVR()` helper is acceptable on real Quest Browser when A-Frame detects the headset correctly, but it is not reliable enough for the desktop Meta Immersive Web Emulator path used in development.

## False Signals During Debugging

Do not trust mouse-drag 180-degree viewing as a WebXR success signal. That can be plain desktop camera controls or A-Frame fullscreen fallback.

Before debugging Meta IWE, first confirm the page actually hydrated:

```text
The browser Network panel must not show 404 for /_next/static/chunks/app/xr/.../page.js.
The page must contain a canvas.
/xr/hello should move past "Initializing Meta WebXR player...".
```

If a chunk such as the following returns 404, this is a Next dev/cache problem, not a Meta plugin problem:

```text
/_next/static/chunks/app/xr/hello/page.js
/_next/static/chunks/app/xr/login/page.js
```

Common cause: multiple `next dev` processes are writing the same `apps/web/.next` directory. Stop duplicate dev servers, clean `.next`, and restart one server before testing Meta IWE again.

Current `/xr/hello` exposes an explicit diagnostic:

```text
renderer.xr.isPresenting: true
```

This must become `true` after clicking Enter VR with Meta IWE enabled. If it stays `false`, the page is not in a real immersive renderer session even if the view can be dragged with the mouse.
