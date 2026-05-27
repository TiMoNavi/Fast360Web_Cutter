"use client";

import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type PcEditorPressedKeyState = {
  code: string;
  key: string;
  pressedAt: number;
};

export type PcEditorViewCenter = {
  pitch: number;
  yaw: number;
};

export type PcEditorViewFov = {
  h: number;
  v: number;
};

export type PcEditorVector3 = {
  x: number;
  y: number;
  z: number;
};

export type PcEditorViewportCornerId = "top-left" | "top-right" | "bottom-right" | "bottom-left";

export type PcEditorViewportCorner = {
  id: PcEditorViewportCornerId;
  screen?: {
    x: number;
    y: number;
  };
  sphere: {
    x: number;
    y: number;
    z: number;
  };
};

export type PcEditorViewportRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type PcEditorMaskViewportBounds = {
  center: {
    pitch: number;
    yaw: number;
  };
  corners: PcEditorViewportCorner[];
  fov: {
    h: number;
    v: number;
  };
  roll: number;
  screenRect?: PcEditorViewportRect;
  source: "crop-mask-bounds";
  updatedAt: number;
};

export type PcEditorCropMaskRuntimeState = {
  aspect: string;
  center: PcEditorViewCenter;
  fov: PcEditorViewFov;
  input: "head_gaze" | "keyboard";
  locked: boolean;
  maskOpacity: number;
  roll: number;
  smoothFollow: boolean;
  updatedAt: number;
  videoTimeMs: number;
};

export type PcEditorPlaybackRuntimeState = {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate?: number;
  readyState?: number;
  sourceId?: string;
  status: "idle" | "loading" | "ready" | "playing" | "paused" | "error";
  updatedAt: number;
};

export type PcEditorRateRuntimeState = {
  effectSpeed: number;
  recordingRate: number;
  updatedAt: number;
};

export type PcEditorViewTargetRuntimeState = {
  center: PcEditorViewCenter;
  fov: PcEditorViewFov;
  input: "head_gaze" | "keyboard" | "controller" | "gesture" | "workflow";
  locked: boolean;
  maskOpacity?: number;
  roll: number;
  source: "crop-mask" | "xr-pose" | "controller" | "workflow";
  updatedAt: number;
  videoTimeMs: number;
};

export type PcEditorCameraPoseRuntimeState = {
  center: PcEditorViewCenter;
  source: "camera" | "headset" | "controller";
  updatedAt: number;
};

export type PcEditorSphereViewRuntimeState = {
  fov: number;
  source: "gesture" | "workflow";
  updatedAt: number;
};

export type PcEditorXrCameraRigPoseRuntimeState = {
  active: boolean;
  cameraRotation: PcEditorVector3;
  fov?: number;
  id?: string;
  position: PcEditorVector3;
  rotation: PcEditorVector3;
  source: "gesture" | "workflow" | "xr-runtime";
  updatedAt: number;
};

export type PcEditorPressedControlState = {
  action?: string;
  id: string;
  pressedAt: number;
  sourceKind: "ui" | "keyboard" | "vr-ray" | "gesture" | "xr-runtime";
};

export type PcEditorPointerRuntimeState = {
  draggingMask: boolean;
  lastScreen?: {
    x: number;
    y: number;
  };
  primaryDown: boolean;
  updatedAt: number;
};

export type PcEditorControllerInputState = {
  buttons: Record<string, {
    pressed: boolean;
    touched?: boolean;
    value?: number;
  }>;
  hand: "left" | "right";
  updatedAt: number;
};

export type PcEditorInputRuntimeState = {
  controls: {
    pressed: Record<string, PcEditorPressedControlState>;
  };
  pointer: PcEditorPointerRuntimeState;
  vrControllers: Record<"left" | "right", PcEditorControllerInputState | null>;
};

