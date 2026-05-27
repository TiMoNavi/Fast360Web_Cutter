"use client";

import { useEffect, useRef, useState } from "react";
import { useOptionalPcEditorEventBus, type PcEditorEvent } from "../../events";
import type { PcEditorEffectPanelCategory, PcEditorEffectPanelItem } from "../types";
import {
  findEffectShortcutCategory,
  findEffectShortcutItem,
  isDigitShortcutKey,
  isEditableShortcutTarget,
  type EffectShortcutState
} from "./effectShortcutStateMachine";

type ShortcutKeyboardEventLike = {
  key: string;
  preventDefault?: () => void;
  repeat?: boolean;
  target?: EventTarget | null;
};

type ShortcutKeyPayload = {
  key?: unknown;
  repeat?: unknown;
};

type UseEffectShortcutBindingsOptions = {
  categories: PcEditorEffectPanelCategory[];
  enabled?: boolean;
  isHoldEffect?: (effect: PcEditorEffectPanelItem, category: PcEditorEffectPanelCategory) => boolean;
  onEnsurePanelOpen?: () => void;
  onHoldEnd: () => void;
  onHoldStart: (category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem, key: string) => void;
  onOpenCategory?: (category: PcEditorEffectPanelCategory) => void;
  onSelectEffect: (category: PcEditorEffectPanelCategory, effect: PcEditorEffectPanelItem) => void;
};

const DEFAULT_HOLD_EFFECT_IDS = new Set(["black-fade", "white-fade"]);

function shortcutEventToKeyInput(event: PcEditorEvent): ShortcutKeyboardEventLike | null {
  const payload = event.payload as ShortcutKeyPayload | string | null | undefined;
  const key =
    typeof payload === "string"
      ? payload
      : typeof payload === "object" && payload !== null && typeof payload.key === "string"
        ? payload.key
        : null;

  if (!key) {
    return null;
  }

  return {
    key,
    repeat: typeof payload === "object" && payload !== null && typeof payload.repeat === "boolean" ? payload.repeat : event.meta.repeat
  };
}

export function useEffectShortcutBindings({
  categories,
  enabled = true,
  isHoldEffect = (effect) => DEFAULT_HOLD_EFFECT_IDS.has(effect.id),
  onEnsurePanelOpen,
  onHoldEnd,
  onHoldStart,
  onOpenCategory,
  onSelectEffect
}: UseEffectShortcutBindingsOptions) {
  const bus = useOptionalPcEditorEventBus();
  const [shortcut, setShortcut] = useState<EffectShortcutState>({ mode: "hidden" });
  const shortcutRef = useRef<EffectShortcutState>({ mode: "hidden" });
  const hideTimerRef = useRef<number | null>(null);
  const holdKeyRef = useRef<string | null>(null);

  const setShortcutState = (nextShortcut: EffectShortcutState) => {
    shortcutRef.current = nextShortcut;
    setShortcut(nextShortcut);
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const hideAfter = (delayMs: number) => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setShortcutState({ mode: "hidden" });
      hideTimerRef.current = null;
    }, delayMs);
  };

  const showSelected = (
    category: PcEditorEffectPanelCategory,
    effect: PcEditorEffectPanelItem,
    hideDelayMs = 1200
  ) => {
    clearHideTimer();
    setShortcutState({ category, effect, mode: "selected" });
    hideAfter(hideDelayMs);
  };

  useEffect(() => () => clearHideTimer(), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const openShortcutCategories = (event?: Pick<ShortcutKeyboardEventLike, "preventDefault">) => {
      event?.preventDefault?.();
      clearHideTimer();
      onEnsurePanelOpen?.();
      setShortcutState({ mode: "category" });
    };

    const handleShortcutKeyDown = (event: ShortcutKeyboardEventLike) => {
      if (isEditableShortcutTarget(event.target ?? null)) {
        return;
      }

      const key = event.key.toLowerCase();
      const currentShortcut = shortcutRef.current;

      if (key === " " || key === "spacebar") {
        return;
      }

      if (event.repeat) {
        if (currentShortcut.mode !== "hidden") {
          event.preventDefault?.();
        }
        return;
      }

      if (key === "tab") {
        openShortcutCategories(event);
        return;
      }

      if (key === "escape" && currentShortcut.mode !== "hidden") {
        event.preventDefault?.();
        if (currentShortcut.mode === "holding") {
          holdKeyRef.current = null;
          onHoldEnd();
        }
        setShortcutState({ mode: "hidden" });
        return;
      }

      if (!isDigitShortcutKey(key)) {
        return;
      }

      if (currentShortcut.mode === "category") {
        const category = findEffectShortcutCategory(categories, key);

        if (!category) {
          return;
        }

        event.preventDefault?.();
        clearHideTimer();
        onOpenCategory?.(category);
        setShortcutState({ category, mode: "effect" });
        return;
      }

      if (currentShortcut.mode === "effect") {
        const effect = findEffectShortcutItem(currentShortcut.category, key);

        if (!effect) {
          return;
        }

        event.preventDefault?.();
        clearHideTimer();
        if (isHoldEffect(effect, currentShortcut.category)) {
          holdKeyRef.current = key;
          setShortcutState({ category: currentShortcut.category, effect, mode: "holding" });
          onHoldStart(currentShortcut.category, effect, key);
        } else {
          setShortcutState({ category: currentShortcut.category, effect, mode: "selected" });
          hideAfter(1200);
          onSelectEffect(currentShortcut.category, effect);
        }
      }
    };

    const handleShortcutKeyUp = (event: ShortcutKeyboardEventLike) => {
      const key = event.key.toLowerCase();
      const currentShortcut = shortcutRef.current;

      if (key === "tab" && currentShortcut.mode !== "holding" && !isEditableShortcutTarget(event.target ?? null)) {
        openShortcutCategories(event);
        return;
      }

      if (currentShortcut.mode !== "holding" || holdKeyRef.current !== key) {
        return;
      }

      event.preventDefault?.();
      holdKeyRef.current = null;
      onHoldEnd();
      setShortcutState({ category: currentShortcut.category, effect: currentShortcut.effect, mode: "selected" });
      hideAfter(800);
    };

    const handleKeyDown = (event: KeyboardEvent) => handleShortcutKeyDown(event);
    const handleKeyUp = (event: KeyboardEvent) => handleShortcutKeyUp(event);
    const unsubscribeBusEvents = bus
      ? [
          bus.on("editor.effects.shortcut.open", () => openShortcutCategories()),
          bus.on("editor.effects.shortcut.key.down", (event) => {
            const input = shortcutEventToKeyInput(event);

            if (input) {
              handleShortcutKeyDown(input);
            }
          }),
          bus.on("editor.effects.shortcut.key.up", (event) => {
            const input = shortcutEventToKeyInput(event);

            if (input) {
              handleShortcutKeyUp(input);
            }
          })
        ]
      : [];

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      unsubscribeBusEvents.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    bus,
    categories,
    enabled,
    isHoldEffect,
    onEnsurePanelOpen,
    onHoldEnd,
    onHoldStart,
    onOpenCategory,
    onSelectEffect
  ]);

  return {
    clearHideTimer,
    hideAfter,
    shortcut,
    showSelected
  };
}
