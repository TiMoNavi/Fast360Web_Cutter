export type XrVideoSource =
  | {
      type: "mp4";
      url: string;
    }
  | {
      type: "hls";
      url: string;
    };

export type VideoPlaybackStatus =
  | "loading"
  | "ready"
  | "playing"
  | "blocked"
  | "error";

export type XrSessionState = "idle" | "requesting" | "presenting" | "ended" | "error";

export type XrSupportStatus = {
  secureContext: boolean;
  hasNavigatorXr: boolean;
  immersiveVr: "checking" | "supported" | "unsupported" | "error";
};

export type XrLogEntry = {
  id: number;
  line: string;
};

export type VideoSourceHandle = {
  videoElement: HTMLVideoElement;
  status: VideoPlaybackStatus;
  play: () => Promise<void>;
  dispose: () => void;
};

export type XrLogHandler = (line: string) => void;
