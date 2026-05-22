import Hls from "hls.js";
import type { VideoPlaybackStatus, VideoSourceHandle, XrLogHandler } from "./types";

type VideoSourceOptions = {
  url: string;
  onStatusChange?: (status: VideoPlaybackStatus) => void;
  onLog?: XrLogHandler;
};

function createBaseVideo() {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  return video;
}

function attachVideoEvents(
  video: HTMLVideoElement,
  setStatus: (status: VideoPlaybackStatus) => void,
  onLog?: XrLogHandler
) {
  const onCanPlay = () => {
    setStatus("ready");
    onLog?.("360 video ready");
  };
  const onPlaying = () => {
    setStatus("playing");
    onLog?.("360 video playing");
  };
  const onError = () => {
    setStatus("error");
    onLog?.("360 video failed");
  };

  video.addEventListener("canplay", onCanPlay);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("error", onError);

  return () => {
    video.removeEventListener("canplay", onCanPlay);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("error", onError);
  };
}

function disposeVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export function createMp4VideoSource({ url, onStatusChange, onLog }: VideoSourceOptions): VideoSourceHandle {
  const video = createBaseVideo();
  let status: VideoPlaybackStatus = "loading";

  const setStatus = (nextStatus: VideoPlaybackStatus) => {
    status = nextStatus;
    onStatusChange?.(nextStatus);
  };

  const removeEvents = attachVideoEvents(video, setStatus, onLog);
  video.src = url;
  video.load();

  return {
    videoElement: video,
    get status() {
      return status;
    },
    async play() {
      try {
        await video.play();
        setStatus("playing");
      } catch (error) {
        setStatus("blocked");
        onLog?.(error instanceof Error ? `video play failed: ${error.message}` : "video play failed");
      }
    },
    dispose() {
      removeEvents();
      disposeVideo(video);
    }
  };
}

export function createHlsVideoSource({ url, onStatusChange, onLog }: VideoSourceOptions): VideoSourceHandle {
  const video = createBaseVideo();
  let status: VideoPlaybackStatus = "loading";
  let hls: Hls | null = null;

  const setStatus = (nextStatus: VideoPlaybackStatus) => {
    status = nextStatus;
    onStatusChange?.(nextStatus);
  };

  const removeEvents = attachVideoEvents(video, setStatus, onLog);

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    video.load();
    onLog?.("native HLS stream loaded");
  } else if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setStatus("ready");
      onLog?.("HLS manifest parsed");
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      setStatus("error");
      onLog?.(`HLS ${data.fatal ? "fatal" : "warning"}: ${data.type}`);
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    onLog?.("hls.js stream attached");
  } else {
    setStatus("error");
    onLog?.("HLS unsupported in this browser");
  }

  return {
    videoElement: video,
    get status() {
      return status;
    },
    async play() {
      try {
        await video.play();
        setStatus("playing");
      } catch (error) {
        setStatus("blocked");
        onLog?.(error instanceof Error ? `video play failed: ${error.message}` : "video play failed");
      }
    },
    dispose() {
      hls?.destroy();
      hls = null;
      removeEvents();
      disposeVideo(video);
    }
  };
}
