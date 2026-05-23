"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import type { CropMaskState } from "../../webxr/AFrameCropViewportMask";
import type { AFrame360PlaybackState } from "../types";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcPlaybackOperations } from "../operations/playbackOperations";
import type { PcRateWheelTarget } from "../operations/rateCurve";
import type { PcTimelineOperations } from "../operations/timelineOperations";
import { normalizeViewCenter } from "../operations/viewGeometry";
import { isEditableTarget } from "./domTargetGuards";

const KEYBOARD_MASK_SPEED_DEG_PER_SECOND = 42;
const KEYBOARD_MASK_FOV_SPEED_DEG_PER_SECOND = 48;
const DISCARD_HOLD_THRESHOLD_MS = 400;

export type PcDiscardRange = {
  endMs: number;
  startMs: number;
};

export type PcDiscardNoticeTone = "idle" | "active" | "success" | "warning";

export type PcDiscardNotice = {
  active: boolean;
  lastRange: PcDiscardRange | null;
  message: string;
  tone: PcDiscardNoticeTone;
  visible: boolean;
};

export type PcDiscardNoticePatch = Partial<PcDiscardNotice>;

type DiscardHoldState = {
  active: boolean;
  keyHeld: boolean;
  startMs: number;
  timer: number | null;
};

function formatDiscardTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function usePcKeyboardShortcuts({
  cropMaskState,
  mask,
  onDiscardNotice,
  pcWorkbench,
  playback,
  playbackState,
  rateWheelTargetRef,
  setRateWheelTarget,
  timeline
}: {
  cropMaskState: CropMaskState;
  mask: PcMaskOperations;
  onDiscardNotice: (patch: PcDiscardNoticePatch, autoHideMs?: number) => void;
  pcWorkbench: boolean;
  playback: PcPlaybackOperations;
  playbackState: AFrame360PlaybackState;
  rateWheelTargetRef: MutableRefObject<PcRateWheelTarget>;
  setRateWheelTarget: (target: PcRateWheelTarget) => void;
  timeline: PcTimelineOperations;
}) {
  const heldKeysRef = useRef(new Set<string>());
  const discardHoldRef = useRef<DiscardHoldState | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const latestCenterRef = useRef(cropMaskState.center);
  const latestFovRef = useRef(cropMaskState.fov.h);
  const latestPlaybackStateRef = useRef(playbackState);
  const maskRef = useRef(mask);
  const onDiscardNoticeRef = useRef(onDiscardNotice);
  const playbackRef = useRef(playback);
  const timelineRef = useRef(timeline);

  useEffect(() => {
    latestCenterRef.current = cropMaskState.center;
    latestFovRef.current = cropMaskState.fov.h;
    latestPlaybackStateRef.current = playbackState;
  }, [cropMaskState.center, cropMaskState.fov.h, playbackState]);

  useEffect(() => {
    maskRef.current = mask;
    onDiscardNoticeRef.current = onDiscardNotice;
    playbackRef.current = playback;
    timelineRef.current = timeline;
  }, [mask, onDiscardNotice, playback, timeline]);

  useEffect(() => {
    const stopLoop = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };

    const tick = (time: number) => {
      const held = heldKeysRef.current;
      const yawAxis = (held.has("keyd") ? 1 : 0) - (held.has("keya") ? 1 : 0);
      const pitchAxis = (held.has("keyw") ? 1 : 0) - (held.has("keys") ? 1 : 0);
      const fovAxis = (held.has("keye") ? 1 : 0) - (held.has("keyq") ? 1 : 0);

      if (!yawAxis && !pitchAxis && !fovAxis) {
        stopLoop();
        return;
      }

      const last = lastFrameTimeRef.current ?? time;
      const deltaSeconds = Math.min(0.05, Math.max(0, (time - last) / 1000));
      lastFrameTimeRef.current = time;
      if (yawAxis || pitchAxis) {
        const length = Math.hypot(yawAxis, pitchAxis) || 1;
        const speed = KEYBOARD_MASK_SPEED_DEG_PER_SECOND;
        const nextCenter = normalizeViewCenter({
          pitch: latestCenterRef.current.pitch + (pitchAxis / length) * speed * deltaSeconds,
          yaw: latestCenterRef.current.yaw + (yawAxis / length) * speed * deltaSeconds
        });

        latestCenterRef.current = nextCenter;
        maskRef.current.setPreviewCenter(nextCenter);
      }

      if (fovAxis) {
        latestFovRef.current += fovAxis * KEYBOARD_MASK_FOV_SPEED_DEG_PER_SECOND * deltaSeconds;
        maskRef.current.setPreviewFov(latestFovRef.current, 0);
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (frameRef.current === null) {
        lastFrameTimeRef.current = null;
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };
    const setWheelTarget = (target: PcRateWheelTarget) => {
      rateWheelTargetRef.current = target;
      setRateWheelTarget(target);
    };
    const clearDiscardTimer = (hold: DiscardHoldState) => {
      if (hold.timer !== null) {
        window.clearTimeout(hold.timer);
        hold.timer = null;
      }
    };
    const finishDiscardHold = (mode: "release" | "cancel" = "release") => {
      const hold = discardHoldRef.current;

      if (!hold) {
        return;
      }

      clearDiscardTimer(hold);
      hold.keyHeld = false;
      discardHoldRef.current = null;

      if (!hold.active) {
        if (mode === "release") {
          onDiscardNoticeRef.current(
            {
              active: false,
              message: "Hold Del a little longer to mark a discard range.",
              tone: "warning",
              visible: true
            },
            1600
          );
        }
        return;
      }

      const endMs = Math.max(hold.startMs + 1, latestPlaybackStateRef.current.currentTimeMs);
      timelineRef.current.endDiscardRange(hold.startMs, endMs);
      onDiscardNoticeRef.current(
        {
          active: false,
          lastRange: {
            endMs,
            startMs: hold.startMs
          },
          message: `Marked discard ${formatDiscardTime(hold.startMs)}-${formatDiscardTime(endMs)}.`,
          tone: mode === "cancel" ? "warning" : "success",
          visible: true
        },
        mode === "cancel" ? 1800 : 2600
      );
    };
    const beginDiscardHold = () => {
      if (discardHoldRef.current) {
        return;
      }

      const currentPlayback = latestPlaybackStateRef.current;
      if (!currentPlayback.isPlaying) {
        onDiscardNoticeRef.current(
          {
            active: false,
            message: "Play the video, then hold Del to mark a discard range.",
            tone: "warning",
            visible: true
          },
          1800
        );
        return;
      }

      const hold: DiscardHoldState = {
        active: false,
        keyHeld: true,
        startMs: currentPlayback.currentTimeMs,
        timer: null
      };

      hold.timer = window.setTimeout(() => {
        if (!hold.keyHeld) {
          return;
        }

        const latestPlayback = latestPlaybackStateRef.current;
        if (!latestPlayback.isPlaying) {
          discardHoldRef.current = null;
          onDiscardNoticeRef.current(
            {
              active: false,
              message: "Discard marking needs the video to keep playing.",
              tone: "warning",
              visible: true
            },
            1800
          );
          return;
        }

        hold.active = true;
        timelineRef.current.beginDiscardRange(hold.startMs);
        onDiscardNoticeRef.current({
          active: true,
          message: "Discard marking is active. Release Del to finish this range.",
          tone: "active",
          visible: true
        });
      }, DISCARD_HOLD_THRESHOLD_MS);

      discardHoldRef.current = hold;
      onDiscardNoticeRef.current({
        active: false,
        message: "Hold Del to mark this playing segment as discarded.",
        tone: "warning",
        visible: true
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const code = event.code.toLowerCase();

      if (key === "delete" || code === "delete") {
        beginDiscardHold();
        event.preventDefault();
        return;
      }

      if (key === "t" || code === "keyt") {
        setWheelTarget("playback");
        event.preventDefault();
        return;
      }

      if (key === "r" || code === "keyr") {
        setWheelTarget("recording");
        event.preventDefault();
        return;
      }

      if (key === "h" || code === "keyh") {
        setWheelTarget("mask-opacity");
        event.preventDefault();
        return;
      }

      if (["keyw", "keya", "keys", "keyd", "keyq", "keye"].includes(code)) {
        heldKeysRef.current.add(code);
        ensureLoop();
        event.preventDefault();
        return;
      }

      if (key === " " || code === "space") {
        playbackRef.current.togglePlay();
        event.preventDefault();
        return;
      }

      if (key === "," || key === "<" || code === "comma" || code === "bracketleft") {
        playbackRef.current.setPlaybackRateByOffset(-1);
        event.preventDefault();
        return;
      }

      if (key === "." || key === ">" || code === "period" || code === "bracketright") {
        playbackRef.current.setPlaybackRateByOffset(1);
        event.preventDefault();
        return;
      }

      if (key === "p" || code === "keyp") {
        playbackRef.current.toggleDomPlaylist();
        event.preventDefault();
        return;
      }

      if (key === "f" || code === "keyf") {
        timelineRef.current.flushTimeline("live");
        event.preventDefault();
        return;
      }

      if (key === "c" || code === "keyc") {
        timelineRef.current.cutHere();
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const code = event.code.toLowerCase();
      const key = event.key.toLowerCase();

      if (key === "delete" || code === "delete") {
        finishDiscardHold("release");
        event.preventDefault();
        return;
      }

      if (code === "keyt" || code === "keyr" || code === "keyh") {
        setWheelTarget(null);
        event.preventDefault();
        return;
      }

      if (heldKeysRef.current.delete(code)) {
        if (!heldKeysRef.current.size) {
          stopLoop();
        }
        event.preventDefault();
      }
    };

    const handleBlur = () => {
      heldKeysRef.current.clear();
      setWheelTarget(null);
      finishDiscardHold("cancel");
      stopLoop();
    };

    if (!pcWorkbench) {
      handleBlur();
      return;
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      handleBlur();
    };
  }, [pcWorkbench, rateWheelTargetRef, setRateWheelTarget]);
}
