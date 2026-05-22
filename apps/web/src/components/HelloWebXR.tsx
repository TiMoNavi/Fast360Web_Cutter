"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import * as THREE from "three";

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

type XrStatus = {
  secureContext: boolean;
  hasNavigatorXr: boolean;
  immersiveVr: "checking" | "supported" | "unsupported" | "error";
};

const SAMPLE_FILE_SRC = "/api/sample-video";
const SAMPLE_HLS_SRC = "/api/sample-stream/index.m3u8";

type SampleVideoSource = "file" | "hls";
type XrLogEntry = {
  id: number;
  line: string;
};

type XrBindingGlobal = Window &
  typeof globalThis & {
    XRWebGLBinding?: typeof XRWebGLBinding;
  };

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: BrowserXr }).xr;
}

function isXrWebGlBindingSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("XRWebGLBinding") && message.includes("XRSession");
}

async function withLegacyXrWebGlLayer<T>(callback: () => Promise<T>) {
  const globalScope = window as XrBindingGlobal;
  const originalDescriptor = Reflect.getOwnPropertyDescriptor(globalScope, "XRWebGLBinding");
  const originalBinding = globalScope.XRWebGLBinding;

  if (!originalBinding) {
    return callback();
  }

  const masked = Reflect.defineProperty(globalScope, "XRWebGLBinding", {
    configurable: true,
    value: undefined,
    writable: true
  });

  if (!masked) {
    return callback();
  }

  try {
    return await callback();
  } finally {
    if (originalDescriptor) {
      Reflect.defineProperty(globalScope, "XRWebGLBinding", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalScope, "XRWebGLBinding");
    }
  }
}

async function setRendererSession(renderer: THREE.WebGLRenderer, session: BrowserXrSession) {
  try {
    await renderer.xr.setSession(session as unknown as XRSession);
    return false;
  } catch (error) {
    if (!isXrWebGlBindingSessionError(error)) {
      throw error;
    }

    await withLegacyXrWebGlLayer(() => renderer.xr.setSession(session as unknown as XRSession));
    return true;
  }
}

