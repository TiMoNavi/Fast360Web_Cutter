"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EffectEventName } from "@/lib/path-protocol";
import { dispatchWebXrTimelineEvent } from "../data/timeline-bridge";
import { WEBXR_PC_EFFECT_PREVIEW_EVENT, type PcEffectPreviewDetail } from "./PcEffectPreview";

type EffectItem = {
  durationMs?: number;
  eventName: EffectEventName;
  id: string;
  key: string;
  label: string;
  params?: Record<string, unknown>;
};

type EffectCategory = {
  id: string;
  key: string;
  label: string;
  effects: EffectItem[];
};

const EFFECT_CATEGORIES: EffectCategory[] = [
  {
    id: "transition",
    key: "1",
    label: "Transition",
    effects: [
      { durationMs: 900, eventName: "transition.fade_black", id: "black-fade", key: "1", label: "Black fade" },
      { durationMs: 720, eventName: "transition.flash_white", id: "white-fade", key: "2", label: "White fade" },
      { durationMs: 260, eventName: "transition.flash_white", id: "flash-cut", key: "3", label: "Flash cut" },
      { durationMs: 900, eventName: "highlight", id: "neon-wipe", key: "4", label: "Neon wipe", params: { tint: "cyan" } },
      { durationMs: 900, eventName: "filter.blur", id: "grid-dissolve", key: "5", label: "Grid dissolve", params: { strength: 0.42 } },
      { durationMs: 700, eventName: "black.solid", id: "vhs-blank", key: "6", label: "VHS blank" }
    ]
  },
  {
    id: "color",
    key: "2",
    label: "Color",
    effects: [
      { eventName: "filter.color_grade", id: "cyan-boost", key: "1", label: "Cyan boost", params: { tint: "cyan" } },
      { eventName: "filter.color_grade", id: "magenta-wash", key: "2", label: "Magenta wash", params: { tint: "magenta" } },
      { eventName: "filter.color_grade", id: "sunset-grade", key: "3", label: "Sunset grade", params: { tint: "sunset" } },
      { eventName: "filter.color_grade", id: "cold-chrome", key: "4", label: "Cold chrome", params: { tint: "chrome" } },
      { eventName: "filter.color_grade", id: "warm-vhs", key: "5", label: "Warm VHS", params: { tint: "warm" } },
      { eventName: "filter.color_grade", id: "mono-scan", key: "6", label: "Mono scan", params: { tint: "mono" } }
    ]
  },
  {
    id: "speed",
    key: "3",
    label: "Speed",
    effects: [
      { eventName: "speed.ramp", id: "speed-ramp", key: "1", label: "Speed ramp" },
      { eventName: "speed.slow_drift", id: "slow-drift", key: "2", label: "Slow drift" },
      { eventName: "speed.freeze_frame", id: "freeze-frame", key: "3", label: "Freeze frame" },
      { eventName: "speed.beat_stutter", id: "beat-stutter", key: "4", label: "Beat stutter" },
      { eventName: "speed.reverse_hit", id: "reverse-hit", key: "5", label: "Reverse hit" },
      { eventName: "speed.time_skip", id: "time-skip", key: "6", label: "Time skip" }
    ]
  },
  {
    id: "frame",
    key: "4",
    label: "Frame",
    effects: [
      { eventName: "frame.push_in", id: "push-in", key: "1", label: "Push in" },
      { eventName: "frame.pull_out", id: "pull-out", key: "2", label: "Pull out" },
      { eventName: "frame.tilt_glide", id: "tilt-glide", key: "3", label: "Tilt glide" },
      { eventName: "frame.roll_pulse", id: "roll-pulse", key: "4", label: "Roll pulse" },
      { eventName: "highlight", id: "focus-box", key: "5", label: "Focus box" },
      { eventName: "filter.vignette", id: "edge-vignette", key: "6", label: "Edge vignette" }
    ]
  },
  {
    id: "glitch",
    key: "5",
    label: "Glitch",
    effects: [
      { eventName: "filter.chromatic_aberration", id: "rgb-split", key: "1", label: "RGB split" },
      { eventName: "glitch.scan_tear", id: "scan-tear", key: "2", label: "Scan tear" },
      { eventName: "glitch.datamosh", id: "datamosh", key: "3", label: "Datamosh" },
      { eventName: "glitch.noise_burst", id: "noise-burst", key: "4", label: "Noise burst" },
      { eventName: "glitch.signal_loss", id: "signal-loss", key: "5", label: "Signal loss" },
      { eventName: "glitch.pixel_shift", id: "pixel-shift", key: "6", label: "Pixel shift" }
    ]
  },
  {
    id: "marker",
    key: "6",
    label: "Marker",
    effects: [
      { eventName: "marker.beat", id: "beat-mark", key: "1", label: "Beat mark" },
      { eventName: "marker.cut_note", id: "cut-note", key: "2", label: "Cut note" },
      { eventName: "marker.restore_here", id: "restore-here", key: "3", label: "Restore here" },
      { eventName: "marker.discard_here", id: "discard-here", key: "4", label: "Discard here" },
      { eventName: "highlight", id: "hero-shot", key: "5", label: "Hero shot" },
      { eventName: "marker.review_flag", id: "review-flag", key: "6", label: "Review flag" }
    ]
  }
];

