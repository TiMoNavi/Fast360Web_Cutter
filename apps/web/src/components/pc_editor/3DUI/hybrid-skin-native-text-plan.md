# Hybrid Skin + Native Text UI Plan

## Goal

Build one immersive player UI that keeps the visual quality of the existing desktop player while avoiding blurry HTMLMesh text.

The design target is a hybrid spatial UI:

```text
graphics skin layer     CSS/HTMLMesh/canvas visual surface
native text layer       SDF text placed on top of the skin
native interaction      transparent raycast hit planes
shared commands         PcEditorCommand
```

This is different from the current `native-player/` prototype. That prototype proves placement and interaction, but it looks crude because it tries to rebuild a rich CSS interface from raw A-Frame primitives.

## Reference Success

`/xr/three-official-interactive-lab` already proves that CSS UI can become spatial UI.

That page uses:

- React DOM for the visual UI.
- CSS for gradients, clip paths, shadows, borders, and layout.
- Three.js `HTMLMesh` to turn DOM into a spatial mesh.
- Three.js `InteractiveGroup` for DOM-style pointer interaction.

For the PC editor v3 path, we should not copy that whole interaction model directly. Instead, use it as proof that the graphics layer can come from CSS/HTML, while text and interaction can be rebuilt natively for clarity and stability.

## Layer Model

### 1. Graphics Skin Layer

Responsibility:

- panel background
- glass surface
- button shells
- decorative lines
- glow
- scanline/noise texture
- non-dynamic icons or chrome

Possible implementations:

- `HTMLMesh` from a stripped DOM skin with text hidden
- canvas-generated texture
- exported PNG/WebP/SVG atlas from the current CSS design

Initial recommendation:

Use an HTML/CSS skin first, because the existing player design already lives in CSS. Hide dynamic text in the skin, keep only shapes and decoration, then place native text above it.

### 2. Native Text Layer

Responsibility:

- title
- subtitle/status
- timecodes
- button labels
- rate values
- recording state

Requirements:

- text must stay visually aligned to the graphics skin
- text must not be part of the skin texture
- text should use SDF/native rendering where available
- text color/glow should match the skin palette

Style mapping:

```text
primary text    #f7ffff
secondary text  #9fefff
cyan accent     #00ffff
magenta accent  #ff00ff
orange accent   #ff9900
record text     #fff3f3 / #ffb8b8
```

For glow, use either:

- emissive text material
- duplicated text behind the main label with lower opacity and slightly larger scale

### 3. Native Interaction Layer

Responsibility:

- hit testing
- controller ray interaction
- hover/pressed state
- dispatching `PcEditorCommand`

Implementation:

- transparent planes for each interactive zone
- each hit plane has a stable command mapping
- visual hover state can tint the graphics skin region or show a native outline

Important rule:

The graphics skin should not own the business action. The hit plane owns the command.

## Coordinate System

To prevent skin/text/hit-plane drift, every layer must share one design coordinate system.

Use a single root:

```text
SpatialPlayerRoot
  position: camera-relative
  size: 1.82m x 0.245m
  design pixels: 1040 x 140
```

Recommended conversion:

```text
worldX = (pixelX / 1040 - 0.5) * 1.82
worldY = (0.5 - pixelY / 140) * 0.245
```

Do not position text by eye. Define named slots:

```text
progress.startTime
progress.track
progress.endTime
transport.previous
transport.playPause
transport.next
title.primary
title.subtitle
record.toggle
rate.playback
rate.recording
playlist.toggle
```

Each slot stores:

- center pixel x/y
- width/height in pixels
- world x/y derived from the shared conversion
- text align
- hit command

This prevents the common failure where the graphic is scaled one way and text is scaled another way.

## Z Layering

Use tiny z offsets under one root:

```text
z = 0.000  graphics skin
z = 0.006  progress fill / dynamic native shapes
z = 0.012  native text
z = 0.018  transparent hit planes
z = 0.024  hover/pressed outlines
```

Keep all offsets small. Large offsets cause parallax drift when the viewer moves their head.

## Placement

The whole player bar should be camera-relative for this phase.

Recommended starting transform:

```text
position: 0 -0.48 -1.15
rotation: 0 0 0
width:    1.82
height:   0.245
```

Reasoning:

- Quest/WebXR head origin is often near `0 0 0`.
- The player should sit below eye line like a floating monitor control bar.
- A camera-relative root keeps visual/text/hit alignment stable.

Later we can add:

- pinned-to-world mode
- recenter action
- follow delay
- user-adjustable distance

## Update Strategy

Static graphics:

- update rarely
- can be one mesh/texture

Dynamic graphics:

- progress fill
- recording state tint
- hover/pressed outlines

Dynamic text:

- update from React state
- avoid redrawing the whole skin for timecode changes

Commands:

- use `PcEditorCommand`
- keep the same command semantics as desktop UI

## Implementation Steps

1. Create `hybrid-player/` beside `native-player/`.
2. Build a `SpatialPlayerLayout.ts` file with slot definitions and pixel-to-world conversion.
3. Build a skin-only DOM/CSS component based on the current player bar, with dynamic text hidden.
4. Convert the skin to a spatial graphics layer.
5. Add native text entities using the shared slot coordinates.
6. Add transparent hit planes using the same slots.
7. Wire hit planes to `PcEditorCommand`.
8. Add a debug mode that renders slot rectangles and anchor points.
9. Compare desktop player, skin layer, text layer, and hit layer in one screenshot.

## Acceptance Criteria

- The player bar is visually closer to the existing desktop UI than the primitive prototype.
- Text stays sharp in immersive mode.
- Text aligns with the graphics skin at desktop and headset resolutions.
- Button hit regions match visible buttons.
- Progress fill and timecode update without full skin redraw.
- Existing `player-v2` remains untouched.
- `player-v3` remains the only validation route.

## Known Risks

HTMLMesh skin:

- easiest to match the existing CSS
- may still be blurry if used for text
- acceptable if text is hidden and native text is overlaid

Canvas skin:

- more control over resolution
- less direct CSS reuse
- better if HTMLMesh artifacts remain visible

Native SDF text:

- sharp and performant
- needs careful style tuning to match CSS
- may require font loading work

Alignment:

- highest risk
- must be solved with a shared coordinate map, not manual placement
