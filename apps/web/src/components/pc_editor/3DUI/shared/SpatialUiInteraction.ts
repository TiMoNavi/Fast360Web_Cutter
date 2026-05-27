import { useEffect, useRef } from "react";

export type SpatialControlVisualState = "hover" | "idle" | "pressed";

export const SPATIAL_UI_HIT_ATTRIBUTE = "data-spatial-ui-hit";
export const SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE = "data-spatial-ui-ray-active";
export const SPATIAL_UI_RENDER_ORDER = 220;
export const SPATIAL_UI_TEXT_RENDER_ORDER = 230;
export const SPATIAL_UI_HIT_RENDER_ORDER = 240;

const spatialUiRayTargets = new WeakMap<HTMLElement, WeakSet<HTMLElement>>();

function sceneForSpatialElement(element: HTMLElement) {
  return element.closest("a-scene") as HTMLElement | null;
}

export function setSpatialUiRayActive(element: HTMLElement, active: boolean) {
  const scene = sceneForSpatialElement(element);

  if (!scene) {
    return;
  }

  let activeTargets = spatialUiRayTargets.get(scene);
  if (!activeTargets) {
    activeTargets = new WeakSet<HTMLElement>();
    spatialUiRayTargets.set(scene, activeTargets);
  }

  if (active) {
    activeTargets.add(element);
    scene.setAttribute(SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE, "true");
    return;
  }

  activeTargets.delete(element);
  window.requestAnimationFrame(() => {
    const raycasters = Array.from(scene.querySelectorAll<HTMLElement>("[raycaster]"));
    const stillIntersectingSpatialUi = raycasters.some((raycasterEl) => {
      const raycaster = (raycasterEl as {
        components?: {
          raycaster?: {
            intersectedEls?: HTMLElement[];
            intersections?: Array<{
              el?: HTMLElement;
              object?: {
                el?: HTMLElement;
              };
            }>;
          };
        };
      }).components?.raycaster;

      return [
        ...(raycaster?.intersections ?? []).map((intersection) => intersection.el ?? intersection.object?.el ?? null),
        ...(raycaster?.intersectedEls ?? [])
      ].some((candidate) => Boolean(candidate?.closest?.(`[${SPATIAL_UI_HIT_ATTRIBUTE}="true"]`)));
    });

    if (!stillIntersectingSpatialUi) {
      scene.setAttribute(SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE, "false");
    }
  });
}

export function flatEmissiveMaterial(color: string, opacity = 1, glow = 0.4) {
  return `shader: flat; color: ${color}; emissive: ${color}; emissiveIntensity: ${glow}; opacity: ${opacity}; transparent: true; side: double; depthTest: false; depthWrite: false`;
}

export function transparentHitMaterial(color = "#ffffff") {
  return flatEmissiveMaterial(color, 0.001, 0);
}

export function useSpatialButtonEvents({
  onClick,
  onState
}: {
  onClick?: () => void;
  onState?: (state: SpatialControlVisualState) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;

    if (!el) {
      return undefined;
    }

    const setHover = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, true);
      onState?.("hover");
    };
    const setIdle = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, false);
      onState?.("idle");
    };
    const setPressed = (event: Event) => {
      event.stopPropagation();
      onState?.("pressed");
    };
    const handleUp = (event: Event) => {
      event.stopPropagation();
      onState?.("hover");
    };
    const handleClick = (event: Event) => {
      event.stopPropagation();
      onClick?.();
    };

    el.addEventListener("mouseenter", setHover);
    el.addEventListener("mouseleave", setIdle);
    el.addEventListener("raycaster-intersected", setHover);
    el.addEventListener("raycaster-intersected-cleared", setIdle);
    el.addEventListener("mousedown", setPressed);
    el.addEventListener("mouseup", handleUp);
    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("mouseenter", setHover);
      el.removeEventListener("mouseleave", setIdle);
      el.removeEventListener("raycaster-intersected", setHover);
      el.removeEventListener("raycaster-intersected-cleared", setIdle);
      el.removeEventListener("mousedown", setPressed);
      el.removeEventListener("mouseup", handleUp);
      el.removeEventListener("click", handleClick);
    };
  }, [onClick, onState]);

  return ref;
}

export function useSpatialRayBlockerEvents() {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;

    if (!el) {
      return undefined;
    }

    const stop = (event: Event) => event.stopPropagation();
    const stopAndSetActive = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, true);
    };
    const stopAndSetIdle = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, false);
    };
    el.addEventListener("click", stop);
    el.addEventListener("mousedown", stop);
    el.addEventListener("mouseup", stop);
    el.addEventListener("mouseenter", stopAndSetActive);
    el.addEventListener("mouseleave", stopAndSetIdle);
    el.addEventListener("raycaster-intersected", stopAndSetActive);
    el.addEventListener("raycaster-intersected-cleared", stopAndSetIdle);
    return () => {
      el.removeEventListener("click", stop);
      el.removeEventListener("mousedown", stop);
      el.removeEventListener("mouseup", stop);
      el.removeEventListener("mouseenter", stopAndSetActive);
      el.removeEventListener("mouseleave", stopAndSetIdle);
      el.removeEventListener("raycaster-intersected", stopAndSetActive);
      el.removeEventListener("raycaster-intersected-cleared", stopAndSetIdle);
    };
  }, []);

  return ref;
}
