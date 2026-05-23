"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Artplayer from "artplayer";
import Hls from "hls.js";
import type {
  AFrame360VideoCommand,
  AFrame360VideoCommandPayload,
  AFrame360VideoSource,
  AFrame360VideoSourcesResponse
} from "@/components/aframe/video-controls/types";

type LabMenu = "rate" | "settings" | null;
type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

const SOURCE_LIST_URL = "/api/xr/video-sources";
const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2];
const FALLBACK_COVER_URL = "/assets/xr/geometric-360.svg";

const FALLBACK_SOURCES: AFrame360VideoSource[] = [
  {
    durationMs: 185000,
    id: "sample-mp4",
    kind: "mp4",
    resolution: "5760 x 2880",
    sourceUrl: "/api/sample-video",
    thumbnailUrl: FALLBACK_COVER_URL,
    title: "Local 360 MP4 sample"
  }
];

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function expandLabSources(sources: AFrame360VideoSource[]) {
  const baseSources = sources.length ? sources : FALLBACK_SOURCES;

  return Array.from({ length: 24 }, (_, index) => {
    const source = baseSources[index % baseSources.length];
    const take = index + 1;

    return {
      ...source,
      durationMs: (source.durationMs ?? 185000) + (index % 5) * 11000,
      id: `${source.id}-lab-${take}`,
      resolution: source.resolution ?? (source.kind === "hls" ? "HLS stream" : "5760 x 2880"),
      thumbnailUrl: source.thumbnailUrl ?? FALLBACK_COVER_URL,
      title: `${source.title} // take ${take.toString().padStart(2, "0")}`
    };
  });
}

function sourceType(source: AFrame360VideoSource) {
  return source.kind === "hls" ? "hls" : undefined;
}

