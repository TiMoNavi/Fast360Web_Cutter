import type { RefObject } from "react";

export type MetaImmersiveModeSessionState = "idle" | "checking" | "unsupported" | "ready" | "requesting" | "presenting" | "ended" | "error";

export type MetaImmersiveModeState = {
  canEnter: boolean;
  hasNavigatorXr: boolean;
  isHttps: boolean;
  isSecureContext: boolean;
  message: string;
  sessionState: MetaImmersiveModeSessionState;
};

export type UseMetaImmersiveModeOptions = {
  beforeEnter?: () => Promise<void> | void;
  debugImmersive?: boolean;
  requireHttps?: boolean;
  sceneReady?: boolean;
  sceneRef: RefObject<HTMLElement | null>;
};

export type UseMetaImmersiveModeResult = MetaImmersiveModeState & {
  enterImmersiveVr: () => Promise<void>;
  recheckSupport: () => Promise<void>;
};
