import type { Dispatch, SetStateAction } from "react";
import { dispatchWebXrTimelineEvent, type TimelineBridgeStatus } from "../../data/timeline-bridge";

export type PcTimelineStatusSource = {
  getStatus: () => TimelineBridgeStatus;
};

export type PcTimelineOperations = {
  beginDiscardRange: (startMs: number) => void;
  cutHere: () => void;
  endDiscardRange: (startMs: number, endMs: number) => void;
  flushTimeline: (reason?: "live" | "cut" | "fov" | "lock") => void;
  pauseSampling: () => void;
  resumeSampling: () => void;
};

export function createPcTimelineOperations({
  setTimelineStatus,
  timelineBridge
}: {
  setTimelineStatus: Dispatch<SetStateAction<TimelineBridgeStatus | null>>;
  timelineBridge: PcTimelineStatusSource;
}): PcTimelineOperations {
  const refreshStatusSoon = () => {
    window.setTimeout(() => setTimelineStatus(timelineBridge.getStatus()), 120);
  };

  return {
    beginDiscardRange(startMs) {
      dispatchWebXrTimelineEvent({ type: "discardRange", startMs });
      refreshStatusSoon();
    },
    cutHere() {
      dispatchWebXrTimelineEvent({ type: "cutHere" });
      refreshStatusSoon();
    },
    endDiscardRange(startMs, endMs) {
      dispatchWebXrTimelineEvent({ type: "restoreRange", startMs, endMs });
      refreshStatusSoon();
    },
    flushTimeline(reason = "live") {
      dispatchWebXrTimelineEvent({ type: "flushPath", reason });
      refreshStatusSoon();
    },
    pauseSampling() {
      dispatchWebXrTimelineEvent({ type: "samplingPause" });
      refreshStatusSoon();
    },
    resumeSampling() {
      dispatchWebXrTimelineEvent({ type: "samplingResume" });
      refreshStatusSoon();
    }
  };
}
