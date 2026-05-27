import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

test.use({ ignoreHTTPSErrors: true });
test.setTimeout(120_000);

const repoRoot = path.resolve(process.cwd(), "..", "..");
const gridVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");

type CropMaskChange = {
  center?: { yaw?: number; pitch?: number };
  fov?: { h?: number; v?: number };
  videoTimeMs?: number;
};

async function createGridSession(page: Page) {
  const email = `player-v2-flow-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "secret123";

  const register = await page.request.post("/api/auth/register", {
    data: { email, password }
  });
  expect(register.status()).toBe(200);

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
  const sessionId = `session_player_v2_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

async function installCropMaskRecorder(page: Page) {
  await page.evaluate(() => {
    const changes: CropMaskChange[] = [];
    window.__playerV2CropMaskChanges = changes;
    window.addEventListener("webxr:crop-mask-change", (event) => {
      changes.push((event as CustomEvent).detail);
    });
  });
}

async function readLatestCropMaskChange(page: Page) {
  return page.evaluate(() => {
    const changes = window.__playerV2CropMaskChanges ?? [];
    return (changes.at(-1) ?? null) as CropMaskChange | null;
  });
}

declare global {
  interface Window {
    __playerV2CropMaskChanges?: CropMaskChange[];
  }
}

test("Player V2 edit flow records a yaw move and auto-renders an export", async ({ page }) => {
  const session = await createGridSession(page);
  const pathPatchResponses: number[] = [];
  const renderResponses: number[] = [];

  page.on("response", (response) => {
    const url = response.url();
    if (url.includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`)) {
      pathPatchResponses.push(response.status());
    }
    if (url.includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/render-test`)) {
      renderResponses.push(response.status());
    }
  });

  const response = await page.goto("/xr/player-v2", { waitUntil: "commit" });
  expect(response?.status()).toBeLessThan(400);
  await installCropMaskRecorder(page);

  await page.waitForFunction(() => Boolean(window.AFRAME));
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible();
  await expect(page.getByTestId("player-v2-ui-overlay")).toBeVisible();
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached();
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { initialized?: boolean }> })
      | null;
    return Boolean(el?.components?.["pc-crop-viewport-mask"]?.initialized);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector("video#player-v2-video") as HTMLVideoElement | null;
        return video?.readyState ?? 0;
      })
    )
    .toBeGreaterThan(1);

  await page.evaluate(async () => {
    const video = document.querySelector("video#player-v2-video") as HTMLVideoElement | null;
    if (!video) {
      throw new Error("Player V2 video element missing");
    }
    video.currentTime = 0.15;
    video.playbackRate = 2;
    video.pause();
  });

  const autoRenderToggle = page.locator("[data-testid='xr-pc-crop-workflow'] input[type='checkbox']");
  await autoRenderToggle.check();
  await expect(page.getByTestId("player-v2-ui-overlay")).toContainText("auto on");

  await page.getByTestId("xr-pc-start-crop").click();
  await expect(page.getByTestId("player-v2-ui-overlay")).toContainText("End record");

  const beforeMove = await readLatestCropMaskChange(page);
  await page.getByTestId("xr-pc-yaw-right").click();
  await expect
    .poll(async () => (await readLatestCropMaskChange(page))?.center?.yaw ?? -999)
    .toBeGreaterThan((beforeMove?.center?.yaw ?? 0) + 3);

  await page.waitForTimeout(500);
  await page.getByTestId("xr-pc-end-crop").click();

  await expect(page.getByTestId("player-v2-ui-overlay")).toContainText("Export ready", { timeout: 90_000 });
  await expect(page.getByTestId("xr-pc-export-download")).toBeVisible();
  await expect(page.getByTestId("xr-pc-export-prompt")).toBeVisible();
  const detailHref = await page.getByTestId("xr-pc-export-prompt-view").getAttribute("href");
  expect(detailHref).toContain("/mobile/exports/");
  const exportId = detailHref?.split("/").at(-1);
  if (!exportId) {
    throw new Error("Export detail link did not include an export id");
  }
  await page.getByTestId("xr-pc-export-prompt-view").click();
  await expect(page).toHaveURL(new RegExp(`/mobile/exports/${exportId}$`));
  await expect(page.locator("body")).toContainText(exportId);
  await expect(page.locator("body")).toContainText("Ready");

  expect(pathPatchResponses.some((status) => status >= 200 && status < 400)).toBe(true);
  expect(renderResponses.some((status) => status >= 200 && status < 400)).toBe(true);
});
