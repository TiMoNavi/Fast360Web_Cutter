"use client";

import { useEffect, type RefObject } from "react";
import type { PcMaskOperations } from "../operations/maskOperations";
import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";
import { PC_MASK_BACKGROUND_HIT_ATTRIBUTE } from "../webxr/AFrameMaskBackgroundTarget";
import { directionToViewCenter } from "../operations/viewGeometry";
import { getPcEditorFrontendPlaybackRate, getPcEditorRuntimeState } from "../../state";
import { isPcMaskCenterFollowKeyPressed } from "./centerFollowKey";
import { SPATIAL_UI_HIT_ATTRIBUTE, SPATIAL_UI_RAY_ACTIVE_ATTRIBUTE } from "../../3DUI/shared/SpatialUiInteraction";

type Vector3Like = {
  x: number;
  y: number;
  z: number;
};

type DirectionTarget = Vector3Like & {
  normalize: () => DirectionTarget;
  set: (x: number, y: number, z: number) => DirectionTarget;
};

type PositionTarget = Vector3Like & {
  setFromMatrixPosition?: (matrix: unknown) => PositionTarget;
};

type AFrameThreeGlobal = typeof globalThis & {
  AFRAME?: {
    THREE?: {
      Vector3?: new () => DirectionTarget & PositionTarget;
    };
  };
};

type RayIntersection = {
  el?: HTMLElement;
  object?: {
    el?: HTMLElement;
  };
  point?: Vector3Like;
};

type RayIntersectionEventDetail = {
  cursorEl?: EventTarget | null;
  hand?: "left" | "right" | string;
  intersection?: RayIntersection;
};

type AFrameRaycasterElement = HTMLElement & {
  components?: {
    raycaster?: {
      intersectedEls?: HTMLElement[];
      intersections?: RayIntersection[];
      raycaster?: {
        ray?: {
          direction?: Vector3Like;
          origin?: Vector3Like;
        };
      };
    };
  };
  object3D?: {
    getWorldDirection?: (target: Vector3Like) => Vector3Like;
    getWorldPosition?: (target: Vector3Like) => Vector3Like;
  };
};

function createAFrameVector3() {
  const Vector3Constructor = (globalThis as AFrameThreeGlobal).AFRAME?.THREE?.Vector3;
  return Vector3Constructor ? new Vector3Constructor() : null;
}

function createDirectionTarget(): DirectionTarget {
  const vector = createAFrameVector3();

  if (vector) {
    return vector;
  }

  return {
    x: 0,
    y: 0,
    z: -1,
    normalize() {
      const length = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= length;
      this.y /= length;
      this.z /= length;
      return this;
    },
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  };
}

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
  const rayDirection = element?.components?.raycaster?.raycaster?.ray?.direction;

  if (rayDirection) {
    return directionToViewCenter(rayDirection);
  }

  const worldDirection = element?.object3D?.getWorldDirection?.(createDirectionTarget());

  // A-Frame raycasters point down local -Z, while a plain Object3D world
  // direction reports local +Z. Negate this fallback to match the raycaster.
  return worldDirection
    ? directionToViewCenter({
        x: -worldDirection.x,
        y: -worldDirection.y,
        z: -worldDirection.z
      })
    : null;
}

function readCursorTarget(event: Event) {
  return (event as CustomEvent<RayIntersectionEventDetail>).detail?.cursorEl ?? null;
}

function readEventHand(event: Event) {
  const hand = (event as CustomEvent<RayIntersectionEventDetail>).detail?.hand;
  return hand === "left" || hand === "right" ? hand : null;
}

function isControllerRayTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const hand = element?.dataset.hand ?? element?.getAttribute("hand");
  const id = element?.id.toLowerCase() ?? "";

  return hand === "left" || hand === "right" || id.includes("controller");
}

function readControllerElementFromEvent(event: Event, scene: HTMLElement) {
  if (isControllerRayTarget(event.target)) {
    return event.target;
  }

  const cursorTarget = readCursorTarget(event);
  if (isControllerRayTarget(cursorTarget)) {
    return cursorTarget;
  }

  const hand = readEventHand(event);
  return hand
    ? scene.querySelector(`#${hand}-controller, [data-hand="${hand}"]`)
    : null;
}

function readBackgroundHitCenter(intersection: RayIntersection | null) {
  const hitElement = elementFromIntersection(intersection);
  const backgroundTarget = hitElement?.closest?.(`[${PC_MASK_BACKGROUND_HIT_ATTRIBUTE}="true"]`) as AFrameRaycasterElement | null;
  const point = intersection?.point;

  if (!point) {
    return null;
  }

  const positionTarget = createAFrameVector3();
  const worldPosition = positionTarget ? backgroundTarget?.object3D?.getWorldPosition?.(positionTarget) : null;

  return directionToViewCenter(
    worldPosition
      ? {
          x: point.x - worldPosition.x,
          y: point.y - worldPosition.y,
          z: point.z - worldPosition.z
        }
      : point
  );
}

function readEventIntersection(event: Event): RayIntersection | null {
  const detail = (event as CustomEvent<RayIntersectionEventDetail>).detail;
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
      mask.moveMaskTo(center, 520 / getPcEditorFrontendPlaybackRate());
    };

    const moveTriggerToCenter = (center: PcViewCenter) => {
      mask.setPreviewCenter(center);
    };

    const handleBackgroundClick = (event: Event) => {
      const pointer = getPcEditorRuntimeState().input.pointer;
      if (isPcMaskCenterFollowKeyPressed() || pointer.primaryDown || pointer.draggingMask) {
        event.stopPropagation();
        return;
      }

      const intersection = readEventIntersection(event);
      const target = elementFromIntersection(intersection) ?? (event.target instanceof HTMLElement ? event.target : null);
      const controllerTarget = readControllerElementFromEvent(event, scene);

      if (!isBackgroundHitTarget(target) || !intersection?.point) {
        return;
      }

      event.stopPropagation();
      const center = readBackgroundHitCenter(intersection);

      if (center) {
        moveToCenter(center);
      }
    };

    const handleTriggerUp = (event: Event) => {
      const controllerTarget = readControllerElementFromEvent(event, scene);

      if (!controllerTarget || hasSpatialUiHit(controllerTarget, scene)) {
        return;
      }

      const intersection = readFirstIntersection(controllerTarget);
      const hitElement = elementFromIntersection(intersection);

      if (isBlockingRayTarget(hitElement)) {
        return;
      }

      if (isBackgroundHitTarget(hitElement)) {
        const center = readBackgroundHitCenter(intersection) ?? readControllerCenter(controllerTarget);

        if (center) {
          moveTriggerToCenter(center);
        }
        return;
      }

      const controllerCenter = readControllerCenter(controllerTarget);
      if (controllerCenter) {
        moveTriggerToCenter(controllerCenter);
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
