"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useEffectShortcutBindings,
  usePcEditorEffectCatalog,
  resolveEffectPreviewAdapters,
  type PcEditorEffectPanelCategory,
  type PcEditorEffectPanelItem
} from "../effects";
import { setPcEditorEffectInput } from "../state";
import { usePcEditorUiEventEmitter } from "./usePcEditorUiEventEmitter";

const FALLBACK_EFFECT_CATEGORIES: PcEditorEffectPanelCategory[] = [
  {
    id: "transition",
    key: "1",
    label: "Transition",
    effects: [
      { id: "black-fade", key: "1", label: "Black fade" },
      { id: "white-fade", key: "2", label: "White fade" },
      { id: "flash-cut", key: "3", label: "Flash cut" },
      { id: "neon-wipe", key: "4", label: "Neon wipe" },
      { id: "grid-dissolve", key: "5", label: "Grid dissolve" },
      { id: "vhs-blank", key: "6", label: "VHS blank" }
    ]
  },
  {
    id: "color",
    key: "2",
    label: "Color",
    effects: [
      { id: "cyan-boost", key: "1", label: "Cyan boost" },
      { id: "magenta-wash", key: "2", label: "Magenta wash" },
      { id: "sunset-grade", key: "3", label: "Sunset grade" },
      { id: "cold-chrome", key: "4", label: "Cold chrome" },
      { id: "warm-vhs", key: "5", label: "Warm VHS" },
      { id: "soft-blur", key: "6", label: "Soft blur" }
    ]
  },
  {
    id: "speed",
    key: "3",
    label: "Speed",
    effects: [
      { id: "speed-ramp", key: "1", label: "Speed ramp" },
      { id: "slow-drift", key: "2", label: "Slow drift" },
      { id: "freeze-frame", key: "3", label: "Freeze frame" },
      { id: "beat-stutter", key: "4", label: "Beat stutter" },
      { id: "reverse-hit", key: "5", label: "Reverse hit" },
      { id: "time-skip", key: "6", label: "Time skip" }
    ]
  },
  {
    id: "frame",
    key: "4",
    label: "Frame",
    effects: [
      { id: "hero-push", key: "1", label: "Hero push" },
      { id: "reveal-pull", key: "2", label: "Reveal pull" },
      { id: "drift-left-parallax", key: "3", label: "Drift left" },
      { id: "impact-shake", key: "4", label: "Impact shake" },
      { id: "focus-box", key: "5", label: "Focus box" },
      { id: "edge-vignette", key: "6", label: "Edge vignette" },
      {
        durationMs: 1600,
        eventName: "frame.little_planet_pullback",
        id: "little-planet",
        key: "7",
        label: "Little planet",
        params: { peakAtMs: 560, peakPitch: -88, peakSphereFov: 175, previewFlightHeight: 46.8, previewFov: 138, previewPitch: -90 },
        previewMode: "sphere_overlay",
        previewTarget: "sphere",
        renderFallback: "warn",
        renderStage: "pre_remap_equirect",
        renderSupported: true
      },
      {
        durationMs: 1900,
        eventName: "frame.crystal_ball_pull",
        id: "crystal-ball",
        key: "8",
        label: "Crystal ball",
        params: { centerPitch: 88, peakAtMs: 760, peakSphereFov: 165, previewFlightHeight: 34, previewFov: 145, previewMaskFov: 178, previewMaskPitch: -78, previewPitch: -82, roll: 180 },
        previewMode: "sphere_overlay",
        previewTarget: "sphere",
        renderFallback: "warn",
        renderStage: "pre_remap_equirect",
        renderSupported: true
      },
      {
        durationMs: 2200,
        eventName: "frame.look_around",
        id: "look-around",
        key: "9",
        label: "Look around",
        params: { returnYaw: -10, sweepYaw: 28, widenFovH: 3 },
        previewMode: "viewport_simulation",
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "viewport_path",
        renderSupported: true
      },
      {
        durationMs: 1700,
        eventName: "frame.dolly_zoom",
        id: "dolly-zoom",
        key: "0",
        label: "Dolly zoom",
        params: { peakAtMs: 820, peakDeltaFovH: -18, previewDollyDistance: -6.5, previewFov: 64, previewMaskFovDelta: -18 },
        previewMode: "sphere_overlay",
        previewTarget: "sphere",
        renderFallback: "warn",
        renderStage: "viewport_path",
        renderSupported: true
      }
    ]
  },
  {
    id: "glitch",
    key: "5",
    label: "Glitch",
    effects: [
      { id: "rgb-split", key: "1", label: "RGB split" },
      { id: "scan-tear", key: "2", label: "Scan tear" },
      { id: "datamosh", key: "3", label: "Datamosh" },
      { id: "noise-burst", key: "4", label: "Noise burst" },
      { id: "signal-loss", key: "5", label: "Signal loss" },
      { id: "pixel-shift", key: "6", label: "Pixel shift" }
    ]
  },
  {
    id: "marker",
    key: "6",
    label: "Marker",
    effects: [
      { id: "beat-mark", key: "1", label: "Beat mark" },
      { id: "cut-note", key: "2", label: "Cut note" },
      { id: "restore-here", key: "3", label: "Restore here" },
      { id: "discard-here", key: "4", label: "Discard here" },
      { id: "hero-shot", key: "5", label: "Hero shot" },
      { id: "review-flag", key: "6", label: "Review flag" }
    ]
  },
  {
    id: "overlay",
    key: "7",
    label: "Overlay",
    effects: [
      {
        durationMs: 2400,
        eventName: "overlay.text",
        id: "text-title",
        key: "1",
        label: "Text title",
        params: { backgroundOpacity: 0.45, position: "bottom_center", text: "TEXT" },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "overlay_frame",
        renderSupported: true
      },
      {
        durationMs: 1800,
        eventName: "overlay.letterbox",
        id: "letterbox-bars",
        key: "2",
        label: "Letterbox",
        params: { opacity: 1, ratio: 0.12 },
        previewTarget: "viewport-mask",
        renderFallback: "warn",
        renderStage: "overlay_frame",
        renderSupported: true
      }
    ]
  }
];

