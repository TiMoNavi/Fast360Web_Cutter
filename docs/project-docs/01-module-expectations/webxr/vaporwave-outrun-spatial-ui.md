# Vaporwave / Outrun Spatial UI Direction

Status: active visual direction for the XR login experiment.

## Goal

Turn the XR login experience into a retro-futuristic spatial terminal:
neon, CRT texture, perspective grids, glowing controls, and layered glass. This
direction prioritizes fast visual iteration and strong style over physically
accurate visionOS glass.

## Current System Context

Tech stack:

- Next.js app router.
- React / TSX components.
- Global CSS in `apps/web/app/globals.css`.
- A-Frame for XR background, session entry, controllers, and camera.
- DOM overlay for the current login card and controls.

Current component:

```text
apps/web/src/components/aframe/AFrameLoginExperience.tsx
```

The active page already uses a DOM glass card over an A-Frame background. This
is the right foundation for Vaporwave because CSS handles typography, glow,
hover states, scanlines, and pseudo-elements better than the previous shader
route.

## Visual Principles

The design should feel like:

```text
Digital nostalgia meets neon future.
An XR login terminal from a synthetic 1980s vision of 2088.
```

Core traits:

- dark purple void,
- cyan and magenta neon borders,
- sunset orange accent light,
- CRT scanlines and subtle RGB distortion,
- terminal language and monospace labels,
- theatrical hover states,
- visible layer depth through glow and transform.

## Token Direction

Use CSS variables local to the XR login page first. Promote them later only if
the style spreads to more WebXR screens.

```css
--vapor-bg: #090014;
--vapor-panel: rgba(26, 16, 60, 0.78);
--vapor-text: #e0e0e0;
--vapor-cyan: #00ffff;
--vapor-magenta: #ff00ff;
--vapor-orange: #ff9900;
--vapor-border: #2d1b4e;
```

Typography plan:

- Prefer `Orbitron` for major headings if we add font loading.
- Prefer `Share Tech Mono` or the existing monospace stack for labels/buttons.
- Until web fonts are added, use CSS fallback stacks and keep text readable.

## Layer Plan

Back to front:

1. A-Frame geometric 360 background.
2. Dark purple gradient wash.
3. Perspective neon grid floor.
4. Large blurred sunset orb.
5. Cyan/magenta side light beams.
6. Main login terminal card.
7. Raised neon buttons.
8. CRT scanline and subtle chromatic overlay.

## Component Plan

Keep the active implementation in `AFrameLoginExperience.tsx` for now:

- A-Frame scene remains responsible for XR runtime behavior.
- DOM overlay owns the login card and visual treatment.
- CSS classes should be renamed toward the new direction:
  - `xr-vapor-stage`
  - `xr-vapor-grid`
  - `xr-vapor-sun`
  - `xr-vapor-scanlines`
  - `xr-vapor-card`
  - `xr-vapor-button`
  - `xr-vapor-terminal-row`

If the design stabilizes, extract the DOM card into a separate component:

```text
apps/web/src/components/aframe/XrVaporwaveLoginOverlay.tsx
```

## Motion Plan

Use CSS motion first:

- scanlines drift subtly,
- grid slowly scrolls toward the viewer,
- sunset orb breathes with scale and opacity,
- card has a slow neon light sweep,
- buttons skew and un-skew on hover,
- active controls intensify glow,
- terminal cursor blinks.

Respect `prefers-reduced-motion`:

- disable grid scrolling,
- disable shimmer sweeps,
- keep hover color changes.

## Accessibility Notes

- The DOM login card should remain keyboard-operable.
- Buttons must stay real `<button>` elements.
- Do not let scanlines reduce text contrast below readable levels.
- Keep XR status/debug controls separate from the visual login card.

## First Implementation Slice

Do this before adding more complexity:

1. Add page-local CSS variables for Vaporwave tokens.
2. Replace light glass card colors with dark purple/cyan/magenta treatment.
3. Add perspective grid and sunset orb layers.
4. Add CRT scanline overlay.
5. Convert buttons to skewed neon controls with strong hover states.
6. Screenshot desktop and mobile sizes.

Avoid in the first slice:

- WebGL shader glass,
- real refraction,
- audio,
- external animation libraries,
- broad app-wide style changes.

## Combined Spatial Neon Prompt

Use this prompt when asking an implementation agent or design agent to redesign
the XR login UI. It combines lessons from the deprecated Apple/visionOS glass
prototype with the active Vaporwave / Outrun design system.

