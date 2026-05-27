"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";
import type { AFrame360PlaybackState } from "../types";
import { clampNumber, edgeAxisSpeed, viewCenterToScreenPoint } from "../operations/viewGeometry";
import { getPcEditorFrontendPlaybackRate } from "../../state";

const EDGE_PAN_ACCEL_RESPONSE_SECONDS = 0.16;
const EDGE_PAN_DECEL_RESPONSE_SECONDS = 0.24;
const EDGE_PAN_STOP_EPSILON_DEG_PER_SECOND = 0.04;

export type PcEdgePanControls = {
  edgePanActive: boolean;
  startEdgePanFromPointer: (x: number, y: number) => void;
  stopEdgePan: () => void;
  updateEdgePanFromMask: (maskCenter: PcViewCenter) => void;
  updateEdgePanFromPointer: (x: number, y: number) => void;
};

export function usePcEdgePan({
  cameraLookRef,
  mask,
  maskDragging,
  pcWorkbench,
  playbackState,
  sceneRef
}: {
  cameraLookRef: RefObject<PcViewCenter>;
  mask: PcMaskOperations;
  maskDragging: boolean;
  pcWorkbench: boolean;
  playbackState: AFrame360PlaybackState;
  sceneRef: RefObject<HTMLElement | null>;
}): PcEdgePanControls {
  const maskRef = useRef(mask);
  const edgePanRef = useRef({ pitchSpeed: 0, yawSpeed: 0 });
  const edgePanTargetRef = useRef({ pitchSpeed: 0, yawSpeed: 0 });
  const edgePanFrameRef = useRef<number | null>(null);
  const edgePanLastTimeRef = useRef<number | null>(null);
  const [edgePanActive, setEdgePanActive] = useState(false);

  useEffect(() => {
    maskRef.current = mask;
  }, [mask]);

  const updateEdgePanFromPointer = (x: number, y: number) => {
    const stage = sceneRef.current?.parentElement ?? document.documentElement;
    const bounds = stage.getBoundingClientRect();
    const localX = clampNumber(x - bounds.left, 0, bounds.width);
    const localY = clampNumber(y - bounds.top, 0, bounds.height);
    const yawSpeed = edgeAxisSpeed(localX, bounds.width);
    const pitchSpeed = edgeAxisSpeed(localY, bounds.height, true);
    const active = Math.abs(yawSpeed) > 0.01 || Math.abs(pitchSpeed) > 0.01;

    edgePanTargetRef.current = { pitchSpeed, yawSpeed };
    setEdgePanActive(active);
  };

  const updateEdgePanFromMask = (maskCenter: PcViewCenter) => {
    const stage = sceneRef.current?.parentElement ?? document.documentElement;
    const cameraLook = cameraLookRef.current ?? { pitch: 0, yaw: 0 };
    const screenPoint = viewCenterToScreenPoint({
      cameraLook,
      horizontalFov: playbackState.fov,
      maskCenter,
      stage
    });

    if (!screenPoint) {
      edgePanTargetRef.current = { pitchSpeed: 0, yawSpeed: 0 };
      setEdgePanActive(false);
      return;
    }

    const bounds = stage.getBoundingClientRect();
    const localX = clampNumber(screenPoint.x - bounds.left, 0, bounds.width);
    const localY = clampNumber(screenPoint.y - bounds.top, 0, bounds.height);
    const yawSpeed = edgeAxisSpeed(localX, bounds.width);
    const pitchSpeed = edgeAxisSpeed(localY, bounds.height, true);
    const active = Math.abs(yawSpeed) > 0.01 || Math.abs(pitchSpeed) > 0.01;

    edgePanTargetRef.current = { pitchSpeed, yawSpeed };
    setEdgePanActive(active);
  };

  const stopEdgePan = () => {
    edgePanRef.current = { pitchSpeed: 0, yawSpeed: 0 };
    edgePanTargetRef.current = { pitchSpeed: 0, yawSpeed: 0 };
    edgePanLastTimeRef.current = null;
    setEdgePanActive(false);
  };

  useEffect(() => {
    if (!pcWorkbench || !maskDragging) {
      if (edgePanFrameRef.current !== null) {
        window.cancelAnimationFrame(edgePanFrameRef.current);
        edgePanFrameRef.current = null;
      }
      stopEdgePan();
      return;
    }

    const tick = (time: number) => {
      const lastTime = edgePanLastTimeRef.current ?? time;
      const deltaSeconds = clampNumber((time - lastTime) / 1000, 0, 0.05);
      edgePanLastTimeRef.current = time;

      const target = edgePanTargetRef.current;
      const frontendRate = getPcEditorFrontendPlaybackRate();
      const response =
        Math.abs(target.yawSpeed) > EDGE_PAN_STOP_EPSILON_DEG_PER_SECOND ||
        Math.abs(target.pitchSpeed) > EDGE_PAN_STOP_EPSILON_DEG_PER_SECOND
          ? EDGE_PAN_ACCEL_RESPONSE_SECONDS / frontendRate
          : EDGE_PAN_DECEL_RESPONSE_SECONDS / frontendRate;
      const alpha = 1 - Math.exp(-deltaSeconds / response);
      edgePanRef.current = {
        pitchSpeed: edgePanRef.current.pitchSpeed + (target.pitchSpeed - edgePanRef.current.pitchSpeed) * alpha,
        yawSpeed: edgePanRef.current.yawSpeed + (target.yawSpeed - edgePanRef.current.yawSpeed) * alpha
      };
      const { pitchSpeed, yawSpeed } = edgePanRef.current;

      if (Math.abs(yawSpeed) > EDGE_PAN_STOP_EPSILON_DEG_PER_SECOND || Math.abs(pitchSpeed) > EDGE_PAN_STOP_EPSILON_DEG_PER_SECOND) {
        maskRef.current.bindMaskAndCameraBy(yawSpeed * deltaSeconds * frontendRate, pitchSpeed * deltaSeconds * frontendRate, 90);
      }

      edgePanFrameRef.current = window.requestAnimationFrame(tick);
    };

    edgePanFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (edgePanFrameRef.current !== null) {
        window.cancelAnimationFrame(edgePanFrameRef.current);
        edgePanFrameRef.current = null;
      }
      edgePanLastTimeRef.current = null;
    };
  }, [maskDragging, pcWorkbench]);

  return {
    edgePanActive,
    startEdgePanFromPointer: updateEdgePanFromPointer,
    stopEdgePan,
    updateEdgePanFromMask,
    updateEdgePanFromPointer
  };
}
