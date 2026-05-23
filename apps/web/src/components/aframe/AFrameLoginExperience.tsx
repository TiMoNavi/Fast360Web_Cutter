"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { AFrameGeometricSkyBackground } from "./AFrameGeometricSkyBackground";
import { AFramePassthroughBackground } from "./AFramePassthroughBackground";
import { AFrameSpatialLoginKeyboard } from "./AFrameSpatialLoginKeyboard";
import { XrDomLoginForm } from "./XrDomLoginForm";
import { patchAFrameSceneXrBindingFallback, requestAFrameMetaVrSession } from "./aframeXrCompat";
import { useAFrameRuntime } from "./useAFrameRuntime";
import { getMe, login, register, type AuthUser } from "@/lib/api";

type ArSupportState = "checking" | "supported" | "unsupported";
type VrSupportState = "checking" | "supported" | "unsupported";
type BackgroundRequest = "passthrough" | "geometric";
type LoginMode = "idle" | "email" | "guest";
type AuthMode = "login" | "register";
type LoginField = "email" | "password";

type BrowserXr = {
  isSessionSupported?: (mode: XRSessionMode) => Promise<boolean>;
  requestSession?: (mode: XRSessionMode, options?: XRSessionInit) => Promise<XRSession>;
};

type AFrameSceneElement = HTMLElement & {
  addFullScreenStyles?: () => void;
  canvas?: HTMLCanvasElement;
  enterAR?: () => Promise<unknown>;
  enterVR?: (arMode?: boolean, offerSession?: boolean) => Promise<unknown>;
  emit: (name: string, detail?: unknown) => void;
  hasLoaded?: boolean;
  is?: (state: string) => boolean;
  addState?: (state: string) => void;
  removeState?: (state: string) => void;
  resize?: () => void;
  renderer?: {
    xr?: {
      enabled?: boolean;
      isPresenting?: boolean;
      setFoveation?: (foveation: number) => void;
      setReferenceSpaceType?: (referenceSpaceType: string) => void;
    };
  };
  systems?: {
    renderer?: {
      setWebXRFrameRate?: (session: XRSession) => void;
    };
    webxr?: {
      sessionConfiguration?: XRSessionInit;
      sessionReferenceSpaceType?: XRReferenceSpaceType;
    };
  };
  xrSession?: XRSession;
};

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: BrowserXr }).xr;
}

function isMetaQuestBrowser() {
  return /OculusBrowser|Quest|Meta Quest/i.test(navigator.userAgent);
}

function immersiveErrorMessage(error: unknown, mode: "AR" | "VR", auto = false) {
  const message = error instanceof Error ? error.message : String(error);

  if (/user activation|gesture|allowed|permission|denied/i.test(message)) {
    return auto
      ? `Meta Quest detected. Tap Start ${mode} if the browser asks for a gesture.`
      : `Start ${mode} needs a direct browser gesture. Tap the button again.`;
  }

  return `Start ${mode} failed: ${message}`;
}

function statusText(arSupport: ArSupportState, background: BackgroundRequest) {
  if (background === "geometric") {
    return "Geometric 360 background";
  }

  if (arSupport === "supported") {
    return "Passthrough requested";
  }

  if (arSupport === "checking") {
    return "Checking Passthrough";
  }

  return "Passthrough unavailable, using 360 background";
}

