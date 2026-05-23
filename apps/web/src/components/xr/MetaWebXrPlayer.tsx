"use client";

import { useEffect, useRef, useState } from "react";
import { VideoSphereScene } from "./VideoSphereScene";
import type { VideoPlaybackStatus, VideoSourceHandle, XrSessionState, XrSupportStatus, XrVideoSource } from "./types";
import { setRendererSessionWithLabFallback } from "./webXrLabCompat";
import { createHlsVideoSource, createMp4VideoSource } from "./videoSources";

const DEFAULT_SOURCE: XrVideoSource = {
  type: "mp4",
  url: "/api/sample-video"
};

type BrowserXrSession = {
  end: () => Promise<void>;
  addEventListener: (type: "end", listener: () => void) => void;
};

type BrowserXr = {
  isSessionSupported?: (mode: "immersive-vr") => Promise<boolean>;
  requestSession?: (
    mode: "immersive-vr",
    options?: { optionalFeatures?: string[] }
  ) => Promise<BrowserXrSession>;
};

type MetaWebXrPlayerProps = {
  source?: XrVideoSource;
  autoPlay?: boolean;
  onStatusChange?: (status: VideoPlaybackStatus) => void;
  onSessionChange?: (state: XrSessionState) => void;
};

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: BrowserXr }).xr;
}

function createVideoSourceHandle(
  source: XrVideoSource,
  onStatusChange: (status: VideoPlaybackStatus) => void
) {
  if (source.type === "hls") {
    return createHlsVideoSource({ url: source.url, onStatusChange });
  }

  return createMp4VideoSource({ url: source.url, onStatusChange });
}

