"use client";

import { useEffect, useRef, useState } from "react";
import { forwardHtmlEvents } from "@pmndrs/pointer-events";
import { Button } from "@pmndrs/uikit-default";
import {
  CirclePause,
  CirclePlay,
  Download,
  Film,
  Menu,
  RefreshCcw,
  Save,
  Scissors,
  SkipBack,
  SkipForward,
  SlidersHorizontal
} from "@pmndrs/uikit-lucide";
import {
  Container,
  Text,
  reversePainterSortStable,
  setGlobalProperties,
  withOpacity
} from "@pmndrs/uikit";
import type { ContainerProperties, TextProperties } from "@pmndrs/uikit";
import * as THREE from "three";
import { setRendererSessionWithLabFallback } from "./xr/webXrLabCompat";

type MockVideo = {
  id: string;
  filename: string;
  durationMs: number;
  resolution: string;
  status: "Ready" | "Draft" | "Rendering";
  updatedAt: string;
};

type ActiveModal = "save" | "discard" | "export" | null;
type ActiveMenu = "main" | null;
type RadialActionId = "cut" | "discard" | "lock" | "sampling" | "rewind" | "save";

type HudOptions = {
  showGrid: boolean;
  showSafeFrame: boolean;
  locked: boolean;
  smoothFollow: boolean;
};

type WorkbenchState = {
  videos: MockVideo[];
  selectedVideoId: string;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  isRefreshing: boolean;
  refreshMessage: string;
  activeModal: ActiveModal;
  activeMenu: ActiveMenu;
  radialOpen: boolean;
  radialHighlightedAction: RadialActionId | null;
  playbackRate: number;
  previousPlaybackRate: number;
  fov: number;
  discardMode: boolean;
  samplingPaused: boolean;
  lastActionMessage: string;
  hudOptions: HudOptions;
};

type UiRefs = {
  selectedTitle?: Text;
  selectedMeta?: Text;
  playLabel?: Text;
  miniPlayLabel?: Text;
  timeLabel?: Text;
  refreshLabel?: Text;
  progressFill?: Container;
  modalLayer?: Container;
  modalTitle?: Text;
  modalBody?: Text;
  menuLayer?: Container;
  gridToggle?: Text;
  safeToggle?: Text;
  lockToggle?: Text;
  smoothToggle?: Text;
  fovLabel?: Text;
  statusLabel?: Text;
  actionFeedback?: Text;
  radialLayer?: Container;
  radialHint?: Text;
  radialMainLabel?: Text;
  radialItems: Array<{ id: RadialActionId; button: Button; shadow: Container; label: Text }>;
  safeFrame?: Container;
  gridLayer?: Container;
  ringLayers: Container[];
  videoCards: Array<{ id: string; card: Container; status: Text }>;
};

type Snapshot = {
  selectedTitle: string;
  currentTime: string;
  refreshMessage: string;
  modal: string;
  menu: string;
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

type XrStatus = {
  secureContext: boolean;
  hasNavigatorXr: boolean;
  immersiveVr: "checking" | "supported" | "unsupported" | "error";
};

const MOCK_VIDEOS: MockVideo[] = [
  {
    id: "ridge-flight",
    filename: "Ridge flight 360 source.mp4",
    durationMs: 185000,
    resolution: "5760 x 2880",
    status: "Ready",
    updatedAt: "12 min ago"
  },
  {
    id: "studio-pass",
    filename: "Studio pass director take.mp4",
    durationMs: 242000,
    resolution: "4096 x 2048",
    status: "Draft",
    updatedAt: "Today"
  },
  {
    id: "night-market",
    filename: "Night market walk 8K.mp4",
    durationMs: 396000,
    resolution: "7680 x 3840",
    status: "Rendering",
    updatedAt: "Yesterday"
  },
  {
    id: "coastline",
    filename: "Coastline crane orbit.mp4",
    durationMs: 128000,
    resolution: "5760 x 2880",
    status: "Ready",
    updatedAt: "May 22"
  }
];

const PANEL_BG = withOpacity("#ffffff", 0.1);
const PANEL_BG_STRONG = withOpacity("#ffffff", 0.18);
const PANEL_BG_HOVER = withOpacity("#ffffff", 0.16);
const SURFACE_BG = withOpacity("#ffffff", 0.08);
const BUTTON_BG = withOpacity("#ffffff", 0.94);
const BUTTON_HOVER = withOpacity("#f3f6fa", 0.98);
const BUTTON_ACTIVE = withOpacity("#dde6ef", 0.98);
const BUTTON_SHADOW = withOpacity("#667586", 0.28);
const BUTTON_TEXT = "#111827";
const AMBER = "#c9942e";
const TEXT = "#17202a";
const MUTED = "#667586";
const LINE = "#d8e0e8";
const DANGER = "#c44f61";

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: BrowserXr }).xr;
}

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSelectedVideo(state: WorkbenchState) {
  return state.videos.find((video) => video.id === state.selectedVideoId) ?? state.videos[0];
}

function createText(text: string, properties: TextProperties = {}) {
  return new Text({
    color: TEXT,
    fontSize: 20,
    lineHeight: 26,
    whiteSpace: "normal",
    wordBreak: "break-word",
    text,
    ...properties
  });
}

function createPanel(properties: ContainerProperties = {}) {
  return new Container({
    flexDirection: "column",
    backgroundColor: PANEL_BG,
    borderColor: withOpacity("#ffffff", 0),
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    panelMaterialClass: "glass",
    padding: 22,
    gap: 14,
    depthTest: false,
    depthWrite: false,
    ...properties
  });
}