export function ArtPlayerUiLab() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<Artplayer | null>(null);
  const [sources, setSources] = useState<AFrame360VideoSource[]>(() => expandLabSources(FALLBACK_SOURCES));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(185000);
  const [draftSeekMs, setDraftSeekMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<LabMenu>(null);
  const [status, setStatus] = useState("loading sources");

  const currentSource = sources[currentIndex] ?? sources[0] ?? FALLBACK_SOURCES[0];
  const progressMs = draftSeekMs ?? currentTimeMs;
  const progressPercent = durationMs > 0 ? clamp((progressMs / durationMs) * 100, 0, 100) : 0;

  useEffect(() => {
    let cancelled = false;

    async function loadSources() {
      try {
        const response = await fetch(SOURCE_LIST_URL, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`source list ${response.status}`);
        }

        const body = (await response.json()) as AFrame360VideoSourcesResponse;

        if (!cancelled) {
          setSources(expandLabSources(body.videos));
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setSources(expandLabSources(FALLBACK_SOURCES));
          setStatus("fallback sources");
        }
      }
    }

    void loadSources();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !currentSource) {
      return;
    }

    const currentType = sourceType(currentSource);
    const art = new Artplayer({
      autoplay: false,
      container,
      fullscreen: false,
      fullscreenWeb: false,
      hotkey: false,
      loop: true,
      muted: true,
      playbackRate: false,
      playsInline: true,
      setting: false,
      theme: "#00ffff",
      url: currentSource.sourceUrl,
      ...(currentType ? { type: currentType } : {}),
      customType: {
        hls(video, url, currentArt) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
            return;
          }

          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            (currentArt as Artplayer & { hls?: Hls }).hls = hls;
          }
        }
      },
      moreVideoAttr: {
        crossOrigin: "anonymous"
      }
    });

    artRef.current = art;
    art.playbackRate = playbackRate;
    setCurrentTimeMs(0);
    setDurationMs(currentSource.durationMs ?? 0);
    setIsPlaying(false);
    setStatus("ready");

    function syncTime() {
      setCurrentTimeMs(Math.max(0, Math.round(art.currentTime * 1000)));
    }

    function syncDuration() {
      setDurationMs(Number.isFinite(art.duration) ? Math.round(art.duration * 1000) : (currentSource.durationMs ?? 0));
    }

    art.on("video:timeupdate", syncTime);
    art.on("video:durationchange", syncDuration);
    art.on("video:loadedmetadata", syncDuration);
    art.on("video:play", () => setIsPlaying(true));
    art.on("video:playing", () => setIsPlaying(true));
    art.on("video:pause", () => setIsPlaying(false));
    art.on("video:error", () => setStatus("video error"));

    return () => {
      const hls = (art as Artplayer & { hls?: Hls }).hls;
      hls?.destroy();
      art.destroy(true);
      if (artRef.current === art) {
        artRef.current = null;
      }
    };
  }, [currentSource, playbackRate]);

  const runCommand = useCallback(
    async (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => {
      const art = artRef.current;

      if (command === "toggle-playlist") {
        setPlaylistOpen((open) => !open);
        setActiveMenu(null);
        return;
      }

      if (command === "close-overlays") {
        setPlaylistOpen(false);
        setActiveMenu(null);
        setDraftSeekMs(null);
        return;
      }

      if (command === "next") {
        setCurrentIndex((index) => (sources.length ? (index + 1) % sources.length : 0));
        setActiveMenu(null);
        return;
      }

      if (command === "previous") {
        setCurrentIndex((index) => (sources.length ? (index - 1 + sources.length) % sources.length : 0));
        setActiveMenu(null);
        return;
      }

      if (command === "select-source") {
        setCurrentIndex((index) => {
          const nextIndex = sources.findIndex((source) => source.id === payload?.sourceId);
          return nextIndex >= 0 ? nextIndex : index;
        });
        setPlaylistOpen(false);
        setActiveMenu(null);
        return;
      }

      if (!art) {
        return;
      }

      if (command === "toggle-play") {
        if (art.playing) {
          art.pause();
        } else {
          await art.play().catch(() => setStatus("play blocked"));
        }
        return;
      }

      if (command === "seek-to") {
        const timeMs = clamp(payload?.timeMs ?? 0, 0, durationMs || payload?.timeMs || 0);
        art.currentTime = timeMs / 1000;
        setCurrentTimeMs(timeMs);
        setDraftSeekMs(null);
        return;
      }

      if (command === "set-rate") {
        const nextRate = clamp(payload?.playbackRate ?? 1, 0.5, 2);
        art.playbackRate = nextRate;
        setPlaybackRate(nextRate);
        setActiveMenu(null);
      }
    },
    [durationMs, sources]
  );

  const sourceRows = useMemo(
    () =>
      sources.map((source, index) => ({
        isActive: index === currentIndex,
        source
      })),
    [currentIndex, sources]
  );

  return (
    <main className="player-ui-lab-page">
      <section className="player-ui-lab-stage" data-testid="player-ui-lab">
        <div className="player-ui-art-shell" data-layer="video-background">
          <div className="player-ui-artplayer" ref={containerRef} />
          <div className="player-ui-video-vignette" aria-hidden="true" />
        </div>

        <div className="player-ui-environment-layer" data-layer="environment" aria-hidden="true">
          <span className="player-ui-halo-bed" data-layer="background-neon-halo" />
          <span className="player-ui-halo-core" data-layer="background-neon-halo" />
          <span className="player-ui-base-aura" />
          <span className="player-ui-sun-core" />
          <span className="player-ui-dot-matrix" />
        </div>

        <div className="player-ui-status-strip" data-layer="status-text" aria-live="polite">
          <span className="player-ui-status-prompt">&gt;</span>
          <span>ARTPLAYER UI LAB</span>
          <span>{status}</span>
          <span>{currentSource.kind.toUpperCase()}</span>
        </div>

        <section className="player-ui-control-bar" data-layer="foreground-controls" aria-label="Player controls">
          <div className="player-ui-control-glow" data-layer="control-background-glow" aria-hidden="true" />
          <div className="player-ui-control-chrome" data-layer="control-chrome" aria-hidden="true">
            <span className="player-ui-window-dot dot-magenta" />
            <span className="player-ui-window-dot dot-cyan" />
            <span className="player-ui-window-dot dot-orange" />
            <span className="player-ui-control-label">PLAYBACK_CORE // 2088</span>
          </div>
          <div className="player-ui-progress-row">
            <span>{formatTime(progressMs)}</span>
            <input
              aria-label="Playback progress"
              max={Math.max(durationMs, 1)}
              min="0"
              onChange={(event) => setDraftSeekMs(Number(event.currentTarget.value))}
              onKeyUp={() => void runCommand("seek-to", { timeMs: draftSeekMs ?? currentTimeMs })}
              onPointerUp={() => void runCommand("seek-to", { timeMs: draftSeekMs ?? currentTimeMs })}
              style={{ "--player-progress": `${progressPercent}%` } as StyleWithVars}
              type="range"
              value={progressMs}
            />
            <span>{formatTime(durationMs)}</span>
          </div>

          <div className="player-ui-main-controls">
            <button className="player-ui-icon-button" type="button" onClick={() => void runCommand("previous")} aria-label="Previous video">
              {"\u23EE"}
            </button>
            <button
              className="player-ui-primary-button player-ui-icon-button"
              type="button"
              onClick={() => void runCommand("toggle-play")}
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {isPlaying ? "\u23F8" : "\u25B6"}
            </button>
            <button className="player-ui-icon-button" type="button" onClick={() => void runCommand("next")} aria-label="Next video">
              {"\u23ED"}
            </button>
            <div className="player-ui-title-block">
              <strong>{currentSource.title}</strong>
              <span>
                {currentSource.resolution ?? "360 source"} / {playbackRate.toFixed(2).replace(/\.00$/, "")}x
              </span>
            </div>
            <button
              className={activeMenu === "rate" ? "active" : ""}
              type="button"
              onClick={() => setActiveMenu((menu) => (menu === "rate" ? null : "rate"))}
            >
              Speed
            </button>
            <button
              className={activeMenu === "settings" ? "active player-ui-icon-button" : "player-ui-icon-button"}
              type="button"
              aria-label="Player options"
              onClick={() => setActiveMenu((menu) => (menu === "settings" ? null : "settings"))}
            >
              {"\u2699"}
            </button>
            <button
              className={playlistOpen ? "active player-ui-icon-button" : "player-ui-icon-button"}
              type="button"
              onClick={() => void runCommand("toggle-playlist")}
              aria-label="Toggle playlist"
            >
              {"\u2630"}
            </button>
          </div>

          {activeMenu === "rate" ? (
            <div className="player-ui-popover player-ui-rate-menu">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  className={rate === playbackRate ? "active" : ""}
                  key={rate}
                  type="button"
                  onClick={() => void runCommand("set-rate", { playbackRate: rate })}
                >
                  {rate}x
                </button>
              ))}
            </div>
          ) : null}

          {activeMenu === "settings" ? (
            <div className="player-ui-popover player-ui-options-menu">
              <button type="button" onClick={() => void runCommand("close-overlays")}>
                Reset overlays
              </button>
              <span>Muted autoplay / Loop / 360 sample stream</span>
            </div>
          ) : null}
        </section>

        <aside className={playlistOpen ? "player-ui-playlist open" : "player-ui-playlist"} data-layer="playlist-panel" data-testid="player-ui-playlist">
          <div className="player-ui-playlist-shine" data-layer="playlist-highlight" aria-hidden="true" />
          <div className="player-ui-playlist-head">
            <span>&gt; MEDIA LIST</span>
            <button type="button" onClick={() => void runCommand("close-overlays")} aria-label="Close playlist">
              {"\u00D7"}
            </button>
          </div>
          <div className="player-ui-playlist-scroll">
            {sourceRows.map(({ source, isActive }) => (
              <button
                className={isActive ? "player-ui-playlist-item active" : "player-ui-playlist-item"}
                key={source.id}
                type="button"
                onClick={() => void runCommand("select-source", { sourceId: source.id })}
              >
                <span className="player-ui-thumb" style={{ "--thumb-accent": isActive ? "#00ffff" : "#ff00ff" } as StyleWithVars}>
                  {source.thumbnailUrl ? <img alt="" src={source.thumbnailUrl} /> : null}
                  <span>{source.kind.toUpperCase()}</span>
                </span>
                <span className="player-ui-playlist-copy">
                  <strong>{source.title}</strong>
                  <span>
                    {formatTime(source.durationMs ?? 0)} / {source.resolution ?? "360"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