```text
You are an expert frontend engineer, UI/UX designer, visual design specialist,
typography expert, and spatial interface designer.

Your task is to redesign the XR login UI for a Next.js + React + A-Frame WebXR
application. The current app uses:

- Next.js app router.
- React/TSX components.
- Global CSS in apps/web/app/globals.css.
- A-Frame for the XR scene, geometric/passthrough background, WebXR entry,
  controllers, cursor, and camera.
- A DOM overlay for the login card and buttons.

The active component is:

apps/web/src/components/aframe/AFrameLoginExperience.tsx

The design direction is:

"Apple-style spatial layering meets Vaporwave / Outrun neon terminal."

Do not make a generic glass card. Build a spatial UI that feels like a floating
XR terminal from a synthetic 1980s future: neon-lit, layered, theatrical, and
responsive to space.

Core visual idea:

- Keep the clarity and layering discipline from Apple/visionOS-style glass.
- Replace the quiet Apple palette with Vaporwave / Outrun neon energy.
- Use DOM/CSS for the first implementation because typography, hover states,
  rounded surfaces, shadows, and scanlines are easier to tune there than in
  WebGL shaders.
- Let A-Frame own the immersive background and WebXR runtime, while the DOM
  overlay owns the login UI.

Spatial layering model:

Build the UI as visible depth, not a flat page.

Back to front:

1. Immersive background layer
   - A-Frame geometric or passthrough background.
   - Darken it with a deep purple void wash.
   - It should remain visible enough to imply XR space.

2. Environmental light layer
   - Add large blurred neon light sources:
     - sunset orange/pink orb,
     - cyan side glow,
     - magenta side glow.
   - These are not decorative blobs; treat them as synthetic light sources
     illuminating the UI.
   - Use slow motion: breathing opacity, slight drift, or gentle scale.

3. Spatial grid layer
   - Add a perspective outrun grid that recedes into the background.
   - The grid should imply floor/depth, not cover the login card.
   - Use magenta/cyan lines at low opacity with glow.

4. Main glass terminal layer
   - Use a semi-transparent deep purple panel:
     rgba(26, 16, 60, 0.78)
   - Use backdrop-filter blur and saturation.
   - Use Apple-style layering:
     - outer shadow/glow layer,
     - translucent body layer,
     - inner highlight/rim layer,
     - content layer lifted above the panel.
   - The card should have visible Z depth through transform, shadow, and
     layered pseudo-elements.
   - Keep borders intentional: neon light tubes, not subtle gray outlines.

5. Foreground controls layer
   - Buttons must sit above the card, visually closer to the viewer.
   - Use transform/translateZ where possible.
   - Use white/neon inner highlights like Apple glass buttons, but color them
     with cyan/magenta Vaporwave energy.
   - Buttons should have clear hover, active, focus, and disabled states.

6. CRT / holographic overlay layer
   - Add scanlines, subtle RGB chromatic aberration, and optional vignette.
   - Keep opacity low enough that text remains readable.
   - The overlay should feel like a holographic display, not dirt on the UI.

Color system:

- Background void: #090014
- Foreground text: #E0E0E0
- Panel: rgba(26, 16, 60, 0.78)
- Primary neon: #FF00FF
- Secondary neon: #00FFFF
- Accent sun: #FF9900
- Muted border: #2D1B4E
- Active border: #00FFFF or #FF00FF

Gradients:

- Signature text / accent gradient:
  linear-gradient(to right, #FF9900, #FF00FF, #00FFFF)
- Sun glow:
  linear-gradient(to bottom, #FF9900, #FF00FF)
- Border / light sweep:
  linear-gradient(to right, #FF00FF, #00FFFF)

Typography:

- Use "Orbitron", system-ui, sans-serif for major headings if font loading is
  available.
- Use "Share Tech Mono", ui-monospace, monospace for UI labels, status text,
  and buttons if font loading is available.
- If fonts are not available yet, use fallback stacks but preserve the hierarchy:
  - heading: bold, wide, futuristic,
  - UI labels: uppercase, monospace, letter-spaced,
  - status lines: terminal-like.

Text rules:

- Use terminal language:
  - > ACCESS MODE
  - XR_NODE // LOGIN
  - STATUS: READY
  - ENTER_SESSION
- Use gradient fill or glow for the main title.
- Do not overfill the card with copy. XR users need quick scanning.
- Text must remain readable over scanlines and glow.

Button rules:

- Primary button:
  - cyan border,
  - transparent or deep purple base,
  - uppercase mono label,
  - skewed or angular shape,
  - hover un-skews, fills cyan, turns text black, and emits strong cyan glow.

- Secondary button:
  - magenta border or fill,
  - hover intensifies magenta glow.

- Button depth:
  - Buttons are the front layer.
  - Add inner white top highlight inspired by Apple glass.
  - Add colored outer glow inspired by neon tubes.
  - Add a small shadow or transform lift so the button feels closer than the
    card.

Background and light rules:

- The background is never empty.
- Use:
  - perspective grid,
  - blurred sunset orb,
  - cyan/magenta light beams,
  - subtle scanlines,
  - optional dot pattern.
- Keep the main card readable. The environmental lights should frame the UI,
  not compete with it.

Motion rules:

- Motion should feel retro-digital, like CRT warmup and synthwave light.
- Use CSS first:
  - grid slowly scrolls or drifts,
  - sun orb breathes,
  - neon bar sweeps across the card,
  - scanlines drift subtly,
  - terminal cursor blinks,
  - buttons un-skew and glow on hover.
- Respect prefers-reduced-motion:
  - remove continuous animations,
  - keep static glow and color changes.

XR-specific rules:

- The UI must feel suspended in space, not like a normal web page.
- Center the card in the user's comfortable forward view.
- Keep critical text and buttons in the central safe region.
- Avoid forcing the user to look too high or too low.
- Keep buttons large enough for gaze/cursor/controller interaction.
- Debug/status HUD may remain separate from the styled login card.
- A-Frame should continue to control WebXR entry and runtime behavior.

Implementation guidance:

- Do not reintroduce WebGL shader glass for the first Vaporwave pass.
- Use TSX + CSS pseudo-elements and CSS variables.
- Keep styles scoped with clear class names:
  - xr-vapor-stage
  - xr-vapor-grid
  - xr-vapor-sun
  - xr-vapor-scanlines
  - xr-vapor-card
  - xr-vapor-button
  - xr-vapor-terminal-row
- Prefer reusable class patterns over one-off inline styles.
- Keep accessibility:
  - real button elements,
  - visible focus states,
  - sufficient contrast,
  - keyboard operability.

Quality bar:

The result should look like a spatial neon terminal, not a corporate login card.
It should preserve the good Apple-glass lessons:

- separate background, body, highlight, and control layers,
- foreground buttons are visibly closer,
- high-quality inner highlights,
- calm layout hierarchy,
- readable text.

But the final skin should be unapologetically Vaporwave:

- magenta/cyan/orange neon,
- perspective grid,
- CRT scanlines,
- terminal labels,
- glowing borders,
- dramatic hover motion.
```

