"use client";

import { usePcEditorXrSession } from "@/components/pc_editor/state";
import styles from "../PlayerV2.module.css";

type XrHudProps = {
  disabled?: boolean;
  status: string;
  onStartXr: () => void;
};

export function XrHud({ disabled = false, status, onStartXr }: XrHudProps) {
  const xrSession = usePcEditorXrSession();
  const resolvedStatus = xrSession?.message || status;
  const resolvedDisabled = disabled || xrSession?.sessionState === "requesting" || xrSession?.presenting === true || xrSession?.canEnter === false;

  return (
    <div className={styles.xrHud}>
      <span>{resolvedStatus}</span>
      <button disabled={resolvedDisabled} data-testid="player-v2-metavr-button" type="button" onClick={onStartXr}>
        MetaVR
      </button>
    </div>
  );
}