export type PcEditorEffectInputRuntimeState = {
  categoryId?: string;
  effectId?: string;
  eventName?: string;
  holdKey?: string;
  label?: string;
  mode: "hidden" | "category" | "effect" | "holding" | "selected";
  previewTarget?: "screen" | "viewport-mask" | "sphere" | "world-layer";
  startedAtMs?: number;
  updatedAt: number;
};

export type PcEditorEffectCatalogRuntimeItem = {
  categoryId?: string;
  conflictGroup?: string | null;
  durationMs?: number;
  eventName?: string;
  id: string;
  key?: string;
  label: string;
  params?: Record<string, unknown>;
  previewMode?: string;
  previewTarget?: "screen" | "viewport-mask" | "sphere" | "world-layer";
  renderFallback?: "ignore" | "warn" | "fail";
  renderStage?: string;
  renderSupported?: boolean;
  webxrSupport?: "exact" | "approximate" | "symbolic" | "unsupported";
};

export type PcEditorEffectCatalogRuntimeCategory = {
  effects: PcEditorEffectCatalogRuntimeItem[];
  id: string;
  key?: string;
  label: string;
};

export type PcEditorEffectCatalogRuntimeState = {
  categories: PcEditorEffectCatalogRuntimeCategory[];
  error?: string | null;
  status: "fallback" | "loading" | "ready" | "error";
  updatedAt: number;
};

export type PcEditorEditorUiRuntimeState = {
  autoRenderEnabled: boolean;
  playlistOpen: boolean;
  recordingActive: boolean;
  updatedAt: number;
};

export type PcEditorRenderRuntimeState = {
  downloadReady: boolean;
  exportId: string | null;
  message: string;
  status: "idle" | "rendering" | "done" | "error";
  updatedAt: number;
};

export type PcEditorDiscardRuntimeState = {
  active: boolean;
  lastRange: {
    endMs: number;
    startMs: number;
  } | null;
  message: string;
  tone: "idle" | "active" | "success" | "warning";
  updatedAt: number;
};

export type PcEditorXrSessionRuntimeState = {
  canEnter: boolean;
  message: string;
  presenting: boolean;
  sessionState: "idle" | "checking" | "unsupported" | "ready" | "requesting" | "presenting" | "ended" | "error";
  updatedAt: number;
};

export type PcEditorRuntimeState = {
  cameraPose: PcEditorCameraPoseRuntimeState | null;
  cropMask: PcEditorCropMaskRuntimeState | null;
  discard: PcEditorDiscardRuntimeState;
  editorUi: PcEditorEditorUiRuntimeState;
  effectCatalog: PcEditorEffectCatalogRuntimeState;
  effectInput: PcEditorEffectInputRuntimeState | null;
  input: PcEditorInputRuntimeState;
  keyboard: {
    pressed: Record<string, PcEditorPressedKeyState>;
  };
  maskViewportBounds: PcEditorMaskViewportBounds | null;
  playback: PcEditorPlaybackRuntimeState | null;
  rates: PcEditorRateRuntimeState;
  render: PcEditorRenderRuntimeState;
  sphereView: PcEditorSphereViewRuntimeState | null;
  viewTarget: PcEditorViewTargetRuntimeState | null;
  xrCameraRigPose: PcEditorXrCameraRigPoseRuntimeState | null;
  xrSession: PcEditorXrSessionRuntimeState | null;
};