## Design Synthesis Notes

The deprecated Apple glass prototype remains useful as a structural reference.
Do not copy its quiet palette, but keep its spatial discipline:

- **Text**: minimal, centered, high hierarchy, never crowded.
- **Buttons**: raised above the panel with their own highlight/shadow layer.
- **Background**: supports depth and context, but never steals focus.
- **Motion**: should imply light moving across a surface or space moving behind
  the UI.
- **Layering**: background, environmental light, panel body, rim/highlight,
  content, foreground controls, global overlay.

The Vaporwave skin should add energy on top of that structure rather than
destroy the structure.

## Implemented XR Login Style

Status: accepted baseline for the `/xr/login` visual direction.

Implemented in:

```text
apps/web/src/components/aframe/AFrameLoginExperience.tsx
apps/web/app/globals.css
```

Screenshot reference:

```text
storage/exports/timeline-review/xr-login-vaporwave-check.png
```

### Visual Summary

The current login UI is a suspended neon terminal in XR space. It keeps the
spatial layering lessons from the Apple glass prototype, but the skin is now
Vaporwave / Outrun:

- deep purple terminal panel,
- cyan and magenta neon light-tube borders,
- gradient title text,
- terminal-style metadata and status chips,
- perspective grid floor,
- wave rings radiating around the card,
- cyan/magenta light beams,
- CRT scanline overlay,
- skewed neon buttons.

The accepted tone is:

```text
retro-futuristic, synthetic, theatrical, readable, spatial
```

Not:

```text
corporate, flat, quiet, gray, generic glassmorphism
```

### Layer Stack

The implemented page uses this layer order:

1. **A-Frame background**
   - `AFrameGeometricSkyBackground` or passthrough placeholder.
   - Keeps XR context alive behind the DOM terminal.

2. **Page color wash**
   - `.aframe-login-page`
   - Dark purple base with magenta/cyan/orange radial light washes.

3. **Global CRT overlay**
   - `.aframe-login-stage::before`
   - Horizontal scanlines plus subtle RGB aberration.

4. **Vignette / focus overlay**
   - `.aframe-login-stage::after`
   - Darkens the edges and keeps attention on the login terminal.

5. **Vaporwave environmental field**
   - `.xr-vapor-wave-field`
   - Contains:
     - `.xr-vapor-sun`
     - `.xr-vapor-grid`
     - `.xr-vapor-wave-ring`
     - `.xr-vapor-light-beam`
     - `.xr-vapor-light-orb`

6. **Main terminal card**
   - `.xr-vapor-card`
   - The primary floating UI surface.

