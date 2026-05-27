"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { getPcEditorFrontendPlaybackRate } from "../state";

export type PcViewCenter = {
  pitch: number;
  yaw: number;
};

export type PcTrajectoryRippleCorrectorHandle = {
  bindMove: (delta: PcViewCenter, durationMs?: number) => void;
  moveMaskTo: (target: PcViewCenter, durationMs?: number) => void;
  sync: (state: { camera: PcViewCenter; mask: PcViewCenter }) => void;
  stop: () => void;
};

type PcTrajectoryRippleCorrectorProps = {
  enabled: boolean;
  onCameraCenter: (center: PcViewCenter) => void;
  onMaskCenter: (center: PcViewCenter) => void;
};

type AnimationState = {
  cameraFrom: PcViewCenter;
  cameraTo: PcViewCenter;
  durationMs: number;
  maskFrom: PcViewCenter;
  maskTo: PcViewCenter;
  startedAt: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYaw(yaw: number) {
  let nextYaw = yaw;
  while (nextYaw > 180) {
    nextYaw -= 360;
  }
  while (nextYaw < -180) {
    nextYaw += 360;
  }
  return Object.is(nextYaw, -0) ? 0 : Number(nextYaw.toFixed(3));
}

function normalizeCenter(center: PcViewCenter) {
  return {
    pitch: Number(clamp(center.pitch, -85, 85).toFixed(3)),
    yaw: normalizeYaw(center.yaw)
  };
}

function addCenter(center: PcViewCenter, delta: PcViewCenter) {
  return normalizeCenter({
    pitch: center.pitch + delta.pitch,
    yaw: center.yaw + delta.yaw
  });
}

function easeOutCubic(t: number) {
  const p = clamp(t, 0, 1);
  return 1 - Math.pow(1 - p, 3);
}

function lerpAngle(from: number, to: number, t: number) {
  let delta = to - from;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  return normalizeYaw(from + delta * t);
}

function lerpCenter(from: PcViewCenter, to: PcViewCenter, t: number) {
  return normalizeCenter({
    pitch: from.pitch + (to.pitch - from.pitch) * t,
    yaw: lerpAngle(from.yaw, to.yaw, t)
  });
}

export const PcTrajectoryRippleCorrector = forwardRef<PcTrajectoryRippleCorrectorHandle, PcTrajectoryRippleCorrectorProps>(
  function PcTrajectoryRippleCorrector({ enabled, onCameraCenter, onMaskCenter }, ref) {
    const cameraRef = useRef<PcViewCenter>({ pitch: 0, yaw: 0 });
    const maskRef = useRef<PcViewCenter>({ pitch: 0, yaw: 0 });
    const animationRef = useRef<AnimationState | null>(null);
    const frameRef = useRef<number | null>(null);

    function cancelFrame() {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }

    function apply(camera: PcViewCenter, mask: PcViewCenter) {
      const nextCamera = normalizeCenter(camera);
      const nextMask = normalizeCenter(mask);
      cameraRef.current = nextCamera;
      maskRef.current = nextMask;
      onCameraCenter(nextCamera);
      onMaskCenter(nextMask);
    }

    function start(animation: AnimationState) {
      if (!enabled) {
        apply(animation.cameraTo, animation.maskTo);
        return;
      }

      animationRef.current = animation;
      cancelFrame();

      const tick = (time: number) => {
        const active = animationRef.current;
        if (!active) {
          frameRef.current = null;
          return;
        }

        const progress = easeOutCubic(((time - active.startedAt) * getPcEditorFrontendPlaybackRate()) / Math.max(active.durationMs, 1));
        const camera = lerpCenter(active.cameraFrom, active.cameraTo, progress);
        const mask = lerpCenter(active.maskFrom, active.maskTo, progress);
        apply(camera, mask);

        if (progress >= 1) {
          animationRef.current = null;
          frameRef.current = null;
          return;
        }

        frameRef.current = window.requestAnimationFrame(tick);
      };

      frameRef.current = window.requestAnimationFrame(tick);
    }

    useImperativeHandle(ref, () => ({
      bindMove(delta, durationMs = 130) {
        const normalizedDelta = normalizeCenter(delta);
        const cameraFrom = cameraRef.current;
        const maskFrom = maskRef.current;
        start({
          cameraFrom,
          cameraTo: addCenter(cameraFrom, normalizedDelta),
          durationMs,
          maskFrom,
          maskTo: addCenter(maskFrom, normalizedDelta),
          startedAt: performance.now()
        });
      },
      moveMaskTo(target, durationMs = 700) {
        const camera = cameraRef.current;
        const maskFrom = maskRef.current;
        start({
          cameraFrom: camera,
          cameraTo: camera,
          durationMs,
          maskFrom,
          maskTo: normalizeCenter(target),
          startedAt: performance.now()
        });
      },
      sync(state) {
        if (animationRef.current) {
          return;
        }
        cameraRef.current = normalizeCenter(state.camera);
        maskRef.current = normalizeCenter(state.mask);
      },
      stop() {
        animationRef.current = null;
        cancelFrame();
      }
    }), [enabled, onCameraCenter, onMaskCenter]);

    useEffect(() => () => {
      animationRef.current = null;
      cancelFrame();
    }, []);

    return null;
  }
);
