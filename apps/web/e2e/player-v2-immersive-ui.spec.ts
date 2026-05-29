import { expect, test, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

test.use({ ignoreHTTPSErrors: true });
test.setTimeout(60_000);

const repoRoot = path.resolve(process.cwd(), "..", "..");
const gridVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");

type Center = {
  pitch: number;
  yaw: number;
};

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYaw(yaw: number) {
  let nextYaw = yaw;

  while (nextYaw > 180) {
    nextYaw -= 360;
  }
  while (nextYaw < -180) {
    nextYaw += 360;
  }

  return Object.is(nextYaw, -0) ? 0 : nextYaw;
}

function directionToCenter(direction: Vector3): Center {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;

  return {
    pitch: Math.asin(clamp(y, -1, 1)) * 180 / Math.PI,
    yaw: normalizeYaw(Math.atan2(x, -z) * 180 / Math.PI)
  };
}

function angularDistance(a: Center, b: Center) {
  let yawDelta = a.yaw - b.yaw;
  if (yawDelta > 180) {
    yawDelta -= 360;
  }
  if (yawDelta < -180) {
    yawDelta += 360;
  }
  return Math.hypot(yawDelta, a.pitch - b.pitch);
}

async function registerTestUser(page: Page) {
  const email = `player-v2-immersive-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "secret123";
  const register = await page.request.post("/api/auth/register", {
    data: { email, password }
  });

  expect(register.status()).toBe(200);
}

async function createGridSession(page: Page) {
  await registerTestUser(page);

  const upload = await page.request.post("/api/videos/upload", {
    multipart: {
      file: {
        buffer: readFileSync(gridVideoPath),
        mimeType: "video/mp4",
        name: "equirect-grid.mp4"
      }
    }
  });
  expect(upload.status()).toBe(200);
  const video = (await upload.json()) as { id: string };
  const sessionId = `session_player_v2_immersive_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const session = await page.request.post("/api/cut-sessions", {
    data: {
      output: {
        aspect: "16:9",
        fps: 30,
        height: 1080,
        width: 1920
      },
      sessionId,
      source: "webxr",
      timelineRevision: 1,
      version: 1,
      videoId: video.id
    }
  });
  expect(session.status()).toBe(200);

  return { sessionId, videoId: video.id };
}

async function openForcedImmersivePlayer(page: Page) {
  await registerTestUser(page);
  const response = await page.goto("/xr/player-v2?forceImmersiveUi=1", { waitUntil: "commit" });

  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId("player-v2-ui-overlay")).toHaveCount(0);
  await expect(page.getByTestId("player-v2-immersive-state")).toBeAttached();
  await expect(page.getByTestId("hybrid-skin-player-bar")).toBeAttached();
  await expect(page.getByTestId("arwes-workbench-spatial-table")).toBeAttached();
}

async function openForcedImmersivePlayerWithMaskProbe(page: Page) {
  await registerTestUser(page);
  const response = await page.goto("/xr/player-v2?forceImmersiveUi=1&vrMaskProbe=1", { waitUntil: "commit" });

  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId("player-v2-immersive-state")).toBeAttached();
}

async function openDebugImmersiveEntryPlayer(page: Page) {
  const response = await page.goto("/xr/player-v2?xrDebug=1", { waitUntil: "commit" });

  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached({ timeout: 30_000 });
  await expect(page.getByTestId("player-v2-metavr-button")).toBeVisible();
  await expect(page.getByTestId("player-v2-metavr-button")).toBeEnabled({ timeout: 20_000 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector("video#player-v2-video") as HTMLVideoElement | null;
        return video?.readyState ?? 0;
      })
    )
    .toBeGreaterThan(1);
}

async function dispatchControllerEvent(page: Page, eventName: string, hand: "left" | "right" = "right") {
  await page.evaluate(
    ({ eventName: nextEventName, hand: nextHand }) => {
      const scene = document.querySelector("a-scene");
      scene?.dispatchEvent(new CustomEvent(nextEventName, {
        bubbles: true,
        detail: { hand: nextHand }
      }));
    },
    { eventName, hand }
  );
}