export type PcEditorRuntimeStateStore = {
  getSnapshot: () => PcEditorRuntimeState;
  reset: () => void;
  setCameraPose: (cameraPose: Omit<PcEditorCameraPoseRuntimeState, "updatedAt"> | null) => void;
  setControlPressed: (input: {
    action?: string;
    id: string;
    pressed: boolean;
    sourceKind: PcEditorPressedControlState["sourceKind"];
  }) => void;
  setCropMaskState: (cropMask: Omit<PcEditorCropMaskRuntimeState, "updatedAt"> | null) => void;
  setDiscardState: (discard: Omit<PcEditorDiscardRuntimeState, "updatedAt">) => void;
  setEditorUiState: (editorUi: Partial<Omit<PcEditorEditorUiRuntimeState, "updatedAt">>) => void;
  setEffectCatalogState: (effectCatalog: Omit<PcEditorEffectCatalogRuntimeState, "updatedAt">) => void;
  setEffectInput: (effectInput: Omit<PcEditorEffectInputRuntimeState, "updatedAt"> | null) => void;
  setKeyPressed: (input: {
    code: string;
    key: string;
    pressed: boolean;
  }) => void;
  setMaskViewportBounds: (maskViewportBounds: PcEditorMaskViewportBounds | null) => void;
  setPlaybackState: (playback: Omit<PcEditorPlaybackRuntimeState, "updatedAt"> | null) => void;
  setPointerState: (pointer: Partial<Omit<PcEditorPointerRuntimeState, "updatedAt">>) => void;
  setRateState: (rates: Partial<Omit<PcEditorRateRuntimeState, "updatedAt">>) => void;
  setRenderState: (render: Partial<Omit<PcEditorRenderRuntimeState, "updatedAt">>) => void;
  setSphereViewState: (sphereView: Omit<PcEditorSphereViewRuntimeState, "updatedAt"> | null) => void;
  setViewTarget: (viewTarget: Omit<PcEditorViewTargetRuntimeState, "updatedAt"> | null) => void;
  setVrControllerState: (hand: "left" | "right", controller: Omit<PcEditorControllerInputState, "hand" | "updatedAt"> | null) => void;
  setXrCameraRigPose: (xrCameraRigPose: Omit<PcEditorXrCameraRigPoseRuntimeState, "updatedAt"> | null) => void;
  setXrSessionState: (xrSession: Omit<PcEditorXrSessionRuntimeState, "updatedAt"> | null) => void;
  subscribe: (listener: () => void) => () => void;
};

const EMPTY_STATE: PcEditorRuntimeState = {
  cameraPose: null,
  cropMask: null,
  discard: {
    active: false,
    lastRange: null,
    message: "Hold a discard control to mark a range.",
    tone: "idle",
    updatedAt: 0
  },
  editorUi: {
    autoRenderEnabled: false,
    playlistOpen: false,
    recordingActive: false,
    updatedAt: 0
  },
  effectCatalog: {
    categories: [],
    error: null,
    status: "loading",
    updatedAt: 0
  },
  effectInput: null,
  input: {
    controls: {
      pressed: {}
    },
    pointer: {
      draggingMask: false,
      primaryDown: false,
      updatedAt: 0
    },
    vrControllers: {
      left: null,
      right: null
    }
  },
  keyboard: {
    pressed: {}
  },
  maskViewportBounds: null,
  playback: null,
  rates: {
    effectSpeed: 1,
    recordingRate: 1,
    updatedAt: 0
  },
  render: {
    downloadReady: false,
    exportId: null,
    message: "Render idle.",
    status: "idle",
    updatedAt: 0
  },
  sphereView: null,
  viewTarget: null,
  xrCameraRigPose: null,
  xrSession: null
};

function cropMaskToViewTarget(
  cropMask: PcEditorCropMaskRuntimeState,
  updatedAt: number
): PcEditorViewTargetRuntimeState {
  return {
    center: cropMask.center,
    fov: cropMask.fov,
    input: cropMask.input,
    locked: cropMask.locked,
    maskOpacity: cropMask.maskOpacity,
    roll: cropMask.roll,
    source: "crop-mask",
    updatedAt,
    videoTimeMs: cropMask.videoTimeMs
  };
}