function createButton(label: string, onClick: () => void, icon?: THREE.Object3D) {
  const button = new Button({
    height: 40,
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: BUTTON_BG,
    borderColor: withOpacity("#ffffff", 0.98),
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    cursor: "pointer",
    transformTranslateZ: 12,
    zIndexOffset: 16,
    hover: {
      backgroundColor: BUTTON_HOVER,
      borderColor: withOpacity("#ffffff", 1),
      transformTranslateZ: 18
    },
    active: {
      backgroundColor: BUTTON_ACTIVE,
      transformTranslateZ: 8
    },
    onClick
  });

  if (icon) {
    button.add(icon);
  }

  button.add(createText(label, { color: BUTTON_TEXT, fontSize: 14, lineHeight: 18, fontWeight: "bold" }));
  return button;
}

function createMiniButton(label: string, onClick: () => void, icon?: THREE.Object3D) {
  const button = new Button({
    height: 32,
    minWidth: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: BUTTON_BG,
    borderColor: withOpacity("#ffffff", 0.98),
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    cursor: "pointer",
    transformTranslateZ: 10,
    zIndexOffset: 16,
    hover: {
      backgroundColor: BUTTON_HOVER,
      borderColor: withOpacity("#ffffff", 1),
      transformTranslateZ: 16
    },
    active: {
      backgroundColor: BUTTON_ACTIVE,
      transformTranslateZ: 7
    },
    onClick
  });

  if (icon) {
    button.add(icon);
  }

  button.add(createText(label, { color: BUTTON_TEXT, fontSize: 12, lineHeight: 16, fontWeight: "bold" }));
  return button;
}

function createIcon(IconClass: typeof CirclePlay, color = BUTTON_TEXT) {
  return new IconClass({
    width: 18,
    height: 18,
    color,
    opacity: 0.95
  });
}

function snapshotFromState(state: WorkbenchState): Snapshot {
  const selected = getSelectedVideo(state);
  return {
    selectedTitle: selected.filename,
    currentTime: `${formatTime(state.currentTimeMs)} / ${formatTime(state.durationMs)}`,
    refreshMessage: state.refreshMessage,
    modal: state.activeModal ?? "none",
    menu: state.activeMenu ?? "none"
  };
}

