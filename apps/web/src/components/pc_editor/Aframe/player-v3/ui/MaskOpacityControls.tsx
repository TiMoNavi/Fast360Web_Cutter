"use client";

import type { CropMaskState } from "../webxr/cropMaskComponents";
import styles from "./MaskOpacityControls.module.css";

type MaskOpacityControlsProps = {
  cropMaskState: CropMaskState;
  onSetOpacity: (opacity: number, durationMs?: number) => void;
};

export function MaskOpacityControls({ cropMaskState, onSetOpacity }: MaskOpacityControlsProps) {
  return (
    <div className={styles.root} data-testid="mask-opacity-controls">
      <label htmlFor="mask-opacity" className={styles.label}>
        Mask opacity
      </label>
      <input
        id="mask-opacity"
        data-testid="mask-opacity-slider"
        className={styles.slider}
        type="range"
        min="0"
        max="0.95"
        step="0.01"
        value={cropMaskState.maskOpacity}
        onChange={(event) => onSetOpacity(Number(event.currentTarget.value))}
      />
      <button
        className={styles.button}
        data-testid="mask-opacity-clear"
        type="button"
        onClick={() => onSetOpacity(0, 700)}
      >
        Clear
      </button>
      <button
        className={styles.button}
        data-testid="mask-opacity-deepen"
        type="button"
        onClick={() => onSetOpacity(0.74, 900)}
      >
        Deepen
      </button>
    </div>
  );
}
