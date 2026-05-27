import type { ReactNode, Ref } from "react";

export type AFrame360VideoPlaybackState = {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  readyState: number;
};

export type AFrame360VideoPlayerHandle = {
  getPlaybackState: () => AFrame360VideoPlaybackState | null;
  getVideoElement: () => HTMLVideoElement | null;
  pause: () => void;
  play: () => Promise<void>;
  seekTo: (timeMs: number) => void;
  setMuted: (muted: boolean) => void;
  setPlaybackRate: (playbackRate: number) => void;
  togglePlay: () => Promise<void>;
};

export type AFrame360VideoPlayerProps = {
  autoPlay?: boolean;
  cameraChildren?: ReactNode;
  cameraRef?: Ref<HTMLElement>;
  children?: ReactNode;
  crossOrigin?: "" | "anonymous" | "use-credentials";
  loop?: boolean;
  muted?: boolean;
  onPlaybackStateChange?: (state: AFrame360VideoPlaybackState) => void;
  onSceneReady?: (scene: HTMLElement) => void;
  onSessionEnd?: () => void;
  onSessionStart?: () => void;
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  radius?: number;
  rotation?: string;
  sourceUrl: string;
  videoId?: string;
  videoRef?: Ref<HTMLVideoElement>;
};