export function AFrameLoginExperience() {
  const sceneRef = useRef<AFrameSceneElement | null>(null);
  const { ready: aframeReady, error: loadError } = useAFrameRuntime();
  const [arSupport, setArSupport] = useState<ArSupportState>("checking");
  const [vrSupport, setVrSupport] = useState<VrSupportState>("checking");
  const [backgroundRequest, setBackgroundRequest] = useState<BackgroundRequest>("passthrough");
  const [loginMode, setLoginMode] = useState<LoginMode>("idle");
  const [compatStatus, setCompatStatus] = useState("pending");
  const [entryStatus, setEntryStatus] = useState("Waiting for WebXR runtime...");
  const [sessionMode, setSessionMode] = useState<"idle" | "vr" | "ar">("idle");
  const [rendererPresenting, setRendererPresenting] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState("Use Quest keyboard below, or point at the spatial keyboard in VR.");
  const [spatialLoginMode, setSpatialLoginMode] = useState<AuthMode>("login");
  const [spatialActiveField, setSpatialActiveField] = useState<LoginField>("email");
  const [spatialEmail, setSpatialEmail] = useState("");
  const [spatialPassword, setSpatialPassword] = useState("");
  const autoStartAttemptedRef = useRef(false);
  const enterSessionInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    getMe()
      .then((user) => {
        if (!cancelled) {
          setAuthUser(user);
          setAuthStatus(`Already signed in as ${user.email}.`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const xr = getNavigatorXr();

    if (!xr?.isSessionSupported) {
      setArSupport("unsupported");
      setVrSupport("unsupported");
      setEntryStatus("navigator.xr is missing. Use Quest Browser or enable the Meta WebXR emulator.");
      return () => {
        cancelled = true;
      };
    }

    xr.isSessionSupported("immersive-vr")
      .then((supported) => {
        if (!cancelled) {
          setVrSupport(supported ? "supported" : "unsupported");
          setEntryStatus(
            supported
              ? isMetaQuestBrowser() && authUser
                ? "Meta Quest detected. Preparing automatic Start VR..."
                : "WebXR VR is ready. Sign in, then Start VR."
              : "immersive-vr is unavailable in this browser."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVrSupport("unsupported");
          setEntryStatus("Could not verify immersive-vr support. Reopen the Meta WebXR panel and retry.");
        }
      });

    xr.isSessionSupported("immersive-ar")
      .then((supported) => {
        if (!cancelled) {
          setArSupport(supported ? "supported" : "unsupported");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArSupport("unsupported");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const effectiveBackground = useMemo<BackgroundRequest>(() => {
    if (backgroundRequest === "passthrough" && arSupport !== "supported") {
      return "geometric";
    }

    return backgroundRequest;
  }, [arSupport, backgroundRequest]);

  useEffect(() => {
    if (!aframeReady) {
      return;
    }

    const sceneEl = sceneRef.current;
    if (!sceneEl) {
      return;
    }
    const currentSceneEl = sceneEl;

    let cleanup = () => {};
    let cancelled = false;

    function installPatch() {
      if (cancelled) {
        return;
      }

      cleanup = patchAFrameSceneXrBindingFallback(currentSceneEl);
      setCompatStatus("XRWebGLBinding fallback armed");
    }

    if (currentSceneEl.hasLoaded) {
      installPatch();
    } else {
      currentSceneEl.addEventListener("loaded", installPatch, { once: true });
    }

    return () => {
      cancelled = true;
      currentSceneEl.removeEventListener("loaded", installPatch);
      cleanup();
    };
  }, [aframeReady]);

  async function enterVr(auto = false) {
    const sceneEl = sceneRef.current;
    const xr = getNavigatorXr();

    if (
      enterSessionInFlightRef.current ||
      sessionMode === "vr" ||
      sceneEl?.is?.("vr-mode") ||
      sceneEl?.renderer?.xr?.isPresenting
    ) {
      return;
    }

    if (!sceneEl?.renderer?.xr || !xr?.requestSession) {
      setEntryStatus("A-Frame scene is still loading. Try Start VR again in a moment.");
      return;
    }

    enterSessionInFlightRef.current = true;
    setEntryStatus(auto ? "Meta Quest detected. Requesting Meta XR immersive-vr..." : "Requesting Meta XR immersive-vr...");

    try {
      const xrManager = sceneEl.renderer.xr;
      const { session, usedLegacyLayerFallback } = await requestAFrameMetaVrSession(sceneEl);
      session.addEventListener("end", () => {
        sceneEl.removeState?.("vr-mode");
        setSessionMode("idle");
        setRendererPresenting(false);
        setEntryStatus("Meta XR session ended.");
      });

      setSessionMode("vr");
      setRendererPresenting(Boolean(xrManager.isPresenting));
      setEntryStatus(
        usedLegacyLayerFallback
          ? "Meta XR session is running with XRWebGLLayer fallback."
          : "Meta XR immersive-vr session is running."
      );
    } catch (error) {
      setEntryStatus(immersiveErrorMessage(error, "VR", auto));
    } finally {
      enterSessionInFlightRef.current = false;
    }
  }

  async function enterAr() {
    const sceneEl = sceneRef.current;

    if (enterSessionInFlightRef.current || sessionMode === "ar" || sceneEl?.is?.("ar-mode")) {
      return;
    }

    if (!sceneEl?.enterAR) {
      setEntryStatus("A-Frame scene is still loading. Try Start AR again in a moment.");
      return;
    }

    enterSessionInFlightRef.current = true;
    setEntryStatus("Starting AR...");

    try {
      await sceneEl.enterAR();
      setSessionMode("ar");
      setEntryStatus("AR session is running.");
    } catch (error) {
      setEntryStatus(immersiveErrorMessage(error, "AR"));
    } finally {
      enterSessionInFlightRef.current = false;
    }
  }

  async function enterAFrameFallbackVr() {
    const sceneEl = sceneRef.current;

    if (!sceneEl?.enterVR || enterSessionInFlightRef.current || sessionMode === "vr") {
      return;
    }

    enterSessionInFlightRef.current = true;
    setEntryStatus("Trying A-Frame VR fallback...");

    try {
      await sceneEl.enterVR(false);
      setSessionMode("vr");
      setRendererPresenting(Boolean(sceneEl.renderer?.xr?.isPresenting));
      setEntryStatus("A-Frame VR fallback entered. Verify Meta IWE binocular output manually.");
    } catch (error) {
      setEntryStatus(immersiveErrorMessage(error, "VR"));
    } finally {
      enterSessionInFlightRef.current = false;
    }
  }


  useEffect(() => {
    if (!aframeReady || !authUser || vrSupport !== "supported" || autoStartAttemptedRef.current || !isMetaQuestBrowser()) {
      return;
    }

    const sceneEl = sceneRef.current;
    if (!sceneEl) {
      return;
    }

    autoStartAttemptedRef.current = true;

    function startWhenReady() {
      window.setTimeout(() => {
        void enterVr(true);
      }, 0);
    }

    if (sceneEl.hasLoaded) {
      startWhenReady();
    } else {
      sceneEl.addEventListener("loaded", startWhenReady, { once: true });
    }

    return () => {
      sceneEl.removeEventListener("loaded", startWhenReady);
    };
  }, [aframeReady, authUser, vrSupport]);

  useEffect(() => {
    const sceneEl = sceneRef.current;

    if (!aframeReady || !sceneEl) {
      return;
    }

    function handleEnterVr() {
      setSessionMode(sceneEl?.is?.("ar-mode") ? "ar" : "vr");
      setEntryStatus(sceneEl?.is?.("ar-mode") ? "AR session is running." : "VR session is running.");
    }

    function handleExitVr() {
      setSessionMode("idle");
      setEntryStatus(
        authUser
          ? isMetaQuestBrowser()
            ? "Meta Quest detected. Start VR is ready."
            : "WebXR is ready. Use Start VR."
          : "Sign in first, then Start VR."
      );
    }

    sceneEl.addEventListener("enter-vr", handleEnterVr);
    sceneEl.addEventListener("exit-vr", handleExitVr);

    return () => {
      sceneEl.removeEventListener("enter-vr", handleEnterVr);
      sceneEl.removeEventListener("exit-vr", handleExitVr);
    };
  }, [aframeReady, authUser]);

  function handleAuthenticated(user: AuthUser) {
    setAuthUser(user);
    setAuthStatus(`Signed in as ${user.email}.`);
    setLoginMode("email");

    if (isMetaQuestBrowser() && vrSupport === "supported") {
      window.setTimeout(() => {
        void enterVr(true);
      }, 150);
    }
  }

  function appendSpatialCharacter(value: string) {
    if (spatialActiveField === "email") {
      setSpatialEmail((current) => `${current}${value}`.replace(/\s+/g, "").toLowerCase().slice(0, 72));
      return;
    }

    setSpatialPassword((current) => `${current}${value}`.slice(0, 64));
  }

  function backspaceSpatialCharacter() {
    if (spatialActiveField === "email") {
      setSpatialEmail((current) => current.slice(0, -1));
      return;
    }

    setSpatialPassword((current) => current.slice(0, -1));
  }

  function clearSpatialField() {
    if (spatialActiveField === "email") {
      setSpatialEmail("");
      return;
    }

    setSpatialPassword("");
  }

  async function submitSpatialLogin() {
    setAuthStatus(spatialLoginMode === "login" ? "Signing in from spatial keyboard..." : "Creating account from spatial keyboard...");

    try {
      const user =
        spatialLoginMode === "login"
          ? await login(spatialEmail, spatialPassword)
          : await register(spatialEmail, spatialPassword);
      handleAuthenticated(user);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Spatial login failed.");
    }
  }

  if (loadError) {
    return (
      <main className="aframe-login-page">
        <div className="aframe-login-message" role="alert">
          A-Frame failed to load: {loadError}
        </div>
      </main>
    );
  }

  return (
    <main className="aframe-login-page">
      <section className="aframe-login-stage" data-testid="aframe-xr-login">
        {!aframeReady ? <div className="aframe-login-message">Loading A-Frame XR login...</div> : null}
        <div className="aframe-login-hud" data-testid="aframe-login-dom-hud">
          <strong>XR Login UI Lab</strong>
          <span data-testid="aframe-login-background-status">{statusText(arSupport, effectiveBackground)}</span>
          <span data-testid="aframe-login-xr-status">
            immersive-vr: {vrSupport}; immersive-ar: {arSupport}
          </span>
          <span data-testid="aframe-login-compat-status">{compatStatus}</span>
          <span data-testid="aframe-login-entry-status">{entryStatus}</span>
          <span data-testid="aframe-login-renderer-presenting">
            renderer.xr.isPresenting: {rendererPresenting ? "true" : "false"}
          </span>
          <span data-testid="aframe-login-auth-status">{authStatus}</span>
          <div className="aframe-login-hud-actions">
            <button type="button" id="aframe-login-enter-vr" onClick={() => void enterVr()} disabled={!authUser || sessionMode === "vr"}>
              {sessionMode === "vr" ? "VR Running" : authUser ? "Start VR" : "Login first"}
            </button>
            <button type="button" id="aframe-login-enter-ar" onClick={() => void enterAr()} disabled={sessionMode === "ar"}>
              {sessionMode === "ar" ? "AR Running" : "Start AR"}
            </button>
            <button
              type="button"
              id="aframe-login-aframe-vr"
              onClick={() => void enterAFrameFallbackVr()}
              disabled={!authUser || sessionMode === "vr"}
            >
              A-Frame VR fallback
            </button>
            <button
              type="button"
              onClick={() => setBackgroundRequest("passthrough")}
              disabled={arSupport === "unsupported"}
              data-testid="select-passthrough-background"
            >
              Passthrough
            </button>
            <button
              type="button"
              onClick={() => setBackgroundRequest("geometric")}
              data-testid="select-geometric-background"
            >
              360 Sky
            </button>
          </div>
          <XrDomLoginForm onAuthenticated={handleAuthenticated} onStatus={setAuthStatus} />
        </div>
        <div className="xr-vapor-login-wrap">
          <div className="xr-vapor-wave-field" aria-hidden="true">
            <span className="xr-vapor-sun" />
            <span className="xr-vapor-grid" />
            <span className="xr-vapor-wave-ring ring-one" />
            <span className="xr-vapor-wave-ring ring-two" />
            <span className="xr-vapor-wave-ring ring-three" />
            <span className="xr-vapor-light-beam beam-cyan" />
            <span className="xr-vapor-light-beam beam-magenta" />
            <span className="xr-vapor-light-orb orb-cyan" />
            <span className="xr-vapor-light-orb orb-magenta" />
          </div>
          <section className="xr-vapor-card" data-testid="aframe-login-spatial-panel" aria-label="XR login panel">
            <div className="xr-vapor-toolbar" aria-hidden="true">
              <span className="xr-vapor-window-dot dot-magenta" />
              <span className="xr-vapor-window-dot dot-cyan" />
              <span className="xr-vapor-window-dot dot-orange" />
              <span className="xr-vapor-toolbar-label">XR_NODE // 2088</span>
            </div>
            <div className="xr-vapor-card-shine" aria-hidden="true" />
            <div className="xr-vapor-content-layer">
              <p className="xr-vapor-eyebrow">&gt; ACCESS MODE</p>
              <h1>Invisible Director</h1>
              <p className="xr-vapor-subtitle">
                {loginMode === "email"
                  ? "EMAIL VECTOR ARMED // READY"
                  : loginMode === "guest"
                    ? "GUEST SESSION ARMED // READY"
                    : "SELECT ENTRY VECTOR FOR THE XR CUTTING ROOM."}
              </p>
              <div className="xr-vapor-status-line" aria-hidden="true">
                <span>STATUS: ONLINE</span>
                <span>SCAN: CLEAN</span>
              </div>
              <div className="xr-vapor-actions">
                <button
                  type="button"
                  className={loginMode === "email" ? "xr-vapor-action active" : "xr-vapor-action"}
                  onClick={() => setLoginMode("email")}
                  data-testid="spatial-email-login"
                >
                  <span>Email</span>
                </button>
                <button
                  type="button"
                  className={loginMode === "guest" ? "xr-vapor-action active secondary" : "xr-vapor-action secondary"}
                  onClick={() => setLoginMode("guest")}
                  data-testid="spatial-guest-login"
                >
                  <span>Guest</span>
                </button>
              </div>
            </div>
          </section>
        </div>
        <span className="aframe-login-test-state" data-testid="aframe-login-mode">
          {loginMode}
        </span>
        {aframeReady
          ? createElement(
              "a-scene",
              {
                ref: sceneRef,
                embedded: true,
                renderer: "colorManagement: true; alpha: true; antialias: true",
                background: "transparent: true",
                webxr: "optionalFeatures: local-floor, bounded-floor, hand-tracking",
                "xr-mode-ui": "enabled: false",
                "device-orientation-permission-ui": "enabled: true",
                cursor: "rayOrigin: mouse",
                raycaster: "objects: .clickable"
              },
              effectiveBackground === "passthrough"
                ? createElement(AFramePassthroughBackground, { supported: arSupport === "supported" })
                : createElement(AFrameGeometricSkyBackground),
              createElement("a-entity", {
                light: "type: ambient; color: #dfe9ff; intensity: 0.72"
              }),
              createElement("a-entity", {
                light: "type: directional; color: #ffffff; intensity: 0.82",
                position: "-1.5 2.4 1.2"
              }),
              createElement("a-entity", {
                light: "type: point; color: #f8fbff; intensity: 0.85; distance: 4.5",
                position: "1.2 1.85 0.35"
              }),
              createElement(AFrameSpatialLoginKeyboard, {
                activeField: spatialActiveField,
                email: spatialEmail,
                mode: spatialLoginMode,
                password: spatialPassword,
                status: authUser ? `Signed in as ${authUser.email}` : authStatus,
                onAppend: appendSpatialCharacter,
                onBackspace: backspaceSpatialCharacter,
                onClear: clearSpatialField,
                onFieldChange: setSpatialActiveField,
                onModeChange: setSpatialLoginMode,
                onSubmit: submitSpatialLogin
              }),
              createElement("a-entity", {
                "laser-controls": "hand: left",
                raycaster: "objects: .clickable; far: 8",
                line: "color: #dcecff; opacity: 0.55"
              }),
              createElement("a-entity", {
                "laser-controls": "hand: right",
                raycaster: "objects: .clickable; far: 8",
                line: "color: #dcecff; opacity: 0.55"
              }),
              createElement("a-entity", {
                "hand-controls": "hand: left; handModelStyle: lowPoly; color: #00ffff"
              }),
              createElement("a-entity", {
                "hand-controls": "hand: right; handModelStyle: lowPoly; color: #ff00ff"
              }),
              createElement("a-entity", {
                "hand-tracking-controls": "hand: left; modelColor: #00ffff"
              }),
              createElement("a-entity", {
                "hand-tracking-controls": "hand: right; modelColor: #ff00ff"
              }),
              createElement(
                "a-entity",
                {
                  camera: true,
                  "look-controls": "enabled: true",
                  position: "0 1.6 0"
                },
                createElement("a-cursor", {
                  color: "#ffffff",
                  opacity: "0.72",
                  fuse: "true",
                  "fuse-timeout": "900",
                  raycaster: "objects: .clickable"
                })
              )
            )
          : null}
      </section>
    </main>
  );
}
