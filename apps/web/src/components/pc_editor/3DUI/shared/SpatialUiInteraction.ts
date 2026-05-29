import { useEffect, useRef } from "react";

export type SpatialControlVisualState = "hover" | "idle" | "pressed";

const SPATIAL_UI_BLOCKER_ATTRIBUTE = "data-spatial-ui-blocker";
const SPATIAL_UI_CONTROL_ATTRIBUTE = "data-spatial-ui-control";
export const SPATIAL_UI_HIT_ATTRIBUTE = "data-spatial-ui-hit";
export const SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE = "data-spatial-ui-ray-active";
export const SPATIAL_UI_RENDER_ORDER = 220;
export const SPATIAL_UI_TEXT_RENDER_ORDER = 230;
export const SPATIAL_UI_HIT_RENDER_ORDER = 240;

const spatialUiRayTargets = new WeakMap<HTMLElement, WeakSet<HTMLElement>>();

type AFrameRaycasterElement = HTMLElement & {
  components?: {
    raycaster?: {
      intersectedEls?: HTMLElement[];
      intersections?: Array<{
        distance?: number;
        el?: HTMLElement;
        object?: {
          el?: HTMLElement;
        };
      }>;
    };
  };
};

function sceneForSpatialElement(element: HTMLElement) {
  return element.closest("a-scene") as HTMLElement | null;
}

function spatialHitTargetFromElement(element: HTMLElement | null | undefined) {
  return element?.closest?.(`[${SPATIAL_UI_HIT_ATTRIBUTE}="true"]`) as HTMLElement | null;
}

function isSpatialControlTarget(element: HTMLElement | null | undefined) {
  return element?.getAttribute(SPATIAL_UI_CONTROL_ATTRIBUTE) === "true";
}

function raycasterComponent(element: HTMLElement | null | undefined) {
  return (element as AFrameRaycasterElement | null | undefined)?.components?.raycaster;
}

function spatialHitTargetForRaycaster(raycasterEl: HTMLElement) {
  const raycaster = raycasterComponent(raycasterEl);

  if (!raycaster) {
    return null;
  }

  const intersectionTargets = [...(raycaster.intersections ?? [])]
    .sort((left, right) => (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY))
    .map((intersection) => spatialHitTargetFromElement(intersection.el ?? intersection.object?.el ?? null))
    .filter(Boolean) as HTMLElement[];

  const controlTarget = intersectionTargets.find(isSpatialControlTarget);

  if (controlTarget) {
    return controlTarget;
  }

  if (intersectionTargets.length > 0) {
    return intersectionTargets[0];
  }

  const fallbackTargets: HTMLElement[] = [];

  for (const intersectedEl of raycaster.intersectedEls ?? []) {
    const target = spatialHitTargetFromElement(intersectedEl);

    if (target) {
      fallbackTargets.push(target);
    }
  }

  return fallbackTargets.find(isSpatialControlTarget) ?? fallbackTargets[0] ?? null;
}

function raycasterElementsForEvent(scene: HTMLElement, event?: Event) {
  const eventTarget = event?.target instanceof HTMLElement ? event.target : null;
  const candidates = eventTarget && raycasterComponent(eventTarget)
    ? [eventTarget, ...Array.from(scene.querySelectorAll<HTMLElement>("[raycaster]")).filter((element) => element !== eventTarget)]
    : Array.from(scene.querySelectorAll<HTMLElement>("[raycaster]"));

  return candidates;
}

