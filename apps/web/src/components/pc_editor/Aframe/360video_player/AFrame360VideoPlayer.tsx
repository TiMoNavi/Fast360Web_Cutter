"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { AFrameVideoSphere } from "../media/AFrameVideoSphere";
import { AFrameScene } from "../runtime/AFrameScene";
import type {
  AFrame360VideoPlaybackState,
  AFrame360VideoPlayerHandle,
  AFrame360VideoPlayerProps
} from "./types";

const DEFAULT_VIDEO_ID = "aframe-360-source-video";

function assignRef<T>(ref: AFrame360VideoPlayerProps["videoRef"], value: T | null) {
  if (!ref) {
    return;
  }

  if (typeof ref === "function") {
    ref(value as HTMLVideoElement | null);
    return;
  }

  ref.current = value as HTMLVideoElement | null;
}

function readPlaybackState(video: HTMLVideoElement): AFrame360VideoPlaybackState {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;

  return {
    currentTimeMs: Math.round(video.currentTime * 1000),
    durationMs: Math.round(duration * 1000),
    isPlaying: !video.paused,
    playbackRate: video.playbackRate || 1,
    readyState: video.readyState
  };
}

export const AFrame360VideoPlayer = forwardRef<AFrame360VideoPlayerHandle, AFrame360VideoPlayerProps>(function AFrame360VideoPlayer(
  {
    autoPlay = true,
    cameraChildren,
    cameraRef,
    children,
    crossOrigin = "anonymous",
    loop = true,
    muted = true,
    onPlaybackStateChange,
    onSceneReady,
    onSessionEnd,
    onSessionStart,
    onVideoElement,
    radius,
    rotation = "0 -90 0",
    sourceUrl,
    videoId = DEFAULT_VIDEO_ID,
    videoRef
  },
  ref
) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const setVideoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      localVideoRef.current = video;
      assignRef(videoRef, video);
      onVideoElement?.(video);
    },
    [onVideoElement, videoRef]
  );

  const getPlaybackState = useCallback(() => {
    const video = localVideoRef.current;

    if (!video) {
      return null;
    }

    return readPlaybackState(video);
  }, []);

  const reportPlaybackState = useCallback(() => {
    const state = getPlaybackState();

    if (state) {
      onPlaybackStateChange?.(state);
    }
  }, [getPlaybackState, onPlaybackStateChange]);

  useImperativeHandle(
    ref,
    () => ({
      getPlaybackState,
      getVideoElement: () => localVideoRef.current,
      pause: () => {
        localVideoRef.current?.pause();
        reportPlaybackState();
      },
      play: async () => {
        const video = localVideoRef.current;

        if (!video) {
          return;
        }

        await video.play();
        reportPlaybackState();
      },
      seekTo: (timeMs: number) => {
        const video = localVideoRef.current;

        if (!video) {
          return;
        }

        video.currentTime = Math.max(0, timeMs) / 1000;
        reportPlaybackState();
      },
      setMuted: (nextMuted: boolean) => {
        const video = localVideoRef.current;

        if (!video) {
          return;
        }

        video.muted = nextMuted;
        reportPlaybackState();
      },
      setPlaybackRate: (playbackRate: number) => {
        const video = localVideoRef.current;

        if (!video) {
          return;
        }

        video.playbackRate = playbackRate;
        reportPlaybackState();
      },
      togglePlay: async () => {
        const video = localVideoRef.current;

        if (!video) {
          return;
        }

        if (video.paused) {
          await video.play();
        } else {
          video.pause();
        }

        reportPlaybackState();
      }
    }),
    [getPlaybackState, reportPlaybackState]
  );

  return (
    <AFrameScene
      cameraChildren={cameraChildren}
      cameraRef={cameraRef}
      onSceneReady={onSceneReady}
      onSessionEnd={onSessionEnd}
      onSessionStart={onSessionStart}
    >
      <AFrameVideoSphere
        autoPlay={autoPlay}
        crossOrigin={crossOrigin}
        loop={loop}
        muted={muted}
        onLoadedMetadata={reportPlaybackState}
        onPause={reportPlaybackState}
        onPlay={reportPlaybackState}
        onTimeUpdate={reportPlaybackState}
        radius={radius}
        rotation={rotation}
        sourceUrl={sourceUrl}
        videoId={videoId}
        videoRef={setVideoRef}
      />
      {children}
    </AFrameScene>
  );
});
