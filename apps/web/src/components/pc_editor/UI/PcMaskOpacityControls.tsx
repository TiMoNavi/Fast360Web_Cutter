"use client";

import type { CropMaskState } from "../webxr/AFrameCropViewportMask";

type PcMaskOpacityControlsProps = {
  cropMaskState: CropMaskState;
  onSetOpacity: (opacity: number, durationMs?: number) => void;
  pcWorkbench: boolean;
};

export function PcMaskOpacityControls({ cropMaskState, onSetOpacity, pcWorkbench }: PcMaskOpacityControlsProps) {
  return (
    <div
      className={pcWorkbench ? "aframe-crop-mask-controls xr-session-mask-controls" : "aframe-crop-mask-controls"}
      data-testid="aframe-crop-mask-controls"
    >
      <label htmlFor="aframe-crop-mask-opacity">Mask opacity</label>
      <input
        id="aframe-crop-mask-opacity"
        data-testid="aframe-crop-mask-opacity"
        max="0.95"
        min="0"
        onChange={(event) => onSetOpacity(Number(event.currentTarget.value))}
        step="0.01"
        type="range"
        value={cropMaskState.maskOpacity}
      />
      <button data-testid="aframe-crop-mask-fade-out" onClick={() => onSetOpacity(0, 700)} type="button">
        Clear
      </button>
      <button data-testid="aframe-crop-mask-fade-in" onClick={() => onSetOpacity(0.74, 900)} type="button">
        Deepen
      </button>
    </div>
  );
}
