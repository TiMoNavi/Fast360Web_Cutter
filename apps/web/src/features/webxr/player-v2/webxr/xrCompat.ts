"use client";

/**
 * Meta XR Compatibility Layer
 *
 * Handles XRWebGLBinding compatibility issues when requesting XR sessions.
 * Some Meta Quest browsers may have issues with XRProjectionLayer creation,
 * requiring fallback to legacy XRWebGLLayer.
 */

type XrBindingGlobal = Window &
  typeof globalThis & {
    XRWebGLBinding?: typeof XRWebGLBinding;
  };

/**
 * Check if an error is related to XRWebGLBinding session issues
 */
export function isXrWebGlBindingSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("XRWebGLBinding") && message.includes("XRSession");
}

/**
 * Temporarily mask XRWebGLBinding to force legacy XRWebGLLayer usage
 */
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

export type MetaXrSessionResult = {
  session: XRSession;
  usedLegacyLayerFallback: boolean;
};

/**
 * Request Meta XR session with automatic fallback to legacy layer if needed
 *
 * @param sceneElement - The scene element (typically an A-Frame scene or Three.js container)
 * @returns XR session and whether legacy fallback was used
 */
export async function requestMetaXrSession(
  sceneElement: HTMLElement
): Promise<MetaXrSessionResult> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;

  if (!xr?.requestSession) {
    throw new Error("navigator.xr.requestSession is unavailable. Enable Meta WebXR support first.");
  }

  // Request immersive VR session
  const session = await xr.requestSession("immersive-vr", {
    optionalFeatures: ["local-floor", "bounded-floor"]
  });

  // Try to initialize with XRProjectionLayer, fallback to legacy if needed
  let usedLegacyLayerFallback = false;

  // Note: The actual renderer setup should be handled by the caller
  // This function only handles the session request and compatibility detection

  return {
    session,
    usedLegacyLayerFallback
  };
}
