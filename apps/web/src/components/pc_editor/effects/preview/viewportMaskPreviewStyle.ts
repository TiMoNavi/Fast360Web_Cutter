import type { CSSProperties } from "react";
import type { PcEditorMaskViewportBounds } from "../../state";

export type EffectPreviewStyleVars = CSSProperties & Record<`--${string}`, string>;

export function createViewportMaskPreviewStyle(
  maskViewportBounds: PcEditorMaskViewportBounds | null
): EffectPreviewStyleVars | undefined {
  const rect = maskViewportBounds?.screenRect;

  if (!rect || rect.width < 8 || rect.height < 8) {
    return undefined;
  }

  const screenCorners = maskViewportBounds.corners
    .map((corner) => corner.screen)
    .filter((corner): corner is { x: number; y: number } => Boolean(corner));
  const clipPath = screenCorners.length === 4
    ? `polygon(${screenCorners
        .map((corner) => {
          const x = ((corner.x - rect.left) / rect.width) * 100;
          const y = ((corner.y - rect.top) / rect.height) * 100;
          return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
        })
        .join(", ")})`
    : "none";

  return {
    "--pc-mask-aspect-ratio": "auto",
    "--pc-mask-clip-path": clipPath,
    "--pc-mask-height": `${rect.height}px`,
    "--pc-mask-left": `${rect.left + rect.width / 2}px`,
    "--pc-mask-max-width": "none",
    "--pc-mask-top": `${rect.top + rect.height / 2}px`,
    "--pc-mask-transform": "translate(-50%, -50%)",
    "--pc-mask-width": `${rect.width}px`
  };
}
