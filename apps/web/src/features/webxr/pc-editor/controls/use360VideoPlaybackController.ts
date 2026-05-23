"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type {
  AFrame360PlaybackState,
  AFrame360VideoCommand,
  AFrame360VideoCommandPayload,
  AFrame360VideoSource,
  AFrame360VideoSourcesResponse
} from "./types";
import { clampRate, PC_EDITOR_RATE_DEFAULT } from "./operations/rateCurve";

type Use360VideoPlaybackControllerOptions = {
  cameraRef: RefObject<HTMLElement | null>;
  initialSourceId?: string | null;
  initialSources?: AFrame360VideoSource[];
  mediaElementKey?: number;
  sourceListUrl?: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
};

const DEFAULT_SOURCE_LIST_URL = "/api/xr/video-sources";
const DEFAULT_FOV = 80;
const MIN_FOV = 1;
const MAX_FOV = 140;
const FOV_STEP = 5;

function clampFov(fov: number) {
  return Math.min(MAX_FOV, Math.max(MIN_FOV, fov));
}

function updateCameraFov(cameraEl: HTMLElement | null, fov: number) {
  if (!cameraEl) {
    return;
  }

  cameraEl.setAttribute("camera", `fov: ${fov}`);
}

async function fetchVideoSources(sourceListUrl: string) {
  const response = await fetch(sourceListUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch video sources: ${response.status}`);
  }

  const body = (await response.json()) as AFrame360VideoSourcesResponse;
  return body.videos;
}

function selectInitialSourceIndex(sources: AFrame360VideoSource[], sourceId: string | null | undefined, fallbackIndex: number) {
  if (!sources.length) {
    return 0;
  }

  if (sourceId === null) {
    return -1;
  }

  if (sourceId) {
    const sourceIndex = sources.findIndex((source) => source.id === sourceId);
    if (sourceIndex >= 0) {
      return sourceIndex;
    }
  }

  return Math.min(fallbackIndex, sources.length - 1);
}

export function use360VideoPlaybackController({
  cameraRef,
  initialSourceId,
  initialSources,
  mediaElementKey = 0,
  sourceListUrl = DEFAULT_SOURCE_LIST_URL,
  videoRef
}: Use360VideoPlaybackControllerOptions) {
  const [sources, setSources] = useState<AFrame360VideoSource[]>(() => initialSources ?? []);
  const [currentIndex, setCurrentIndex] = useState(() => selectInitialSourceIndex(initialSources ?? [], initialSourceId, 0));
  const [fov, setFov] = useState(DEFAULT_FOV);
  const fovRef = useRef(DEFAULT_FOV);
  const fovAnimationRef = useRef<number | null>(null);
  const [status, setStatus] = useState<AFrame360PlaybackState["status"]>("idle");
  const [lastCommand, setLastCommand] = useState<AFrame360PlaybackState["lastCommand"]>("init");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(PC_EDITOR_RATE_DEFAULT);
  const playbackRateRef = useRef(PC_EDITOR_RATE_DEFAULT);
  const playbackRateAnimationRef = useRef<number | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<AFrame360PlaybackState["activeMenu"]>(null);

  const currentSource = currentIndex >= 0 ? sources[currentIndex] ?? null : null;

  const loadSources = useCallback(async () => {
    if (sourceListUrl === null) {
      setSources(initialSources ?? []);
      setCurrentIndex((index) =>
        initialSources?.length ? selectInitialSourceIndex(initialSources, initialSourceId, index) : 0
      );
      setStatus(initialSources?.length ? "ready" : "error");
      setLastCommand(initialSources?.length ? "list-loaded" : "error");
      return;
    }

    setStatus("loading-list");
    setLastCommand("reload-list");

    try {
      const nextSources = await fetchVideoSources(sourceListUrl);
      setSources(nextSources);
      setCurrentIndex((index) => selectInitialSourceIndex(nextSources, initialSourceId, index));
      setStatus("ready");
      setLastCommand("list-loaded");
    } catch {
      setStatus("error");
      setLastCommand("error");
    }
  }, [initialSourceId, initialSources, sourceListUrl]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    fovRef.current = fov;
    updateCameraFov(cameraRef.current, fov);
  }, [cameraRef, fov]);

  useEffect(() => () => {
    if (fovAnimationRef.current !== null) {
      window.cancelAnimationFrame(fovAnimationRef.current);
      fovAnimationRef.current = null;
    }
    if (playbackRateAnimationRef.current !== null) {
      window.cancelAnimationFrame(playbackRateAnimationRef.current);
      playbackRateAnimationRef.current = null;
    }
  }, []);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, videoRef]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !currentSource) {
      return;
    }

    const currentVideo = video;
    const source = currentSource;
    let hls: Hls | null = null;
    let disposed = false;

    function markReady() {
      if (!disposed) {
        setStatus("ready");
        setDurationMs(Number.isFinite(currentVideo.duration) ? Math.round(currentVideo.duration * 1000) : (source.durationMs ?? 0));
      }
    }

    function markPlaying() {
      if (!disposed) {
        setIsPlaying(true);
        setStatus("playing");
      }
    }

    function markPaused() {
      if (!disposed) {
        setIsPlaying(false);
        setStatus("paused");
      }
    }

    function markError() {
      if (!disposed) {
        setStatus("error");
        setLastCommand("error");
      }
    }

    function markTime() {
      if (!disposed) {
        setCurrentTimeMs(Math.max(0, Math.round(currentVideo.currentTime * 1000)));
      }
    }

    function markDuration() {
      if (!disposed) {
        setDurationMs(Number.isFinite(currentVideo.duration) ? Math.round(currentVideo.duration * 1000) : (source.durationMs ?? 0));
      }
    }

    function markRate() {
      if (!disposed) {
        const nextRate = clampRate(currentVideo.playbackRate || PC_EDITOR_RATE_DEFAULT);
        playbackRateRef.current = nextRate;
        setPlaybackRate(nextRate);
      }
    }

    video.pause();
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.playbackRate = playbackRate;
    video.removeAttribute("src");
    video.load();
    video.addEventListener("canplay", markReady);
    video.addEventListener("durationchange", markDuration);
    video.addEventListener("playing", markPlaying);
    video.addEventListener("pause", markPaused);
    video.addEventListener("error", markError);
    video.addEventListener("ratechange", markRate);
    video.addEventListener("timeupdate", markTime);

    if (source.kind === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.setAttribute("src", source.sourceUrl);
        video.src = source.sourceUrl;
        video.load();
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false
        });
        hls.on(Hls.Events.MANIFEST_PARSED, markReady);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            markError();
          }
        });
        hls.loadSource(source.sourceUrl);
        hls.attachMedia(video);
      } else {
        markError();
      }
    } else {
      video.setAttribute("src", source.sourceUrl);
      video.src = source.sourceUrl;
      video.load();
    }

    setLastCommand("loaded-source");
    setStatus("ready");
    setCurrentTimeMs(0);
    setDurationMs(source.durationMs ?? 0);
    void video.play().catch(() => {
      if (!disposed) {
        setStatus("blocked");
      }
    });

    return () => {
      disposed = true;
      hls?.destroy();
      hls = null;
      video.removeEventListener("canplay", markReady);
      video.removeEventListener("durationchange", markDuration);
      video.removeEventListener("playing", markPlaying);
      video.removeEventListener("pause", markPaused);
      video.removeEventListener("error", markError);
      video.removeEventListener("ratechange", markRate);
      video.removeEventListener("timeupdate", markTime);
    };
  }, [currentSource, mediaElementKey, videoRef]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || currentSource) {
      return;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setDurationMs(0);
    setStatus(sources.length ? "ready" : "idle");
  }, [currentSource, mediaElementKey, sources.length, videoRef]);

  const animateFov = useCallback((targetFov: number, durationMs = 180) => {
    if (fovAnimationRef.current !== null) {
      window.cancelAnimationFrame(fovAnimationRef.current);
      fovAnimationRef.current = null;
    }

    const from = fovRef.current;
    const to = clampFov(targetFov);
    const startedAt = performance.now();

    if (durationMs <= 0) {
      fovRef.current = to;
      setFov(to);
      return;
    }

    const tick = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - startedAt) / Math.max(durationMs, 1)));
      const eased = progress * progress * (3 - 2 * progress);
      const nextFov = from + (to - from) * eased;
      fovRef.current = nextFov;
      setFov(nextFov);

      if (progress >= 1) {
        fovRef.current = to;
        setFov(to);
        fovAnimationRef.current = null;
        return;
      }

      fovAnimationRef.current = window.requestAnimationFrame(tick);
    };

    fovAnimationRef.current = window.requestAnimationFrame(tick);
  }, []);

  const animatePlaybackRate = useCallback((targetRate: number, durationMs = 140) => {
    if (playbackRateAnimationRef.current !== null) {
      window.cancelAnimationFrame(playbackRateAnimationRef.current);
      playbackRateAnimationRef.current = null;
    }

    const from = playbackRateRef.current;
    const to = clampRate(targetRate);
    const startedAt = performance.now();

    const applyRate = (rate: number) => {
      const nextRate = clampRate(rate);
      playbackRateRef.current = nextRate;
      if (videoRef.current) {
        videoRef.current.playbackRate = nextRate;
      }
      setPlaybackRate(nextRate);
    };

    const tick = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - startedAt) / Math.max(durationMs, 1)));
      const eased = progress * progress * (3 - 2 * progress);
      applyRate(from + (to - from) * eased);

      if (progress >= 1) {
        applyRate(to);
        playbackRateAnimationRef.current = null;
        return;
      }

      playbackRateAnimationRef.current = window.requestAnimationFrame(tick);
    };

    playbackRateAnimationRef.current = window.requestAnimationFrame(tick);
  }, [videoRef]);

  const runCommand = useCallback(
    async (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => {
      const video = videoRef.current;
      setLastCommand(command);

      if (command === "reload-list") {
        await loadSources();
        return;
      }

      if (command === "next") {
        setCurrentIndex((index) => (sources.length ? (index < 0 ? 0 : (index + 1) % sources.length) : 0));
        setActiveMenu(null);
        return;
      }

      if (command === "previous") {
        setCurrentIndex((index) => (sources.length ? (index < 0 ? sources.length - 1 : (index - 1 + sources.length) % sources.length) : 0));
        setActiveMenu(null);
        return;
      }

      if (command === "select-source") {
        setCurrentIndex((index) => {
          const nextIndex = sources.findIndex((source) => source.id === payload?.sourceId);
          return nextIndex >= 0 ? nextIndex : index;
        });
        setActiveMenu(null);
        setPlaylistOpen(false);
        return;
      }

      if (command === "toggle-playlist") {
        setPlaylistOpen((open) => !open);
        setActiveMenu(null);
        return;
      }

      if (command === "close-overlays") {
        setPlaylistOpen(false);
        setActiveMenu(null);
        return;
      }

      if (command === "zoom-in") {
        animateFov(fovRef.current - FOV_STEP, 0);
        return;
      }

      if (command === "zoom-out") {
        animateFov(fovRef.current + FOV_STEP, 0);
        return;
      }

      if (!video) {
        return;
      }

      if (command === "seek-to") {
        const timeMs = Math.max(0, payload?.timeMs ?? 0);
        const durationLimit = Number.isFinite(video.duration) ? video.duration * 1000 : durationMs;
        video.currentTime = Math.min(timeMs, Math.max(durationLimit || timeMs, 0)) / 1000;
        setCurrentTimeMs(timeMs);
        return;
      }

      if (command === "set-rate") {
        const nextRate = clampRate(payload?.playbackRate ?? PC_EDITOR_RATE_DEFAULT);
        animatePlaybackRate(nextRate);
        setActiveMenu(null);
        return;
      }

      if (command === "pause") {
        video.pause();
        setIsPlaying(false);
        setStatus("paused");
        return;
      }

      if (command === "play" || (command === "toggle-play" && video.paused)) {
        try {
          await video.play();
          setIsPlaying(true);
          setStatus("playing");
        } catch {
          setStatus("blocked");
        }
        return;
      }

      if (command === "toggle-play") {
        video.pause();
        setIsPlaying(false);
        setStatus("paused");
      }
    },
    [animateFov, animatePlaybackRate, durationMs, loadSources, sources, videoRef]
  );

  const playbackState = useMemo<AFrame360PlaybackState>(
    () => ({
      currentIndex,
      currentSource,
      currentTimeMs,
      durationMs: durationMs || currentSource?.durationMs || 0,
      fov,
      isPlaying,
      lastCommand,
      playbackRate,
      recordingRate: PC_EDITOR_RATE_DEFAULT,
      playlistOpen,
      activeMenu,
      selectedSourceId: currentSource?.id ?? null,
      sourceCount: sources.length,
      sources,
      status
    }),
    [activeMenu, currentIndex, currentSource, currentTimeMs, durationMs, fov, isPlaying, lastCommand, playbackRate, playlistOpen, sources, status]
  );

  return {
    playbackState,
    runCommand
  };
}