async function dispatchDualGrip(page: Page, eventName: "gripdown" | "gripup") {
  await page.evaluate((nextEventName) => {
    const scene = document.querySelector("a-scene");

    scene?.dispatchEvent(new CustomEvent(nextEventName, {
      bubbles: true,
      detail: { hand: "left" }
    }));
    scene?.dispatchEvent(new CustomEvent(nextEventName, {
      bubbles: true,
      detail: { hand: "right" }
    }));
  }, eventName);
}

async function dispatchRightControllerTriggerUp(page: Page) {
  await page.evaluate(() => {
    const controller = document.querySelector("#right-controller");
    controller?.dispatchEvent(new CustomEvent("triggerup", {
      bubbles: true,
      detail: { hand: "right" }
    }));
  });
}

async function readMaskCenter(page: Page): Promise<Center> {
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { center?: Center }> })
      | null;
    return Boolean(el?.components?.["pc-crop-viewport-mask"]?.center);
  }, { timeout: 30_000 });

  return page.evaluate(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { center?: Center }> })
      | null;
    const center = el?.components?.["pc-crop-viewport-mask"]?.center;

    if (!center) {
      throw new Error("Mask center unavailable");
    }

    return {
      pitch: center.pitch,
      yaw: center.yaw
    };
  });
}

async function setMockXrControllerState(
  page: Page,
  state: {
    leftAxes?: number[];
    leftGrip?: boolean;
    rightAxes?: number[];
    rightGrip?: boolean;
  }
) {
  await page.waitForFunction(() => {
    const scene = document.querySelector("a-scene") as (HTMLElement & { hasLoaded?: boolean }) | null;
    return Boolean(scene?.hasLoaded);
  });
  await page.evaluate((nextState) => {
    type MockGamepad = {
      axes: number[];
      buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
    };
    type MockInputSource = {
      gamepad: MockGamepad;
      handedness: "left" | "right";
    };
    type MockScene = HTMLElement & {
      __playerV2MockXrInputSources?: MockInputSource[];
      xrSession?: {
        inputSources: MockInputSource[];
      };
    };

    const createButtons = (gripPressed: boolean) =>
      Array.from({ length: 6 }, (_, index) => {
        const pressed = index === 1 && gripPressed;
        return {
          pressed,
          touched: pressed,
          value: pressed ? 1 : 0
        };
      });

    const scene = document.querySelector("a-scene") as MockScene | null;
    if (!scene) {
      throw new Error("A-Frame scene unavailable");
    }

    const left: MockInputSource = {
      gamepad: {
        axes: nextState.leftAxes ?? [0, 0, 0, 0],
        buttons: createButtons(nextState.leftGrip === true)
      },
      handedness: "left"
    };
    const right: MockInputSource = {
      gamepad: {
        axes: nextState.rightAxes ?? [0, 0, 0, 0],
        buttons: createButtons(nextState.rightGrip === true)
      },
      handedness: "right"
    };

    scene.__playerV2MockXrInputSources = [left, right];
    Object.defineProperty(scene, "xrSession", {
      configurable: true,
      value: {
        inputSources: scene.__playerV2MockXrInputSources
      }
    });
  }, state);
}

