"use client";

import { useEffect, type RefObject } from "react";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";
import { PC_MASK_BACKGROUND_HIT_ATTRIBUTE } from "../webxr/AFrameMaskBackgroundTarget";
import { directionToViewCenter } from "../operations/viewGeometry";
import { getPcEditorRuntimeState } from "../../state";
import { isPcMaskCenterFollowKeyPressed } from "./centerFollowKey";
import { SPATIAL_UI_HIT_ATTRIBUTE, SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE } from "../../3DUI/shared/SpatialUiInteraction";

type Vector3Like = {
  x: number;
  y: number;
  z: number;
};

type RayIntersection = {
  el?: HTMLElement;
  object?: {
    el?: HTMLElement;
  };
  point?: Vector3Like;
};

type AFrameRaycasterElement = HTMLElement & {
  components?: {
    raycaster?: {
      intersectedEls?: HTMLElement[];
      intersections?: RayIntersection[];
    };
  };
  object3D?: {
    getWorldDirection?: (target: Vector3Like) => Vector3Like;
  };
};

function elementFromIntersection(intersection: RayIntersection | null) {
  return intersection?.el ?? intersection?.object?.el ?? null;
}

function elementsFromRaycaster(target: EventTarget | null) {
  const element = target as AFrameRaycasterElement | null;
  const raycaster = element?.components?.raycaster;

  return [
    ...(raycaster?.intersections ?? []).map((intersection) => elementFromIntersection(intersection)),
    ...(raycaster?.intersectedEls ?? [])
  ].filter(Boolean) as HTMLElement[];
}

function readFirstIntersection(target: EventTarget | null): RayIntersection | null {
  const element = target as AFrameRaycasterElement | null;
  const raycaster = element?.components?.raycaster;
  const intersection = raycaster?.intersections?.[0];

  if (intersection) {
    return intersection;
  }

  const intersectedEl = raycaster?.intersectedEls?.[0];
  return intersectedEl ? { el: intersectedEl } : null;
}

function isBackgroundHitTarget(element: HTMLElement | null) {
  return Boolean(element?.closest?.(`[${PC_MASK_BACKGROUND_HIT_ATTRIBUTE}="true"]`));
}

function isBlockingRayTarget(element: HTMLElement | null) {
  if (!element || isBackgroundHitTarget(element)) {
    return false;
  }

  return Boolean(
    element.closest?.("[data-ray-blocking='true'], [data-crop-arc-id]") ??
    element.classList?.contains("clickable")
  );
}

function hasSpatialUiHit(target: EventTarget | null, scene: HTMLElement | null) {
  if (scene?.getAttribute(SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE) === "true") {
    return true;
  }

  return elementsFromRaycaster(target).some((element) => Boolean(element.closest?.(`[${SPATIAL_UI_HIT_ATTRIBUTE}="true"]`)));
}

function readControllerCenter(target: EventTarget | null) {
  const element = target as AFrameRaycasterElement | null;
  const direction = { x: 0, y: 0, z: -1 };
  const worldDirection = element?.object3D?.getWorldDirection?.(direction);

  return worldDirection ? directionToViewCenter(worldDirection) : null;
}

function readEventIntersection(event: Event): RayIntersection | null {
  const detail = (event as CustomEvent<{ intersection?: RayIntersection }>).detail;
  return detail?.intersection ?? readFirstIntersection(event.target);
}

export function usePcMaskRayTargetInput({
  enabled = true,
  mask,
  sceneReady,
  sceneRef
}: {
  enabled?: boolean;
  mask: PcMaskOperations;
  sceneReady: boolean;
  sceneRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const scene = sceneRef.current;

    if (!enabled || !sceneReady || !scene) {
      return;
    }

    const moveToCenter = (center: PcViewCenter) => {
      mask.moveMaskTo(center, 520);
    };

    const handleBackgroundClick = (event: Event) => {
      const pointer = getPcEditorRuntimeState().input.pointer;
      if (isPcMaskCenterFollowKeyPressed() || pointer.primaryDown || pointer.draggingMask) {
        event.stopPropagation();
        return;
      }

      const intersection = readEventIntersection(event);
      const target = elementFromIntersection(intersection) ?? (event.target instanceof HTMLElement ? event.target : null);

      if (!isBackgroundHitTarget(target) || !intersection?.point) {
        return;
      }

      event.stopPropagation();
      moveToCenter(directionToViewCenter(intersection.point));
    };

    const handleTriggerUp = (event: Event) => {
      if (hasSpatialUiHit(event.target, scene)) {
        return;
      }

      const intersection = readFirstIntersection(event.target);
      const hitElement = elementFromIntersection(intersection);

      if (isBlockingRayTarget(hitElement)) {
        return;
      }

      if (intersection?.point && isBackgroundHitTarget(hitElement)) {
        moveToCenter(directionToViewCenter(intersection.point));
        return;
      }

      const controllerCenter = readControllerCenter(event.target);
      if (controllerCenter) {
        moveToCenter(controllerCenter);
      }
    };

    scene.addEventListener("click", handleBackgroundClick);
    scene.addEventListener("triggerup", handleTriggerUp);
    return () => {
      scene.removeEventListener("click", handleBackgroundClick);
      scene.removeEventListener("triggerup", handleTriggerUp);
    };
  }, [enabled, mask, sceneReady, sceneRef]);
}