type ShortcutState =
  | { mode: "hidden" }
  | { mode: "category" }
  | { category: EffectCategory; mode: "effect" }
  | { category: EffectCategory; effect: EffectItem; mode: "selected" };

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function findCategory(key: string) {
  return EFFECT_CATEGORIES.find((category) => category.key === key) ?? null;
}

function findEffect(category: EffectCategory, key: string) {
  return category.effects.find((effect) => effect.key === key) ?? null;
}

export function PcEffectsPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(["transition"]));
  const [shortcut, setShortcut] = useState<ShortcutState>({ mode: "hidden" });
  const hideTimerRef = useRef<number | null>(null);

  const activeCategory = shortcut.mode === "effect" || shortcut.mode === "selected" ? shortcut.category : null;
  const activeEffect = shortcut.mode === "selected" ? shortcut.effect : null;

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const selectEffect = (category: EffectCategory, effect: EffectItem) => {
    clearHideTimer();
    setShortcut({ category, effect, mode: "selected" });
    dispatchWebXrTimelineEvent({
      displayName: effect.label,
      durationMs: effect.durationMs ?? 900,
      effectType: effect.eventName,
      params: {
        category: category.id,
        effectId: effect.id,
        ...(effect.params ?? {})
      },
      renderPolicy: {
        fallback: "warn"
      },
      type: "createEffectEvent"
    });
    window.dispatchEvent(
      new CustomEvent<PcEffectPreviewDetail>(WEBXR_PC_EFFECT_PREVIEW_EVENT, {
        detail: {
          categoryId: category.id,
          effectId: effect.id,
          eventName: effect.eventName,
          label: effect.label
        }
      })
    );
    hideTimerRef.current = window.setTimeout(() => {
      setShortcut({ mode: "hidden" });
      hideTimerRef.current = null;
    }, 1200);
  };

  useEffect(() => () => clearHideTimer(), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "tab") {
        event.preventDefault();
        clearHideTimer();
        setCollapsed(false);
        setShortcut((value) => (value.mode === "hidden" ? { mode: "category" } : { mode: "hidden" }));
        return;
      }

      if (!/^[1-6]$/.test(key)) {
        if (key === "escape" && shortcut.mode !== "hidden") {
          setShortcut({ mode: "hidden" });
          event.preventDefault();
        }
        return;
      }

      if (shortcut.mode === "category") {
        const category = findCategory(key);
        if (!category) {
          return;
        }
        setOpenCategories((value) => new Set(value).add(category.id));
        setShortcut({ category, mode: "effect" });
        event.preventDefault();
        return;
      }

      if (shortcut.mode === "effect") {
        const effect = findEffect(shortcut.category, key);
        if (!effect) {
          return;
        }
        selectEffect(shortcut.category, effect);
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [shortcut]);

  const categories = useMemo(() => EFFECT_CATEGORIES, []);

  return (
    <>
      <aside className={collapsed ? "xr-pc-effects-panel collapsed" : "xr-pc-effects-panel"} data-testid="xr-pc-effects-panel">
        <div className="xr-pc-effects-header">
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand effects sidebar" : "Collapse effects sidebar"}
            className="xr-pc-effects-toggle"
            data-testid="xr-pc-effects-toggle"
            onClick={() => setCollapsed((value) => !value)}
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
                  onClick={() =>
                    setOpenCategories((value) => {
                      const next = new Set(value);
                      if (next.has(category.id)) {
                        next.delete(category.id);
                      } else {
                        next.add(category.id);
                      }
                      return next;
                    })
                  }
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
              {shortcut.mode === "category" ? "Tab / choose type" : shortcut.mode === "effect" ? `Tab ${shortcut.category.key} / choose effect` : "Effect selected"}
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
