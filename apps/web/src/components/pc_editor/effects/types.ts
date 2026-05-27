import type { EffectPreviewTarget } from "./preview/types";

export type PcEditorEffectCatalog = {
  catalogVersion: number;
  categories: PcEditorEffectCategorySpec[];
  effects: PcEditorEffectDefinitionSpec[];
  schema: "pc-editor-effect-catalog.v1";
};

export type PcEditorEffectCategorySpec = {
  id: string;
  key: string;
  label: string;
};

export type PcEditorEffectDefinitionSpec = {
  description?: string;
  event: {
    defaultDurationMs: number;
    defaultParams: Record<string, unknown>;
    name: string;
    params?: Record<string, unknown>;
  };
  family: string;
  id: string;
  label: string;
  operation: {
    eventType: "editor.effects.select" | string;
    payload: Record<string, unknown>;
    type: "pc-editor-event";
  };
  preview: {
    mode: "none" | "ui_overlay" | "sphere_overlay" | "viewport_simulation" | "exact_shared_shader";
    renderer?: string | null;
    target?: EffectPreviewTarget;
    webxrSupport: "exact" | "approximate" | "symbolic" | "unsupported";
  };
  render: {
    backendSupport: "supported" | "unsupported";
    conflictGroup?: string | null;
    fallback: "ignore" | "warn" | "fail";
    stage: "pre_remap_equirect" | "post_remap_frame" | "viewport_path" | "overlay_frame" | "audio_timeline" | "marker_only";
  };
  ui: {
    categoryId: string;
    key: string;
    visible: boolean;
  };
};

export type PcEditorEffectPanelItem = {
  categoryId?: string;
  conflictGroup?: string | null;
  durationMs?: number;
  eventName?: string;
  id: string;
  key: string;
  label: string;
  params?: Record<string, unknown>;
  previewMode?: PcEditorEffectDefinitionSpec["preview"]["mode"];
  previewTarget?: EffectPreviewTarget;
  renderFallback?: PcEditorEffectDefinitionSpec["render"]["fallback"];
  renderStage?: PcEditorEffectDefinitionSpec["render"]["stage"];
  renderSupported?: boolean;
  webxrSupport?: PcEditorEffectDefinitionSpec["preview"]["webxrSupport"];
};

export type PcEditorEffectPanelCategory = {
  effects: PcEditorEffectPanelItem[];
  id: string;
  key: string;
  label: string;
};