function effectHoldDurationMs(effect: PcEditorEffectPanelItem, elapsedMs: number) {
  if (effect.id === "white-fade") {
    return Math.min(1800, Math.max(260, Math.round(elapsedMs)));
  }

  return Math.max(160, Math.round(elapsedMs));
}

export function PcEffectsPanel() {
  const emit = usePcEditorUiEventEmitter("pc-effects-panel", { legacyCommandFallback: false });
  const catalog = usePcEditorEffectCatalog(FALLBACK_EFFECT_CATEGORIES);
  const [collapsed, setCollapsed] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(["transition"]));
  const holdEffectRef = useRef<{
    category: PcEditorEffectPanelCategory;
    effect: PcEditorEffectPanelItem;
    key: string;
    startedAtMs: number;
  } | null>(null);

  const categories = useMemo(() => catalog.categories, [catalog.categories]);

  const previewTargetForEffect = (effect: PcEditorEffectPanelItem) =>
    resolveEffectPreviewAdapters({
      effectId: effect.id,
      eventName: effect.eventName,
      previewMode: effect.previewMode,
      previewTarget: effect.previewTarget,
      renderStage: effect.renderStage
    }).target;

  const emitSelectEffect = (category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem) => {
    setOpenCategories((value) => new Set(value).add(category.id));
    emit({
      event: {
        type: "editor.effects.select",
        payload: {
          categoryId: category.id,
          durationMs: effect.durationMs,
          effectId: effect.id,
          eventName: effect.eventName,
          label: effect.label,
          params: effect.params,
          previewMode: effect.previewMode,
          previewTarget: previewTargetForEffect(effect),
          conflictGroup: effect.conflictGroup,
          renderFallback: effect.renderFallback,
          renderStage: effect.renderStage,
          renderSupported: effect.renderSupported
        }
      },
      fallbackCommand: {
        categoryId: category.id,
        effectId: effect.id,
        label: effect.label,
        type: "effects.select"
      }
    });
  };

  const beginHoldEffect = (category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem, key: string) => {
    if (holdEffectRef.current) {
      return;
    }

    setOpenCategories((value) => new Set(value).add(category.id));
    holdEffectRef.current = {
      category,
      effect,
      key,
      startedAtMs: performance.now()
    };
    emit({
      event: {
        type: "editor.effects.hold.start",
        payload: {
          categoryId: category.id,
          effectId: effect.id,
          eventName: effect.eventName,
          label: effect.label,
          params: effect.params,
          previewMode: effect.previewMode,
          previewTarget: previewTargetForEffect(effect),
          conflictGroup: effect.conflictGroup,
          renderFallback: effect.renderFallback,
          renderStage: effect.renderStage,
          renderSupported: effect.renderSupported
        }
      }
    });
  };

  const endHoldEffect = () => {
    const active = holdEffectRef.current;

    if (!active) {
      return;
    }

    holdEffectRef.current = null;
    const durationMs = effectHoldDurationMs(active.effect, performance.now() - active.startedAtMs);
    emit({
      event: {
        type: "editor.effects.hold.end",
        payload: {
          categoryId: active.category.id,
          durationMs,
          effectId: active.effect.id,
          eventName: active.effect.eventName,
          label: active.effect.label,
          params: active.effect.params,
          previewMode: active.effect.previewMode,
          previewTarget: previewTargetForEffect(active.effect),
          conflictGroup: active.effect.conflictGroup,
          renderFallback: active.effect.renderFallback,
          renderStage: active.effect.renderStage,
          renderSupported: active.effect.renderSupported
        }
      }
    });
  };

  const setCollapsedAndEmit = (nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed);
    emit({
      event: { type: "ui.panel.effects.collapse.set", payload: { collapsed: nextCollapsed } },
      fallbackCommand: { collapsed: nextCollapsed, type: "panel.effects.collapse.set" }
    });
  };

  const openCategory = (category: PcEditorEffectPanelCategory) => {
    setOpenCategories((value) => new Set(value).add(category.id));
    emit({
      event: { type: "ui.panel.effects.category.toggle", payload: { categoryId: category.id, open: true } },
      fallbackCommand: { categoryId: category.id, open: true, type: "effects.category.toggle" }
    });
  };

  const toggleCategory = (category: PcEditorEffectPanelCategory) => {
    const open = !openCategories.has(category.id);

    setOpenCategories((value) => {
      const next = new Set(value);

      if (open) {
        next.add(category.id);
      } else {
        next.delete(category.id);
      }

      return next;
    });
    emit({
      event: { type: "ui.panel.effects.category.toggle", payload: { categoryId: category.id, open } },
      fallbackCommand: { categoryId: category.id, open, type: "effects.category.toggle" }
    });
  };

  const shortcutControls = useEffectShortcutBindings({
    categories,
    onEnsurePanelOpen: () => setCollapsedAndEmit(false),
    onHoldEnd: endHoldEffect,
    onHoldStart: beginHoldEffect,
    onOpenCategory: openCategory,
    onSelectEffect: emitSelectEffect
  });
  const { shortcut } = shortcutControls;
  const activeCategory = shortcut.mode === "effect" || shortcut.mode === "holding" || shortcut.mode === "selected" ? shortcut.category : null;
  const activeEffect = shortcut.mode === "holding" || shortcut.mode === "selected" ? shortcut.effect : null;

  useEffect(() => {
    if (shortcut.mode === "hidden") {
      setPcEditorEffectInput({ mode: "hidden" });
      return;
    }

    if (shortcut.mode === "category") {
      setPcEditorEffectInput({ mode: "category" });
      return;
    }

    if (shortcut.mode === "effect") {
      setPcEditorEffectInput({
        categoryId: shortcut.category.id,
        mode: "effect"
      });
      return;
    }

    const nextInput = {
      categoryId: shortcut.category.id,
      effectId: shortcut.effect.id,
      eventName: shortcut.effect.eventName ?? shortcut.effect.id,
      label: shortcut.effect.label,
      mode: shortcut.mode,
      previewTarget: previewTargetForEffect(shortcut.effect)
    } as const;

    if (shortcut.mode === "holding") {
      const activeHold = holdEffectRef.current;

      setPcEditorEffectInput({
        ...nextInput,
        ...(activeHold ? { holdKey: activeHold.key, startedAtMs: activeHold.startedAtMs } : {})
      });
      return;
    }

    setPcEditorEffectInput(nextInput);
  }, [shortcut]);

  const selectEffect = (category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem) => {
    shortcutControls.showSelected(category, effect);
    emitSelectEffect(category, effect);
  };

  return (
    <>
      <aside className={collapsed ? "xr-pc-effects-panel collapsed" : "xr-pc-effects-panel"} data-testid="xr-pc-effects-panel">
        <div className="xr-pc-effects-header">
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand effects sidebar" : "Collapse effects sidebar"}
            className="xr-pc-effects-toggle"
            data-testid="xr-pc-effects-toggle"
            onClick={() => setCollapsedAndEmit(!collapsed)}
            type="button"
          >
            <span className="xr-button-label">{collapsed ? "<" : ">"}</span>
          </button>
          <div>
            <div className="xr-pc-workbench-chrome" aria-hidden="true">
              <span className="dot-magenta" />
              <span className="dot-cyan" />
              <span className="dot-orange" />
            </div>
            <p className="xr-pc-workbench-kicker">Tab effects</p>
            <h2>Effects Rack</h2>
          </div>
        </div>
        <div aria-hidden={collapsed} className="xr-pc-effects-body">
          {categories.map((category) => {
            const open = openCategories.has(category.id);

            return (
              <section className="xr-pc-effect-category" data-active={activeCategory?.id === category.id} key={category.id}>
                <button
                  aria-expanded={open}
                  className="xr-pc-effect-category-button"
                  onClick={() => toggleCategory(category)}
                  type="button"
                >
                  <span className="xr-pc-effect-key">{category.key}</span>
                  <span>{category.label}</span>
                </button>
                {open ? (
                  <div className="xr-pc-effect-grid">
                    {category.effects.map((effect) => (
                      <button
                        className={activeEffect?.id === effect.id ? "xr-pc-effect-tile active" : "xr-pc-effect-tile"}
                        data-render-supported={effect.renderSupported ?? true}
                        data-testid={`xr-pc-effect-${category.id}-${effect.id}`}
                        key={effect.id}
                        onClick={() => selectEffect(category, effect)}
                        type="button"
                      >
                        <span className="xr-pc-effect-badge">{effect.key}</span>
                        <span className="xr-pc-effect-icon" aria-hidden="true" />
                        <span>{effect.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </aside>
      {shortcut.mode !== "hidden" ? (
        <div className="xr-pc-effect-shortcut-overlay" data-testid="xr-pc-effect-shortcut-overlay">
          <div className="xr-pc-effect-shortcut-card">
            <p className="xr-pc-workbench-kicker">
              {shortcut.mode === "category"
                ? "Tab / choose type"
                : shortcut.mode === "effect"
                  ? `Tab ${shortcut.category.key} / choose effect`
                  : shortcut.mode === "holding"
                    ? "Hold / release effect"
                    : "Effect selected"}
            </p>
            <h2>{shortcut.mode === "category" ? "Effects" : shortcut.mode === "effect" ? shortcut.category.label : shortcut.effect.label}</h2>
            <div className="xr-pc-effect-shortcut-grid">
              {(shortcut.mode === "category" ? categories : shortcut.mode === "effect" ? shortcut.category.effects : [shortcut.effect]).map((item) => (
                <div className="xr-pc-effect-shortcut-tile" key={item.id}>
                  <span>{item.key}</span>
                  <strong>{item.label}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
