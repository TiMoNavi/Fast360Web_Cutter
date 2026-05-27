"use client";

import { useEffect, useRef } from "react";
import { PC_EDITOR_RATE_DEFAULT } from "../controls/operations/rateCurve";
import { usePcEditorEventEmitter } from "../events";
import { getPcEditorRuntimeState, setPcEditorRateState } from "../state";

const PC_BULLET_TIME_KEY_CODE = "KeyT";
const PC_BULLET_TIME_PLAYBACK_RATE = 0.1;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function usePcBulletTimeToggle({ enabled = true }: { enabled?: boolean } = {}) {
  const emit = usePcEditorEventEmitter();
  const activeRef = useRef(false);
  const restoreRateRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const setPlaybackRate = (playbackRate: number, phase: "end" | "start") => {
      setPcEditorRateState({
        bulletTimeActive: phase === "start",
        frontendPlaybackRate: phase === "start" ? PC_BULLET_TIME_PLAYBACK_RATE : PC_EDITOR_RATE_DEFAULT
      });
      emit({
        type: "player.playback.rate.set",
        payload: { playbackRate },
        source: {
          kind: "keyboard",
          id: "pc-t-bullet-time",
          device: "pc"
        },
        meta: { phase }
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== PC_BULLET_TIME_KEY_CODE ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      const playbackRate = getPcEditorRuntimeState().playback?.playbackRate ?? PC_EDITOR_RATE_DEFAULT;

      if (activeRef.current) {
        const restoreRate = restoreRateRef.current ?? PC_EDITOR_RATE_DEFAULT;

        activeRef.current = false;
        restoreRateRef.current = null;
        setPlaybackRate(restoreRate, "end");
        return;
      }

      activeRef.current = true;
      restoreRateRef.current =
        playbackRate > PC_BULLET_TIME_PLAYBACK_RATE + 0.01 ? playbackRate : PC_EDITOR_RATE_DEFAULT;
      setPlaybackRate(PC_BULLET_TIME_PLAYBACK_RATE, "start");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [emit, enabled]);
}
