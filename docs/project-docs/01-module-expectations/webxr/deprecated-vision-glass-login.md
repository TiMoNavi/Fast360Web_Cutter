# Deprecated Vision Glass Login

Status: deprecated reference. Do not use as the active XR login visual direction.

## Why This Exists

The XR login page briefly explored an Apple visionOS-inspired glass style: soft
mist, translucent glass panes, lifted buttons, Fresnel-like highlights, and
camera-relative light motion. The result was useful enough to keep as a design
and implementation reference, but it is no longer the active direction.

The archived code lives at:

```text
apps/web/src/components/aframe/AFrameVisionGlassPanelDeprecated.tsx
```

## Technique

The prototype used A-Frame entities and Three.js shader materials instead of DOM
CSS.

Core pieces:

- `deprecated-vision-glass-renderer`
  - Sets ACES filmic tone mapping.
  - Raises exposure so specular highlights can feel brighter before tone mapping.
- `deprecated-vision-glass-layer`
  - Uses rounded-rectangle SDF masks for glass and button shapes.
  - Uses a `mist` variant for soft backing glow.
  - Uses a `glass` variant for the main panel.
  - Uses a `control` variant for raised buttons.
- Per-frame camera-relative lighting
  - Reads the camera position in the local coordinate space of the UI mesh.
  - Converts that into `uViewShift` and `uFresnel`.
  - Uses those uniforms to shift sheen, rim light, and specular response.

## What Worked

- It established a real three-layer spatial model:
  - backing mist,
  - glass body,
  - raised controls.
- It made lighting responsive to camera/headset orientation.
- It proved that A-Frame custom components can own the glass material pipeline.
- It gave us language for future true WebGL glass: SDF masks, inner rim,
  Fresnel, specular bloom, and ACES-style compression.

## Why It Is Deprecated

The visual quality was not predictable enough for the current product stage.

Problems:

- WebGL plane transparency made edges and sorting hard to tune.
- Typography and button radii were harder to make polished than in DOM/CSS.
- Shader iteration was slow compared with CSS glassmorphism.
- The result suggested visionOS but did not achieve the real system-material
  look because there was no true backdrop sampling/refraction pass.

## Reuse Guidance

Use this reference only if we intentionally return to shader-based spatial glass.

If revived, the next version should not stack flat planes. It should use one of:

- a rounded mesh with bevel geometry,
- a framebuffer/refraction pass for true backdrop sampling,
- a shared material module instead of inline component-local shader strings,
- screenshot checks across desktop and headset simulator views.

For current UI work, prefer the DOM/CSS glassmorphism route documented in
`vaporwave-outrun-spatial-ui.md`.
