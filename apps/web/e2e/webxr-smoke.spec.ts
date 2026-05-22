import { expect, test } from "@playwright/test";

test("serves the local 360 sample video with range requests", async ({ request }) => {
  const response = await request.get("/api/sample-video", {
    headers: {
      Range: "bytes=0-99"
    }
  });

  expect(response.status()).toBe(206);
  expect(response.headers()["content-type"]).toContain("video/mp4");
  expect(response.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
});

test("serves the generated 360 HLS stream playlist", async ({ request }) => {
  const playlist = await request.get("/api/sample-stream/index.m3u8");

  expect(playlist.status()).toBe(200);
  expect(playlist.headers()["content-type"]).toContain("application/vnd.apple.mpegurl");
  expect(await playlist.text()).toContain("#EXTM3U");

  const segment = await request.get("/api/sample-stream/segment_000.ts", {
    headers: {
      Range: "bytes=0-99"
    }
  });

  expect(segment.status()).toBe(206);
  expect(segment.headers()["content-type"]).toContain("video/mp2t");
});

test("opens the Meta WebXR player without lab-only controls", async ({ page }) => {
  await page.goto("/xr/hello");

  await expect(page.getByRole("heading", { name: "360 Video Player" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("xr-message")).toContainText(/Scene ready|WebXR exists/);
  await expect(page.getByTestId("sample-video-status")).toContainText(/ready|playing/);
  await expect(page.getByTestId("sample-video-source")).toContainText("MP4 file");
  await expect(page.getByTestId("xr-session-state")).toContainText("idle");
  await expect(page.getByTestId("start-desktop-simulator")).toHaveCount(0);
  await expect(page.getByText("Mock XR automation mode")).toHaveCount(0);
  await expect(page.getByTestId("load-hls-stream")).toHaveCount(0);
});

test("opens the minimal A-Frame 360 video sphere player", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/aframe-player");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("aframe-video-sphere-player")).toBeVisible();
  await expect(page.locator("a-scene")).toHaveCount(1);
  await expect(page.locator("a-videosphere")).toHaveCount(1);
  await expect(page.locator("video#aframe-360-source-video")).toHaveAttribute("src", "/api/sample-video");
  await expect(page.getByText("Internal Server Error")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("opens the playback lab and starts the desktop stereo simulator", async ({ page }) => {
  await page.goto("/xr/playback-lab");

  await expect(page.getByRole("heading", { name: "360 Video Test Lab" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("xr-message")).toContainText(/Scene ready|WebXR exists/);
  await expect(page.getByTestId("sample-video-status")).toContainText(/ready|playing/);

  await page.getByTestId("start-desktop-simulator").click();

  await expect(page.getByText("LEFT EYE")).toBeVisible();
  await expect(page.getByText("RIGHT EYE")).toBeVisible();
  await expect(page.getByTestId("xr-message")).toContainText("Desktop XR Simulator is running");
  await expect(page.getByTestId("sample-video-status")).toContainText("playing");
  await expect(page.getByTestId("xr-log")).toContainText("desktop simulator running");
});

test("can switch the 360 sphere from MP4 to the generated HLS stream", async ({ page }) => {
  await page.goto("/xr/playback-lab");

  await expect(page.getByTestId("sample-video-source")).toContainText("MP4 file");
  await page.getByTestId("load-hls-stream").click();

  await expect(page.getByTestId("sample-video-source")).toContainText("HLS stream");
  await expect(page.getByTestId("sample-video-status")).toContainText(/ready|stream ready|playing/);
});

test("mock WebXR mode can complete Enter VR without a headset", async ({ page }) => {
  await page.goto("/xr/playback-lab?mock-xr=1");

  await expect(page.getByText("Mock XR automation mode")).toBeVisible();
  await expect(page.getByText("immersive-vr: supported")).toBeVisible();

  await page.getByTestId("enter-vr").click();

  await expect(page.getByTestId("xr-message")).toContainText("Mock WebXR session is running");
  await expect(page.getByRole("button", { name: "VR Running" })).toBeVisible();
});

test("opens the XR workbench UI prototype", async ({ page }) => {
  await page.goto("/xr/workbench");

  await expect(page.getByRole("heading", { name: "WebXR 剪辑工作台" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("workbench-library-label")).toContainText("素材库");
  await expect(page.getByTestId("workbench-stage-label")).toContainText("中控台");
  await expect(page.getByTestId("workbench-action-label")).toContainText("操作工作台");
  await expect(page.getByTestId("workbench-selected-video")).toContainText("Ridge flight");
  await expect(page.getByTestId("workbench-progress-text")).toContainText("0:42");
  await expect(page.getByTestId("workbench-modal-state")).toContainText("none");
  await expect(page.getByTestId("workbench-menu-state")).toContainText("none");
});