async function clickSpatialTarget(page: Page, testId: string) {
  await page.evaluate((nextTestId) => {
    const target = document.querySelector(`[data-testid="${nextTestId}"]`);
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, testId);
}

async function openTransitionEffectRingLevel(page: Page) {
  await expect(page.getByTestId("spatial-effect-ring-hit-category-transition")).toBeAttached();
  await clickSpatialTarget(page, "spatial-effect-ring-hit-category-transition");
  await expect(page.getByTestId("spatial-effect-ring-hit-effect-vhs-blank")).toBeAttached();
}

async function forceSceneCameraDirection(page: Page, center: Center) {
  await page.waitForFunction(() => {
    const browserWindow = window as unknown as { AFRAME?: unknown };
    const scene = document.querySelector("a-scene") as (HTMLElement & { camera?: unknown; hasLoaded?: boolean }) | null;
    return Boolean(browserWindow.AFRAME && scene?.hasLoaded && scene.camera);
  });
  await page.evaluate((nextCenter) => {
    const browserWindow = window as unknown as {
      AFRAME?: { THREE?: { Vector3?: new (x?: number, y?: number, z?: number) => Vector3 } };
    };
    const THREE = browserWindow.AFRAME?.THREE;
    const scene = document.querySelector("a-scene") as
      | (HTMLElement & {
          camera?: {
            getWorldDirection?: (target: Vector3) => Vector3;
          };
        })
      | null;

    if (!THREE?.Vector3 || !scene?.camera) {
      throw new Error("A-Frame scene camera unavailable");
    }

    const pitchRad = nextCenter.pitch * Math.PI / 180;
    const yawRad = nextCenter.yaw * Math.PI / 180;
    const cosPitch = Math.cos(pitchRad);
    const direction = new THREE.Vector3(
      Math.sin(yawRad) * cosPitch,
      Math.sin(pitchRad),
      -Math.cos(yawRad) * cosPitch
    );

    scene.camera.getWorldDirection = (target: Vector3) => {
      target.x = direction.x;
      target.y = direction.y;
      target.z = direction.z;
      return target;
    };
  }, center);
}

async function aimRightControllerAtMaskCenter(page: Page, center: Center) {
  await page.waitForFunction(() => {
    const browserWindow = window as unknown as { AFRAME?: unknown };
    const scene = document.querySelector("a-scene") as (HTMLElement & { hasLoaded?: boolean }) | null;
    const controller = document.querySelector("#right-controller") as
      | (HTMLElement & {
          components?: {
            raycaster?: {
              objects?: unknown[];
            };
          };
        })
      | null;
    return Boolean(browserWindow.AFRAME && scene?.hasLoaded && controller?.components?.raycaster?.objects);
  });

  return page.evaluate(async (nextCenter) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    type BrowserVector3 = {
      add(value: unknown): BrowserVector3;
      clone(): BrowserVector3;
      normalize(): BrowserVector3;
      set(x: number, y: number, z: number): BrowserVector3;
      sub(value: unknown): BrowserVector3;
      toArray(): number[];
      x: number;
      y: number;
      z: number;
    };

    const browserWindow = window as unknown as {
      AFRAME?: { THREE?: { Vector3?: new (x?: number, y?: number, z?: number) => BrowserVector3 } };
    };
    const THREE = browserWindow.AFRAME?.THREE;
    const scene = document.querySelector("a-scene") as
      | (HTMLElement & {
          object3D?: { updateMatrixWorld(force?: boolean): void };
        })
      | null;
    const controller = document.querySelector("#right-controller") as
      | (HTMLElement & {
          components?: {
            raycaster?: {
              checkIntersections(): void;
              intersections?: Array<{
                distance: number;
                object: {
                  el?: HTMLElement;
                };
                point?: BrowserVector3;
              }>;
              raycaster?: {
                ray?: {
                  direction?: Vector3;
                };
              };
              refreshObjects(): void;
            };
          };
          object3D?: {
            getWorldDirection(target: BrowserVector3): BrowserVector3;
            lookAt(target: unknown): void;
            position: { copy(value: unknown): void };
            updateMatrixWorld(force?: boolean): void;
          };
        })
      | null;
    const background = document.querySelector("[data-testid='pc-mask-background-hit-target']") as
      | (HTMLElement & {
          object3D?: {
            getWorldPosition(target: unknown): void;
          };
        })
      | null;

    if (!THREE?.Vector3 || !scene?.object3D || !controller?.object3D || !background?.object3D) {
      throw new Error("Controller ray test scene unavailable");
    }

    const pitchRad = nextCenter.pitch * Math.PI / 180;
    const yawRad = nextCenter.yaw * Math.PI / 180;
    const cosPitch = Math.cos(pitchRad);
    const direction = new THREE.Vector3(
      Math.sin(yawRad) * cosPitch,
      Math.sin(pitchRad),
      -Math.cos(yawRad) * cosPitch
    ).normalize();

    scene.object3D.updateMatrixWorld(true);
    const sphereCenter = new THREE.Vector3();
    background.object3D.getWorldPosition(sphereCenter);
    const origin = sphereCenter.clone().add(new THREE.Vector3(0.62, -0.24, 0.46));
    const aimThrough = origin.clone().sub(direction);

    controller.object3D.position.copy(origin);
    controller.object3D.lookAt(aimThrough);
    controller.object3D.updateMatrixWorld(true);

    const raycaster = controller.components?.raycaster;
    raycaster?.refreshObjects();
    raycaster?.checkIntersections();

    const objectDirection = new THREE.Vector3();
    controller.object3D.getWorldDirection(objectDirection);
    const rayDirection = raycaster?.raycaster?.ray?.direction ?? null;
    const backgroundHit = raycaster?.intersections?.find((hit) =>
      hit.object.el?.getAttribute("data-testid") === "pc-mask-background-hit-target"
    );
    const backgroundHitDirection = backgroundHit?.point ? backgroundHit.point.clone().sub(sphereCenter).normalize() : null;
    const hits = (raycaster?.intersections ?? []).slice(0, 8).map((hit) => ({
      distance: Number(hit.distance.toFixed(4)),
      testId: hit.object.el?.getAttribute("data-testid") ?? null
    }));

    return {
      closestTestId: hits[0]?.testId ?? null,
      hitTestIds: hits.map((hit) => hit.testId),
      backgroundHitDirection: backgroundHitDirection
        ? {
            x: backgroundHitDirection.x,
            y: backgroundHitDirection.y,
            z: backgroundHitDirection.z
          }
        : null,
      objectDirection: {
        x: objectDirection.x,
        y: objectDirection.y,
        z: objectDirection.z
      },
      origin: origin.toArray(),
      rayDirection: rayDirection
        ? {
            x: rayDirection.x,
            y: rayDirection.y,
            z: rayDirection.z
          }
        : null,
      sphereCenter: sphereCenter.toArray()
    };
  }, center);
}

