import type { Object3D } from "three";
import type {
  ControllerHand,
  SyntheticControllerSelectDetail,
  SyntheticQuickMenuDetail,
  SyntheticThumbstickDetail,
  XrControllerObject
} from "./types";

type ControllerInputBindings = {
  canvas: HTMLElement;
  controllers: Record<ControllerHand, Object3D>;
  xrControllers: Record<ControllerHand, XrControllerObject>;
  onCanvasPointerDown: (event: PointerEvent) => void;
  onCanvasPointerUp: (event: PointerEvent) => void;
  onMenuToggle: () => void;
  onQuickMenu: (detail?: SyntheticQuickMenuDetail) => void;
  onRecordToggle: () => void;
  onSelectEnd: (hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) => void;
  onSelectStart: (hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) => void;
  onSqueezeEnd: (hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) => void;
  onSqueezeStart: (hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) => void;
  onSyntheticAim: (hand: ControllerHand, detail?: SyntheticControllerSelectDetail) => void;
  onThumbstick: (detail?: SyntheticThumbstickDetail) => void;
};

function isControllerHand(value: unknown): value is ControllerHand {
  return value === "left" || value === "right";
}

function addControllerListener(
  cleanup: Array<() => void>,
  controller: XrControllerObject,
  type: string,
  listener: (event: unknown) => void
) {
  controller.addEventListener(type, listener);
  cleanup.push(() => controller.removeEventListener(type, listener));
}

function addWindowListener(cleanup: Array<() => void>, type: string, listener: EventListener) {
  window.addEventListener(type, listener);
  cleanup.push(() => window.removeEventListener(type, listener));
}

export function bindThreeOfficialControllerInput({
  canvas,
  controllers,
  onCanvasPointerDown,
  onCanvasPointerUp,
  onMenuToggle,
  onQuickMenu,
  onRecordToggle,
  onSelectEnd,
  onSelectStart,
  onSqueezeEnd,
  onSqueezeStart,
  onSyntheticAim,
  onThumbstick,
  xrControllers
}: ControllerInputBindings) {
  const cleanup: Array<() => void> = [];

  addControllerListener(cleanup, xrControllers.left, "selectstart", () => onSelectStart("left", controllers.left));
  addControllerListener(cleanup, xrControllers.right, "selectstart", () => onSelectStart("right", controllers.right));
  addControllerListener(cleanup, xrControllers.left, "selectend", () => onSelectEnd("left", controllers.left));
  addControllerListener(cleanup, xrControllers.right, "selectend", () => onSelectEnd("right", controllers.right));
  addControllerListener(cleanup, xrControllers.left, "squeezestart", () => onSqueezeStart("left", controllers.left));
  addControllerListener(cleanup, xrControllers.right, "squeezestart", () => onSqueezeStart("right", controllers.right));
  addControllerListener(cleanup, xrControllers.left, "squeezeend", () => onSqueezeEnd("left", controllers.left));
  addControllerListener(cleanup, xrControllers.right, "squeezeend", () => onSqueezeEnd("right", controllers.right));

  addWindowListener(cleanup, "three-official-controller-select", ((event: Event) => {
    const detail = (event as CustomEvent<SyntheticControllerSelectDetail>).detail;
    if (!isControllerHand(detail?.hand)) {
      return;
    }

    const controller = controllers[detail.hand];
    if (detail.phase === "start") {
      onSelectStart(detail.hand, controller, detail);
    } else if (detail.phase === "end") {
      onSelectEnd(detail.hand, controller, detail);
    }
  }) as EventListener);

  addWindowListener(cleanup, "three-official-controller-aim", ((event: Event) => {
    const detail = (event as CustomEvent<SyntheticControllerSelectDetail>).detail;
    if (isControllerHand(detail?.hand)) {
      onSyntheticAim(detail.hand, detail);
    }
  }) as EventListener);

  addWindowListener(cleanup, "three-official-controller-squeeze", ((event: Event) => {
    const detail = (event as CustomEvent<SyntheticControllerSelectDetail>).detail;
    if (!isControllerHand(detail?.hand)) {
      return;
    }

    const controller = controllers[detail.hand];
    if (detail.phase === "start") {
      onSqueezeStart(detail.hand, controller, detail);
    } else if (detail.phase === "end") {
      onSqueezeEnd(detail.hand, controller, detail);
    }
  }) as EventListener);

  addWindowListener(cleanup, "three-official-quick-menu", ((event: Event) => {
    onQuickMenu((event as CustomEvent<SyntheticQuickMenuDetail>).detail);
  }) as EventListener);
  addWindowListener(cleanup, "three-official-menu-toggle", onMenuToggle as EventListener);
  addWindowListener(cleanup, "three-official-record-toggle", onRecordToggle as EventListener);
  addWindowListener(cleanup, "three-official-thumbstick", ((event: Event) => {
    onThumbstick((event as CustomEvent<SyntheticThumbstickDetail>).detail);
  }) as EventListener);

  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("pointerup", onCanvasPointerUp);
  cleanup.push(() => {
    canvas.removeEventListener("pointerdown", onCanvasPointerDown);
    canvas.removeEventListener("pointerup", onCanvasPointerUp);
  });

  return () => {
    cleanup.forEach((remove) => remove());
  };
}