export function HelloWebXR() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sampleVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const simulatorRef = useRef(false);
  const viewRef = useRef({ yaw: 0, pitch: 0 });
  const pointerRef = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0 });
  const [mockMode, setMockMode] = useState(false);
  const [message, setMessage] = useState("Initializing the Three.js scene...");
  const logIdRef = useRef(1);
  const [logs, setLogs] = useState<XrLogEntry[]>([{ id: 0, line: "Page loaded" }]);
  const [videoStatus, setVideoStatus] = useState("loading");
  const [sampleVideoSource, setSampleVideoSource] = useState<SampleVideoSource>("file");
  const [canEnterVr, setCanEnterVr] = useState(false);
  const [inVr, setInVr] = useState(false);
  const [simulatedVr, setSimulatedVr] = useState(false);
  const [xrStatus, setXrStatus] = useState<XrStatus>({
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
    simulatorRef.current = simulatedVr;
  }, [simulatedVr]);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1014);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    camera.position.set(0, 1.6, 3);
    camera.rotation.order = "YXZ";
    const stereoCamera = new THREE.StereoCamera();
    stereoCamera.eyeSep = 0.064;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const sampleVideo = document.createElement("video");
    sampleVideo.crossOrigin = "anonymous";
    sampleVideo.loop = true;
    sampleVideo.muted = true;
    sampleVideo.playsInline = true;
    sampleVideo.preload = "auto";
    sampleVideo.src = SAMPLE_FILE_SRC;
    sampleVideoRef.current = sampleVideo;

    const floor = new THREE.GridHelper(8, 16, 0x6ee7b7, 0x2b3542);
    scene.add(floor);

    const videoTexture = new THREE.VideoTexture(sampleVideo);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;

    const videoSphereGeometry = new THREE.SphereGeometry(24, 64, 32);
    videoSphereGeometry.scale(-1, 1, 1);
    const videoSphereMaterial = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.FrontSide
    });
    const videoSphere = new THREE.Mesh(videoSphereGeometry, videoSphereMaterial);
    scene.add(videoSphere);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.45 })
    );
    cube.position.set(0, 1.4, -1.5);
    scene.add(cube);

    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.025, 16, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    marker.position.set(0, 1.4, -1.5);
    scene.add(marker);

    const referenceMaterials = [
      new THREE.MeshBasicMaterial({ color: 0x22c55e }),
      new THREE.MeshBasicMaterial({ color: 0xef4444 }),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 }),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    ];
    const referenceGeometry = new THREE.ConeGeometry(0.18, 0.45, 24);
    const referenceMarkers = [
      { position: new THREE.Vector3(0, 1.5, -3), rotationY: 0, material: referenceMaterials[0] },
      { position: new THREE.Vector3(3, 1.5, 0), rotationY: -Math.PI / 2, material: referenceMaterials[1] },
      { position: new THREE.Vector3(-3, 1.5, 0), rotationY: Math.PI / 2, material: referenceMaterials[2] },
      { position: new THREE.Vector3(0, 1.5, 3), rotationY: Math.PI, material: referenceMaterials[3] }
    ].map(({ position, rotationY, material }) => {
      const cone = new THREE.Mesh(referenceGeometry, material);
      cone.position.copy(position);
      cone.rotation.z = Math.PI / 2;
      cone.rotation.y = rotationY;
      scene.add(cone);
      return cone;
    });

    const light = new THREE.HemisphereLight(0xffffff, 0x223344, 2.4);
    scene.add(light);

    const onVideoCanPlay = () => {
      setVideoStatus("ready");
      pushLog("360 sample video ready");
    };
    const onVideoPlaying = () => {
      setVideoStatus("playing");
      pushLog("360 sample video playing");
    };
    const onVideoError = () => {
      setVideoStatus("error");
      pushLog("360 sample video failed");
    };

    sampleVideo.addEventListener("canplay", onVideoCanPlay);
    sampleVideo.addEventListener("playing", onVideoPlaying);
    sampleVideo.addEventListener("error", onVideoError);
    sampleVideo.load();

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const onPointerDown = (event: PointerEvent) => {
      pointerRef.current = {
        active: true,
        x: event.clientX,
        y: event.clientY,
        yaw: viewRef.current.yaw,
        pitch: viewRef.current.pitch
      };
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerRef.current.active || !simulatorRef.current) {
        return;
      }

      const dx = event.clientX - pointerRef.current.x;
      const dy = event.clientY - pointerRef.current.y;
      viewRef.current.yaw = pointerRef.current.yaw - dx * 0.004;
      viewRef.current.pitch = THREE.MathUtils.clamp(
        pointerRef.current.pitch - dy * 0.004,
        -Math.PI / 2 + 0.05,
        Math.PI / 2 - 0.05
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      pointerRef.current.active = false;

      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!simulatorRef.current) {
        return;
      }

      const step = 0.06;

      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        viewRef.current.yaw += step;
      }

      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        viewRef.current.yaw -= step;
      }

      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        viewRef.current.pitch = THREE.MathUtils.clamp(viewRef.current.pitch + step, -1.2, 1.2);
      }

      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
        viewRef.current.pitch = THREE.MathUtils.clamp(viewRef.current.pitch - step, -1.2, 1.2);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    renderer.setAnimationLoop((time: number) => {
      cube.rotation.x = time / 1400;
      cube.rotation.y = time / 900;
      marker.rotation.z = time / 1200;

      if (!renderer.xr.isPresenting) {
        camera.rotation.y = viewRef.current.yaw;
        camera.rotation.x = viewRef.current.pitch;
      }

      if (simulatorRef.current) {
        const size = renderer.getSize(new THREE.Vector2());
        const halfWidth = Math.floor(size.width / 2);
        stereoCamera.update(camera);
        renderer.setScissorTest(true);
        renderer.clear();
        renderer.setViewport(0, 0, halfWidth, size.height);
        renderer.setScissor(0, 0, halfWidth, size.height);
        renderer.render(scene, stereoCamera.cameraL);
        renderer.setViewport(halfWidth, 0, halfWidth, size.height);
        renderer.setScissor(halfWidth, 0, halfWidth, size.height);
        renderer.render(scene, stereoCamera.cameraR);
        renderer.setScissorTest(false);
      } else {
        renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
        renderer.setScissorTest(false);
        renderer.render(scene, camera);
      }
    });

    setMessage("Scene ready. Use Start Simulator for desktop stereo preview, or enable Quest 3 in Chrome DevTools > WebXR.");
    pushLog("Three.js scene ready");

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      sampleVideo.pause();
      sampleVideo.removeAttribute("src");
      sampleVideo.load();
      sampleVideo.removeEventListener("canplay", onVideoCanPlay);
      sampleVideo.removeEventListener("playing", onVideoPlaying);
      sampleVideo.removeEventListener("error", onVideoError);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      floor.dispose();
      videoTexture.dispose();
      videoSphereGeometry.dispose();
      videoSphereMaterial.dispose();
      cube.geometry.dispose();
      marker.geometry.dispose();
      referenceGeometry.dispose();
      for (const referenceMaterial of referenceMaterials) {
        referenceMaterial.dispose();
      }
      for (const referenceMarker of referenceMarkers) {
        scene.remove(referenceMarker);
      }
      (cube.material as THREE.Material).dispose();
      (marker.material as THREE.Material).dispose();
      sampleVideoRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    setMockMode(new URLSearchParams(window.location.search).get("mock-xr") === "1");
  }, []);

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
      setMessage("navigator.xr is missing. Open normal Chrome with the Meta/WebXR extension enabled.");
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
      setMessage(
        supported
          ? "immersive-vr is available. Click Enter VR."
          : "The WebXR API exists, but immersive-vr is not enabled. Open DevTools > WebXR, choose Meta Quest 3, start emulation, reload, then Recheck WebXR."
      );
    } catch {
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "error" });
      pushLog("support check failed");
      setMessage("WebXR support check failed. Confirm the extension is enabled, then reload this page.");
    }
  }

  useEffect(() => {
    checkSupport();
  }, [mockMode]);

  async function enterVr() {
    pushLog("Enter VR clicked");
    const videoPlayback = playSampleVideo("VR entry");

    if (!canEnterVr) {
      setMessage(
        "Enter VR is blocked because immersive-vr is not enabled yet. In Chrome DevTools > WebXR, choose Meta Quest 3, start emulation, reload, then Recheck WebXR."
      );
      pushLog("blocked: immersive-vr unavailable");
      return;
    }

    const xr = getXr();
    const renderer = rendererRef.current;

    if (!xr?.requestSession || !renderer) {
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
        simulatorRef.current = false;
        usedLegacyLayerFallback = await setRendererSession(renderer, session);
      }

      setInVr(true);
      pushLog(session.isMock ? "mock session running" : "real WebXR session running");
      if (usedLegacyLayerFallback) {
        pushLog("used XRWebGLLayer fallback");
      }
      setMessage(
        session.isMock
          ? "Mock WebXR session is running. The automated Enter VR test passed."
          : usedLegacyLayerFallback
            ? "VR session is running with the WebXR emulator compatibility fallback."
            : "VR session is running. Move the virtual headset in the WebXR emulator panel."
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
    void playSampleVideo("desktop simulator");
    pushLog("desktop simulator running");
    setMessage("Desktop XR Simulator is running with the 360 sample video. Left and right halves are stereo eyes. Drag the mouse or use WASD / arrow keys to move the virtual headset.");
  }

  function stopDesktopSimulator() {
    setSimulatedVr(false);
    pushLog("desktop simulator stopped");
    setMessage("Desktop XR Simulator stopped.");
  }

  function loadSampleVideoSource(source: SampleVideoSource, autoplay: boolean) {
    const sampleVideo = sampleVideoRef.current;

    setSampleVideoSource(source);

    if (!sampleVideo) {
      setVideoStatus("missing");
      pushLog("360 sample video missing");
      return;
    }

    hlsRef.current?.destroy();
    hlsRef.current = null;
    sampleVideo.pause();
    sampleVideo.removeAttribute("src");
    sampleVideo.load();
    setVideoStatus(source === "hls" ? "stream loading" : "loading");

    if (source === "hls") {
      if (sampleVideo.canPlayType("application/vnd.apple.mpegurl")) {
        sampleVideo.src = SAMPLE_HLS_SRC;
        sampleVideo.load();
        pushLog("native HLS stream loaded");
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setVideoStatus("stream ready");
          pushLog("HLS manifest parsed");
          if (autoplay) {
            void playSampleVideo("HLS manifest");
          }
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          setVideoStatus(data.fatal ? "stream error" : "stream warning");
          pushLog(`HLS ${data.fatal ? "fatal" : "warning"}: ${data.type}`);
        });
        hls.loadSource(SAMPLE_HLS_SRC);
        hls.attachMedia(sampleVideo);
        pushLog("hls.js stream attached");
        return;
      } else {
        setVideoStatus("stream unsupported");
        pushLog("HLS unsupported in this browser");
        return;
      }
    } else {
      sampleVideo.src = SAMPLE_FILE_SRC;
      sampleVideo.load();
      pushLog("MP4 sample video loaded");
    }

    if (autoplay) {
      void playSampleVideo(source === "hls" ? "native HLS stream" : "MP4 source");
    }
  }

  async function playSampleVideo(source: string) {
    const sampleVideo = sampleVideoRef.current;

    if (!sampleVideo) {
      setVideoStatus("missing");
      pushLog("360 sample video missing");
      return;
    }

    try {
      await sampleVideo.play();
      setVideoStatus("playing");
      pushLog(`360 sample video play requested by ${source}`);
    } catch (error) {
      setVideoStatus("blocked");
      pushLog(error instanceof Error ? `video play failed: ${error.message}` : "video play failed");
    }
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
          <p className="muted">First WebXR Scene</p>
          <h1>Hello WebXR</h1>
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
              source: {sampleVideoSource === "hls" ? "HLS stream" : "MP4 file"}
            </span>
          </div>
          <div className="xr-help">
            <strong>Meta Quest 3 emulator steps</strong>
            <ol>
              <li>Use normal Chrome, because your installed Meta/WebXR extension is in the default profile.</li>
              <li>Press F12 and open the WebXR panel. If it is hidden, use DevTools &gt;&gt; or Command Menu.</li>
              <li>Choose Meta Quest 3, then start emulation or enable the polyfill in that panel.</li>
              <li>Reload this page, click Recheck WebXR, then click Enter VR.</li>
            </ol>
            <p>For an immediate desktop-only view, click Start Simulator.</p>
          </div>
          <div className="button-row">
            <button
              className="button primary"
              data-testid="enter-vr"
              disabled={inVr}
              onClick={enterVr}
              type="button"
            >
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
            <button className="button" onClick={() => void playSampleVideo("manual button")} type="button">
              Play 360 Video
            </button>
            <button
              className="button"
              data-testid="load-hls-stream"
              onClick={() => loadSampleVideoSource("hls", true)}
              type="button"
            >
              Use HLS Stream
            </button>
            <button
              className="button"
              data-testid="load-mp4-file"
              onClick={() => loadSampleVideoSource("file", true)}
              type="button"
            >
              Use MP4 File
            </button>
            <button className="button" onClick={checkSupport} type="button">
              Recheck WebXR
            </button>
            <a className="button" href="/xr/dev-check">
              Environment Check
            </a>
            <a className="button" href="/">
              Home
            </a>
          </div>
          <div className="xr-demo-log" data-testid="xr-log">
            {logs.map((entry) => (
              <div key={entry.id}>{entry.line}</div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