function isCurrentSpatialRayTarget(element: HTMLElement, event?: Event) {
  const scene = sceneForSpatialElement(element);

  if (!scene) {
    return false;
  }

  return raycasterElementsForEvent(scene, event).some((raycasterEl) => spatialHitTargetForRaycaster(raycasterEl) === element);
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

    el.setAttribute(SPATIAL_UI_CONTROL_ATTRIBUTE, "true");

    let hoverFrame = 0;
    const fallbackPressedRef = { current: false };
    const lastFallbackClickAtRef = { current: 0 };
    const lastFallbackUpAtRef = { current: 0 };
    const rayActiveRef = { current: false };
    const visualStateRef = { current: "idle" as SpatialControlVisualState };

    const setRayActive = (active: boolean) => {
      if (rayActiveRef.current === active) {
        return;
      }

      rayActiveRef.current = active;
      setSpatialUiRayActive(el, active);
    };

    const setVisualState = (state: SpatialControlVisualState) => {
      if (visualStateRef.current === state) {
        return;
      }

      visualStateRef.current = state;
      onState?.(state);
    };

    const setHover = (event: Event) => {
      event.stopPropagation();
      setRayActive(true);
      setVisualState("hover");
    };
    const setIdle = (event: Event) => {
      event.stopPropagation();
      setRayActive(false);
      setVisualState("idle");
    };
    const setPressed = (event: Event) => {
      event.stopPropagation();
      setVisualState("pressed");
    };
    const handleUp = (event: Event) => {
      event.stopPropagation();
      setVisualState("hover");
    };
    const handleClick = (event: Event) => {
      event.stopPropagation();
      if (performance.now() - lastFallbackClickAtRef.current < 120) {
        return;
      }

      onClick?.();
    };
    const handleFallbackDown = (event: Event) => {
      if (fallbackPressedRef.current || !isCurrentSpatialRayTarget(el, event)) {
        return;
      }

      fallbackPressedRef.current = true;
      setRayActive(true);
      setVisualState("pressed");
    };
    const handleFallbackUp = (event: Event) => {
      const now = performance.now();

      if (now - lastFallbackUpAtRef.current < 40) {
        return;
      }

      lastFallbackUpAtRef.current = now;

      if (!fallbackPressedRef.current) {
        return;
      }

      fallbackPressedRef.current = false;

      if (!isCurrentSpatialRayTarget(el, event)) {
        setRayActive(false);
        setVisualState("idle");
        return;
      }

      setRayActive(true);
      setVisualState("hover");
      lastFallbackClickAtRef.current = now;
      onClick?.();
    };
    const pollHover = () => {
      if (!fallbackPressedRef.current) {
        if (isCurrentSpatialRayTarget(el)) {
          setRayActive(true);
          setVisualState("hover");
        } else {
          setRayActive(false);
          setVisualState("idle");
        }
      }

      hoverFrame = window.requestAnimationFrame(pollHover);
    };

    el.addEventListener("mouseenter", setHover);
    el.addEventListener("mouseleave", setIdle);
    el.addEventListener("raycaster-intersected", setHover);
    el.addEventListener("raycaster-intersected-cleared", setIdle);
    el.addEventListener("mousedown", setPressed);
    el.addEventListener("mouseup", handleUp);
    el.addEventListener("click", handleClick);
    const scene = sceneForSpatialElement(el);

    scene?.addEventListener("triggerdown", handleFallbackDown);
    scene?.addEventListener("selectstart", handleFallbackDown);
    scene?.addEventListener("triggerup", handleFallbackUp);
    scene?.addEventListener("selectend", handleFallbackUp);
    hoverFrame = window.requestAnimationFrame(pollHover);
    return () => {
      window.cancelAnimationFrame(hoverFrame);
      setSpatialUiRayActive(el, false);
      el.removeEventListener("mouseenter", setHover);
      el.removeEventListener("mouseleave", setIdle);
      el.removeEventListener("raycaster-intersected", setHover);
      el.removeEventListener("raycaster-intersected-cleared", setIdle);
      el.removeEventListener("mousedown", setPressed);
      el.removeEventListener("mouseup", handleUp);
      el.removeEventListener("click", handleClick);
      scene?.removeEventListener("triggerdown", handleFallbackDown);
      scene?.removeEventListener("selectstart", handleFallbackDown);
      scene?.removeEventListener("triggerup", handleFallbackUp);
      scene?.removeEventListener("selectend", handleFallbackUp);
      el.removeAttribute(SPATIAL_UI_CONTROL_ATTRIBUTE);
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

    el.setAttribute(SPATIAL_UI_BLOCKER_ATTRIBUTE, "true");

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
      el.removeAttribute(SPATIAL_UI_BLOCKER_ATTRIBUTE);
    };
  }, []);

  return ref;
}
