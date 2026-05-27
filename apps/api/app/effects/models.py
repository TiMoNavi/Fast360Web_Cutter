from typing import Any, Literal

from pydantic import BaseModel, Field


class EffectParamSpec(BaseModel):
    type: Literal["string", "number", "boolean", "object"]
    default: Any = None
    min: float | None = None
    max: float | None = None


class EffectEventSpec(BaseModel):
    name: str
    default_duration_ms: int = Field(default=900, alias="defaultDurationMs")
    default_params: dict[str, Any] = Field(default_factory=dict, alias="defaultParams")
    params: dict[str, EffectParamSpec] = Field(default_factory=dict)


class EffectRenderSpec(BaseModel):
    stage: Literal["pre_remap_equirect", "post_remap_frame", "viewport_path", "overlay_frame", "audio_timeline", "marker_only"]
    backend_support: Literal["supported", "unsupported"] = Field(alias="backendSupport")
    fallback: Literal["ignore", "warn", "fail"] = "warn"
    conflict_group: str | None = Field(default=None, alias="conflictGroup")


class EffectPreviewSpec(BaseModel):
    webxr_support: Literal["exact", "approximate", "symbolic", "unsupported"] = Field(alias="webxrSupport")
    mode: Literal["none", "ui_overlay", "sphere_overlay", "viewport_simulation", "exact_shared_shader"]
    target: Literal["screen", "viewport-mask", "sphere", "world-layer"] = "screen"
    renderer: str | None = None


class EffectUiSpec(BaseModel):
    category_id: str = Field(alias="categoryId")
    key: str
    visible: bool = True


class EffectOperationSpec(BaseModel):
    type: Literal["pc-editor-event"] = "pc-editor-event"
    event_type: str = Field(alias="eventType")
    payload: dict[str, Any] = Field(default_factory=dict)


class EffectDefinitionSpec(BaseModel):
    id: str
    family: str
    label: str
    description: str = ""
    event: EffectEventSpec
    render: EffectRenderSpec
    preview: EffectPreviewSpec
    ui: EffectUiSpec
    operation: EffectOperationSpec


class EffectCategorySpec(BaseModel):
    id: str
    key: str
    label: str


class EffectCatalogResponse(BaseModel):
    schema_name: Literal["pc-editor-effect-catalog.v1"] = Field(default="pc-editor-effect-catalog.v1", alias="schema")
    catalog_version: int = Field(default=1, alias="catalogVersion")
    categories: list[EffectCategorySpec]
    effects: list[EffectDefinitionSpec]
