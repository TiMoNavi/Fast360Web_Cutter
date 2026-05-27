"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  apiUrl,
  getSessionMusic,
  listMusicTracks,
  updateSessionMusic,
  type MusicTrackSummary,
  type SessionMusicState
} from "@/lib/api";
import styles from "./BgmControls.module.css";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type BgmControlsProps = {
  sessionId?: string;
};

function formatTime(ms: number | undefined | null) {
  const safeMs = Math.max(0, Math.floor(ms ?? 0));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function trackLabel(track: MusicTrackSummary | null) {
  return track?.filename ?? "No BGM selected";
}

export function BgmControls({ sessionId }: BgmControlsProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<MusicTrackSummary[]>([]);
  const [sessionMusic, setSessionMusic] = useState<SessionMusicState | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrackSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("BGM aligns from output 0:00.");
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setMessage("No session id for BGM sync.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([listMusicTracks(), getSessionMusic(sessionId)])
      .then(([nextTracks, nextMusic]) => {
        if (cancelled) {
          return;
        }
        setTracks(nextTracks);
        setSessionMusic(nextMusic);
        const nextSelected =
          nextMusic.music ??
          nextTracks.find((track) => track.id === nextMusic.musicId) ??
          null;
        setSelectedTrack(nextSelected);
        setDurationMs(nextSelected?.durationMs ?? 0);
        setMessage(nextSelected ? "BGM selected for export from 0:00." : "Choose BGM for this take.");
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load BGM tracks.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const update = () => {
      setCurrentMs(Math.round(audio.currentTime * 1000));
      if (Number.isFinite(audio.duration)) {
        setDurationMs(Math.round(audio.duration * 1000));
      }
    };
    const markPlaying = () => setPlaying(true);
    const markPaused = () => setPlaying(false);

    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("play", markPlaying);
    audio.addEventListener("pause", markPaused);
    audio.addEventListener("ended", markPaused);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", update);
      audio.removeEventListener("play", markPlaying);
      audio.removeEventListener("pause", markPaused);
      audio.removeEventListener("ended", markPaused);
    };
  }, [selectedTrack?.id]);

  const selectedSourceUrl = useMemo(() => {
    if (!selectedTrack?.sourceUrl) {
      return "";
    }
    return apiUrl(selectedTrack.sourceUrl);
  }, [selectedTrack]);

  const progressPercent = durationMs > 0 ? Math.min(100, Math.max(0, (currentMs / durationMs) * 100)) : 0;

  const selectTrack = async (track: MusicTrackSummary | null) => {
    if (!sessionId) {
      return;
    }

    setLoading(true);
    setMessage(track ? "Syncing BGM selection..." : "Clearing BGM...");
    try {
      const nextMusic = await updateSessionMusic(sessionId, {
        enabled: Boolean(track),
        gainDb: sessionMusic?.gainDb ?? -10,
        musicId: track?.id ?? null,
        startMs: 0
      });
      audioRef.current?.pause();
      setPlaying(false);
      setCurrentMs(0);
      setSessionMusic(nextMusic);
      setSelectedTrack(track);
      setDurationMs(track?.durationMs ?? 0);
      setOpen(false);
      setMessage(track ? "BGM selected for export from 0:00." : "BGM disabled for this take.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update BGM.");
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !selectedTrack) {
      setOpen(true);
      return;
    }

    if (playing) {
      audio.pause();
      return;
    }

    void audio.play().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not play BGM preview.");
    });
  };

  return (
    <aside className={styles.bgmControls} data-testid="bgm-controls">
      <audio ref={audioRef} src={selectedSourceUrl || undefined} preload="metadata" />
      <div className={styles.bgmHead}>
        <div>
          <p className={styles.bgmKicker}>Output BGM</p>
          <strong>{trackLabel(selectedTrack)}</strong>
        </div>
        <button aria-label="Choose BGM" className={open ? styles.active : ""} onClick={() => setOpen((value) => !value)} type="button">
          <span className={styles.buttonLabel}>List</span>
        </button>
      </div>
      <div className={styles.bgmStrip}>
        <button aria-label={playing ? "Pause BGM" : "Play BGM"} onClick={togglePlay} type="button">
          <span className={styles.buttonLabel}>{playing ? "II" : ">"}</span>
        </button>
        <div className={styles.bgmProgress}>
          <span>{formatTime(currentMs)}</span>
          <div className={styles.bgmProgressTrack} style={{ "--bgm-progress": `${progressPercent}%` } as StyleWithVars}>
            <span />
          </div>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>
      <p className={styles.bgmMessage}>{loading ? "Loading BGM..." : message}</p>
      {open ? (
        <div className={styles.bgmPopover} data-testid="bgm-popover">
          <button className={!selectedTrack ? styles.active : ""} onClick={() => void selectTrack(null)} type="button">
            <span className={styles.buttonLabel}>No BGM</span>
            <span className={styles.buttonKey}>export silent</span>
          </button>
          {tracks.map((track) => (
            <button
              className={selectedTrack?.id === track.id ? styles.active : ""}
              key={track.id}
              onClick={() => void selectTrack(track)}
              type="button"
            >
              <span className={styles.buttonLabel}>{track.filename}</span>
              <span className={styles.buttonKey}>{formatTime(track.durationMs)}</span>
            </button>
          ))}
          {tracks.length === 0 ? <p>No uploaded BGM tracks.</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
