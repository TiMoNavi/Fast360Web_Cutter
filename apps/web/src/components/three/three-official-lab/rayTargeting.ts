import { Object3D, PerspectiveCamera, Quaternion, Raycaster, Vector2, Vector3, WebGLRenderer } from "three";
import { HTMLMesh } from "three/examples/jsm/interactive/HTMLMesh.js";
import type { ViewInputSource } from "@/features/webxr/pc-editor/data/timeline-bridge";
import { directionToViewTarget, readObjectForward } from "./runtimeHelpers";
import type { ControllerHand, SyntheticControllerSelectDetail } from "./types";
import type { ControllerRayOverrideState } from "./controllerInteractionState";

type Vector3Detail = SyntheticControllerSelectDetail["rayDirection"] | SyntheticControllerSelectDetail["rayOrigin"];

type ThreeOfficialRayTargetingOptions = {
  camera: PerspectiveCamera;
  domSourceForHtmlMesh: (mesh: HTMLMesh) => HTMLElement | null;
  getUiMeshes: () => HTMLMesh[];
  renderer: WebGLRenderer;
  videoSphere: Object3D;
};

export function vectorFromDetail(value: Vector3Detail) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    return null;
  }

  return new Vector3(value.x, value.y, value.z);
}

export function createThreeOfficialRayTargeting({
  camera,
  domSourceForHtmlMesh,
  getUiMeshes,
  renderer,
  videoSphere
}: ThreeOfficialRayTargetingOptions) {
  const direction = new Vector3();
  const hitDirection = new Vector3();
  const pointerNdc = new Vector2();
  const quaternion = new Quaternion();
  const raycaster = new Raycaster();
  const rayDirection = new Vector3();
  const rayOrigin = new Vector3();
  const sphereCenter = new Vector3();
  const uiDispatchUv = new Vector2();

  function normalizedRayDirection(value: Vector3) {
    return direction.copy(value).normalize();
  }

  function readPoseFromObject(object: Object3D, input: ViewInputSource) {
    return directionToViewTarget(readObjectForward(object, direction, quaternion), input);
  }

  function getUiHitFromRay(origin: Vector3, rayDirectionValue: Vector3) {
    const uiObjects = getUiMeshes();
    if (!uiObjects.length) {
      return null;
    }

    raycaster.ray.set(origin, normalizedRayDirection(rayDirectionValue));
    return raycaster.intersectObjects(uiObjects, false)[0] ?? null;
  }

  function getSpherePoseFromRay(origin: Vector3, rayDirectionValue: Vector3, input: ViewInputSource) {
    raycaster.ray.set(origin, normalizedRayDirection(rayDirectionValue));
    const uiObjects = getUiMeshes();
    const uiHit = uiObjects.length ? raycaster.intersectObjects(uiObjects, true)[0] : null;
    const sphereHit = raycaster.intersectObject(videoSphere, false)[0] ?? null;
    if (!sphereHit || (uiHit && uiHit.distance < sphereHit.distance)) {
      return null;
    }

    videoSphere.getWorldPosition(sphereCenter);
    return directionToViewTarget(hitDirection.copy(sphereHit.point).sub(sphereCenter).normalize(), input);
  }

  function hasInteractiveDomTarget(mesh: HTMLMesh, uv: Vector2) {
    const domSource = domSourceForHtmlMesh(mesh);
    if (!domSource) {
      return false;
    }

    const rootRect = domSource.getBoundingClientRect();
    const x = rootRect.left + uv.x * rootRect.width;
    const y = rootRect.top + (1 - uv.y) * rootRect.height;
    const interactiveElements = Array.from(domSource.querySelectorAll<HTMLElement>("button, input, select, a[href]"));

    return interactiveElements.some((element) => {
      if (element instanceof HTMLButtonElement && element.disabled) {
        return false;
      }
      if (element instanceof HTMLInputElement && element.disabled) {
        return false;
      }
      if (element instanceof HTMLSelectElement && element.disabled) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
  }

  function dispatchHtmlMeshPointerEventFromRay(origin: Vector3, rayDirectionValue: Vector3, eventType: "click" | "mousedown" | "mouseup") {
    const uiHit = getUiHitFromRay(origin, rayDirectionValue);
    if (!uiHit?.uv || !(uiHit.object instanceof HTMLMesh)) {
      return false;
    }
    if (!hasInteractiveDomTarget(uiHit.object, uiHit.uv)) {
      return false;
    }

    uiHit.object.dispatchEvent({
      data: uiDispatchUv.set(uiHit.uv.x, 1 - uiHit.uv.y),
      type: eventType
    } as never);
    return true;
  }

  function dispatchHtmlMeshPointerEventFromController(
    hand: ControllerHand,
    controller: Object3D,
    eventType: "click" | "mousedown" | "mouseup",
    controllerRayOverrideState: ControllerRayOverrideState,
    detail?: SyntheticControllerSelectDetail
  ) {
    const detailOrigin = vectorFromDetail(detail?.rayOrigin);
    const detailDirection = vectorFromDetail(detail?.rayDirection);
    const override = controllerRayOverrideState[hand];
    const origin = detailOrigin ?? override.rayOrigin;
    const directionValue = detailDirection ?? override.rayDirection;

    if (origin && directionValue) {
      return dispatchHtmlMeshPointerEventFromRay(origin, directionValue, eventType);
    }

    controller.getWorldPosition(rayOrigin);
    readObjectForward(controller, rayDirection, quaternion);
    return dispatchHtmlMeshPointerEventFromRay(rayOrigin, rayDirection, eventType);
  }

  function getSpherePoseFromPointer(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointerNdc, camera);
    return getSpherePoseFromRay(raycaster.ray.origin, raycaster.ray.direction, "controller_ray");
  }

  function getSpherePoseFromController(controller: Object3D) {
    controller.getWorldPosition(rayOrigin);
    readObjectForward(controller, rayDirection, quaternion);
    return getSpherePoseFromRay(rayOrigin, rayDirection, "controller_ray");
  }

  return {
    dispatchHtmlMeshPointerEventFromController,
    dispatchHtmlMeshPointerEventFromRay,
    getSpherePoseFromController,
    getSpherePoseFromPointer,
    getSpherePoseFromRay,
    getUiHitFromRay,
    readPoseFromObject
  };
}
