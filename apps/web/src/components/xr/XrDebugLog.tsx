"use client";

import type { XrLogEntry } from "./types";

type XrDebugLogProps = {
  logs: XrLogEntry[];
};

export function XrDebugLog({ logs }: XrDebugLogProps) {
  return (
    <div className="xr-demo-log" data-testid="xr-log">
      {logs.map((entry) => (
        <div key={entry.id}>{entry.line}</div>
      ))}
    </div>
  );
}
