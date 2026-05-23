import { expect, test, type Page } from "@playwright/test";

function parseViewTarget(text: string | null) {
  const match = text?.match(/yaw\s+(-?\d+(?:\.\d+)?)\s+\/\s+pitch\s+(-?\d+(?:\.\d+)?)/);
  if (!match) {
    throw new Error(`Unable to parse view target text: ${text ?? ""}`);
  }

  return {
    pitch: Number(match[2]),
    yaw: Number(match[1])
  };
}

async function readViewTarget(page: Page) {
  return parseViewTarget(await page.getByTestId("three-official-view-target").textContent());
}

async function readMaskOpacity(page: Page) {
  const text = await page.getByTestId("three-official-mask-opacity").textContent();
  const match = text?.match(/mask opacity:\s+(-?\d+(?:\.\d+)?)/);
  if (!match) {
    throw new Error(`Unable to parse mask opacity text: ${text ?? ""}`);
  }
  return Number(match[1]);
}

async function clickCanvas(page: Page, xRatio: number, yRatio: number, modifiers: Array<"Control" | "Meta"> = []) {
  const box = await page.getByTestId("three-official-canvas").boundingBox();
  if (!box) {
    throw new Error("Three official canvas is not visible");
  }

  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
  }
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
  for (const modifier of modifiers.slice().reverse()) {
    await page.keyboard.up(modifier);
  }
}

async function expectCanvasHasRenderedPixels(page: Page) {
  await expect
    .poll(() =>
      page.getByTestId("three-official-canvas").evaluate((canvas) => {
        const source = canvas as HTMLCanvasElement;
        const context = source.getContext("webgl2") ?? source.getContext("webgl");
        if (!context) {
          return 0;
        }

        const pixels = new Uint8Array(4 * 16 * 16);
        context.readPixels(
          Math.max(0, Math.floor(source.width / 2) - 8),
          Math.max(0, Math.floor(source.height / 2) - 8),
          16,
          16,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixels
        );
        return pixels.reduce((total, value) => total + value, 0);
      })
    )
    .toBeGreaterThan(0);
}

test("three official lab supports sphere click target selection", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("three-official-interactive-lab")).toBeVisible();
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);
  await expect(page.getByTestId("three-official-view-target")).toContainText("FOV 82");

  const initial = await readViewTarget(page);

  await clickCanvas(page, 0.92, 0.52);
  await expect(page.getByTestId("three-official-last-action")).toContainText("SPHERE CLICK");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("flushPath reason=lock");

  const moved = await readViewTarget(page);
  expect(Math.abs(moved.yaw - initial.yaw)).toBeGreaterThan(8);

  await clickCanvas(page, 0.08, 0.52, ["Control"]);
  await expect(page.getByTestId("three-official-last-action")).toContainText("SPHERE CTRL CLICK");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("flushPath reason=lock");

  const snapped = await readViewTarget(page);
  expect(Math.abs(snapped.yaw - moved.yaw)).toBeGreaterThan(8);
  expect(pageErrors).toEqual([]);
});

test("three official lab exposes PC-style player controls and dual select play toggle", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("three-official-interactive-lab")).toBeVisible();
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);
  await expect(page.getByTestId("three-official-player-ui")).toContainText("PLAYBACK CORE");
  await expect(page.getByTestId("three-official-player-ui")).toContainText("both select");
  await expect(page.getByTestId("three-official-player-progress")).toHaveAttribute("type", "range");
  await expect(page.getByTestId("three-official-player-status-strip")).toContainText(/LOADING|READY|PLAYING|PAUSED|ERROR/);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "left", phase: "start" } }));
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "right", phase: "start" } }));
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "left", phase: "end" } }));
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "right", phase: "end" } }));
  });

  await expect(page.getByTestId("three-official-last-semantic")).toContainText("playPause");
  await expect(page.getByTestId("three-official-last-action")).toContainText("DUAL SELECT");
  expect(pageErrors).toEqual([]);
});

