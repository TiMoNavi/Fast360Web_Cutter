import { expect, test, type Page } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });
test.setTimeout(90_000);

type Center = {
  pitch: number;
  yaw: number;
};

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

async function registerUser(page: Page) {
  const email = `player-v2-motion-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "secret123";
  const register = await page.request.post("/api/auth/register", {
    data: { email, password }
  });
  expect(register.status()).toBe(200);
}

async function openPlayerV2(page: Page) {
  await registerUser(page);
  const response = await page.goto("/xr/player-v2", { waitUntil: "commit" });
  expect(response?.status()).toBeLessThan(400);
  await page.waitForFunction(() => Boolean(window.AFRAME), { timeout: 20_000 });
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible();
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached();
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { initialized?: boolean }> })
      | null;
    return Boolean(el?.components?.["pc-crop-viewport-mask"]?.initialized);
  });
}

async function readMaskCenter(page: Page): Promise<Center> {
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

async function readMaskFov(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { fovH?: number }> })
      | null;
    const fovH = el?.components?.["pc-crop-viewport-mask"]?.fovH;

    if (typeof fovH !== "number") {
      throw new Error("Mask FOV unavailable");
    }

    return fovH;
  });
}

async function readMaskOpacity(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { opacityValue?: number }> })
      | null;
    const opacity = el?.components?.["pc-crop-viewport-mask"]?.opacityValue;

    if (typeof opacity !== "number") {
      throw new Error("Mask opacity unavailable");
    }

    return opacity;
  });
}

async function readMaskRoll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { roll?: number }> })
      | null;
    const roll = el?.components?.["pc-crop-viewport-mask"]?.roll;

    if (typeof roll !== "number") {
      throw new Error("Mask roll unavailable");
    }

    return roll;
  });
}

async function readArcPose(page: Page): Promise<{ rootRotation: Vector3; topLeftPosition: Vector3 }> {
  return page.evaluate(() => {
    const readVector = (value: unknown) => {
      if (!value || typeof value === "string") {
        throw new Error("A-Frame vector unavailable");
      }

      const vector = value as { x?: number; y?: number; z?: number };
      return {
        x: Number(vector.x ?? 0),
        y: Number(vector.y ?? 0),
        z: Number(vector.z ?? 0)
      };
    };
    const root = document.querySelector("[data-testid='aframe-crop-viewport-arcs']") as
      | (Element & { getAttribute: (name: string) => unknown })
      | null;
    const topLeft = document.querySelector("[data-testid='aframe-crop-arc-top-left']") as
      | (Element & { getAttribute: (name: string) => unknown })
      | null;

    if (!root || !topLeft) {
      throw new Error("Crop viewport arcs unavailable");
    }

    return {
      rootRotation: readVector(root.getAttribute("rotation")),
      topLeftPosition: readVector(topLeft.getAttribute("position"))
    };
  });
}

async function readCameraCenter(page: Page): Promise<Center> {
  return page.evaluate(() => {
    const camera = document.querySelector("#main-camera") as
      | (Element & { getAttribute: (name: string) => { x?: number; y?: number } | string | null })
      | null;
    const rotation = camera?.getAttribute("rotation");

    if (!rotation || typeof rotation === "string") {
      throw new Error("Camera rotation unavailable");
    }

    const vector = rotation as { x?: number; y?: number };

    return {
      pitch: Number(vector.x ?? 0),
      yaw: -Number(vector.y ?? 0)
    };
  });
}

async function readCameraFov(page: Page): Promise<number> {
  return page.evaluate(() => {
    const camera = document.querySelector("#main-camera") as
      | (Element & { getAttribute: (name: "camera") => unknown })
      | null;
    const cameraAttr = camera?.getAttribute("camera") as { fov?: unknown } | string | null | undefined;

    if (!cameraAttr || typeof cameraAttr !== "object" || typeof cameraAttr.fov !== "number") {
      throw new Error("Camera FOV unavailable");
    }

    return cameraAttr.fov;
  });
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

test("Player V2 WASD motion accelerates continuously and opposing keys cancel", async ({ page }) => {
  await openPlayerV2(page);
  const start = await readMaskCenter(page);

  await page.keyboard.down("KeyD");
  await page.waitForTimeout(95);
  const early = await readMaskCenter(page);
  expect(early.yaw).toBeGreaterThan(start.yaw + 0.05);
  expect(early.yaw).toBeLessThan(start.yaw + 4.5);

  await page.waitForTimeout(240);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(260);
  const afterStop = await readMaskCenter(page);
  expect(afterStop.yaw).toBeGreaterThan(early.yaw);

  await page.keyboard.down("KeyA");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(240);
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(180);
  const afterCancel = await readMaskCenter(page);
  expect(Math.abs(afterCancel.yaw - afterStop.yaw)).toBeLessThan(1.2);
});

test("Player V2 Q/E zoom accelerates smoothly and opposing keys brake", async ({ page }) => {
  await openPlayerV2(page);
  const start = await readMaskFov(page);

  await page.keyboard.down("KeyE");
  await page.waitForTimeout(95);
  const early = await readMaskFov(page);
  expect(early).toBeGreaterThan(start + 0.05);
  expect(early).toBeLessThan(start + 5);

  await page.waitForTimeout(220);
  const moving = await readMaskFov(page);
  expect(moving).toBeGreaterThan(early);

  await page.keyboard.down("KeyQ");
  await page.waitForTimeout(180);
  const braking = await readMaskFov(page);
  await page.waitForTimeout(180);
  const afterBrake = await readMaskFov(page);
  expect(Math.abs(afterBrake - braking)).toBeLessThan(1.2);

  await page.keyboard.up("KeyQ");
  await page.keyboard.up("KeyE");
});

test("Player V2 Q/E zoom reaches the extended upper FOV limit", async ({ page }) => {
  await openPlayerV2(page);

  await page.keyboard.down("KeyE");
  await expect.poll(() => readMaskFov(page), { timeout: 8000 }).toBeGreaterThan(153);
  await page.keyboard.up("KeyE");
  await page.waitForTimeout(180);

  const afterLimit = await readMaskFov(page);
  expect(afterLimit).toBeLessThanOrEqual(154.5);
});

test("Player V2 H + wheel adjusts mask opacity before normal wheel zoom", async ({ page }) => {
  await openPlayerV2(page);
  const stage = page.getByTestId("player-v2-xr-stage");
  const box = await stage.boundingBox();
  if (!box) {
    throw new Error("Player stage missing bounding box");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const startOpacity = await readMaskOpacity(page);
  const startCameraFov = await readCameraFov(page);

  await page.keyboard.down("KeyH");
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(120);
  await page.keyboard.up("KeyH");

  const nextOpacity = await readMaskOpacity(page);
  const nextCameraFov = await readCameraFov(page);
  expect(nextOpacity).toBeGreaterThan(startOpacity + 0.02);
  expect(Math.abs(nextCameraFov - startCameraFov)).toBeLessThan(0.5);
});

test("Player V2 bracket keys rotate the crop viewport", async ({ page }) => {
  await openPlayerV2(page);
  const start = await readMaskRoll(page);

  await page.keyboard.press("BracketRight");
  await expect.poll(() => readMaskRoll(page), { timeout: 5000 }).toBeGreaterThan(start + 4);

  const clockwise = await readMaskRoll(page);
  await page.keyboard.press("BracketLeft");
  await expect.poll(() => readMaskRoll(page), { timeout: 5000 }).toBeLessThan(clockwise - 4);

  const restored = await readMaskRoll(page);
  expect(Math.abs(restored - start)).toBeLessThan(0.8);
});

test("Player V2 crop viewport corner handles follow center and roll", async ({ page }) => {
  await openPlayerV2(page);
  const startArc = await readArcPose(page);

  await page.keyboard.down("KeyD");
  await page.waitForTimeout(260);
  await page.keyboard.up("KeyD");
  await expect.poll(async () => (await readMaskCenter(page)).yaw, { timeout: 5000 }).toBeGreaterThan(2);

  const movedCenter = await readMaskCenter(page);
  const movedArc = await readArcPose(page);
  expect(Math.abs(movedArc.rootRotation.y + movedCenter.yaw)).toBeLessThan(0.6);

  await page.keyboard.press("BracketRight");
  await expect.poll(() => readMaskRoll(page), { timeout: 5000 }).toBeGreaterThan(4);

  const rolledArc = await readArcPose(page);
  const topLeftDelta = Math.hypot(
    rolledArc.topLeftPosition.x - startArc.topLeftPosition.x,
    rolledArc.topLeftPosition.y - startArc.topLeftPosition.y
  );
  expect(topLeftDelta).toBeGreaterThan(0.2);
});

test("Player V2 roll changes are written to timeline path patches", async ({ page }) => {
  await openPlayerV2(page);
  await page.getByTestId("xr-pc-start-crop").click();
  await expect(page.getByTestId("xr-session-recording-toggle")).toContainText("End record", { timeout: 10_000 });
  await expect(page.getByTestId("xr-session-player-ui-status")).toContainText("playing", { timeout: 10_000 });

  const rollPatch = page.waitForResponse((response) => {
    const request = response.request();
    const payload = request.postData() ?? "";
    return (
      request.method() === "POST" &&
      response.url().includes("/path-patches") &&
      payload.includes('"reason":"lock"') &&
      payload.includes('"roll":5')
    );
  });

  await page.keyboard.press("BracketRight");
  await rollPatch;
});

test("Player V2 Delete marks discard and restore ranges on the timeline", async ({ page }) => {
  await openPlayerV2(page);
  await page.getByTestId("xr-pc-start-crop").click();
  await expect(page.getByTestId("xr-session-recording-toggle")).toContainText("End record", { timeout: 10_000 });
  await expect(page.getByTestId("xr-session-player-ui-status")).toContainText("playing", { timeout: 10_000 });

  const discardPatch = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      response.url().includes("/path-patches") &&
      (request.postData() ?? "").includes('"reason":"discard"')
    );
  });
  await page.keyboard.down("Delete");
  await discardPatch;
  await expect(page.getByTestId("xr-pc-discard-toast")).toContainText("当前播放内容将被放弃");

  const restorePatch = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      response.url().includes("/path-patches") &&
      (request.postData() ?? "").includes('"reason":"restore"')
    );
  });
  await page.waitForTimeout(320);
  await page.keyboard.up("Delete");
  await restorePatch;

  await expect(page.getByTestId("xr-pc-discard-hint")).toContainText("Last discard");
});

test("Player V2 V pointer follow keeps mask near camera and stops on release", async ({ page }) => {
  await openPlayerV2(page);
  const stage = page.getByTestId("player-v2-xr-stage");
  const box = await stage.boundingBox();
  if (!box) {
    throw new Error("Player stage missing bounding box");
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const startCamera = await readCameraCenter(page);
  await page.mouse.move(startX, startY);
  await page.keyboard.down("KeyV");
  await page.mouse.down();
  await page.mouse.move(startX + 130, startY - 32, { steps: 8 });
  await page.waitForTimeout(650);

  const heldCamera = await readCameraCenter(page);
  const heldMask = await readMaskCenter(page);
  expect(angularDistance(heldCamera, startCamera)).toBeGreaterThan(4);
  expect(angularDistance(heldMask, heldCamera)).toBeLessThan(4);

  await page.mouse.up();
  await page.keyboard.up("KeyV");
  const releasedMask = await readMaskCenter(page);
  await page.mouse.move(startX - 130, startY + 32, { steps: 8 });
  await page.waitForTimeout(320);
  const afterRelease = await readMaskCenter(page);
  expect(angularDistance(afterRelease, releasedMask)).toBeLessThan(0.8);
});
