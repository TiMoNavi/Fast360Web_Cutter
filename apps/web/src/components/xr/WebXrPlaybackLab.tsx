"use client";

import { useEffect, useRef, useState } from "react";
import { VideoSphereScene } from "./VideoSphereScene";
import { XrDebugLog } from "./XrDebugLog";
import type { VideoPlaybackStatus, VideoSourceHandle, XrLogEntry, XrSupportStatus, XrVideoSource } from "./types";
import { createHlsVideoSource, createMp4VideoSource } from "./videoSources";
import { setRendererSessionWithLabFallback } from "./webXrLabCompat";

const SOURCES = {
  file: {
    type: "mp4",
    url: "/api/sample-video"
  },
  hls: {
    type: "hls",
    url: "/xr/sample-stream/index.m3u8"
  }
} satisfies Record<string, XrVideoSource>;

type BrowserXrSession = {
  isMock?: boolean;
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

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: BrowserXr }).xr;
}

function createVideoSourceHandle(
  source: XrVideoSource,
  onStatusChange: (status: VideoPlaybackStatus) => void,
  onLog: (line: string) => void
) {
  if (source.type === "hls") {
    return createHlsVideoSource({ url: source.url, onStatusChange, onLog });
  }

  return createMp4VideoSource({ url: source.url, onStatusChange, onLog });
}

