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
const KEYBOARD_MASK_ACCEL_RESPONSE_SECONDS = 0.085;
const KEYBOARD_MASK_DECEL_RESPONSE_SECONDS = 0.18;
const KEYBOARD_MASK_STOP_EPSILON_DEG_PER_SECOND = 0.04;
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

function approachValue(current: number, target: number, deltaSeconds: number, responseSeconds: number) {
  const alpha = 1 - Math.exp(-deltaSeconds / responseSeconds);
  return current + (target - current) * alpha;
}

function consumeKeyboardEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
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
  const motionRef = useRef({
    fovVelocity: 0,
    pitchVelocity: 0,
    yawVelocity: 0
  });
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
    const clearMotion = () => {
      motionRef.current = {
        fovVelocity: 0,
        pitchVelocity: 0,
        yawVelocity: 0
      };
    };

    const tick = (time: number) => {
      const held = heldKeysRef.current;
      const yawAxis = (held.has("keyd") ? 1 : 0) - (held.has("keya") ? 1 : 0);
      const pitchAxis = (held.has("keyw") ? 1 : 0) - (held.has("keys") ? 1 : 0);
      const fovAxis = (held.has("keye") ? 1 : 0) - (held.has("keyq") ? 1 : 0);

      const last = lastFrameTimeRef.current ?? time;
      const deltaSeconds = Math.min(0.05, Math.max(0, (time - last) / 1000));
      lastFrameTimeRef.current = time;
      const length = Math.hypot(yawAxis, pitchAxis) || 1;
      const targetYawVelocity = yawAxis ? (yawAxis / length) * KEYBOARD_MASK_SPEED_DEG_PER_SECOND : 0;
      const targetPitchVelocity = pitchAxis ? (pitchAxis / length) * KEYBOARD_MASK_SPEED_DEG_PER_SECOND : 0;
      const targetFovVelocity = fovAxis * KEYBOARD_MASK_FOV_SPEED_DEG_PER_SECOND;
      const response =
        targetYawVelocity || targetPitchVelocity || targetFovVelocity
          ? KEYBOARD_MASK_ACCEL_RESPONSE_SECONDS
          : KEYBOARD_MASK_DECEL_RESPONSE_SECONDS;
      const motion = motionRef.current;

      motion.yawVelocity = approachValue(motion.yawVelocity, targetYawVelocity, deltaSeconds, response);
      motion.pitchVelocity = approachValue(motion.pitchVelocity, targetPitchVelocity, deltaSeconds, response);
      motion.fovVelocity = approachValue(motion.fovVelocity, targetFovVelocity, deltaSeconds, response);

      const maskMoving =
        Math.abs(motion.yawVelocity) > KEYBOARD_MASK_STOP_EPSILON_DEG_PER_SECOND ||
        Math.abs(motion.pitchVelocity) > KEYBOARD_MASK_STOP_EPSILON_DEG_PER_SECOND;
      const fovMoving = Math.abs(motion.fovVelocity) > KEYBOARD_MASK_STOP_EPSILON_DEG_PER_SECOND;

      if (!yawAxis && !pitchAxis && !fovAxis && !maskMoving && !fovMoving) {
        clearMotion();
        stopLoop();
        return;
      }

      if (maskMoving) {
        const nextCenter = normalizeViewCenter({
          pitch: latestCenterRef.current.pitch + motion.pitchVelocity * deltaSeconds,
          yaw: latestCenterRef.current.yaw + motion.yawVelocity * deltaSeconds
        });

        latestCenterRef.current = nextCenter;
        maskRef.current.setPreviewCenter(nextCenter);
      }

      if (fovMoving) {
        latestFovRef.current += motion.fovVelocity * deltaSeconds;
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
      const key = event.key.toLowerCase();
      const code = event.code.toLowerCase();

      const isSystemKey = event.key === "F5" || event.key === "F12" || (event.ctrlKey && key === "r");
      if (isSystemKey) {
        return;
      }

      if (key === " " || code === "space") {
        playbackRef.current.togglePlay();
        consumeKeyboardEvent(event);
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (key === "delete" || code === "delete") {
        beginDiscardHold();
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "z" || code === "keyz") {
        setWheelTarget("playback");
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "x" || code === "keyx") {
        setWheelTarget("recording");
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "c" || code === "keyc") {
        setWheelTarget("effect-speed");
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "h" || code === "keyh") {
        setWheelTarget("mask-opacity");
        consumeKeyboardEvent(event);
        return;
      }

      if (["keyw", "keya", "keys", "keyd", "keyq", "keye"].includes(code)) {
        heldKeysRef.current.add(code);
        ensureLoop();
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "," || key === "<" || code === "comma" || code === "bracketleft") {
        playbackRef.current.setPlaybackRateByOffset(-1);
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "." || key === ">" || code === "period" || code === "bracketright") {
        playbackRef.current.setPlaybackRateByOffset(1);
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "p" || code === "keyp") {
        playbackRef.current.toggleDomPlaylist();
        consumeKeyboardEvent(event);
        return;
      }

      if (key === "f" || code === "keyf") {
        timelineRef.current.flushTimeline("live");
        consumeKeyboardEvent(event);
        return;
      }

      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const code = event.code.toLowerCase();
      const key = event.key.toLowerCase();

      if (key === "delete" || code === "delete") {
        finishDiscardHold("release");
        consumeKeyboardEvent(event);
        return;
      }

      if (code === "keyz" || code === "keyx" || code === "keyc" || code === "keyh") {
        setWheelTarget(null);
        consumeKeyboardEvent(event);
        return;
      }

      if (heldKeysRef.current.delete(code)) {
        ensureLoop();
        consumeKeyboardEvent(event);
      }
    };

    const handleBlur = () => {
      heldKeysRef.current.clear();
      setWheelTarget(null);
      finishDiscardHold("cancel");
      clearMotion();
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
