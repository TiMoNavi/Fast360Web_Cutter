"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCutSession } from "@/lib/api";

type CutSessionControlsProps = {
  videoId: string;
};

function defaultSessionId(videoId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
  return `${videoId}-session-${suffix}`;
}

export function CutSessionControls({ videoId }: CutSessionControlsProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(() => defaultSessionId(videoId));
  const [message, setMessage] = useState("使用默认 ClipEditConfig 创建 WebXR session。");
  const [isCreating, setIsCreating] = useState(false);

  const xrHref = `/xr/videos/${encodeURIComponent(videoId)}/session/${encodeURIComponent(
    sessionId
  )}`;

  async function createAndEnter() {
    setIsCreating(true);
    setMessage("创建 session 中...");

    try {
      const session = await createCutSession(videoId, sessionId);
      setMessage(`已创建：${session.sessionId}`);
      router.push(xrHref);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建 session 失败。");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="stack">
      <label className="field">
        <span>Session ID</span>
        <input
          onChange={(event) => setSessionId(event.target.value)}
          type="text"
          value={sessionId}
        />
      </label>
      <div className="button-row">
        <button
          className="button primary"
          disabled={isCreating || sessionId.length === 0}
          onClick={createAndEnter}
          type="button"
        >
          创建并进入 WebXR
        </button>
        <a className="button" href={xrHref}>
          直接进入
        </a>
      </div>
      <p className="muted">{message}</p>
    </div>
  );
}
