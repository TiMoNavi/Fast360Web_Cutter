"use client";

type XrBindingGlobal = Window &
  typeof globalThis & {
    XRWebGLBinding?: typeof XRWebGLBinding;
  };

type AFrameSceneWithRenderer = HTMLElement & {
  addFullScreenStyles?: () => void;
  addState?: (state: string) => void;
  emit?: (name: string, detail?: unknown) => void;
  removeState?: (state: string) => void;
  resize?: () => void;
  renderer?: {
    xr?: {
      enabled?: boolean;
      isPresenting?: boolean;
      setReferenceSpaceType?: (referenceSpaceType: string) => void;
      setSession?: (session: XRSession) => Promise<void>;
    };
  };
  systems?: {
    renderer?: {
      setWebXRFrameRate?: (session: XRSession) => void;
    };
  };
  xrSession?: XRSession;
};

export function isXrWebGlBindingSessionError(error: unknown) {
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

export function patchAFrameSceneXrBindingFallback(sceneEl: AFrameSceneWithRenderer) {
  const xrManager = sceneEl.renderer?.xr;
  const originalSetSession = xrManager?.setSession;

  if (!xrManager || !originalSetSession) {
    return () => {};
  }

  const boundSetSession = originalSetSession.bind(xrManager);

  xrManager.setSession = async (session: XRSession) => {
    try {
      await boundSetSession(session);
    } catch (error) {
      if (!isXrWebGlBindingSessionError(error)) {
        throw error;
      }

      await withLegacyXrWebGlLayer(() => boundSetSession(session));
    }
  };

  return () => {
    if (xrManager.setSession !== originalSetSession) {
      xrManager.setSession = originalSetSession;
    }
  };
}

export async function setAFrameSceneXrSessionWithFallback(sceneEl: AFrameSceneWithRenderer, session: XRSession) {
  const xrManager = sceneEl.renderer?.xr;

  if (!xrManager?.setSession) {
    throw new Error("A-Frame renderer.xr is not ready.");
  }

  try {
    await xrManager.setSession(session);
    return false;
  } catch (error) {
    if (!isXrWebGlBindingSessionError(error)) {
      throw error;
    }

    await withLegacyXrWebGlLayer(() => xrManager.setSession!(session));
    return true;
  }
}

export type AFrameMetaXrSessionResult = {
  session: XRSession;
  usedLegacyLayerFallback: boolean;
};

export async function requestAFrameMetaVrSession(sceneEl: AFrameSceneWithRenderer) {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  const xrManager = sceneEl.renderer?.xr;

  if (!xr?.requestSession) {
    throw new Error("navigator.xr.requestSession is unavailable. Enable Meta WebXR support first.");
  }

  if (!xrManager?.setSession) {
    throw new Error("A-Frame renderer.xr is not ready.");
  }

  xrManager.enabled = true;
  xrManager.setReferenceSpaceType?.("local-floor");

  const session = await xr.requestSession("immersive-vr", {
    optionalFeatures: ["local-floor", "bounded-floor"]
  });

  const usedLegacyLayerFallback = await setAFrameSceneXrSessionWithFallback(sceneEl, session);
  sceneEl.xrSession = session;
  sceneEl.systems?.renderer?.setWebXRFrameRate?.(session);
  sceneEl.addState?.("vr-mode");
  sceneEl.emit?.("enter-vr", { target: sceneEl });
  sceneEl.addFullScreenStyles?.();
  sceneEl.resize?.();

  session.addEventListener("end", () => {
    sceneEl.removeState?.("vr-mode");
    sceneEl.emit?.("exit-vr", { target: sceneEl });
    sceneEl.resize?.();
  });

  return {
    session,
    usedLegacyLayerFallback
  } satisfies AFrameMetaXrSessionResult;
}
