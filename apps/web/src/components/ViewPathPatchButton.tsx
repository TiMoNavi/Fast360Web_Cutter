"use client";

import { useState } from "react";
import { sendViewPathPatch } from "@/lib/api";
import type { ViewPathPatch } from "@/lib/path-protocol";

type ViewPathPatchButtonProps = {
  videoId: string;
  sessionId: string;
};

function examplePatch(videoId: string, sessionId: string): ViewPathPatch {
  return {
    version: 1,
    videoId,
    sessionId,
    takeId: "example-take",
    pathRevision: Date.now(),
    replaceRange: {
      startMs: 0,
      endMs: 1000,
      reason: "live"
    },
    points: [
      {
        seq: 1,
        tMs: 0,
        center: { yaw: 0, pitch: 0 },
        fov: { h: 90, v: 60 },
        roll: 0,
        enabled: true,
        cut: false,
        locked: false,
        smoothFollow: true,
        input: "head_gaze"
      },
      {
        seq: 2,
        tMs: 1000,
        center: { yaw: 12, pitch: -3 },
        fov: { h: 88, v: 58 },
        roll: 0,
        enabled: true,
        cut: false,
        locked: false,
        smoothFollow: true,
        input: "head_gaze"
      }
    ]
  };
}

export function ViewPathPatchButton({ videoId, sessionId }: ViewPathPatchButtonProps) {
  const [message, setMessage] = useState("发送一个 2 点示例 ViewPathPatch。");
  const [isSending, setIsSending] = useState(false);

  async function sendPatch() {
    setIsSending(true);
    setMessage("发送中...");

    try {
      const result = await sendViewPathPatch(sessionId, examplePatch(videoId, sessionId));
      setMessage(`已接受：${JSON.stringify(result)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发送失败。");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="stack">
      <div className="button-row">
        <button className="button primary" disabled={isSending} onClick={sendPatch} type="button">
          {isSending ? "发送中" : "发送示例 ViewPathPatch"}
        </button>
      </div>
      <p className="muted">{message}</p>
    </div>
  );
}
