"use client";

import { useState } from "react";
import { verticalFovFromHorizontal } from "@/features/webxr/pc-editor/viewFov";
import { apiUrl, renderTest, sendViewPathPatch } from "@/lib/api";
import type { ViewPathPatch, ViewPathPoint } from "@/lib/path-protocol";

type FixedOrbitRenderButtonProps = {
  videoId: string;
  sessionId: string;
  durationMs?: number;
};

const MAX_FIXED_ORBIT_DURATION_MS = 60_000;
const FALLBACK_FIXED_ORBIT_DURATION_MS = 60_000;
const TEST_OUTPUT_FPS = 30;
const TEST_PATH_SAMPLE_FPS = 5;
const TEST_PATH_SAMPLE_INTERVAL_MS = Math.round(1000 / TEST_PATH_SAMPLE_FPS);
const FIXED_ORBIT_YAW_RATE_DEGREES_PER_SECOND = 1;
const MAX_FIXED_ORBIT_YAW_SWEEP_DEGREES = 60;
const MAX_COMPLEX_PATH_DURATION_MS = 45_000;
const FALLBACK_COMPLEX_PATH_DURATION_MS = 30_000;
const COMPLEX_YAW_RATE_DEGREES_PER_SECOND = 2.2;
const COMPLEX_PITCH_RATE_DEGREES_PER_SECOND = 1.2;

