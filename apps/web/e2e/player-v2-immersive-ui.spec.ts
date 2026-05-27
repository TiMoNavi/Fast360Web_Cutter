import { expect, test, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

test.use({ ignoreHTTPSErrors: true });
test.setTimeout(60_000);

const repoRoot = path.resolve(process.cwd(), "..", "..");
const gridVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");

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
  await page.waitForFunction(() => Boolean(window.AFRAME), { timeout: 20_000 });
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible();
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached();
  await expect(page.getByTestId("player-v2-ui-overlay")).toHaveCount(0);
  await expect(page.getByTestId("player-v2-immersive-state")).toBeAttached();
  await expect(page.getByTestId("hybrid-skin-player-bar")).toBeAttached();
  await expect(page.getByTestId("arwes-workbench-spatial-table")).toBeAttached();
}

async function openDebugImmersiveEntryPlayer(page: Page) {
  const response = await page.goto("/xr/player-v2?xrDebug=1", { waitUntil: "commit" });

  expect(response?.status()).toBeLessThan(400);
  await page.waitForFunction(() => Boolean(window.AFRAME), { timeout: 20_000 });
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible();
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached();
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

async function clickSpatialTarget(page: Page, testId: string) {
  await page.evaluate((nextTestId) => {
    const target = document.querySelector(`[data-testid="${nextTestId}"]`);
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, testId);
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

  const initialFov = Number(await state.getAttribute("data-mask-fov"));
  await dispatchControllerEvent(page, "gripdown", "left");
  await dispatchControllerEvent(page, "thumbstickup");
  await expect
    .poll(async () => Number(await state.getAttribute("data-mask-fov")))
    .toBeLessThan(initialFov);
  await dispatchControllerEvent(page, "gripup", "left");

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

  await expect(page.getByTestId("spatial-effect-ring-hit-effect-vhs-blank")).toBeAttached();
  await clickSpatialTarget(page, "spatial-effect-ring-hit-effect-vhs-blank");
  await expect(state).toHaveAttribute("data-effect-mode", "selected");

  await dispatchControllerEvent(page, "bbuttonup");
  await expect(state).toHaveAttribute("data-right-b-pressed", "false");
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

  await clickSpatialTarget(page, "arwes-workbench-region-hit-start");
  await expect(state).toHaveAttribute("data-recording-active", "true");

  const finalizeResponse = page.waitForResponse((nextResponse) =>
    nextResponse.request().method() === "POST" &&
    nextResponse.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/finalize-recording`)
  );
  await page.waitForTimeout(1200);
  await clickSpatialTarget(page, "arwes-workbench-region-hit-start");
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
  await expect(page.getByTestId("spatial-effect-ring-hit-effect-vhs-blank")).toBeAttached();

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