export function XrWorkbenchDemo() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const stateRef = useRef<WorkbenchState>({
    videos: MOCK_VIDEOS,
    selectedVideoId: MOCK_VIDEOS[0].id,
    currentTimeMs: 42000,
    durationMs: MOCK_VIDEOS[0].durationMs,
    isPlaying: false,
    isRefreshing: false,
    refreshMessage: "Pull to refresh / ready",
    activeModal: null,
    activeMenu: null,
    radialOpen: false,
    radialHighlightedAction: null,
    playbackRate: 1,
    previousPlaybackRate: 1,
    fov: 82,
    discardMode: false,
    samplingPaused: false,
    lastActionMessage: "Hold Edit Ring, drag to an action, release to confirm.",
    hudOptions: {
      showGrid: true,
      showSafeFrame: true,
      locked: false,
      smoothFollow: true
    }
  });
  const uiRef = useRef<UiRefs>({ radialItems: [], ringLayers: [], videoCards: [] });
  const [snapshot, setSnapshot] = useState<Snapshot>(() => snapshotFromState(stateRef.current));
  const [xrMessage, setXrMessage] = useState("Initializing spatial workbench...");
  const [canEnterVr, setCanEnterVr] = useState(false);
  const [sessionState, setSessionState] = useState<"idle" | "requesting" | "presenting" | "ended" | "error">("idle");
  const [xrStatus, setXrStatus] = useState<XrStatus>({
    secureContext: false,
    hasNavigatorXr: false,
    immersiveVr: "checking"
  });

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
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "unsupported" });
      setXrMessage("Use localhost or HTTPS before entering Meta WebXR.");
      return;
    }

    if (!xr?.isSessionSupported) {
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "unsupported" });
      setXrMessage("navigator.xr is missing. Use Quest Browser or the WebXR emulator.");
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
      setXrMessage(
        supported
          ? "Meta WebXR is ready. Enter VR to use headset rotation."
          : "WebXR exists, but immersive-vr is unavailable."
      );
    } catch {
      setCanEnterVr(false);
      setXrStatus({ secureContext, hasNavigatorXr, immersiveVr: "error" });
      setXrMessage("WebXR support check failed. Recheck after enabling the emulator.");
    }
  }

  async function enterVr() {
    const xr = getNavigatorXr();
    const renderer = rendererRef.current;

    if (!canEnterVr || !xr?.requestSession || !renderer) {
      setXrMessage("Cannot enter VR yet. Recheck Meta WebXR support first.");
      return;
    }

    setSessionState("requesting");
    setXrMessage("Requesting immersive-vr session...");

    try {
      const session = await xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"]
      });

      session.addEventListener("end", () => {
        setSessionState("ended");
        setXrMessage("VR session ended.");
      });

      const usedFallback = await setRendererSessionWithLabFallback(renderer, session);
      setSessionState("presenting");
      setXrMessage(
        usedFallback
          ? "VR session is running with the WebXR emulator compatibility fallback."
          : "VR session is running. Rotate the headset to turn the workbench view."
      );
    } catch (error) {
      setSessionState("error");
      setXrMessage(error instanceof Error ? error.message : "Failed to enter VR.");
    }
  }

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return undefined;
    }

    setGlobalProperties({
      fontSize: 18,
      fontWeight: "normal",
      color: TEXT,
      panelMaterialClass: "glass"
    });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe7ebef);
    scene.fog = new THREE.Fog(0xe7ebef, 3.1, 7.2);

    const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 20);
    camera.position.set(0, 1.42, 0.62);
    camera.lookAt(0, 1.28, -1.35);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    renderer.localClippingEnabled = true;
    renderer.setTransparentSort(reversePainterSortStable);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const htmlEvents = forwardHtmlEvents(renderer.domElement, () => camera, scene, {
      intersectEveryFrame: true
    });

    const ambient = new THREE.HemisphereLight(0xffffff, 0xc7d0db, 2.8);
    scene.add(ambient);

    const accentLight = new THREE.PointLight(0xffffff, 18, 5);
    accentLight.position.set(-1.6, 2.3, 1.2);
    scene.add(accentLight);

    const grid = new THREE.GridHelper(6, 24, 0xd7e0e8, 0xc5ced8);
    grid.position.set(0, -0.1, -1.2);
    scene.add(grid);

    const sphereGeometry = new THREE.SphereGeometry(1.7, 48, 24);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xcbd7e3,
      wireframe: true,
      transparent: true,
      opacity: 0.16
    });
    const previewSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    previewSphere.position.set(0, 1.48, -1.95);
    scene.add(previewSphere);

    const root = buildUi();
    root.position.set(0, 1.34, -1.35);
    scene.add(root);
    setXrMessage("Workbench ready. Enter VR to enable Meta headset rotation.");

    function mutate(partial: Partial<WorkbenchState>) {
      stateRef.current = {
        ...stateRef.current,
        ...partial
      };
      updateUi();
      setSnapshot(snapshotFromState(stateRef.current));
    }

    function mutateOptions(partial: Partial<HudOptions>) {
      mutate({
        hudOptions: {
          ...stateRef.current.hudOptions,
          ...partial
        }
      });
    }

    function selectVideo(video: MockVideo) {
      mutate({
        selectedVideoId: video.id,
        durationMs: video.durationMs,
        currentTimeMs: Math.min(18000, video.durationMs * 0.16),
        isPlaying: false,
        activeModal: null
      });
    }

    function stepVideo(direction: -1 | 1) {
      const state = stateRef.current;
      const currentIndex = state.videos.findIndex((video) => video.id === state.selectedVideoId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + direction + state.videos.length) % state.videos.length;
      selectVideo(state.videos[nextIndex]);
    }

    function refreshVideos() {
      mutate({
        isRefreshing: true,
        refreshMessage: "Refreshing local mock list..."
      });

      window.setTimeout(() => {
        mutate({
          isRefreshing: false,
          refreshMessage: `Updated ${new Date().toLocaleTimeString()}`
        });
      }, 850);
    }

    function seekByPointer(event: { localPoint?: THREE.Vector3 }) {
      const localX = event.localPoint?.x ?? 0;
      const normalized = clamp(localX / 438 + 0.5, 0, 1);
      mutate({
        currentTimeMs: normalized * stateRef.current.durationMs
      });
    }

    function openRadialMenu() {
      mutate({
        radialOpen: true,
        radialHighlightedAction: null,
        lastActionMessage: "Drag to a ring action, then release."
      });
    }

    function highlightRadialAction(action: RadialActionId | null) {
      mutate({
        radialOpen: true,
        radialHighlightedAction: action
      });
    }

    function cancelRadialMenu() {
      mutate({
        radialOpen: false,
        radialHighlightedAction: null,
        lastActionMessage: "Ring action canceled."
      });
    }

    function commitRadialAction(action: RadialActionId) {
      const state = stateRef.current;
      const base = {
        radialOpen: false,
        radialHighlightedAction: null,
        activeModal: null as ActiveModal
      };

      if (action === "cut") {
        mutate({
          ...base,
          lastActionMessage: `Cut marker inserted at ${formatTime(state.currentTimeMs)}.`
        });
        return;
      }

      if (action === "discard") {
        const enteringDiscard = !state.discardMode;
        mutate({
          ...base,
          discardMode: enteringDiscard,
          previousPlaybackRate: enteringDiscard ? state.playbackRate : state.previousPlaybackRate,
          playbackRate: enteringDiscard ? 5 : state.previousPlaybackRate,
          lastActionMessage: enteringDiscard
            ? "Discard review enabled. Playback jumps to 5.0x."
            : "Discard review restored. Previous speed resumed."
        });
        return;
      }

      if (action === "lock") {
        mutate({
          ...base,
          hudOptions: {
            ...state.hudOptions,
            locked: !state.hudOptions.locked
          },
          lastActionMessage: state.hudOptions.locked ? "Viewfinder unlocked." : "Viewfinder locked."
        });
        return;
      }

      if (action === "sampling") {
        mutate({
          ...base,
          samplingPaused: !state.samplingPaused,
          lastActionMessage: state.samplingPaused ? "Path sampling resumed." : "Path sampling paused."
        });
        return;
      }

      if (action === "rewind") {
        mutate({
          ...base,
          currentTimeMs: Math.max(0, state.currentTimeMs - 5000),
          lastActionMessage: "Jumped back 5 seconds."
        });
        return;
      }

      mutate({
        ...base,
        activeModal: "save",
        lastActionMessage: "Save confirmation opened."
      });
    }

    function buildUi() {
      const ui = uiRef.current;
      const rootContainer = new Container({
        width: 1700,
        height: 660,
        pixelSize: 0.00118,
        flexDirection: "column",
        depthTest: false,
        depthWrite: false,
        renderOrder: 10
      });

      rootContainer.add(buildLibraryPanel());
      rootContainer.add(buildActionPanel());
      rootContainer.add(buildMiniTransportBar());
      rootContainer.add(buildConsoleDeck());

      const modalLayer = createPanel({
        positionType: "absolute",
        width: 430,
        height: 240,
        positionLeft: 590,
        positionTop: 215,
        display: "none",
        backgroundColor: PANEL_BG_STRONG,
        borderColor: withOpacity("#ffffff", 0.88),
        zIndexOffset: 40
      });
      ui.modalTitle = createText("Save segment", {
        fontSize: 28,
        lineHeight: 32,
        fontWeight: "bold",
        color: TEXT
      });
      ui.modalBody = createText("Confirm the operation for the current edit range.", {
        fontSize: 18,
        lineHeight: 24,
        color: MUTED
      });
      modalLayer.add(ui.modalTitle);
      modalLayer.add(ui.modalBody);
      modalLayer.add(
        createButton("Close", () => mutate({ activeModal: null }), createIcon(CirclePause))
      );
      ui.modalLayer = modalLayer;
      rootContainer.add(modalLayer);

      const menuLayer = createPanel({
        width: 360,
        height: 260,
        positionLeft: 1300,
        positionTop: 132,
        display: "none",
        backgroundColor: PANEL_BG_STRONG,
        borderColor: withOpacity("#ffffff", 0.88),
        zIndexOffset: 35
      });
      menuLayer.add(
        createText("Workbench Menu", {
          fontSize: 24,
          lineHeight: 30,
          fontWeight: "bold",
          color: TEXT
        })
      );
      ui.gridToggle = createText("", { fontSize: 18, lineHeight: 24 });
      ui.safeToggle = createText("", { fontSize: 18, lineHeight: 24 });
      ui.lockToggle = createText("", { fontSize: 18, lineHeight: 24 });
      ui.smoothToggle = createText("", { fontSize: 18, lineHeight: 24 });
      menuLayer.add(
        createButton("Grid", () => mutateOptions({ showGrid: !stateRef.current.hudOptions.showGrid }))
      );
      menuLayer.add(ui.gridToggle);
      menuLayer.add(
        createButton("Safe Frame", () =>
          mutateOptions({ showSafeFrame: !stateRef.current.hudOptions.showSafeFrame })
        )
      );
      menuLayer.add(ui.safeToggle);
      menuLayer.add(ui.lockToggle);
      menuLayer.add(ui.smoothToggle);
      ui.menuLayer = menuLayer;
      rootContainer.add(menuLayer);

      updateUi();
      return rootContainer;
    }

    function buildMiniTransportBar() {
      const ui = uiRef.current;
      const bar = createPanel({
        positionType: "absolute",
        width: 760,
        height: 54,
        positionLeft: 470,
        positionTop: 258,
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        gap: 10,
        backgroundColor: withOpacity("#ffffff", 0.2),
        borderColor: withOpacity("#ffffff", 0.82)
      });

      bar.add(createMiniButton("Prev", () => stepVideo(-1), createIcon(SkipBack)));

      const playButton = createMiniButton(
        "Play",
        () => {
          mutate({ isPlaying: !stateRef.current.isPlaying });
        },
        createIcon(CirclePlay)
      );
      ui.miniPlayLabel = playButton.children.find((child) => child instanceof Text) as Text | undefined;
      bar.add(playButton);

      bar.add(createMiniButton("Next", () => stepVideo(1), createIcon(SkipForward)));

      const progress = new Container({
        height: 10,
        width: 438,
        backgroundColor: withOpacity("#d9e2eb", 0.64),
        borderColor: withOpacity("#ffffff", 0.58),
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderTopLeftRadius: 999,
        borderTopRightRadius: 999,
        borderBottomLeftRadius: 999,
        borderBottomRightRadius: 999,
        cursor: "pointer",
        onClick: seekByPointer,
        onPointerDown: seekByPointer
      });
      ui.progressFill = new Container({
        height: "100%",
        width: 80,
        backgroundColor: withOpacity("#8b98a7", 0.9),
        borderTopLeftRadius: 999,
        borderTopRightRadius: 999,
        borderBottomLeftRadius: 999,
        borderBottomRightRadius: 999
      });
      progress.add(ui.progressFill);
      bar.add(progress);

      return bar;
    }

    function buildLibraryPanel() {
      const ui = uiRef.current;
      const panel = createPanel({
        positionType: "absolute",
        width: 360,
        height: 500,
        positionLeft: 0,
        positionTop: 34,
        borderColor: withOpacity("#ffffff", 0.78)
      });
      const headingRow = new Container({
        positionType: "absolute",
        positionLeft: 18,
        positionTop: 18,
        width: 320,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        height: 38
      });
      headingRow.add(createIcon(Film));
      headingRow.add(
        createText("Media Library", {
          fontSize: 27,
          lineHeight: 32,
          fontWeight: "bold"
        })
      );
      panel.add(headingRow);

      ui.refreshLabel = createText("Pull to refresh / ready", {
        positionType: "absolute",
        positionLeft: 22,
        positionTop: 66,
        width: 260,
        fontSize: 15,
        lineHeight: 20,
        color: MUTED
      });
      panel.add(ui.refreshLabel);
      const refreshButton = createButton("Refresh", refreshVideos, createIcon(RefreshCcw));
      refreshButton.setProperties({
        positionType: "absolute",
        positionLeft: 20,
        positionTop: 96,
        width: 318
      });
      panel.add(refreshButton);

      const list = new Container({
        positionType: "absolute",
        positionLeft: 18,
        positionTop: 150,
        width: 324,
        height: 320,
        flexDirection: "column",
        gap: 12,
        overflow: "scroll",
        scrollbarColor: withOpacity("#f8fafc", 0.72),
        scrollbarWidth: 6,
        paddingRight: 4
      });

      ui.videoCards = [];
      for (const video of stateRef.current.videos) {
        const card = createPanel({
          height: 86,
          padding: 12,
          gap: 7,
          cursor: "pointer",
          backgroundColor: SURFACE_BG,
          borderColor: withOpacity("#ffffff", 0.52),
          hover: {
            backgroundColor: PANEL_BG_HOVER,
            borderColor: withOpacity("#ffffff", 0.96)
          },
          onClick: () => selectVideo(video)
        });
        card.add(
          createText(video.filename, {
            fontSize: 16,
            lineHeight: 20,
            fontWeight: "bold"
          })
        );
        const status = createText("", {
          fontSize: 13,
          lineHeight: 17,
          color: MUTED
        });
        card.add(status);
        card.add(
          createText(`${formatTime(video.durationMs)}  |  ${video.resolution}`, {
            fontSize: 12,
            lineHeight: 16,
            color: MUTED
          })
        );
        ui.videoCards.push({ id: video.id, card, status });
        list.add(card);
      }

      panel.add(list);
      return panel;
    }

    function buildRaisedButtonSlot(
      width: number,
      height: number,
      label: string,
      onClick: () => void,
      icon?: THREE.Object3D
    ) {
      const slot = new Container({
        width: width + 12,
        height: height + 12,
        positionType: "relative",
        zIndexOffset: 20
      });
      slot.add(
        new Container({
          positionType: "absolute",
          width,
          height,
          positionLeft: 8,
          positionTop: 10,
          backgroundColor: BUTTON_SHADOW,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
          transformTranslateZ: 3,
          zIndexOffset: 18
        })
      );

      const button = createButton(label, onClick, icon);
      button.setProperties({
        positionType: "absolute",
        width,
        height,
        positionLeft: 0,
        positionTop: 0,
        borderTopLeftRadius: 999,
        borderTopRightRadius: 999,
        borderBottomLeftRadius: 999,
        borderBottomRightRadius: 999,
        transformTranslateZ: 24,
        zIndexOffset: 26
      });
      slot.add(button);
      return { slot, button };
    }

    function buildRadialController() {
      const ui = uiRef.current;
      const controller = new Container({
        positionType: "absolute",
        width: 520,
        height: 214,
        positionLeft: 220,
        positionTop: 92,
        zIndexOffset: 48,
        depthTest: false,
        depthWrite: false
      });

      ui.radialLayer = new Container({
        positionType: "absolute",
        width: 520,
        height: 214,
        positionLeft: 0,
        positionTop: 0,
        display: "none",
        zIndexOffset: 42,
        transformTranslateZ: 34
      });

      ui.radialLayer.add(
        new Container({
          positionType: "absolute",
          width: 264,
          height: 132,
          positionLeft: 128,
          positionTop: 34,
          borderTopWidth: 2,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
          borderColor: withOpacity("#8dccff", 0.32),
          backgroundColor: withOpacity("#e8f5ff", 0.16),
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
          transformTranslateZ: 18
        })
      );

      const actions: Array<{
        id: RadialActionId;
        label: string;
        left: number;
        top: number;
        icon: THREE.Object3D;
      }> = [
        { id: "cut", label: "Cut", left: 198, top: 0, icon: createIcon(Scissors) },
        { id: "discard", label: "Discard", left: 34, top: 44, icon: createIcon(CirclePause) },
        { id: "lock", label: "Lock", left: 350, top: 44, icon: createIcon(SlidersHorizontal) },
        { id: "rewind", label: "-5 sec", left: 58, top: 128, icon: createIcon(SkipBack) },
        { id: "sampling", label: "Sample", left: 198, top: 158, icon: createIcon(CirclePlay) },
        { id: "save", label: "Save", left: 336, top: 128, icon: createIcon(Save) }
      ];

      ui.radialItems = [];
      for (const action of actions) {
        const slot = new Container({
          positionType: "absolute",
          width: 132,
          height: 48,
          positionLeft: action.left,
          positionTop: action.top,
          zIndexOffset: 54
        });
        const shadow = new Container({
          positionType: "absolute",
          width: 124,
          height: 38,
          positionLeft: 7,
          positionTop: 9,
          backgroundColor: BUTTON_SHADOW,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
          transformTranslateZ: 20,
          zIndexOffset: 52
        });
        const button = new Button({
          positionType: "absolute",
          width: 124,
          height: 38,
          positionLeft: 0,
          positionTop: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          backgroundColor: BUTTON_BG,
          borderColor: withOpacity("#ffffff", 0.98),
          borderTopWidth: 1,
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderLeftWidth: 1,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
          cursor: "pointer",
          transformTranslateZ: 34,
          zIndexOffset: 60,
          hover: {
            backgroundColor: BUTTON_HOVER,
            transformTranslateZ: 40
          },
          active: {
            backgroundColor: BUTTON_ACTIVE,
            transformTranslateZ: 30
          },
          onPointerEnter: () => highlightRadialAction(action.id),
          onPointerMove: () => highlightRadialAction(action.id),
          onPointerUp: () => commitRadialAction(action.id),
          onClick: () => commitRadialAction(action.id)
        });
        const label = createText(action.label, {
          color: BUTTON_TEXT,
          fontSize: 12,
          lineHeight: 16,
          fontWeight: "bold"
        });
        button.add(action.icon);
        button.add(label);
        slot.add(shadow);
        slot.add(button);
        ui.radialItems.push({ id: action.id, button, shadow, label });
        ui.radialLayer.add(slot);
      }

      ui.radialHint = createText("Release on a ring action", {
        positionType: "absolute",
        positionLeft: 140,
        positionTop: 92,
        width: 240,
        textAlign: "center",
        color: withOpacity(TEXT, 0.74),
        fontSize: 13,
        lineHeight: 17,
        fontWeight: "bold"
      });
      ui.radialLayer.add(ui.radialHint);
      controller.add(ui.radialLayer);

      const main = buildRaisedButtonSlot(156, 52, "Edit Ring", openRadialMenu, createIcon(Scissors));
      main.slot.setProperties({
        positionType: "absolute",
        positionLeft: 182,
        positionTop: 81,
        zIndexOffset: 74,
        transformTranslateZ: 48
      });
      main.button.setProperties({
        onPointerDown: openRadialMenu,
        onPointerEnter: () => highlightRadialAction(null)
      });
      ui.radialMainLabel = main.button.children.find((child) => child instanceof Text) as Text | undefined;
      controller.add(main.slot);

      return controller;
    }

    function buildConsoleDeck() {
      const ui = uiRef.current;
      const deck = createPanel({
        positionType: "absolute",
        width: 960,
        height: 270,
        positionLeft: 370,
        positionTop: 325,
        transformRotateX: -7,
        backgroundColor: withOpacity("#f8fbff", 0.22),
        borderColor: withOpacity("#ffffff", 0.96),
        padding: 18,
        gap: 12
      });

      ui.selectedTitle = createText("", {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "bold"
      });
      ui.selectedMeta = createText("", {
        fontSize: 12,
        lineHeight: 16,
        color: MUTED
      });
      deck.add(ui.selectedTitle);
      deck.add(ui.selectedMeta);

      const ringStage = new Container({
        height: 72,
        width: "100%",
        positionType: "relative",
        backgroundColor: withOpacity("#e7f2ff", 0.1),
        borderColor: withOpacity("#ffffff", 0),
        borderTopWidth: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderLeftWidth: 0,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 18,
        overflow: "hidden"
      });

      ui.gridLayer = new Container({
        positionType: "absolute",
        positionLeft: 20,
        positionRight: 20,
        positionTop: 20,
        positionBottom: 20,
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderColor: withOpacity("#86c5ff", 0.2),
        backgroundColor: withOpacity("#86c5ff", 0.04)
      });
      ringStage.add(ui.gridLayer);

      ui.ringLayers = [];
      for (const ring of [
        { size: 204, left: 378, top: -78, opacity: 0.24 },
        { size: 150, left: 405, top: -51, opacity: 0.3 },
        { size: 96, left: 432, top: -24, opacity: 0.38 },
        { size: 52, left: 454, top: -2, opacity: 0.46 }
      ]) {
        const layer = new Container({
          positionType: "absolute",
          width: ring.size,
          height: ring.size,
          positionLeft: ring.left,
          positionTop: ring.top,
          borderTopWidth: 2,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
          borderColor: withOpacity("#71b9ff", ring.opacity),
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
          backgroundColor: withOpacity("#dff1ff", 0.04)
        });
        ui.ringLayers.push(layer);
        ringStage.add(layer);
      }

      ui.safeFrame = new Container({
        positionType: "absolute",
        width: 220,
        height: 48,
        positionLeft: 370,
        positionTop: 12,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        borderColor: withOpacity("#ffffff", 0.82),
        backgroundColor: withOpacity("#ffffff", 0.12)
      });
      ringStage.add(ui.safeFrame);

      ringStage.add(
        new Container({
          positionType: "absolute",
          width: 16,
          height: 16,
          positionLeft: 472,
          positionTop: 29,
          borderTopWidth: 2,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
          borderColor: withOpacity("#6bbcff", 0.9),
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999
        })
      );
      ringStage.add(
        createText("360 Preview / Viewfinder", {
          positionType: "absolute",
          positionLeft: 330,
          positionTop: 54,
          width: 300,
          textAlign: "center",
          fontSize: 13,
          lineHeight: 16,
          color: withOpacity(TEXT, 0.72)
        })
      );
      deck.add(ringStage);
      deck.add(buildRadialController());

      const controls = createPanel({
        height: 70,
        flexDirection: "column",
        padding: 10,
        gap: 8,
        backgroundColor: withOpacity("#ffffff", 0.18),
        borderColor: withOpacity("#ffffff", 0)
      });

      const controlRow = new Container({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        height: 38
      });
      const rateButton = createButton("Rate", () => {
          const nextRate = stateRef.current.playbackRate >= 2 ? 0.5 : stateRef.current.playbackRate + 0.5;
          mutate({
            playbackRate: nextRate,
            previousPlaybackRate: nextRate,
            lastActionMessage: `Playback speed set to ${nextRate.toFixed(1)}x.`
          });
        });
      rateButton.setProperties({ minWidth: 82 });
      controlRow.add(rateButton);
      ui.timeLabel = createText("", {
        flexGrow: 1,
        textAlign: "right",
        fontSize: 18,
        lineHeight: 24,
        color: MUTED
      });
      controlRow.add(ui.timeLabel);
      controls.add(controlRow);
      ui.actionFeedback = createText("", {
        fontSize: 13,
        lineHeight: 16,
        color: withOpacity(TEXT, 0.72)
      });
      controls.add(ui.actionFeedback);
      deck.add(controls);

      return deck;
    }

    function buildActionPanel() {
      const ui = uiRef.current;
      const panel = createPanel({
        positionType: "absolute",
        width: 400,
        height: 500,
        positionLeft: 1300,
        positionTop: 34,
        borderColor: withOpacity("#ffffff", 0.78)
      });

      panel.add(
        createText("Action Desk", {
          positionType: "absolute",
          positionLeft: 20,
          positionTop: 20,
          width: 320,
          fontSize: 28,
          lineHeight: 34,
          fontWeight: "bold"
        })
      );
      panel.add(
        createText("Local mock controls for the edit pass.", {
          positionType: "absolute",
          positionLeft: 20,
          positionTop: 64,
          width: 320,
          fontSize: 15,
          lineHeight: 20,
          color: MUTED
        })
      );

      const actionGrid = new Container({
        positionType: "absolute",
        positionLeft: 20,
        positionTop: 108,
        width: 350,
        height: 92,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12
      });
      actionGrid.add(createButton("Save", () => mutate({ activeModal: "save" }), createIcon(Save)));
      actionGrid.add(
        createButton("Discard", () => mutate({ activeModal: "discard" }), createIcon(CirclePause))
      );
      actionGrid.add(
        createButton("Export", () => mutate({ activeModal: "export" }), createIcon(Download))
      );
      actionGrid.add(
        createButton("Menu", () => {
          mutate({ activeMenu: stateRef.current.activeMenu === "main" ? null : "main" });
        }, createIcon(Menu))
      );
      panel.add(actionGrid);

      const parameterPanel = createPanel({
        positionType: "absolute",
        positionLeft: 20,
        positionTop: 226,
        width: 350,
        height: 244,
        backgroundColor: withOpacity("#ffffff", 0.1),
        borderColor: withOpacity("#ffffff", 0)
      });
      parameterPanel.add(
        createText("Parameters", {
          fontSize: 23,
          lineHeight: 29,
          fontWeight: "bold",
          color: TEXT
        })
      );
      ui.fovLabel = createText("", { fontSize: 18, lineHeight: 24 });
      ui.statusLabel = createText("", { fontSize: 18, lineHeight: 25, color: MUTED });
      parameterPanel.add(ui.fovLabel);
      parameterPanel.add(
        createButton("FOV -", () => mutate({ fov: clamp(stateRef.current.fov - 4, 50, 110) }), createIcon(SlidersHorizontal))
      );
      parameterPanel.add(
        createButton("FOV +", () => mutate({ fov: clamp(stateRef.current.fov + 4, 50, 110) }), createIcon(SlidersHorizontal))
      );
      parameterPanel.add(
        createButton("Lock", () => mutateOptions({ locked: !stateRef.current.hudOptions.locked }))
      );
      parameterPanel.add(
        createButton("Smooth", () =>
          mutateOptions({ smoothFollow: !stateRef.current.hudOptions.smoothFollow })
        )
      );
      parameterPanel.add(ui.statusLabel);
      panel.add(parameterPanel);

      return panel;
    }

    function updateUi() {
      const state = stateRef.current;
      const ui = uiRef.current;
      const selected = getSelectedVideo(state);
      const progress = clamp(state.currentTimeMs / Math.max(state.durationMs, 1), 0, 1);

      ui.selectedTitle?.setProperties({ text: selected.filename });
      ui.selectedMeta?.setProperties({
        text: `${selected.resolution}  |  ${formatTime(selected.durationMs)}  |  ${selected.status}`
      });
      ui.playLabel?.setProperties({ text: state.isPlaying ? "Pause" : "Play" });
      ui.miniPlayLabel?.setProperties({ text: state.isPlaying ? "Pause" : "Play" });
      ui.timeLabel?.setProperties({
        text: `${formatTime(state.currentTimeMs)} / ${formatTime(state.durationMs)}  |  ${state.playbackRate.toFixed(1)}x`
      });
      ui.refreshLabel?.setProperties({
        text: state.refreshMessage,
        color: state.isRefreshing ? AMBER : MUTED
      });
      ui.progressFill?.setProperties({ width: Math.max(10, Math.round(progress * 438)) });
      ui.safeFrame?.setProperties({ display: state.hudOptions.showSafeFrame ? "flex" : "none" });
      ui.gridLayer?.setProperties({ display: state.hudOptions.showGrid ? "flex" : "none" });
      ui.modalLayer?.setProperties({ display: state.activeModal ? "flex" : "none" });
      ui.menuLayer?.setProperties({ display: state.activeMenu === "main" ? "flex" : "none" });
      ui.radialLayer?.setProperties({ display: state.radialOpen ? "flex" : "none" });
      ui.radialMainLabel?.setProperties({ text: state.radialOpen ? "Release" : "Edit Ring" });
      ui.fovLabel?.setProperties({ text: `Field of view: ${state.fov} deg` });
      ui.statusLabel?.setProperties({
        text: [
          `View lock: ${state.hudOptions.locked ? "ON" : "OFF"}`,
          `Smooth follow: ${state.hudOptions.smoothFollow ? "ON" : "OFF"}`,
          `Sampling: ${state.samplingPaused ? "paused" : state.isPlaying ? "live mock" : "ready"}`,
          `Discard review: ${state.discardMode ? "5.0x" : "off"}`
        ].join("\n")
      });
      ui.actionFeedback?.setProperties({
        text: state.lastActionMessage,
        color: state.discardMode ? AMBER : withOpacity(TEXT, 0.72)
      });
      ui.radialHint?.setProperties({
        text: state.radialHighlightedAction
          ? `Release: ${state.radialHighlightedAction.toUpperCase()}`
          : "Drag to a ring action, then release"
      });
      ui.gridToggle?.setProperties({ text: `Grid: ${state.hudOptions.showGrid ? "visible" : "hidden"}` });
      ui.safeToggle?.setProperties({
        text: `Safe frame: ${state.hudOptions.showSafeFrame ? "visible" : "hidden"}`
      });
      ui.lockToggle?.setProperties({ text: `Lock: ${state.hudOptions.locked ? "on" : "off"}` });
      ui.smoothToggle?.setProperties({
        text: `Smooth follow: ${state.hudOptions.smoothFollow ? "on" : "off"}`
      });

      if (state.activeModal && ui.modalTitle && ui.modalBody) {
        const title = {
          save: "Save edit range",
          discard: "Discard this range",
          export: "Export preview"
        }[state.activeModal];
        const body = {
          save: "Store the current view path and keep the timeline revision.",
          discard: "Mark this slice as disabled and jump ahead in review mode.",
          export: "Queue a short preview render for the selected mock video."
        }[state.activeModal];
        ui.modalTitle.setProperties({ text: title });
        ui.modalBody.setProperties({ text: body });
      }

      for (const { id, card, status } of ui.videoCards) {
        const video = state.videos.find((item) => item.id === id);
        const selectedCard = id === state.selectedVideoId;
        card.setProperties({
          borderColor: selectedCard ? withOpacity("#ffffff", 0.98) : withOpacity(LINE, 0.58),
          backgroundColor: selectedCard ? withOpacity("#ffffff", 0.82) : SURFACE_BG
        });
        status.setProperties({
          text: `${video?.status ?? "Ready"}  |  ${video?.updatedAt ?? "Now"}`,
          color: selectedCard ? TEXT : MUTED
        });
      }

      for (const item of ui.radialItems) {
        const selectedAction = state.radialHighlightedAction === item.id;
        item.button.setProperties({
          backgroundColor: selectedAction ? withOpacity("#dbeeff", 0.98) : BUTTON_BG,
          borderColor: selectedAction ? withOpacity("#74bfff", 0.92) : withOpacity("#ffffff", 0.98),
          transformTranslateZ: selectedAction ? 44 : 34
        });
        item.shadow.setProperties({
          backgroundColor: selectedAction ? withOpacity("#4f9fd8", 0.3) : BUTTON_SHADOW
        });
        item.label.setProperties({
          color: selectedAction ? "#06253d" : BUTTON_TEXT
        });
      }

      ui.ringLayers.forEach((ring, index) => {
        ring.setProperties({
          transformRotateZ: state.currentTimeMs / (90 + index * 35)
        });
      });
    }

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

    let previousTime: number | undefined;
    let lastSnapshotSecond = -1;

    renderer.setAnimationLoop((time) => {
      const delta = previousTime == null ? 0 : time - previousTime;
      previousTime = time;

      previewSphere.rotation.y = time / 12000;

      const current = stateRef.current;
      if (current.isPlaying && current.durationMs > 0) {
        const nextTime = current.currentTimeMs + delta * current.playbackRate;
        stateRef.current = {
          ...current,
          currentTimeMs: nextTime >= current.durationMs ? 0 : nextTime
        };
        updateUi();

        const second = Math.floor(stateRef.current.currentTimeMs / 1000);
        if (second !== lastSnapshotSecond) {
          lastSnapshotSecond = second;
          setSnapshot(snapshotFromState(stateRef.current));
        }
      }

      htmlEvents.update();
      root.update(delta);
      renderer.render(scene, camera);
    });

    setSnapshot(snapshotFromState(stateRef.current));

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      htmlEvents.destroy();
      scene.remove(root);
      root.dispose();
      scene.remove(previewSphere);
      scene.remove(grid);
      sphereGeometry.dispose();
      sphereMaterial.dispose();
      grid.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      setGlobalProperties(undefined);
    };
  }, []);

  useEffect(() => {
    void checkSupport();
  }, []);

  return (
    <main className="xr-workbench-page">
      <section className="xr-workbench-stage" ref={mountRef}>
        <div className="xr-workbench-dom-hud" data-testid="workbench-dom-hud">
          <div>
            <p className="muted">XR Workbench UI Prototype</p>
            <h1>WebXR 剪辑工作台</h1>
          </div>
          <div className="xr-workbench-dom-status">
            <p className="xr-workbench-message" data-testid="workbench-xr-message">
              {xrMessage}
            </p>
            <div className="xr-workbench-status-line">
              <span>Secure: {xrStatus.secureContext ? "OK" : "NO"}</span>
              <span>navigator.xr: {xrStatus.hasNavigatorXr ? "OK" : "NO"}</span>
              <span>immersive-vr: {xrStatus.immersiveVr}</span>
              <span data-testid="workbench-session-state">session: {sessionState}</span>
            </div>
          </div>
          <div className="xr-workbench-dom-actions">
            <button
              className="button primary"
              data-testid="workbench-enter-vr"
              disabled={sessionState === "presenting" || sessionState === "requesting"}
              onClick={enterVr}
              type="button"
            >
              {sessionState === "presenting" ? "VR Running" : "Enter VR"}
            </button>
            <button className="button" onClick={checkSupport} type="button">
              Recheck
            </button>
            <a className="button" href="/xr/hello">
              Hello XR
            </a>
          </div>
        </div>
        <div
          aria-live="polite"
          className="xr-workbench-test-state"
          data-testid="workbench-state"
        >
          <span data-testid="workbench-library-label">素材库</span>
          <span data-testid="workbench-stage-label">中控台</span>
          <span data-testid="workbench-action-label">操作工作台</span>
          <span data-testid="workbench-selected-video">{snapshot.selectedTitle}</span>
          <span data-testid="workbench-progress-text">{snapshot.currentTime}</span>
          <span data-testid="workbench-refresh-text">{snapshot.refreshMessage}</span>
          <span data-testid="workbench-modal-state">{snapshot.modal}</span>
          <span data-testid="workbench-menu-state">{snapshot.menu}</span>
        </div>
      </section>
    </main>
  );
}
