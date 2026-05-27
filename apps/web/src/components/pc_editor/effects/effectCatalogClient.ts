import { apiGet } from "@/lib/api";
import type {
  PcEditorEffectCatalog,
  PcEditorEffectPanelCategory,
  PcEditorEffectPanelItem
} from "./types";

export async function fetchPcEditorEffectCatalog() {
  return apiGet<PcEditorEffectCatalog>("/api/effects/catalog");
}

export function catalogToPanelCategories(catalog: PcEditorEffectCatalog): PcEditorEffectPanelCategory[] {
  return catalog.categories.map((category) => {
    const effects = catalog.effects
      .filter((effect) => effect.ui.visible && effect.ui.categoryId === category.id)
      .map<PcEditorEffectPanelItem>((effect) => ({
        categoryId: effect.ui.categoryId,
        conflictGroup: effect.render.conflictGroup,
        durationMs: effect.event.defaultDurationMs,
        eventName: effect.event.name,
        id: effect.id,
        key: effect.ui.key,
        label: effect.label,
        params: effect.event.defaultParams,
        previewMode: effect.preview.mode,
        previewTarget: effect.preview.target,
        renderFallback: effect.render.fallback,
        renderStage: effect.render.stage,
        renderSupported: effect.render.backendSupport === "supported",
        webxrSupport: effect.preview.webxrSupport
      }));

    return {
      ...category,
      effects
    };
  });
}
