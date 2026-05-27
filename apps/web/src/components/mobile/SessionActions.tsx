"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { abandonCutSession, createCutSession, switchWebXrPlayerSession } from "@/lib/api";

type SessionActionsProps = {
  videoId: string;
  currentSessionId?: string | null;
};

function defaultSessionId(videoId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
  return `${videoId}-session-${suffix}`;
}

export function SessionActions({ videoId, currentSessionId }: SessionActionsProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(() => currentSessionId ?? defaultSessionId(videoId));
  const [message, setMessage] = useState(
    currentSessionId ? "可以继续进入当前 WebXR session。" : "创建 session 后可在 Quest 中取景。"
  );
  const [isBusy, setIsBusy] = useState(false);
  const xrHref = "/xr/player";

  async function createOnly() {
    setIsBusy(true);
    setMessage("正在创建 session...");
    try {
      const session = await createCutSession(videoId, sessionId);
      setSessionId(session.sessionId);
      setMessage(`已创建：${session.sessionId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建 session 失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function createAndEnter() {
    setIsBusy(true);
    setMessage("正在准备 WebXR 入口...");
    try {
      const session = await createCutSession(videoId, sessionId);
      setSessionId(session.sessionId);
      router.push(xrHref);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "进入 WebXR 失败。");
      setIsBusy(false);
    }
  }

  async function enterActiveVideo() {
    setIsBusy(true);
    setMessage("正在切换 WebXR session...");
    try {
      await switchWebXrPlayerSession(videoId);
      router.push(xrHref);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "进入 WebXR 失败。");
      setIsBusy(false);
    }
  }

  async function abandonCurrent() {
    if (!currentSessionId) {
      return;
    }

    setIsBusy(true);
    setMessage("正在放弃当前 session...");
    try {
      await abandonCutSession(currentSessionId);
      setMessage("当前 session 已放弃。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "放弃 session 失败。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="session-actions">
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
          disabled={isBusy || sessionId.length === 0}
          onClick={createAndEnter}
          type="button"
        >
          {isBusy ? "处理中" : "进入 WebXR"}
        </button>
        <button
          className="button"
          disabled={isBusy || sessionId.length === 0}
          onClick={createOnly}
          type="button"
        >
          创建入口
        </button>
        <button className="button" disabled={isBusy} onClick={() => void enterActiveVideo()} type="button">
          直接打开
        </button>
        {currentSessionId ? (
          <button className="button danger" disabled={isBusy} onClick={abandonCurrent} type="button">
            放弃当前 session
          </button>
        ) : null}
      </div>

      <p className="muted">{message}</p>
    </div>
  );
}