export function MetaWebXrPlayer({
  source = DEFAULT_SOURCE,
  autoPlay = false,
  onStatusChange,
  onSessionChange
}: MetaWebXrPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<VideoSphereScene | null>(null);
  const sourceRef = useRef<VideoSourceHandle | null>(null);
  const [message, setMessage] = useState("Initializing Meta WebXR player...");
  const [videoStatus, setVideoStatus] = useState<VideoPlaybackStatus>("loading");
  const [sessionState, setSessionState] = useState<XrSessionState>("idle");
  const [rendererPresenting, setRendererPresenting] = useState(false);
  const [canEnterVr, setCanEnterVr] = useState(false);
  const [xrStatus, setXrStatus] = useState<XrSupportStatus>({
    secureContext: false,
    hasNavigatorXr: false,
    immersiveVr: "checking"
  });

  function updateVideoStatus(status: VideoPlaybackStatus) {
    setVideoStatus(status);
    onStatusChange?.(status);
  }

  function updateSessionState(state: XrSessionState) {
    setSessionState(state);
    onSessionChange?.(state);
  }

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return undefined;
    }

    const videoSource = createVideoSourceHandle(source, updateVideoStatus);
    const scene = new VideoSphereScene(mount, videoSource.videoElement, {
      showReferenceMarkers: false,
      enableDesktopStereo: false
    });

    sourceRef.current = videoSource;
    sceneRef.current = scene;
    scene.start();
    setMessage("Scene ready. Open this page in Quest Browser, then enter VR.");

    if (autoPlay) {
      void videoSource.play();
    }

    return () => {
      scene.dispose();
      videoSource.dispose();
      sceneRef.current = null;
      sourceRef.current = null;
    };
  }, [source.type, source.url, autoPlay]);

  async function checkSupport() {
    const xr = getNavigatorXr();
    const secureContext = window.isSecureContext;
    const hasNavigatorXr = Boolean(xr);

    setXrStatus({
      secureContext,
      hasNavigatorXr,
      immersiveVr: "checking"
    });

    if (!secureContext) {
      setMessage("This page is not in a secure context. Use Quest Browser localhost or HTTPS.");
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "unsupported" });
      return;
    }

    if (!xr?.isSessionSupported) {
      setMessage("navigator.xr is missing. Open this page in Quest Browser.");
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "unsupported" });
      return;
    }

    try {
      const supported = await xr.isSessionSupported("immersive-vr");
      setCanEnterVr(supported);
      setXrStatus({
        secureContext,
        hasNavigatorXr,
        immersiveVr: supported ? "supported" : "unsupported"
      });
      setMessage(
        supported
          ? "Meta WebXR is ready. Play the 360 video, then enter VR."
          : "The WebXR API exists, but immersive-vr is unavailable in this browser."
      );
    } catch {
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "error" });
      setMessage("WebXR support check failed. Reload Quest Browser and try again.");
    }
  }

  useEffect(() => {
    void checkSupport();
  }, []);

  async function enterVr() {
    const xr = getNavigatorXr();
    const scene = sceneRef.current;
    const videoSource = sourceRef.current;

    if (!canEnterVr || !xr?.requestSession || !scene || !videoSource) {
      setMessage("Cannot enter VR yet. Confirm Quest Browser WebXR support first.");
      return;
    }

    updateSessionState("requesting");

    try {
      await videoSource.play();
      const session = await xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"]
      });
      setMessage("Meta XR session granted. Binding renderer...");

      session.addEventListener("end", () => {
        updateSessionState("ended");
        setRendererPresenting(false);
        setMessage("VR session ended.");
      });

      const usedLegacyLayerFallback = await setRendererSessionWithLabFallback(scene.renderer, session);
      updateSessionState("presenting");
      setRendererPresenting(scene.renderer.xr.isPresenting);
      setMessage(
        usedLegacyLayerFallback
          ? "VR session is running with XRWebGLLayer fallback."
          : "VR session is running. Rotate the Quest headset to look around the 360 video."
      );
    } catch (error) {
      updateSessionState("error");
      setMessage(error instanceof Error ? error.message : "Failed to enter VR.");
    }
  }

  return (
    <main className="xr-demo-page">
      <section className="xr-demo-stage" ref={mountRef}>
        <div className="xr-demo-overlay">
          <p className="muted">Meta Quest WebXR</p>
          <h1>360 Video Player</h1>
          <p data-testid="xr-message">{message}</p>
          <div className="xr-status-grid">
            <span className={xrStatus.secureContext ? "ok" : "bad"}>Secure: {xrStatus.secureContext ? "OK" : "NO"}</span>
            <span className={xrStatus.hasNavigatorXr ? "ok" : "bad"}>navigator.xr: {xrStatus.hasNavigatorXr ? "OK" : "NO"}</span>
            <span className={xrStatus.immersiveVr === "supported" ? "ok" : "bad"}>
              immersive-vr: {xrStatus.immersiveVr}
            </span>
            <span className={videoStatus === "playing" || videoStatus === "ready" ? "ok" : "bad"} data-testid="sample-video-status">
              360 video: {videoStatus}
            </span>
            <span className="ok" data-testid="sample-video-source">
              source: {source.type === "hls" ? "HLS stream" : "MP4 file"}
            </span>
            <span className={sessionState === "presenting" ? "ok" : "bad"} data-testid="xr-session-state">
              session: {sessionState}
            </span>
            <span className={rendererPresenting ? "ok" : "bad"} data-testid="xr-renderer-presenting">
              renderer.xr.isPresenting: {rendererPresenting ? "true" : "false"}
            </span>
          </div>
          <div className="button-row">
            <button className="button primary" data-testid="enter-vr" disabled={sessionState === "presenting"} onClick={enterVr} type="button">
              {sessionState === "presenting" ? "VR Running" : canEnterVr ? "Enter VR" : "Enter VR (needs Quest WebXR)"}
            </button>
            <button className="button" onClick={() => void sourceRef.current?.play()} type="button">
              Play 360 Video
            </button>
            <button className="button" onClick={checkSupport} type="button">
              Recheck WebXR
            </button>
            <a className="button" href="/xr/playback-lab">
              Playback Lab
            </a>
            <a className="button" href="/">
              Home
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
