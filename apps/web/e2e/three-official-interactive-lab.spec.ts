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
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("IDLE");
  await expect(page.getByTestId("three-official-view-target")).toContainText("FOV 82");

  const initial = await readViewTarget(page);

  await clickCanvas(page, 0.92, 0.52);
  await expect(page.getByTestId("three-official-last-action")).toContainText("SPHERE CLICK");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("flushPath reason=lock");
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("LOCKED");

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
  await expect(page.getByTestId("three-official-arwes-popup-ui")).toHaveAttribute("data-open", "false");

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

test("three official lab loads the backend playlist into a real selector", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/xr/video-sources", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        source: "backend",
        videos: [
          {
            durationMs: 185000,
            id: "backend-a",
            kind: "mp4",
            resolution: "4096 x 2048",
            sourceUrl: "/api/sample-video",
            title: "Backend Clip A"
          },
          {
            durationMs: 92000,
            id: "backend-b",
            kind: "mp4",
            resolution: "5760 x 2880",
            sourceUrl: "/api/sample-video",
            title: "Backend Clip B"
          }
        ]
      })
    });
  });

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  const playlistSelect = page.getByTestId("three-official-player-playlist-select");
  await expect(playlistSelect).toHaveJSProperty("length", 2);
  await expect(playlistSelect).toContainText("Backend Clip A");
  await expect(playlistSelect).toContainText("Backend Clip B");

  await playlistSelect.evaluate((select) => {
    const sourceSelect = select as HTMLSelectElement;
    sourceSelect.value = "backend-b";
    sourceSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.getByTestId("three-official-player-ui")).toContainText("Backend Clip B");
  await expect(playlistSelect).toHaveValue("backend-b");
  expect(pageErrors).toEqual([]);
});

test("three official lab exposes player-rail workflow controls without the old center popup", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("three-official-interactive-lab")).toBeVisible();
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);
  await expect(page.getByTestId("three-official-player-ui")).toContainText("START REC");
  await expect(page.getByTestId("three-official-popup-ui")).toHaveCount(0);

  const recordRateUp = page.locator('button[data-player-action="RECORD_RATE_UP"]');
  await expect
    .poll(async () => {
      await recordRateUp.evaluate((button) => {
        (button as HTMLButtonElement).click();
      });
      return page.getByTestId("three-official-workflow-status").textContent();
    })
    .toMatch(/rec (?!1x)/);

  await page.locator('button[data-player-action="RECORD_TOGGLE"]').evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("three-official-workflow-status")).toContainText("RECORDING");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("samplingResume");
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("PENDING");

  await page.locator('button[data-player-action="RECORD_TOGGLE"]').evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("three-official-workflow-status")).toContainText("READY TO RENDER");
  await expect(page.getByTestId("three-official-workflow-status")).toContainText("samples 2");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("flushPath reason=live");
  expect(pageErrors).toEqual([]);
});

