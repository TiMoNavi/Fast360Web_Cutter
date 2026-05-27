"use client";

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AFrameSpatial3DUi } from "./PlayerV3SpatialUi";
import type { Spatial3DUiAction, SpatialPlayerState } from "../shared/Spatial3DUiPublicApi";

type Spatial3DUiComponentData = {
  model: string;
  playlistOpen: boolean;
  showRingMenuDemo: boolean;
  showWorkbench: boolean;
};

type Spatial3DUiComponentInstance = {
  data: Spatial3DUiComponentData;
  el: HTMLElement;
  reactRoot?: Root;
  init: () => void;
  remove: () => void;
  update: () => void;
};

type AFrameGlobal = {
  components?: Record<string, unknown>;
  registerComponent?: (name: string, definition: unknown) => void;
};

const DEFAULT_MODEL: SpatialPlayerState = {
  activeSourceId: "",
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  playlistSources: [],
  title: ""
};

function readAFrame() {
  return (globalThis as typeof globalThis & { AFRAME?: AFrameGlobal }).AFRAME;
}

function parseModel(value: string): SpatialPlayerState {
  if (!value) {
    return DEFAULT_MODEL;
  }

  try {
    return {
      ...DEFAULT_MODEL,
      ...(JSON.parse(value) as Partial<SpatialPlayerState>)
    };
  } catch {
    return DEFAULT_MODEL;
  }
}

function dispatchSpatialAction(el: HTMLElement, action: Spatial3DUiAction) {
  el.dispatchEvent(
    new CustomEvent("spatial-3dui-action", {
      bubbles: true,
      detail: action
    })
  );
}

function renderSpatialUi(instance: Spatial3DUiComponentInstance) {
  const model = parseModel(instance.data.model);

  instance.reactRoot?.render(
    createElement(AFrameSpatial3DUi, {
      model,
      onAction: (action) => dispatchSpatialAction(instance.el, action),
      playlistOpen: instance.data.playlistOpen,
      showRingMenuDemo: instance.data.showRingMenuDemo,
      showWorkbench: instance.data.showWorkbench
    })
  );
}

export function registerAFrameSpatial3DUiComponent(componentName = "spatial-3d-ui") {
  const aframe = readAFrame();

  if (!aframe?.registerComponent || aframe.components?.[componentName]) {
    return false;
  }

  aframe.registerComponent(componentName, {
    schema: {
      model: { default: "" },
      playlistOpen: { default: false },
      showRingMenuDemo: { default: true },
      showWorkbench: { default: true }
    },

    init(this: Spatial3DUiComponentInstance) {
      this.reactRoot = createRoot(this.el);
      renderSpatialUi(this);
    },

    update(this: Spatial3DUiComponentInstance) {
      renderSpatialUi(this);
    },

    remove(this: Spatial3DUiComponentInstance) {
      this.reactRoot?.unmount();
      this.reactRoot = undefined;
    }
  });

  return true;
}
