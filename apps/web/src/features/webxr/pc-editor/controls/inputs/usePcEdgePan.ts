"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PcMaskOperations } from "../operations/maskOperations";
import { clampNumber, edgeAxisSpeed } from "../operations/viewGeometry";

export type PcEdgePanControls = {
  edgePanActive: boolean;
  startEdgePanFromPointer: (x: number, y: number) => void;
  stopEdgePan: () => void;
  updateEdgePanFromPointer: (x: number, y: number) => void;
};

export function usePcEdgePan({
  mask,
  maskDragging,
  pcWorkbench,
  sceneRef
}: {
  mask: PcMaskOperations;
  maskDragging: boolean;
  pcWorkbench: boolean;
  sceneRef: RefObject<HTMLElement | null>;
}): PcEdgePanControls {
  const maskRef = useRef(mask);
  const edgePanRef = useRef({ pitchSpeed: 0, yawSpeed: 0 });
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

    edgePanRef.current = { pitchSpeed, yawSpeed };
    setEdgePanActive(active);
  };

  const stopEdgePan = () => {
    edgePanRef.current = { pitchSpeed: 0, yawSpeed: 0 };
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

      const { pitchSpeed, yawSpeed } = edgePanRef.current;
      if (Math.abs(yawSpeed) > 0.01 || Math.abs(pitchSpeed) > 0.01) {
        maskRef.current.bindMaskAndCameraBy(yawSpeed * deltaSeconds, pitchSpeed * deltaSeconds, 90);
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
    updateEdgePanFromPointer
  };
}