test("three official lab can send recorded path samples to backend without coordinate sign drift", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  type ReceivedPatch = {
    points?: Array<{
      center?: { pitch?: number; yaw?: number };
      fov?: { h?: number; v?: number };
      input?: string;
      tMs?: number;
    }>;
    replaceRange?: { endMs?: number; startMs?: number };
    sessionId?: string;
    videoId?: string;
  };
  const receivedPatches: ReceivedPatch[] = [];

  await page.route("**/api/cut-sessions/e2e-session/path-patches", async (route) => {
    const receivedPatch = route.request().postDataJSON() as ReceivedPatch;
    receivedPatches.push(receivedPatch);
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ acceptedPoints: receivedPatch?.points?.length ?? 0, status: "accepted" })
    });
  });
  await page.route("**/api/cut-sessions/e2e-session/render-test", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ exportId: "export-e2e" })
    });
  });

  const response = await page.goto("/xr/three-official-interactive-lab?videoId=e2e-video&sessionId=e2e-session");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);

  await page.locator('button[data-module="WORKFLOW"]').evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("three-official-backend-bridge")).toContainText("backend session bound");

  await page.getByTestId("three-official-start-crop").evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await page.evaluate(() => {
    const rayOrigin = { x: 0, y: 1.58, z: 0.45 };
    const rayDirection = { x: 0.72, y: 0.18, z: -1 };
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "right", phase: "start", rayDirection, rayOrigin } }));
    window.dispatchEvent(new CustomEvent("three-official-controller-select", { detail: { hand: "right", phase: "end", rayDirection, rayOrigin } }));
  });
  await expect(page.getByTestId("three-official-last-action")).toContainText("TRIGGER RAY CLICK RIGHT");
  await expect.poll(async () => (await readViewTarget(page)).yaw).toBeGreaterThan(5);
  await expect(page.getByTestId("three-official-coordinate-audit")).toContainText("yaw=");

  await page.getByTestId("three-official-end-crop").evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("three-official-backend-bridge")).toContainText("accepted");

  const receivedPatch = receivedPatches[0];
  expect(receivedPatch).toBeTruthy();
  expect(receivedPatch.sessionId).toBe("e2e-session");
  expect(receivedPatch.videoId).toBe("e2e-video");
  expect(receivedPatch.points?.length).toBeGreaterThanOrEqual(2);
  const movedPoint = receivedPatch.points?.find((point) => point.input === "controller_ray");
  expect(movedPoint?.center?.yaw ?? 0).toBeGreaterThan(5);
  expect(movedPoint?.center?.pitch ?? 0).toBeGreaterThan(2);
  expect(movedPoint?.fov?.h).toBe(82);
  expect(movedPoint?.fov?.v).toBeCloseTo(52.11, 1);
  expect(receivedPatch.replaceRange?.endMs ?? 0).toBeGreaterThan(receivedPatch.replaceRange?.startMs ?? -1);

  await page.getByTestId("three-official-render-crop").evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("three-official-workflow-status")).toContainText("EXPORT READY");
  await expect(page.getByTestId("three-official-export-download")).toHaveAttribute("href", /\/api\/exports\/export-e2e\/download$/);
  expect(pageErrors).toEqual([]);
});

test("three official lab supports B hold release quick menu selection", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);

  await page.evaluate(() => {
    const pressPoint = { x: 0, y: 1.58, z: -0.55 };
    const centerPoint = { x: 0, y: 1.58, z: -0.55 };
    window.dispatchEvent(new CustomEvent("three-official-quick-menu", { detail: { phase: "press", pointerPosition: pressPoint } }));
    window.dispatchEvent(new CustomEvent("three-official-quick-menu", { detail: { phase: "aim", pointerPosition: centerPoint } }));
  });

  await expect(page.getByTestId("three-official-quick-menu-status")).toContainText("open");
  await expect(page.getByTestId("three-official-quick-menu-status")).toContainText("lock");

  await page.evaluate(() => {
    const centerPoint = { x: 0, y: 1.58, z: -0.55 };
    window.dispatchEvent(new CustomEvent("three-official-quick-menu", { detail: { phase: "release", pointerPosition: centerPoint } }));
  });

  await expect(page.getByTestId("three-official-quick-menu-status")).toContainText("closed");
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("LOCKED");
  await expect(page.getByTestId("three-official-last-semantic")).toContainText("flushPath reason=lock");
  expect(pageErrors).toEqual([]);
});

test("three official lab quick menu selects by moving the controller point into an anchored tile", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/three-official-interactive-lab");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByTestId("three-official-canvas")).toBeVisible();
  await expectCanvasHasRenderedPixels(page);

  await page.evaluate(() => {
    const pressPoint = { x: 0, y: 1.58, z: -0.55 };
    const topLeftTilePoint = { x: -0.112, y: 1.666, z: -0.55 };
    window.dispatchEvent(new CustomEvent("three-official-quick-menu", { detail: { phase: "press", pointerPosition: pressPoint } }));
    window.dispatchEvent(new CustomEvent("three-official-quick-menu", { detail: { phase: "aim", pointerPosition: topLeftTilePoint } }));
  });

  await expect(page.getByTestId("three-official-quick-menu-status")).toContainText("open");
  await expect(page.getByTestId("three-official-quick-menu-status")).toContainText("startCrop");

  await page.evaluate(() => {
    const topLeftTilePoint = { x: -0.112, y: 1.666, z: -0.55 };
    window.dispatchEvent(new CustomEvent("three-official-quick-menu", { detail: { phase: "release", pointerPosition: topLeftTilePoint } }));
  });

  await expect(page.getByTestId("three-official-quick-menu-status")).toContainText("closed");
  await expect(page.getByTestId("three-official-workflow-status")).toContainText("RECORDING");
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
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("DRAG");
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("PENDING");

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
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("FOV");
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
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("READY");
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
  await expect(page.getByTestId("three-official-mode-strip")).toContainText("OPACITY");
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
