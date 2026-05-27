export type PcTimelineOperations = {
  flushTimeline: (reason: "fov" | "lock") => void;
};
