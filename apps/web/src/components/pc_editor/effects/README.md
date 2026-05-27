# PC Editor effects

This folder is the frontend adapter for the backend-owned PC Editor effect catalog.

The backend endpoint `/api/effects/catalog` is the source of truth for product effects. The frontend reads that declarative catalog and turns it into:

- Effects panel categories and tiles.
- `editor.effects.select` payloads.
- Effect preview hints.
- `EffectEventsPatch` compilation input for Player V2 workflows.
- Render policy hints such as `render.stage`, `render.fallback`, and `render.conflictGroup`.

The backend must not send executable frontend code. It sends stable effect ids, canonical render event names, default params, render support, and preview descriptors. The frontend maps preview descriptors to local React/A-Frame components.

## Reference pattern: black fade

Black fade is the reference implementation for viewport-mask effects. New effects should follow the same boundaries:

- Product definition comes from the backend catalog: stable `effectId`, canonical `eventName`, default duration, params, render support, and preview target.
- UI components only emit `editor.effects.*` events and write transient input state such as `effectInput` into the runtime state store.
- Live spatial values come from the runtime state store. A viewport-mask preview must read `maskViewportBounds`; it must not recalculate crop geometry or import mask internals.
- Preview semantics live in `effects/preview`, not inside individual UI panels. Use `resolveEffectPreviewTarget` and `createViewportMaskPreviewStyle` instead of duplicating target/range logic.
- Timeline/export semantics live in the workflow layer. For hold effects, `usePlayerV2EffectsWorkflow` turns `editor.effects.hold.start/end` into `EffectEventsPatch` and, when needed, `ViewPathPatch`.
- CSS is only the visual adapter. It may style a black fade, white flash, blur hint, or label, but it must not decide effect timing, event names, or geometry source.

The black fade chain is:

```text
catalog effect definition
  -> PcEffectsPanelSimple / editor.effects.shortcut.* input adapters
  -> editor.effects.hold.start / editor.effects.hold.end
  -> runtime state store effectInput
  -> PcEffectPreview reads maskViewportBounds
  -> viewport-mask CSS variables and clip path
  -> usePlayerV2EffectsWorkflow writes EffectEventsPatch
```

## Compiler foundation

The current implementation has started moving effect compilation out of ad hoc workflow code:

```text
effects/compiler/
  types.ts            Shared EffectSpec, engine, preview, and draft types.
  effectSpecs.ts      Local transitional specs for representative effects.
  effectCompiler.ts   Converts effect selections/holds into standard drafts.

effects/preview/
  previewAdapterRegistry.ts
    Resolves PC/VR preview adapter intent from catalog hints, local specs, and render stage.
```

The intended path is:

```text
editor.effects.*
  -> compileEffectSelectDraft / compileEffectHoldEndDraft
  -> EffectEventDraft / ViewPathRangeDraft / OverlayLayerDraft / MarkerOrAudioDraft / XrRuntimeDraft
  -> workflow dispatches through timeline bridge or the correct runtime adapter
```

`EffectEventDraft` and the first `ViewPathRangeDraft` path are wired into `usePlayerV2EffectsWorkflow` today. The other draft types are deliberately present as the contract for the next engines:

- `ViewPathRangeDraft`: camera motion, hero-push, reveal-pull, drift-left, shake, auto reframe.
- `OverlayLayerDraft`: text, logo, sticker, letterbox, picture-in-picture.
- `MarkerOrAudioDraft`: beat markers, BGM, sound effects.
- `XrRuntimeDraft`: hotspot, portal, world marker, controller hint.

This lets new effects become small compiler modules instead of adding new branches to Player V2 or UI components.

Catalog render policy now flows through the frontend payload:

```text
/api/effects/catalog
  -> catalogToPanelCategories
  -> PcEffectsPanelSimple payload
  -> usePlayerV2EffectsWorkflow
  -> compileEffectSelectDraft / compileEffectHoldEndDraft
  -> EffectEventDraft.renderPolicy
```

Local transitional specs are still allowed, but backend catalog policy wins where the payload supplies it. This keeps the compiler from becoming a second permanent source of truth.

For any new viewport-mask effect, first make sure it can answer these questions:

```text
What is the stable effectId?
What canonical backend eventName does it compile to?
Which preview target does it use?
Which runtime-state values does it read?
Does it write EffectEventsPatch, ViewPathPatch, or both?
What is the backend render fallback policy?
```
