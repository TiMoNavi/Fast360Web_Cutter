"use client";

import styles from "../PlayerV2.module.css";

type XrHudProps = {
  status: string;
  onStartXr: () => void;
};

export function XrHud({ status, onStartXr }: XrHudProps) {
  return (
    <div className={styles.xrHud}>
      <span>{status}</span>
      <button type="button" onClick={onStartXr}>
        Start Meta VR
      </button>
    </div>
  );
}