async function forceWorkbenchXrPose(page: Page) {
  await page.waitForFunction(() => {
    const scene = document.querySelector("a-scene") as (HTMLElement & { hasLoaded?: boolean }) | null;
    return Boolean(scene?.hasLoaded);
  });
  await page.evaluate(() => {
    const scene = document.querySelector("a-scene") as
      | (HTMLElement & {
          __playerV2WorkbenchOriginalIs?: (state: string) => boolean;
          is?: (state: string) => boolean;
        })
      | null;

    if (!scene) {
      return;
    }

    scene.__playerV2WorkbenchOriginalIs ??= scene.is?.bind(scene);
    const originalIs = scene.__playerV2WorkbenchOriginalIs;
    scene.is = (state: string) => state === "vr-mode" || Boolean(originalIs?.(state));
    scene.dispatchEvent(new Event("enter-vr", { bubbles: true }));
  });
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const table = document.querySelector('[data-testid="arwes-workbench-spatial-table"]') as
          | (HTMLElement & {
              getAttribute(name: "position"): { y?: number; z?: number } | string | null;
            })
          | null;
        const position = table?.getAttribute("position");

        if (!position || typeof position === "string") {
          return "";
        }

        return `${position.y?.toFixed(2)} ${position.z?.toFixed(2)}`;
      })
    )
    .toBe("0.92 -0.72");
}

async function probeRightControllerRayHit(page: Page, testId: string) {
  await page.waitForFunction(() => {
    const browserWindow = window as unknown as { AFRAME?: unknown };
    const scene = document.querySelector("a-scene") as (HTMLElement & { hasLoaded?: boolean }) | null;
    const controller = document.querySelector("#right-controller") as
      | (HTMLElement & {
          components?: {
            raycaster?: {
              objects?: unknown[];
            };
          };
        })
      | null;

    return Boolean(browserWindow.AFRAME && scene?.hasLoaded && controller?.components?.raycaster?.objects);
  });

  return page.evaluate(async (nextTestId) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const browserWindow = window as any;
    const THREE = browserWindow.AFRAME?.THREE;
    const scene = document.querySelector("a-scene") as
      | (HTMLElement & {
          object3D?: { updateMatrixWorld(force?: boolean): void };
        })
      | null;
    const controller = document.querySelector("#right-controller") as
      | (HTMLElement & {
          components?: {
            raycaster?: {
              checkIntersections(): void;
              intersections?: Array<{
                distance: number;
                object: {
                  el?: HTMLElement;
                };
              }>;
              refreshObjects(): void;
            };
          };
          object3D?: {
            lookAt(target: unknown): void;
            position: { copy(value: unknown): void };
            updateMatrixWorld(force?: boolean): void;
          };
        })
      | null;
    const target = document.querySelector(`[data-testid="${nextTestId}"]`) as
      | (HTMLElement & {
          object3D?: {
            getWorldPosition(target: unknown): void;
            updateMatrixWorld(force?: boolean): void;
          };
        })
      | null;

    if (!THREE || !scene?.object3D || !controller?.object3D || !target?.object3D) {
      return { closestTestId: null, hitTestIds: [] as Array<string | null>, ready: false };
    }

    scene.object3D.updateMatrixWorld(true);
    target.object3D.updateMatrixWorld(true);

    const targetPosition = new THREE.Vector3();
    target.object3D.getWorldPosition(targetPosition);
    const origin = targetPosition.clone().add(new THREE.Vector3(0.28, 0.22, 0.48));
    const aimThrough = origin.clone().sub(targetPosition.clone().sub(origin));

    controller.object3D.position.copy(origin);
    controller.object3D.lookAt(aimThrough);
    controller.object3D.updateMatrixWorld(true);

    const raycaster = controller.components?.raycaster;
    raycaster?.refreshObjects();
    raycaster?.checkIntersections();

    const hits = (raycaster?.intersections ?? []).slice(0, 8).map((hit) => ({
      distance: Number(hit.distance.toFixed(4)),
      testId: hit.object.el?.getAttribute("data-testid") ?? null
    }));

    return {
      closestTestId: hits[0]?.testId ?? null,
      hitTestIds: hits.map((hit) => hit.testId),
      hits,
      origin: origin.toArray(),
      ready: true,
      targetPosition: targetPosition.toArray()
    };
  }, testId);
}

