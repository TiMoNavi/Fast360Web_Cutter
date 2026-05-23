# WebXR Spatial Glass UI References

This note records local source references for the A-Frame spatial login/player UI direction.

## Local Reference Repositories

All references are cloned under `references/github/`.

- `immersive-web-emulator`: Meta Quest Immersive Web Emulator source. Use it to understand desktop WebXR runtime injection, DevUI, and synthetic environment behavior.
- `reactGlass`: React glass UI source. Useful files:
  - `src/hooks/useGlassEffect.ts`
  - `src/hooks/useLiquidGlass.ts`
  - `src/components/GlassContainer.tsx`
- `galileo-glass-ui`: React/styled-components glass system. Useful files:
  - `src/core/mixins/glassSurface.ts`
  - `src/theme/ThemeProvider.tsx`
  - `src/theme/tokens.ts`
- `liquid-glass-svelte`: Svelte liquid glass button. Useful files:
  - `GlassedButton.svelte`
- `LiquidGlassReference`: Swift/SwiftUI liquid glass reference notes. Useful file:
  - `README.md`

## Patterns To Bring Into A-Frame

These projects mostly target DOM or SwiftUI, not A-Frame. The reusable ideas are visual rules, not direct code.

- Use glass as a navigation/control layer, not as content.
- Prefer almost borderless surfaces: use faint inset rim highlights instead of visible hard outlines.
- Build glass depth with multiple layers: translucent base, soft shadow, rim highlight, specular highlight, and a thin moving light sweep.
- Make highlights depend on view angle, pointer position, or time. `reactGlass` computes Fresnel-style reflectance and anisotropic blur from view angle.
- For liquid/refraction effects, DOM examples use SVG displacement filters or backdrop filters. In A-Frame, translate this later into a shader/material pass rather than CSS.
- Keep opacity low and text high contrast. The background should remain visible, but the action text must stay readable.
- Use reduced-motion fallbacks. Moving caustics or rotating gradients should be disabled or simplified if performance is weak.

## A-Frame Translation Notes

Current A-Frame UI should stay functional-first, but can approximate the reference style with:

- A translucent base `a-plane` for the panel.
- Very faint white rim planes around the panel instead of a strong border.
- A moving narrow highlight plane with low opacity.
- A larger transparent glow plane behind the control for depth.
- Directional and ambient lights to reveal the panel without making it look like a flat HUD.
- Later: a custom Three.js/A-Frame shader for Fresnel rim light and subtle caustic/refraction texture.

## WebXR Emulator Notes

Meta's Immersive Web Emulator installs a WebXR runtime into the page. A page still needs a user gesture that calls WebXR session entry.

For A-Frame 1.7, bind explicit buttons with `xr-mode-ui`:

```text
xr-mode-ui="enabled: true; XRMode: xr; enterVRButton: #enter-vr; enterARButton: #enter-ar"
```

Do not rely on passive feature detection alone. The emulator/dev UI reacts when the page requests an immersive session.
