"use client";

import styles from "../PlayerV3.module.css";

type XrHudProps = {
  disabled?: boolean;
  status: string;
  onStartXr: () => void;
};

export function XrHud({ disabled = false, status, onStartXr }: XrHudProps) {
  return (
    <div className={styles.xrHud}>
      <span>{status}</span>
      <button disabled={disabled} type="button" onClick={onStartXr}>
        Start Meta VR
      </button>
    </div>
  );
}