export function createPcEditorRuntimeStateStore(initialState: PcEditorRuntimeState = EMPTY_STATE): PcEditorRuntimeStateStore {
  let state = initialState;
  const listeners = new Set<() => void>();

  const emitChange = () => {
    for (const listener of Array.from(listeners)) {
      listener();
    }
  };

  return {
    getSnapshot() {
      return state;
    },
    reset() {
      state = EMPTY_STATE;
      emitChange();
    },
    setCameraPose(cameraPose) {
      state = {
        ...state,
        cameraPose: cameraPose
          ? {
              ...cameraPose,
              updatedAt: Date.now()
            }
          : null
      };
      emitChange();
    },
    setControlPressed(input) {
      const id = input.id;

      if (!id) {
        return;
      }

      const pressed = { ...state.input.controls.pressed };

      if (input.pressed) {
        const nextPressed: PcEditorPressedControlState = {
          id,
          pressedAt: Date.now(),
          sourceKind: input.sourceKind
        };

        if (input.action) {
          nextPressed.action = input.action;
        }

        pressed[id] = nextPressed;
      } else {
        delete pressed[id];
      }

      state = {
        ...state,
        input: {
          ...state.input,
          controls: {
            pressed
          }
        }
      };
      emitChange();
    },
    setCropMaskState(cropMask) {
      const updatedAt = Date.now();
      const nextCropMask = cropMask
        ? {
            ...cropMask,
            updatedAt
          }
        : null;

      state = {
        ...state,
        cropMask: nextCropMask,
        viewTarget: nextCropMask ? cropMaskToViewTarget(nextCropMask, updatedAt) : null
      };
      emitChange();
    },
    setDiscardState(discard) {
      state = {
        ...state,
        discard: {
          ...discard,
          updatedAt: Date.now()
        }
      };
      emitChange();
    },
    setEditorUiState(editorUi) {
      state = {
        ...state,
        editorUi: {
          ...state.editorUi,
          ...editorUi,
          updatedAt: Date.now()
        }
      };
      emitChange();
    },
    setEffectCatalogState(effectCatalog) {
      state = {
        ...state,
        effectCatalog: {
          ...effectCatalog,
          updatedAt: Date.now()
        }
      };
      emitChange();
    },
    setEffectInput(effectInput) {
      state = {
        ...state,
        effectInput: effectInput
          ? {
              ...effectInput,
              updatedAt: Date.now()
            }
          : null
      };
      emitChange();
    },
    setKeyPressed(input) {
      const id = input.code || input.key;

      if (!id) {
        return;
      }

      const pressed = { ...state.keyboard.pressed };

      if (input.pressed) {
        pressed[id] = {
          code: input.code,
          key: input.key,
          pressedAt: Date.now()
        };
      } else {
        delete pressed[id];
      }

      state = {
        ...state,
        keyboard: {
          pressed
        }
      };
      emitChange();
    },
    setMaskViewportBounds(maskViewportBounds) {
      state = {
        ...state,
        maskViewportBounds
      };
      emitChange();
    },
    setPlaybackState(playback) {
      state = {
        ...state,
        playback: playback
          ? {
              ...playback,
              updatedAt: Date.now()
            }
          : null
      };
      emitChange();
    },
    setPointerState(pointer) {
      state = {
        ...state,
        input: {
          ...state.input,
          pointer: {
            ...state.input.pointer,
            ...pointer,
            updatedAt: Date.now()
          }
        }
      };
      emitChange();
    },
    setRateState(rates) {
      state = {
        ...state,
        rates: {
          ...state.rates,
          ...rates,
          updatedAt: Date.now()
        }
      };
      emitChange();
    },
    setRenderState(render) {
      state = {
        ...state,
        render: {
          ...state.render,
          ...render,
          updatedAt: Date.now()
        }
      };
      emitChange();
    },
    setSphereViewState(sphereView) {
      state = {
        ...state,
        sphereView: sphereView
          ? {
              ...sphereView,
              updatedAt: Date.now()
            }
          : null
      };
      emitChange();
    },
    setViewTarget(viewTarget) {
      state = {
        ...state,
        viewTarget: viewTarget
          ? {
              ...viewTarget,
              updatedAt: Date.now()
            }
          : null
      };
      emitChange();
    },
    setVrControllerState(hand, controller) {
      state = {
        ...state,
        input: {
          ...state.input,
          vrControllers: {
            ...state.input.vrControllers,
            [hand]: controller
              ? {
                  ...controller,
                  hand,
                  updatedAt: Date.now()
                }
              : null
          }
        }
      };
      emitChange();
    },
    setXrCameraRigPose(xrCameraRigPose) {
      state = {
        ...state,
        xrCameraRigPose: xrCameraRigPose
          ? {
              ...xrCameraRigPose,
              updatedAt: Date.now()
            }
          : null
      };
      emitChange();
    },
    setXrSessionState(xrSession) {
      state = {
        ...state,
        xrSession: xrSession
          ? {
              ...xrSession,
              updatedAt: Date.now()
            }
          : null
      };
      emitChange();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export const pcEditorRuntimeStateStore = createPcEditorRuntimeStateStore();

const PcEditorRuntimeStateContext = createContext<PcEditorRuntimeStateStore | null>(null);

export function PcEditorRuntimeStateProvider({
  children,
  store
}: {
  children: ReactNode;
  store?: PcEditorRuntimeStateStore;
}) {
  const runtimeStore = useMemo(() => store ?? pcEditorRuntimeStateStore, [store]);

  return createElement(PcEditorRuntimeStateContext.Provider, { value: runtimeStore }, children);
}

export const PcEditorRuntimeStateRoot = PcEditorRuntimeStateProvider;

export function usePcEditorRuntimeStateStore() {
  return useContext(PcEditorRuntimeStateContext) ?? pcEditorRuntimeStateStore;
}

export function getPcEditorRuntimeState() {
  return pcEditorRuntimeStateStore.getSnapshot();
}

export function subscribePcEditorRuntimeState(listener: () => void) {
  return pcEditorRuntimeStateStore.subscribe(listener);
}

export function setPcEditorMaskViewportBounds(maskViewportBounds: PcEditorMaskViewportBounds | null) {
  pcEditorRuntimeStateStore.setMaskViewportBounds(maskViewportBounds);
}

export function setPcEditorCropMaskState(cropMask: Omit<PcEditorCropMaskRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setCropMaskState(cropMask);
}

export function setPcEditorDiscardState(discard: Omit<PcEditorDiscardRuntimeState, "updatedAt">) {
  pcEditorRuntimeStateStore.setDiscardState(discard);
}

export function setPcEditorEditorUiState(editorUi: Partial<Omit<PcEditorEditorUiRuntimeState, "updatedAt">>) {
  pcEditorRuntimeStateStore.setEditorUiState(editorUi);
}

export function setPcEditorEffectCatalogState(effectCatalog: Omit<PcEditorEffectCatalogRuntimeState, "updatedAt">) {
  pcEditorRuntimeStateStore.setEffectCatalogState(effectCatalog);
}

export function setPcEditorPlaybackState(playback: Omit<PcEditorPlaybackRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setPlaybackState(playback);
}

export function setPcEditorRateState(rates: Partial<Omit<PcEditorRateRuntimeState, "updatedAt">>) {
  pcEditorRuntimeStateStore.setRateState(rates);
}

export function setPcEditorRenderState(render: Partial<Omit<PcEditorRenderRuntimeState, "updatedAt">>) {
  pcEditorRuntimeStateStore.setRenderState(render);
}

export function setPcEditorViewTarget(viewTarget: Omit<PcEditorViewTargetRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setViewTarget(viewTarget);
}

export function setPcEditorCameraPose(cameraPose: Omit<PcEditorCameraPoseRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setCameraPose(cameraPose);
}

export function setPcEditorControlPressed(input: {
  action?: string;
  id: string;
  pressed: boolean;
  sourceKind: PcEditorPressedControlState["sourceKind"];
}) {
  pcEditorRuntimeStateStore.setControlPressed(input);
}

export function setPcEditorKeyPressed(input: {
  code: string;
  key: string;
  pressed: boolean;
}) {
  pcEditorRuntimeStateStore.setKeyPressed(input);
}

export function setPcEditorPointerState(pointer: Partial<Omit<PcEditorPointerRuntimeState, "updatedAt">>) {
  pcEditorRuntimeStateStore.setPointerState(pointer);
}

export function setPcEditorSphereViewState(sphereView: Omit<PcEditorSphereViewRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setSphereViewState(sphereView);
}

export function setPcEditorVrControllerState(
  hand: "left" | "right",
  controller: Omit<PcEditorControllerInputState, "hand" | "updatedAt"> | null
) {
  pcEditorRuntimeStateStore.setVrControllerState(hand, controller);
}

export function setPcEditorXrCameraRigPose(xrCameraRigPose: Omit<PcEditorXrCameraRigPoseRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setXrCameraRigPose(xrCameraRigPose);
}

export function setPcEditorEffectInput(effectInput: Omit<PcEditorEffectInputRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setEffectInput(effectInput);
}

export function setPcEditorXrSessionState(xrSession: Omit<PcEditorXrSessionRuntimeState, "updatedAt"> | null) {
  pcEditorRuntimeStateStore.setXrSessionState(xrSession);
}

export function usePcEditorRuntimeState() {
  const store = usePcEditorRuntimeStateStore();

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
}

export function usePcEditorRuntimeStateSelector<TSelected>(
  selector: (state: PcEditorRuntimeState) => TSelected
) {
  return selector(usePcEditorRuntimeState());
}

export function usePcEditorMaskViewportBounds() {
  return usePcEditorRuntimeStateSelector((state) => state.maskViewportBounds);
}

export function usePcEditorCropMaskState() {
  return usePcEditorRuntimeStateSelector((state) => state.cropMask);
}

export function usePcEditorDiscardState() {
  return usePcEditorRuntimeStateSelector((state) => state.discard);
}

export function usePcEditorEditorUiState() {
  return usePcEditorRuntimeStateSelector((state) => state.editorUi);
}

export function usePcEditorEffectCatalogState() {
  return usePcEditorRuntimeStateSelector((state) => state.effectCatalog);
}

export function usePcEditorPlaybackState() {
  return usePcEditorRuntimeStateSelector((state) => state.playback);
}

export function usePcEditorRenderState() {
  return usePcEditorRuntimeStateSelector((state) => state.render);
}

export function usePcEditorRateState() {
  return usePcEditorRuntimeStateSelector((state) => state.rates);
}

export function usePcEditorViewTarget() {
  return usePcEditorRuntimeStateSelector((state) => state.viewTarget);
}

export function usePcEditorCameraPose() {
  return usePcEditorRuntimeStateSelector((state) => state.cameraPose);
}

export function usePcEditorPressedKey(code: string) {
  return usePcEditorRuntimeStateSelector((state) => state.keyboard.pressed[code] ?? null);
}

export function usePcEditorPressedControl(id: string) {
  return usePcEditorRuntimeStateSelector((state) => state.input.controls.pressed[id] ?? null);
}

export function usePcEditorPointerState() {
  return usePcEditorRuntimeStateSelector((state) => state.input.pointer);
}

export function usePcEditorSphereView() {
  return usePcEditorRuntimeStateSelector((state) => state.sphereView);
}

export function usePcEditorVrControllerState(hand: "left" | "right") {
  return usePcEditorRuntimeStateSelector((state) => state.input.vrControllers[hand]);
}

export function usePcEditorXrCameraRigPose() {
  return usePcEditorRuntimeStateSelector((state) => state.xrCameraRigPose);
}

export function usePcEditorEffectInput() {
  return usePcEditorRuntimeStateSelector((state) => state.effectInput);
}

export function usePcEditorXrSession() {
  return usePcEditorRuntimeStateSelector((state) => state.xrSession);
}
