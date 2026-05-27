import type { PcEditorEffectPanelCategory, PcEditorEffectPanelItem } from "../types";

export type EffectShortcutState =
  | { mode: "hidden" }
  | { mode: "category" }
  | { category: PcEditorEffectPanelCategory; mode: "effect" }
  | { category: PcEditorEffectPanelCategory; effect: PcEditorEffectPanelItem; mode: "holding" }
  | { category: PcEditorEffectPanelCategory; effect: PcEditorEffectPanelItem; mode: "selected" };

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function isDigitShortcutKey(key: string) {
  return /^[0-9]$/.test(key);
}

export function findEffectShortcutCategory(categories: PcEditorEffectPanelCategory[], key: string) {
  return categories.find((category) => category.key === key) ?? null;
}

export function findEffectShortcutItem(category: PcEditorEffectPanelCategory, key: string) {
  return category.effects.find((effect) => effect.key === key) ?? null;
}
