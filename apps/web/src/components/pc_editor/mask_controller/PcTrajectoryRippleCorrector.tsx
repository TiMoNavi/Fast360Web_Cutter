"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  PC_DEFAULT_MOTION_CONFIG,
  PC_FAST_MOTION_CONFIG,
  addMotionDelta,
  normalizeMotionCenter,
  sphericalDistanceDeg,
  stepTowardTarget,
  type PcMotionConfig,
  type PcMotionVector
} from "./operations/motionSmoothing";

export type PcViewCenter = {
  pitch: number;
  yaw: number;
};

export type PcTrajectoryRippleCorrectorHandle = {
  bindMove: (delta: PcViewCenter, durationMs?: number) => void;
  moveMaskTo: (target: PcViewCenter, durationMs?: number) => void;
  syncCamera: (camera: PcViewCenter) => void;
  sync: (state: { camera: PcViewCenter; mask: PcViewCenter }) => void;
  stop: () => void;
  trackMaskToCenter: (target: PcViewCenter, durationMs?: number) => void;
};

type PcTrajectoryRippleCorrectorProps = {
  enabled: boolean;
  onCameraCenter: (center: PcViewCenter, phase: "change" | "end") => void;
  onMaskCenter: (center: PcViewCenter, phase: "change" | "end") => void;
};

type AnimationState = {
  cameraTarget: PcViewCenter;
  cameraVelocity: PcMotionVector;
  config: PcMotionConfig;
  emitCamera: boolean;
  maskTarget: PcViewCenter;
  maskVelocity: PcMotionVector;
  startedAt: number;
};

function addCenter(center: PcViewCenter, delta: PcViewCenter) {
  return addMotionDelta(center, {
    pitch: delta.pitch,
    yaw: delta.yaw
  });
}

function configForMove({
  distance,
  durationMs,
  fast
}: {
  distance: number;
  durationMs?: number;
  fast?: boolean;
}): PcMotionConfig {
  const base = fast ? PC_FAST_MOTION_CONFIG : PC_DEFAULT_MOTION_CONFIG;

  if (!durationMs || durationMs <= 0 || distance <= 0.001) {
    return base;
  }

  const seconds = Math.max(0.08, durationMs / 1000);
  const timedSpeed = Math.max(70, (distance / seconds) * 1.72);
  const maxSpeedDegPerSecond = Math.min(
    fast ? 720 : 520,
    Math.max(base.maxSpeedDegPerSecond, timedSpeed)
  );

  return {
    ...base,
    accelerationDegPerSecond2: Math.max(base.accelerationDegPerSecond2, maxSpeedDegPerSecond * 4.8),
    brakeDegPerSecond2: Math.max(base.brakeDegPerSecond2, maxSpeedDegPerSecond * 5.8),
    maxSpeedDegPerSecond
  };
}

