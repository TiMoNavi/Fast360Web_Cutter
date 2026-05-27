"use client";

import styles from "../../PlayerV2.module.css";

type EditorWorkbenchProps = {
  fov: number;
  onFovChange: (delta: number) => void;
  onStartCrop: () => void;
  onEndCrop: () => void;
};

export function EditorWorkbench({
  fov,
  onFovChange,
  onStartCrop,
  onEndCrop
}: EditorWorkbenchProps) {
  return (
    <div className={styles.editorWorkbench}>
      <div className={styles.workbenchSection}>
        <span>FOV: {fov}°</span>
        <button type="button" onClick={() => onFovChange(-5)}>
          -
        </button>
        <button type="button" onClick={() => onFovChange(5)}>
          +
        </button>
      </div>
      <div className={styles.workbenchSection}>
        <button type="button" onClick={onStartCrop}>
          Start Crop
        </button>
        <button type="button" onClick={onEndCrop}>
          End Crop
        </button>
      </div>
    </div>
  );
}
