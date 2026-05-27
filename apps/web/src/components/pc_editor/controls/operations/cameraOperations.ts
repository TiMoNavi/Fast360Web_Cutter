import type { MutableRefObject, RefObject } from "react";
import type { PcViewCenter } from "../PcTrajectoryRippleCorrector";
import { clampNumber, normalizeViewCenter } from "./viewGeometry";

type AFrameCameraElement = HTMLElement & {
  components?: {
    "look-controls"?: {
      pitchObject?: {
        rotation?: {
          x: number;
        };
      };
      yawObject?: {
        rotation?: {
          y: number;
        };
      };
    };
  };
  object3D?: {
    rotation?: {
      x: number;
      y: number;
      z: number;
    };
  };
};

export type PcCameraOperations = {
  setCameraCenter: (center: PcViewCenter) => void;
};

export function createPcCameraOperations({
  cameraLookRef,
  cameraRef
}: {
  cameraLookRef: MutableRefObject<PcViewCenter>;
  cameraRef: RefObject<HTMLElement | null>;
}): PcCameraOperations {
  return {
    setCameraCenter(center) {
      const camera = cameraRef.current as AFrameCameraElement | null;
      const normalized = normalizeViewCenter(center);
      const nextYaw = clampNumber(normalized.yaw, -180, 180);
      const nextPitch = clampNumber(normalized.pitch, -70, 70);

      cameraLookRef.current = {
        pitch: nextPitch,
        yaw: nextYaw
      };

      camera?.setAttribute("rotation", `${nextPitch.toFixed(3)} ${nextYaw.toFixed(3)} 0`);
      if (camera?.object3D?.rotation) {
        camera.object3D.rotation.x = nextPitch * Math.PI / 180;
        camera.object3D.rotation.y = nextYaw * Math.PI / 180;
        camera.object3D.rotation.z = 0;
      }
      const lookControls = camera?.components?.["look-controls"];
      if (lookControls?.pitchObject?.rotation) {
        lookControls.pitchObject.rotation.x = nextPitch * Math.PI / 180;
      }
      if (lookControls?.yawObject?.rotation) {
        lookControls.yawObject.rotation.y = nextYaw * Math.PI / 180;
      }
    }
  };
}