export function WebXrPlaybackLab() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<VideoSphereScene | null>(null);
  const sourceRef = useRef<VideoSourceHandle | null>(null);
  const logIdRef = useRef(1);
  const [source, setSource] = useState<XrVideoSource>(SOURCES.file);
  const [mockMode, setMockMode] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mock-xr") === "1"
  );
  const [message, setMessage] = useState("Initializing playback lab...");
  const [logs, setLogs] = useState<XrLogEntry[]>([{ id: 0, line: "Page loaded" }]);
  const [videoStatus, setVideoStatus] = useState<VideoPlaybackStatus>("loading");
  const [canEnterVr, setCanEnterVr] = useState(false);
  const [inVr, setInVr] = useState(false);
  const [simulatedVr, setSimulatedVr] = useState(false);
  const [xrStatus, setXrStatus] = useState<XrSupportStatus>({
    secureContext: false,
    hasNavigatorXr: false,
    immersiveVr: "checking"
  });

  function pushLog(line: string) {
    const entry = {
      id: logIdRef.current,
      line: `${new Date().toLocaleTimeString()} ${line}`
    };
    logIdRef.current += 1;
    setLogs((current) => [entry, ...current].slice(0, 8));
  }

  function getXr() {
    if (mockMode) {
      return {
        isSessionSupported: async () => true,
        requestSession: async () => ({
          isMock: true,
          addEventListener: () => undefined,
          end: async () => undefined
        })
      } satisfies BrowserXr;
    }

    return getNavigatorXr();
  }

  useEffect(() => {
    setMockMode(new URLSearchParams(window.location.search).get("mock-xr") === "1");
  }, []);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return undefined;
    }

    const videoSource = createVideoSourceHandle(source, setVideoStatus, pushLog);
    const scene = new VideoSphereScene(mount, videoSource.videoElement, {
      showReferenceMarkers: true,
      enableDesktopStereo: true
    });

    scene.setDesktopStereo(simulatedVr);
    scene.start();
    sourceRef.current = videoSource;
    sceneRef.current = scene;
    setMessage("Scene ready. Use Start Simulator for desktop preview, or Enter VR with a WebXR emulator.");
    pushLog("Three.js scene ready");

    return () => {
      scene.dispose();
      videoSource.dispose();
      sceneRef.current = null;
      sourceRef.current = null;
    };
  }, [source]);

  useEffect(() => {
    sceneRef.current?.setDesktopStereo(simulatedVr);
  }, [simulatedVr]);

  async function checkSupport() {
    const xr = getXr();
    const secureContext = window.isSecureContext;
    const hasNavigatorXr = Boolean(xr);

    setXrStatus({
      secureContext,
      hasNavigatorXr,
      immersiveVr: "checking"
    });

    if (!secureContext) {
      setMessage("This page is not in a secure context. Use localhost or HTTPS.");
      pushLog("blocked: insecure context");
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "unsupported" });
      return;
    }

    if (!xr?.isSessionSupported) {
      setMessage("navigator.xr is missing. Open Chrome with the Meta/WebXR extension enabled.");
      pushLog("navigator.xr missing");
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
      pushLog(supported ? "immersive-vr supported" : "immersive-vr unsupported");
      setMessage(supported ? "immersive-vr is available. Click Enter VR." : "WebXR exists, but immersive-vr is unavailable.");
    } catch {
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "error" });
      pushLog("support check failed");
      setMessage("WebXR support check failed.");
    }
  }

  useEffect(() => {
    void checkSupport();
  }, [mockMode]);

  async function enterVr() {
    pushLog("Enter VR clicked");
    const videoPlayback = sourceRef.current?.play();

    if (!canEnterVr) {
      setMessage("Enter VR is blocked because immersive-vr is not enabled yet.");
      pushLog("blocked: immersive-vr unavailable");
      return;
    }

    const xr = getXr();
    const scene = sceneRef.current;

    if (!xr?.requestSession || !scene) {
      setMessage("Cannot create a WebXR session.");
      pushLog("requestSession unavailable");
      return;
    }

    try {
      const session = await xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"]
      });
      await videoPlayback;

      session.addEventListener("end", () => {
        setInVr(false);
        setMessage("VR session ended.");
        pushLog("session ended");
      });

      let usedLegacyLayerFallback = false;

      if (!session.isMock) {
        setSimulatedVr(false);
        usedLegacyLayerFallback = await setRendererSessionWithLabFallback(scene.renderer, session);
      }

      setInVr(true);
      pushLog(session.isMock ? "mock session running" : "real WebXR session running");
      if (usedLegacyLayerFallback) {
        pushLog("used XRWebGLLayer fallback");
      }
      setMessage(
        session.isMock
          ? "Mock WebXR session is running. The automated Enter VR test passed."
          : "VR session is running in playback lab."
      );
    } catch (error) {
      setInVr(false);
      pushLog(error instanceof Error ? `request failed: ${error.message}` : "request failed");
      setMessage(error instanceof Error ? error.message : "Failed to enter VR.");
    }
  }

  function startDesktopSimulator() {
    setSimulatedVr(true);
    setInVr(false);
    void sourceRef.current?.play();
    pushLog("desktop simulator running");
    setMessage("Desktop XR Simulator is running. Left and right halves are stereo eyes. Drag the mouse or use WASD / arrow keys.");
  }

  function stopDesktopSimulator() {
    setSimulatedVr(false);
    pushLog("desktop simulator stopped");
    setMessage("Desktop XR Simulator stopped.");
  }

  return (
    <main className={`xr-demo-page ${simulatedVr ? "simulated-vr" : ""}`}>
      <section className="xr-demo-stage" ref={mountRef}>
        {simulatedVr ? (
          <>
            <div className="eye-label left">LEFT EYE</div>
            <div className="eye-label right">RIGHT EYE</div>
            <div className="eye-divider" />
          </>
        ) : null}
        <div className="xr-demo-overlay">
          <p className="muted">WebXR Playback Lab</p>
          <h1>360 Video Test Lab</h1>
          <p data-testid="xr-message">{message}</p>
          {mockMode ? <p className="xr-demo-badge">Mock XR automation mode</p> : null}
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
          </div>
          <div className="button-row">
            <button className="button primary" data-testid="enter-vr" disabled={inVr} onClick={enterVr} type="button">
              {inVr ? "VR Running" : canEnterVr ? "Enter VR" : "Enter VR (needs WebXR panel)"}
            </button>
            <button
              className="button primary"
              data-testid="start-desktop-simulator"
              onClick={simulatedVr ? stopDesktopSimulator : startDesktopSimulator}
              type="button"
            >
              {simulatedVr ? "Exit Simulator" : "Start Simulator"}
            </button>
            <button className="button" onClick={() => void sourceRef.current?.play()} type="button">
              Play 360 Video
            </button>
            <button className="button" data-testid="load-hls-stream" onClick={() => setSource(SOURCES.hls)} type="button">
              Use HLS Stream
            </button>
            <button className="button" data-testid="load-mp4-file" onClick={() => setSource(SOURCES.file)} type="button">
              Use MP4 File
            </button>
            <button className="button" onClick={checkSupport} type="button">
              Recheck WebXR
            </button>
            <a className="button" href="/xr/hello">
              Meta Player
            </a>
            <a className="button" href="/">
              Home
            </a>
          </div>
          <XrDebugLog logs={logs} />
        </div>
      </section>
    </main>
  );
}