7. **Terminal chrome and content**
   - `.xr-vapor-toolbar`
   - `.xr-vapor-card-shine`
   - `.xr-vapor-content-layer`
   - `.xr-vapor-status-line`

8. **Foreground controls**
   - `.xr-vapor-action`
   - Skewed neon buttons that visually sit in front of the card.

9. **Debug HUD**
   - `.aframe-login-hud`
   - Still separate from the styled product UI.

### Tokens In Use

The active card defines page-local tokens in `.xr-vapor-login-wrap`:

```css
--vapor-bg: #090014;
--vapor-panel: rgba(26, 16, 60, 0.78);
--vapor-text: #e0e0e0;
--vapor-cyan: #00ffff;
--vapor-magenta: #ff00ff;
--vapor-orange: #ff9900;
--vapor-border: #2d1b4e;
```

Keep these local until more WebXR screens adopt the same language.

### Component Rules

#### Main Card

Use `.xr-vapor-card` for the principal floating terminal.

Rules:

- square/terminal geometry, not soft corporate card geometry,
- 2px neon border,
- cyan top border,
- magenta/purple side presence,
- deep purple translucent panel,
- inner border and inset glow,
- subtle float animation,
- content translated forward with `translateZ`.

The card should read as a screen floating in XR space, not a website modal.

#### Terminal Chrome

Use `.xr-vapor-toolbar`.

Rules:

- colored window dots communicate retro OS chrome,
- right-side label should use machine language such as `XR_NODE // 2088`,
- toolbar line is part of the card's terminal identity,
- avoid decorative controls that look clickable unless they will become
  interactive.

#### Title And Copy

Use:

- `.xr-vapor-eyebrow` for command prompt style labels,
- `.xr-vapor-card h1` for the product title,
- `.xr-vapor-subtitle` for short terminal-style guidance,
- `.xr-vapor-status-line` for small status chips.

Copy examples:

```text
> ACCESS MODE
Invisible Director
SELECT ENTRY VECTOR FOR THE XR CUTTING ROOM.
STATUS: ONLINE
SCAN: CLEAN
```

Keep the text brief. The style is expressive, so verbose copy gets noisy fast.

#### Buttons

Use `.xr-vapor-action`.

Rules:

- real `<button>` elements,
- skewed by default,
- counter-skew inner text with a child `<span>`,
- cyan primary,
- magenta secondary,
- hover/active state fills with neon and inverts text,
- strong glow amplification on hover,
- minimum height should stay comfortable for gaze/controller use.

The current pattern:

```tsx
<button className="xr-vapor-action">
  <span>Email</span>
</button>
```

### Motion Rules

Current motion vocabulary:

- `xrVaporSunPulse`: slow breathing glow behind the UI.
- `xrVaporGridDrift`: grid line movement for spatial flow.
- `xrVaporWavePulse`: expanding elliptical wave rings.
- `xrVaporBeamSweep`: light beams drifting around the card.
- `xrVaporOrbDrift`: soft cyan/magenta light sources moving slowly.
- `xrVaporCardFloat`: subtle suspended-card motion.
- `xrVaporShineSweep`: neon sweep across the terminal top bar.
- `xrVaporTextShimmer`: gradient title shimmer.

Motion should stay atmospheric. Avoid making the login card feel unstable.

Reduced motion:

- continuous animations must be disabled under `prefers-reduced-motion`,
- hover/focus color changes may remain.

### XR Comfort Rules

- Keep the card centered in the comfortable forward view.
- Avoid placing important buttons near the top/bottom extremes.
- Maintain large hit targets.
- Keep the debug HUD separate from the product UI.
- Do not add motion that makes the panel feel like it is moving away from the
  user.

### Verification Checklist

Before calling the UI done:

- `npm run typecheck:web` passes.
- `/xr/login` renders the A-Frame scene and DOM card.
- Screenshot desktop viewport around `1280 x 800`.
- Screenshot mobile or narrow viewport after major layout changes.
- Confirm scanlines do not make text hard to read.
- Confirm buttons remain keyboard-focusable.
- Confirm reduced-motion media query disables continuous visual motion.

### Future Refinements

Good next steps:

- Extract DOM overlay to `XrVaporwaveLoginOverlay.tsx`.
- Move Vaporwave tokens into a small page-local token block or CSS layer.
- Add visible focus states matching the neon system.
- Add optional font loading for `Orbitron` and `Share Tech Mono`.
- Add a mobile-specific composition that keeps the grid and glow but reduces
  visual density.

Avoid for now:

- returning to WebGL shader glass,
- true refraction,
- adding animation libraries,
- spreading Vaporwave styles across unrelated mobile pages before this pattern
  stabilizes.
