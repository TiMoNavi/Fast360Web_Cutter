"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { switchWebXrPlayerSession } from "@/lib/api";

type XrSessionLinkProps = {
  videoId: string;
};

type XrPlayerEntryButtonProps = {
  buttonClassName?: string;
  label?: string;
  messageClassName?: string;
  switchingLabel?: string;
  videoId: string;
};

export function XrPlayerEntryButton({
  buttonClassName = "button primary",
  label = "进入 WebXR",
  messageClassName = "muted",
  switchingLabel = "切换中",
  videoId
}: XrPlayerEntryButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);

  async function enterPlayer() {
    setIsSwitching(true);
    setMessage("正在切换 WebXR session...");
    try {
      await switchWebXrPlayerSession(videoId);
      router.push("/xr/player");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "切换 WebXR session 失败。");
      setIsSwitching(false);
    }
  }

  return (
    <>
      <button className={buttonClassName} disabled={isSwitching} onClick={() => void enterPlayer()} type="button">
        <span>{isSwitching ? switchingLabel : label}</span>
      </button>
      {message ? <span className={messageClassName}>{message}</span> : null}
    </>
  );
}

export function XrSessionLink({ videoId }: XrSessionLinkProps) {
  return (
    <div className="inline-controls">
      <XrPlayerEntryButton buttonClassName="button primary" videoId={videoId} />
    </div>
  );
}
