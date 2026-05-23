"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startDemoVideo } from "@/lib/api";

type DemoStartButtonProps = {
  sampleId: string;
  className?: string;
  label?: string;
  destination?: "xr" | "detail";
};

export function DemoStartButton({
  sampleId,
  className = "vapor-button vapor-button-primary",
  label = "Start WebXR",
  destination = "xr"
}: DemoStartButtonProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setIsStarting(true);
    setMessage(null);

    try {
      const result = await startDemoVideo(sampleId);
      router.push(destination === "detail" ? result.mobileVideoPath : result.xrPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start this demo.");
      setIsStarting(false);
    }
  }

  return (
    <span className="demo-start-control">
      <button className={className} disabled={isStarting} onClick={start} type="button">
        <span>{isStarting ? "Preparing..." : label}</span>
      </button>
      {message ? <small className="error-text">{message}</small> : null}
    </span>
  );
}
