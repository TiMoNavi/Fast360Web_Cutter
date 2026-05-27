import type { PcEffectPreviewDetail } from "./types";

export const WEBXR_PC_EFFECT_PREVIEW_EVENT = "webxr:pc-effect-preview";

export function dispatchDomEffectPreview(detail: PcEffectPreviewDetail) {
  window.dispatchEvent(
    new CustomEvent<PcEffectPreviewDetail>(WEBXR_PC_EFFECT_PREVIEW_EVENT, {
      detail
    })
  );
}