export const PcTrajectoryRippleCorrector = forwardRef<PcTrajectoryRippleCorrectorHandle, PcTrajectoryRippleCorrectorProps>(
  function PcTrajectoryRippleCorrector({ enabled, onCameraCenter, onMaskCenter }, ref) {
    const cameraRef = useRef<PcViewCenter>({ pitch: 0, yaw: 0 });
    const maskRef = useRef<PcViewCenter>({ pitch: 0, yaw: 0 });
    const animationRef = useRef<AnimationState | null>(null);
    const frameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);

    function cancelFrame() {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }

    function apply(
      camera: PcViewCenter,
      mask: PcViewCenter,
      phase: "change" | "end" = "change",
      options: { emitCamera?: boolean; emitMask?: boolean } = {}
    ) {
      const emitCamera = options.emitCamera ?? true;
      const emitMask = options.emitMask ?? true;
      const nextCamera = normalizeMotionCenter(camera);
      const nextMask = normalizeMotionCenter(mask);
      cameraRef.current = nextCamera;
      maskRef.current = nextMask;
      if (emitCamera) {
        onCameraCenter(nextCamera, phase);
      }
      if (emitMask) {
        onMaskCenter(nextMask, phase);
      }
    }

    function startOrUpdate(animation: Omit<AnimationState, "cameraVelocity" | "maskVelocity" | "startedAt">) {
      if (!enabled) {
        apply(animation.cameraTarget, animation.maskTarget, "end", { emitCamera: animation.emitCamera });
        return;
      }

      const active = animationRef.current;
      animationRef.current = {
        ...animation,
        cameraVelocity: active?.cameraVelocity ?? { pitch: 0, yaw: 0 },
        maskVelocity: active?.maskVelocity ?? { pitch: 0, yaw: 0 },
        startedAt: active?.startedAt ?? performance.now()
      };

      if (frameRef.current !== null) {
        return;
      }

      const tick = (time: number) => {
        const active = animationRef.current;
        if (!active) {
          frameRef.current = null;
          lastTimeRef.current = null;
          return;
        }

        const lastTime = lastTimeRef.current ?? time;
        const deltaSeconds = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
        lastTimeRef.current = time;
        const cameraStep = active.emitCamera
          ? stepTowardTarget({
              config: active.config,
              current: cameraRef.current,
              deltaSeconds,
              target: active.cameraTarget,
              velocity: active.cameraVelocity
            })
          : {
              center: active.cameraTarget,
              done: true,
              velocity: { pitch: 0, yaw: 0 }
            };
        const maskStep = stepTowardTarget({
          config: active.config,
          current: maskRef.current,
          deltaSeconds,
          target: active.maskTarget,
          velocity: active.maskVelocity
        });

        active.cameraVelocity = cameraStep.velocity;
        active.maskVelocity = maskStep.velocity;
        if (cameraStep.done && maskStep.done) {
          apply(cameraStep.center, maskStep.center, "end", { emitCamera: active.emitCamera });
          animationRef.current = null;
          frameRef.current = null;
          lastTimeRef.current = null;
          return;
        }

        apply(cameraStep.center, maskStep.center, "change", { emitCamera: active.emitCamera });
        frameRef.current = window.requestAnimationFrame(tick);
      };

      frameRef.current = window.requestAnimationFrame(tick);
    }

    useImperativeHandle(ref, () => ({
      bindMove(delta, durationMs = 130) {
        const normalizedDelta = normalizeMotionCenter(delta);
        const cameraFrom = cameraRef.current;
        const maskFrom = maskRef.current;
        const cameraTarget = addCenter(cameraFrom, normalizedDelta);
        const maskTarget = addCenter(maskFrom, normalizedDelta);
        const distance = Math.max(
          sphericalDistanceDeg(cameraFrom, cameraTarget),
          sphericalDistanceDeg(maskFrom, maskTarget)
        );
        startOrUpdate({
          cameraTarget,
          config: configForMove({ distance, durationMs, fast: durationMs <= 140 }),
          emitCamera: true,
          maskTarget
        });
      },
      moveMaskTo(target, durationMs = 700) {
        const camera = cameraRef.current;
        const maskTarget = normalizeMotionCenter(target);
        const distance = sphericalDistanceDeg(maskRef.current, maskTarget);
        startOrUpdate({
          cameraTarget: camera,
          config: configForMove({ distance, durationMs }),
          emitCamera: false,
          maskTarget
        });
      },
      syncCamera(camera) {
        cameraRef.current = normalizeMotionCenter(camera);
        const active = animationRef.current;
        if (active) {
          active.cameraTarget = cameraRef.current;
          if (!active.emitCamera) {
            active.cameraVelocity = { pitch: 0, yaw: 0 };
          }
        }
      },
      trackMaskToCenter(target, durationMs = 180) {
        const center = normalizeMotionCenter(target);
        const distance = sphericalDistanceDeg(maskRef.current, center);
        startOrUpdate({
          cameraTarget: cameraRef.current,
          config: configForMove({ distance, durationMs, fast: durationMs <= 220 }),
          emitCamera: false,
          maskTarget: center
        });
      },
      sync(state) {
        if (animationRef.current) {
          return;
        }
        cameraRef.current = normalizeMotionCenter(state.camera);
        maskRef.current = normalizeMotionCenter(state.mask);
      },
      stop() {
        animationRef.current = null;
        lastTimeRef.current = null;
        cancelFrame();
      }
    }), [enabled, onCameraCenter, onMaskCenter]);

    useEffect(() => () => {
      animationRef.current = null;
      lastTimeRef.current = null;
      cancelFrame();
    }, []);

    return null;
  }
);