async function clickSpatialTargetWithRightController(page: Page, testId: string) {
  await probeRightControllerRayHit(page, testId);
  await page.evaluate(async () => {
    const controller = document.querySelector("#right-controller");

    controller?.dispatchEvent(new CustomEvent("triggerdown", {
      bubbles: true,
      detail: { hand: "right" }
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    controller?.dispatchEvent(new CustomEvent("triggerup", {
      bubbles: true,
      detail: { hand: "right" }
    }));
  });
}

async function readWorkbenchTextureHealth(page: Page) {
  return page.evaluate(() => {
    const readPlane = (testId: string) => {
      const element = document.querySelector(`[data-testid="${testId}"]`) as
        | (HTMLElement & {
            object3D?: {
              getObjectByProperty?: (name: string, value: string) => {
                material?: {
                  map?: {
                    image?: {
                      id?: string;
                      isConnected?: boolean;
                    };
                  };
                  visible?: boolean;
                };
              };
            };
          })
        | null;
      const mesh = element?.object3D?.getObjectByProperty?.("type", "Mesh");
      const image = mesh?.material?.map?.image;

      return {
        attached: Boolean(element),
        imageConnected: image?.isConnected === true,
        imageId: image?.id ?? null,
        materialVisible: mesh?.material?.visible === true
      };
    };

    return {
      base: readPlane("arwes-workbench-spatial-table-base-plane"),
      controls: readPlane("arwes-workbench-spatial-table-control-plane"),
      sourceCanvasCount: document.querySelectorAll("canvas.arwes-spatial-texture-source").length,
      text: readPlane("arwes-workbench-spatial-table-text-plane")
    };
  });
}

function readPostJson(request: Request): unknown {
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
}

test("Player V2 forced immersive mode exposes 3D UI and routes Quest controller bindings through EventBus", async ({ page }) => {
  await openForcedImmersivePlayer(page);

  const state = page.getByTestId("player-v2-immersive-state");
  await expect
    .poll(async () => Number(await state.getAttribute("data-effect-catalog-count")))
    .toBeGreaterThan(0);

  await dispatchControllerEvent(page, "bbuttondown");
  await expect(state).toHaveAttribute("data-right-b-pressed", "true");
  await expect(state).toHaveAttribute("data-effect-mode", "category");
  await expect(page.getByTestId("spatial-effect-ring-menu")).toBeAttached();

  await dispatchControllerEvent(page, "abuttondown");
  await expect(state).toHaveAttribute("data-right-a-pressed", "true");

  const initialPitch = Number(await state.getAttribute("data-mask-pitch"));
  await dispatchControllerEvent(page, "thumbstickup", "left");
  await expect
    .poll(async () => Number(await state.getAttribute("data-mask-pitch")))
    .toBeGreaterThan(initialPitch + 3);

  await dispatchControllerEvent(page, "xbuttondown");
  await expect(state).toHaveAttribute("data-right-x-pressed", "true");
  await dispatchControllerEvent(page, "xbuttonup");
  await expect(state).toHaveAttribute("data-right-x-pressed", "false");

  await dispatchControllerEvent(page, "ybuttondown");
  await expect(state).toHaveAttribute("data-right-y-pressed", "true");
  await dispatchControllerEvent(page, "ybuttonup");
  await expect(state).toHaveAttribute("data-right-y-pressed", "false");

  await clickSpatialTarget(page, "arwes-workbench-region-hit-start");
  await expect(state).toHaveAttribute("data-recording-active", "true");
  await clickSpatialTarget(page, "arwes-workbench-region-hit-start");
  await expect(state).toHaveAttribute("data-recording-active", "false");

  await openTransitionEffectRingLevel(page);
  await clickSpatialTarget(page, "spatial-effect-ring-hit-effect-vhs-blank");
  await expect(state).toHaveAttribute("data-effect-mode", "selected");

  await dispatchControllerEvent(page, "bbuttonup");
  await expect(state).toHaveAttribute("data-right-b-pressed", "false");
});

test("Player V2 forced immersive controller toggles coexist with held VR modifiers", async ({ page }) => {
  await openForcedImmersivePlayer(page);

  const state = page.getByTestId("player-v2-immersive-state");
  await clickSpatialTarget(page, "arwes-workbench-region-hit-start");
  await expect(state).toHaveAttribute("data-recording-active", "true");

  await dispatchControllerEvent(page, "abuttondown", "right");
  await dispatchControllerEvent(page, "abuttonup", "right");
  await expect
    .poll(async () => Number(await state.getAttribute("data-playback-rate")), { timeout: 5000 })
    .toBeLessThan(0.12);

  await dispatchControllerEvent(page, "xbuttondown", "left");
  await expect(state).toHaveAttribute("data-left-x-pressed", "true");
  await expect(state).toHaveAttribute("data-discard-active", "true");
  await dispatchControllerEvent(page, "xbuttonup", "left");
  await expect(state).toHaveAttribute("data-left-x-pressed", "false");
  await expect(state).toHaveAttribute("data-discard-active", "true");

  await dispatchControllerEvent(page, "triggerdown", "left");
  await dispatchControllerEvent(page, "triggerdown", "right");
  await expect(state).toHaveAttribute("data-left-trigger-pressed", "true");
  await expect(state).toHaveAttribute("data-right-trigger-pressed", "true");

  await dispatchControllerEvent(page, "gripdown", "left");
  await dispatchControllerEvent(page, "gripdown", "right");
  await expect(state).toHaveAttribute("data-left-grip-pressed", "true");
  await expect(state).toHaveAttribute("data-right-grip-pressed", "true");

  await dispatchControllerEvent(page, "ybuttondown", "right");
  await expect(state).toHaveAttribute("data-right-y-pressed", "true");
  await dispatchControllerEvent(page, "thumbstickup", "right");
  await expect(state).toHaveAttribute("data-discard-active", "true");

  await dispatchControllerEvent(page, "xbuttondown", "left");
  await expect(state).toHaveAttribute("data-discard-active", "false");
  await dispatchControllerEvent(page, "xbuttonup", "left");

  await dispatchControllerEvent(page, "abuttondown", "right");
  await dispatchControllerEvent(page, "abuttonup", "right");
  await expect
    .poll(async () => Number(await state.getAttribute("data-playback-rate")), { timeout: 5000 })
    .toBeGreaterThan(0.9);

  await dispatchControllerEvent(page, "ybuttonup", "right");
  await dispatchControllerEvent(page, "gripup", "left");
  await dispatchControllerEvent(page, "gripup", "right");
  await dispatchControllerEvent(page, "triggerup", "left");
  await dispatchControllerEvent(page, "triggerup", "right");
});

test("Player V2 forced immersive right controller ray hits the XR workbench table", async ({ page }) => {
  await openForcedImmersivePlayer(page);
  await forceWorkbenchXrPose(page);

  await expect
    .poll(async () => {
      const probe = await probeRightControllerRayHit(page, "arwes-workbench-region-hit-start");
      return probe.closestTestId ?? probe.hitTestIds.join(">");
    })
    .toBe("arwes-workbench-region-hit-start");

  const probe = await probeRightControllerRayHit(page, "arwes-workbench-region-hit-start");
  expect(probe.hitTestIds).toContain("arwes-workbench-spatial-table-hit-plane");
  expect(probe.hitTestIds.indexOf("arwes-workbench-region-hit-start")).toBeLessThan(
    probe.hitTestIds.indexOf("pc-mask-background-hit-target")
  );

  await clickSpatialTargetWithRightController(page, "arwes-workbench-region-hit-start");
  await expect(page.getByTestId("player-v2-immersive-state")).toHaveAttribute("data-recording-active", "true");
  await page.waitForTimeout(3600);
  await expect.poll(async () => readWorkbenchTextureHealth(page)).toEqual({
    base: {
      attached: true,
      imageConnected: true,
      imageId: "arwes-workbench-spatial-table-base",
      materialVisible: true
    },
    controls: {
      attached: true,
      imageConnected: true,
      imageId: "arwes-workbench-spatial-table-controls",
      materialVisible: true
    },
    sourceCanvasCount: 3,
    text: {
      attached: true,
      imageConnected: true,
      imageId: "arwes-workbench-spatial-table-text",
      materialVisible: true
    }
  });
});

test("Player V2 forced immersive background trigger uses the background sphere hit point", async ({ page }) => {
  await openForcedImmersivePlayer(page);

  const expectedCenter = { pitch: -14, yaw: 56 };
  const probe = await aimRightControllerAtMaskCenter(page, expectedCenter);
  expect(probe.closestTestId).toBe("pc-mask-background-hit-target");
  expect(probe.rayDirection).not.toBeNull();
  expect(probe.backgroundHitDirection).not.toBeNull();

  if (!probe.rayDirection || !probe.backgroundHitDirection) {
    throw new Error("Right controller ray direction unavailable");
  }

  const expectedHitCenter = directionToCenter(probe.backgroundHitDirection);

  expect(angularDistance(directionToCenter(probe.rayDirection), expectedCenter)).toBeLessThan(0.8);
  expect(angularDistance(directionToCenter({
    x: -probe.objectDirection.x,
    y: -probe.objectDirection.y,
    z: -probe.objectDirection.z
  }), expectedCenter)).toBeLessThan(0.8);

  await dispatchRightControllerTriggerUp(page);
  await expect
    .poll(async () => angularDistance(await readMaskCenter(page), expectedHitCenter), { timeout: 5000 })
    .toBeLessThan(1.5);
});

test("Player V2 forced immersive mask probe drives the mask without controller input", async ({ page }) => {
  await openForcedImmersivePlayerWithMaskProbe(page);

  const start = await readMaskCenter(page);
  await expect
    .poll(async () => angularDistance(await readMaskCenter(page), start), { timeout: 5000 })
    .toBeGreaterThan(4);

  const state = page.getByTestId("player-v2-immersive-state");
  const opacity = Number(await state.getAttribute("data-mask-opacity"));
  await expect
    .poll(async () => Math.abs(Number(await state.getAttribute("data-mask-opacity")) - opacity), { timeout: 5000 })
    .toBeGreaterThan(0.03);
});

test("Player V2 forced immersive left stick uses the smoothed center step path", async ({ page }) => {
  await openForcedImmersivePlayer(page);

  await page.evaluate(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']");
    el?.setAttribute("pc-crop-viewport-mask", "locked: false");
  });

  const start = await readMaskCenter(page);
  await setMockXrControllerState(page, {
    leftAxes: [0, 0, 0.78, -0.62]
  });

  await expect
    .poll(async () => angularDistance(await readMaskCenter(page), start), { timeout: 5000 })
    .toBeGreaterThan(3);

  const moved = await readMaskCenter(page);
  expect(moved.yaw).toBeGreaterThan(start.yaw + 1);
  expect(moved.pitch).toBeGreaterThan(start.pitch + 1);
  await expect(page.getByTestId("player-v2-immersive-state")).toHaveAttribute("data-mask-locked", "true");

  await setMockXrControllerState(page, {
    leftAxes: [0, 0, 0, 0]
  });
  const released = await readMaskCenter(page);
  await page.waitForTimeout(220);
  const afterRelease = await readMaskCenter(page);
  expect(angularDistance(afterRelease, released)).toBeLessThan(0.8);
});

test("Player V2 forced immersive right stick uses the smoothed opacity path", async ({ page }) => {
  await openForcedImmersivePlayer(page);

  const state = page.getByTestId("player-v2-immersive-state");
  const initialOpacity = Number(await state.getAttribute("data-mask-opacity"));
  await setMockXrControllerState(page, {
    rightAxes: [0, 0, 0, -0.82]
  });

  await expect
    .poll(async () => Number(await state.getAttribute("data-mask-opacity")), { timeout: 5000 })
    .toBeGreaterThan(initialOpacity + 0.03);

  await setMockXrControllerState(page, {
    rightAxes: [0, 0, 0, 0]
  });
});

test("Player V2 MetaVR debug entry keeps keyboard recording and writes backend path patches", async ({ page }) => {
  const session = await createGridSession(page);
  await openDebugImmersiveEntryPlayer(page);

  await page.getByTestId("player-v2-metavr-button").click();
  await expect(page.getByTestId("player-v2-debug-stereo-view")).toBeAttached();
  await expect(page.getByTestId("player-v2-debug-stereo-left")).toBeAttached();
  await expect(page.getByTestId("player-v2-debug-stereo-right")).toBeAttached();
  await expect(page.getByTestId("player-v2-ui-overlay")).toHaveCount(0);
  await expect(page.getByTestId("hybrid-skin-player-bar")).toBeAttached();
  await expect(page.getByTestId("arwes-workbench-spatial-table")).toBeAttached();

  const state = page.getByTestId("player-v2-immersive-state");
  await page.keyboard.press("Shift+KeyR");
  await expect(state).toHaveAttribute("data-recording-active", "true");

  await page.keyboard.press("KeyD");
  await page.waitForTimeout(180);

  const pathPatchResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`)
  );
  await page.keyboard.press("KeyR");
  await expect(state).toHaveAttribute("data-recording-active", "false");

  const response = await pathPatchResponse;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { acceptedPoints?: number; status?: string };
  expect(body.status).toBe("accepted");
  expect(body.acceptedPoints ?? 0).toBeGreaterThan(0);

  await clickSpatialTargetWithRightController(page, "arwes-workbench-region-hit-start");
  await expect(state).toHaveAttribute("data-recording-active", "true");

  const finalizeResponse = page.waitForResponse((nextResponse) =>
    nextResponse.request().method() === "POST" &&
    nextResponse.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/finalize-recording`)
  );
  await page.waitForTimeout(1200);
  await clickSpatialTargetWithRightController(page, "arwes-workbench-region-hit-start");
  await expect(state).toHaveAttribute("data-recording-active", "false");

  expect((await finalizeResponse).status()).toBe(200);
});