test("three official lab maps short controller select to ray sphere target selection", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("three-official-interactive-lab")).toBeVisible();
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);

  const initial = await readViewTarget(page);
  await page.evaluate(() => {
    const rayOrigin = { x: 0, y: 1.58, z: 0.45 };
    const rayDirection = { x: 0.95, y: -0.08, z: -1 };
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "right", phase: "start", rayDirection, rayOrigin } }));
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "right", phase: "end", rayDirection, rayOrigin } }));
  });

  await expect(page.getByTestId("three-official-last-action")).toContainText("TRIGGER RAY CLICK RIGHT");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("flushPath reason=lock");

  const moved = await readViewTarget(page);
  expect(Math.abs(moved.yaw - initial.yaw)).toBeGreaterThan(8);
  expect(pageErrors).toEqual([]);
});

test("three official lab maps grip hold to continuous ray sphere mask drag", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("three-official-interactive-lab")).toBeVisible();
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);

  const initial = await readViewTarget(page);
  await page.evaluate(() => {
    const rayOrigin = { x: 0, y: 1.58, z: 0.45 };
    window.dispatchEvent(
      new CustomEvent("three-official-controller-squeeze", {
        detail: {
          hand: "right",
          phase: "start",
          rayDirection: { x: 0.2, y: -0.04, z: -1 },
          rayOrigin
        }
      })
    );
  });

  await expect(page.getByTestId("three-official-last-action")).toContainText("GRIP HOLD");

  await page.evaluate(() => {
    const rayOrigin = { x: 0, y: 1.58, z: 0.45 };
    window.dispatchEvent(
      new CustomEvent("three-official-controller-aim", {
        detail: {
          hand: "right",
          rayDirection: { x: 1.05, y: -0.04, z: -1 },
          rayOrigin
        }
      })
    );
  });

  await expect
    .poll(async () => Math.abs((await readViewTarget(page)).yaw - initial.yaw))
    .toBeGreaterThan(8);

  await page.evaluate(() => {
    const rayOrigin = { x: 0, y: 1.58, z: 0.45 };
    window.dispatchEvent(
      new CustomEvent("three-official-controller-squeeze", {
        detail: {
          hand: "right",
          phase: "end",
          rayDirection: { x: 1.05, y: -0.04, z: -1 },
          rayOrigin
        }
      })
    );
  });

  await expect(page.getByTestId("three-official-last-action")).toContainText("GRIP RELEASE RIGHT");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("controllerAimEnd");
  expect(pageErrors).toEqual([]);
});

test("three official lab maps right thumbstick hold to smooth FOV changes", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("three-official-interactive-lab")).toBeVisible();
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);
  await expect(page.getByTestId("three-official-view-target")).toContainText("FOV 82");

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("three-official-thumbstick", { detail: { hand: "right", y: 1 } }));
  });

  await expect(page.getByTestId("three-official-last-action")).toContainText("RIGHT STICK HOLD");
  await expect
    .poll(async () => {
      const text = await page.getByTestId("three-official-view-target").textContent();
      const match = text?.match(/FOV\s+(-?\d+(?:\.\d+)?)/);
      return match ? Number(match[1]) : 0;
    })
    .toBeGreaterThan(83);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("three-official-thumbstick", { detail: { hand: "right", y: 0 } }));
  });

  await expect(page.getByTestId("three-official-last-semantic")).toContainText("flushPath reason=fov");
  await expect(page.getByTestId("three-official-last-action")).toContainText("RIGHT STICK RELEASE");
  expect(pageErrors).toEqual([]);
});

test("three official lab maps left grip plus right thumbstick to mask opacity", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("three-official-interactive-lab")).toBeVisible();
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);

  const initialOpacity = await readMaskOpacity(page);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("three-official-controller-squeeze", { detail: { hand: "left", phase: "start" } }));
    window.dispatchEvent(new CustomEvent("three-official-thumbstick", { detail: { hand: "right", y: 1 } }));
  });

  await expect(page.getByTestId("three-official-last-action")).toContainText("LEFT GRIP + RIGHT STICK");
  await expect.poll(async () => await readMaskOpacity(page)).toBeGreaterThan(initialOpacity);
  await expect(page.getByTestId("three-official-mask-opacity")).toContainText("left grip modifier on");

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("three-official-thumbstick", { detail: { hand: "right", y: 0 } }));
    window.dispatchEvent(new CustomEvent("three-official-controller-squeeze", { detail: { hand: "left", phase: "end" } }));
  });

  await expect(page.getByTestId("three-official-mask-opacity")).toContainText("left grip modifier off");
  await expect(page.getByTestId("three-official-last-action")).toContainText("LEFT GRIP RELEASE");
  expect(pageErrors).toEqual([]);
});
