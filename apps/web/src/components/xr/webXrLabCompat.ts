import * as THREE from "three";

type BrowserXrSession = {
  isMock?: boolean;
  end: () => Promise<void>;
  addEventListener: (type: "end", listener: () => void) => void;
};

type XrBindingGlobal = Window &
  typeof globalThis & {
    XRWebGLBinding?: typeof XRWebGLBinding;
  };

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

export async function setRendererSessionWithLabFallback(renderer: THREE.WebGLRenderer, session: BrowserXrSession) {
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
