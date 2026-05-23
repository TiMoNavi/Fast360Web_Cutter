"use client";

import { useMemo, useState } from "react";

type XrSessionLinkProps = {
  videoId: string;
};

export function XrSessionLink({ videoId }: XrSessionLinkProps) {
  const initialSessionId = useMemo(() => `${videoId}-session`, [videoId]);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const href = `/xr/videos/${encodeURIComponent(videoId)}/session/${encodeURIComponent(
    sessionId
  )}`;

  return (
    <div className="inline-controls">
      <input
        aria-label={`${videoId} 的 sessionId`}
        onChange={(event) => setSessionId(event.target.value)}
        type="text"
        value={sessionId}
      />
      <a className="button primary" href={href}>
        进入 WebXR
      </a>
    </div>
  );
}