test("Player V2 immersive effect ring writes a real backend effect event", async ({ page }) => {
  const session = await createGridSession(page);
  await openDebugImmersiveEntryPlayer(page);

  await page.getByTestId("player-v2-metavr-button").click();
  await expect(page.getByTestId("player-v2-debug-stereo-view")).toBeAttached();
  await expect(page.getByTestId("player-v2-ui-overlay")).toHaveCount(0);

  const state = page.getByTestId("player-v2-immersive-state");
  await expect
    .poll(async () => Number(await state.getAttribute("data-effect-catalog-count")))
    .toBeGreaterThan(0);

  await dispatchControllerEvent(page, "bbuttondown");
  await expect(state).toHaveAttribute("data-effect-mode", "category");
  await expect(page.getByTestId("spatial-effect-ring-menu")).toBeAttached();
  await openTransitionEffectRingLevel(page);

  const effectEventResponse = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    if (!response.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`)) {
      return false;
    }

    const body = readPostJson(response.request()) as {
      events?: Array<{
        displayName?: string;
        eventName?: string;
      }>;
    } | null;
    return Boolean(body?.events?.some((event) => event.eventName === "black.solid" && event.displayName === "VHS blank"));
  });

  await clickSpatialTarget(page, "spatial-effect-ring-hit-effect-vhs-blank");
  await expect(state).toHaveAttribute("data-effect-mode", "selected");

  const response = await effectEventResponse;
  expect(response.status()).toBe(200);
  const responseBody = (await response.json()) as { acceptedEvents?: number; status?: string };
  expect(responseBody.status).toBe("accepted");
  expect(responseBody.acceptedEvents ?? 0).toBeGreaterThan(0);

  await dispatchControllerEvent(page, "bbuttonup");
});