function buildFixedOrbitPatch(videoId: string, sessionId: string, durationMs?: number): ViewPathPatch {
  const smokeDurationMs = Math.min(
    durationMs && durationMs > 0 ? durationMs : FALLBACK_FIXED_ORBIT_DURATION_MS,
    MAX_FIXED_ORBIT_DURATION_MS
  );
  const yawSweep = Math.min(
    MAX_FIXED_ORBIT_YAW_SWEEP_DEGREES,
    (smokeDurationMs / 1000) * FIXED_ORBIT_YAW_RATE_DEGREES_PER_SECOND
  );
  const startYaw = -yawSweep / 2;
  const points: ViewPathPoint[] = [];
  for (let tMs = 0; tMs <= smokeDurationMs; tMs += TEST_PATH_SAMPLE_INTERVAL_MS) {
    const progress = tMs / smokeDurationMs;
    const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
    points.push({
      seq: points.length + 1,
      tMs,
      center: {
        yaw: startYaw + yawSweep * eased,
        pitch: 0
      },
      fov: {
        h: 90,
        v: verticalFovFromHorizontal(90)
      },
      roll: 0,
      enabled: true,
      cut: false,
      locked: false,
      smoothFollow: true,
      input: "head_gaze" as const
    });
  }

  if (points[points.length - 1]?.tMs !== smokeDurationMs) {
    points.push({
      seq: points.length + 1,
      tMs: smokeDurationMs,
      center: { yaw: startYaw + yawSweep, pitch: 0 },
      fov: { h: 90, v: verticalFovFromHorizontal(90) },
      roll: 0,
      enabled: true,
      cut: false,
      locked: false,
      smoothFollow: true,
      input: "head_gaze"
    });
  }

  return {
    version: 1,
    videoId,
    sessionId,
    takeId: `fixed-orbit-${Date.now()}`,
    pathRevision: Date.now(),
    replaceRange: {
      startMs: 0,
      endMs: smokeDurationMs,
      reason: "live"
    },
    points
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundedBoundary(durationMs: number, ratio: number) {
  return Math.round((durationMs * ratio) / TEST_PATH_SAMPLE_INTERVAL_MS) * TEST_PATH_SAMPLE_INTERVAL_MS;
}

function smoothStep(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

function interpolateKeyframes(
  keyframes: Array<{ at: number; value: number }>,
  progress: number
) {
  if (progress <= keyframes[0].at) {
    return keyframes[0].value;
  }
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const left = keyframes[index];
    const right = keyframes[index + 1];
    if (progress <= right.at) {
      const localProgress = (progress - left.at) / Math.max(right.at - left.at, 0.001);
      const eased = smoothStep(clamp(localProgress, 0, 1));
      return left.value + (right.value - left.value) * eased;
    }
  }
  return keyframes[keyframes.length - 1].value;
}

function buildComplexMotionPatch(videoId: string, sessionId: string, durationMs?: number): ViewPathPatch {
  const smokeDurationMs = Math.min(
    durationMs && durationMs > 0 ? durationMs : FALLBACK_COMPLEX_PATH_DURATION_MS,
    MAX_COMPLEX_PATH_DURATION_MS
  );
  const durationSeconds = smokeDurationMs / 1000;
  const yawExtent = Math.min(14, durationSeconds * COMPLEX_YAW_RATE_DEGREES_PER_SECOND);
  const pitchExtent = Math.min(7, durationSeconds * COMPLEX_PITCH_RATE_DEGREES_PER_SECOND);
  const discardStartMs = roundedBoundary(smokeDurationMs, 0.35);
  const discardEndMs = roundedBoundary(smokeDurationMs, 0.5);
  const cutTimes = new Set([
    roundedBoundary(smokeDurationMs, 0.25),
    discardStartMs,
    discardEndMs,
    roundedBoundary(smokeDurationMs, 0.75)
  ]);

  const points: ViewPathPoint[] = [];
  for (let tMs = 0; tMs <= smokeDurationMs; tMs += TEST_PATH_SAMPLE_INTERVAL_MS) {
    const progress = tMs / smokeDurationMs;
    const yaw = interpolateKeyframes(
      [
        { at: 0, value: -0.4 * yawExtent },
        { at: 0.22, value: 0.55 * yawExtent },
        { at: 0.38, value: 0.35 * yawExtent },
        { at: 0.58, value: -0.55 * yawExtent },
        { at: 0.78, value: -0.2 * yawExtent },
        { at: 1, value: 0.35 * yawExtent }
      ],
      progress
    );
    const pitch = interpolateKeyframes(
      [
        { at: 0, value: 0 },
        { at: 0.2, value: 0.45 * pitchExtent },
        { at: 0.42, value: -0.5 * pitchExtent },
        { at: 0.68, value: 0.6 * pitchExtent },
        { at: 1, value: -0.2 * pitchExtent }
      ],
      progress
    );
    const hFov = interpolateKeyframes(
      [
        { at: 0, value: 92 },
        { at: 0.28, value: 86 },
        { at: 0.46, value: 86 },
        { at: 0.68, value: 98 },
        { at: 1, value: 90 }
      ],
      progress
    );
    const enabled = tMs < discardStartMs || tMs >= discardEndMs;

    points.push({
      seq: points.length + 1,
      tMs,
      center: {
        yaw: clamp(yaw, -18, 18),
        pitch: clamp(pitch, -8, 8)
      },
      fov: {
        h: hFov,
        v: verticalFovFromHorizontal(hFov)
      },
      roll: 0,
      enabled,
      cut: cutTimes.has(tMs),
      locked: progress > 0.62 && progress < 0.72,
      smoothFollow: true,
      input: progress > 0.55 && progress < 0.75 ? "controller_ray" : "head_gaze"
    });
  }

  if (points[points.length - 1]?.tMs !== smokeDurationMs) {
    const last = points[points.length - 1];
    points.push({
      ...last,
      seq: points.length + 1,
      tMs: smokeDurationMs,
      enabled: true,
      cut: true
    });
  }

  return {
    version: 1,
    videoId,
    sessionId,
    takeId: `complex-motion-${Date.now()}`,
    pathRevision: Date.now(),
    replaceRange: {
      startMs: 0,
      endMs: smokeDurationMs,
      reason: "replay"
    },
    points
  };
}

export function FixedOrbitRenderButton({
  videoId,
  sessionId,
  durationMs
}: FixedOrbitRenderButtonProps) {
  const [message, setMessage] = useState(
    `生成 ${TEST_PATH_SAMPLE_FPS}Hz 关键点路径，后端按 ${TEST_OUTPUT_FPS}fps 插值测试导出。`
  );
  const [exportId, setExportId] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  async function renderPatch(patchBuilder: () => ViewPathPatch, label: string) {
    setIsRendering(true);
    setExportId(null);
    setMessage(`上传${label}路径...`);

    try {
      const patch = patchBuilder();
      const firstPoint = patch.points[0];
      const lastPoint = patch.points[patch.points.length - 1];
      const pathDurationSeconds = patch.replaceRange.endMs / 1000;
      const yawSweepDegrees =
        firstPoint && lastPoint ? Math.abs(lastPoint.center.yaw - firstPoint.center.yaw) : 0;
      const discardedPoints = patch.points.filter((point) => !point.enabled).length;
      setMessage(
        `上传${label}路径：${pathDurationSeconds.toFixed(1)}s / ${yawSweepDegrees.toFixed(
          1
        )}°，丢弃点 ${discardedPoints} 个...`
      );
      await sendViewPathPatch(sessionId, patch);
      setMessage("路径已上传，后端裁剪中...");
      const result = await renderTest(sessionId);
      const nextExportId = typeof result.exportId === "string" ? result.exportId : null;
      setExportId(nextExportId);
      setMessage(`导出完成：${nextExportId ?? "unknown export"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "固定环绕测试失败。");
    } finally {
      setIsRendering(false);
    }
  }

  function onFixedRender() {
    void renderPatch(() => buildFixedOrbitPatch(videoId, sessionId, durationMs), "固定环绕");
  }

  function onComplexRender() {
    void renderPatch(() => buildComplexMotionPatch(videoId, sessionId, durationMs), "复杂取景");
  }

  return (
    <div className="stack">
      <div className="button-row">
        <button className="button primary" disabled={isRendering} onClick={onFixedRender} type="button">
          {isRendering ? "处理中" : "固定环绕测试处理"}
        </button>
        <button className="button" disabled={isRendering} onClick={onComplexRender} type="button">
          复杂路径测试处理
        </button>
        <a className="button" href={`/mobile/videos/${encodeURIComponent(videoId)}`}>
          回到安卓详情页
        </a>
        {exportId ? (
          <a className="button" href={apiUrl(`/api/exports/${encodeURIComponent(exportId)}/download`)}>
            下载结果
          </a>
        ) : null}
      </div>
      <p className="muted">{message}</p>
    </div>
  );
}
