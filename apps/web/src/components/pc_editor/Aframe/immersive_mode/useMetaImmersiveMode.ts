"use client";

import { useCallback, useEffect, useState } from "react";
import { requestMetaXrSession } from "../meta/metaXrCompat";
import { httpsRequirementMessage, isHttpsLocation } from "./https";
import type { MetaImmersiveModeState, UseMetaImmersiveModeOptions, UseMetaImmersiveModeResult } from "./types";

const INITIAL_STATE: MetaImmersiveModeState = {
  canEnter: false,
  hasNavigatorXr: false,
  isHttps: false,
  isSecureContext: false,
  message: "Checking Meta WebXR support...",
  sessionState: "checking"
};

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: XRSystem }).xr;
}

export function useMetaImmersiveMode({
  beforeEnter,
  debugImmersive = false,
  requireHttps = true,
  sceneReady = false,
  sceneRef
}: UseMetaImmersiveModeOptions): UseMetaImmersiveModeResult {
  const [state, setState] = useState<MetaImmersiveModeState>(INITIAL_STATE);

  const recheckSupport = useCallback(async () => {
    const isHttps = typeof window !== "undefined" ? isHttpsLocation(window.location) : false;
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : false;
    const xr = typeof navigator !== "undefined" ? getNavigatorXr() : undefined;
    const hasNavigatorXr = Boolean(xr?.isSessionSupported && xr?.requestSession);

    if (debugImmersive) {
      setState({
        canEnter: sceneReady,
        hasNavigatorXr,
        isHttps,
        isSecureContext,
        message: sceneReady ? "MetaVR debug immersive route is ready." : "MetaVR debug waiting for A-Frame scene.",
        sessionState: sceneReady ? "ready" : "checking"
      });
      return;
    }

    if (requireHttps && !isHttps) {
      setState({
        canEnter: false,
        hasNavigatorXr,
        isHttps,
        isSecureContext,
        message: httpsRequirementMessage(false),
        sessionState: "unsupported"
      });
      return;
    }

    if (!hasNavigatorXr || !xr?.isSessionSupported) {
      setState({
        canEnter: false,
        hasNavigatorXr,
        isHttps,
        isSecureContext,
        message: "navigator.xr is unavailable.",
        sessionState: "unsupported"
      });
      return;
    }

    try {
      const supported = await xr.isSessionSupported("immersive-vr");
      setState({
        canEnter: supported && sceneReady,
        hasNavigatorXr,
        isHttps,
        isSecureContext,
        message: supported
          ? sceneReady
            ? "Meta immersive-vr is ready."
            : "Meta immersive-vr is supported. Waiting for A-Frame scene."
          : "immersive-vr is not supported in this browser.",
        sessionState: supported ? "ready" : "unsupported"
      });
    } catch (error) {
      setState({
        canEnter: false,
        hasNavigatorXr,
        isHttps,
        isSecureContext,
        message: error instanceof Error ? error.message : "Failed to check immersive-vr support.",
        sessionState: "error"
      });
    }
  }, [debugImmersive, requireHttps, sceneReady]);

  useEffect(() => {
    void recheckSupport();
  }, [recheckSupport]);

  const enterImmersiveVr = useCallback(async () => {
    const scene = sceneRef.current;

    if (!state.canEnter || !scene || state.sessionState === "requesting" || state.sessionState === "presenting") {
      return;
    }

    setState((current) => ({
      ...current,
      canEnter: false,
      message: "Requesting Meta immersive-vr session...",
      sessionState: "requesting"
    }));

    try {
      await beforeEnter?.();

      if (debugImmersive) {
        scene.dispatchEvent(new CustomEvent("enter-vr", { bubbles: true, detail: { debugImmersive: true } }));
        setState((current) => ({
          ...current,
          canEnter: false,
          message: "MetaVR debug binocular route is running.",
          sessionState: "presenting"
        }));
        return;
      }

      const { session, usedLegacyLayerFallback } = await requestMetaXrSession(scene);

      session.addEventListener("end", () => {
        setState((current) => ({
          ...current,
          canEnter: true,
          message: "Meta immersive-vr session ended.",
          sessionState: "ended"
        }));
      });

      setState((current) => ({
        ...current,
        canEnter: false,
        message: usedLegacyLayerFallback
          ? "Meta VR running with XRWebGLLayer fallback."
          : "Meta VR running through A-Frame/Three renderer.",
        sessionState: "presenting"
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        canEnter: true,
        message: error instanceof Error ? error.message : "Failed to start Meta VR.",
        sessionState: "error"
      }));
    }
  }, [beforeEnter, debugImmersive, sceneRef, state.canEnter, state.sessionState]);

  return {
    ...state,
    enterImmersiveVr,
    recheckSupport
  };
}
