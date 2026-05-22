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

test("opens the WebXR page and starts the desktop stereo simulator", async ({ page }) => {
  await page.goto("/xr/hello");

  await expect(page.getByRole("heading", { name: "Hello WebXR" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("xr-message")).toContainText("Scene ready");
  await expect(page.getByTestId("sample-video-status")).toContainText(/ready|playing/);

  await page.getByTestId("start-desktop-simulator").click();

  await expect(page.getByText("LEFT EYE")).toBeVisible();
  await expect(page.getByText("RIGHT EYE")).toBeVisible();
  await expect(page.getByTestId("xr-message")).toContainText("Desktop XR Simulator is running");
  await expect(page.getByTestId("sample-video-status")).toContainText("playing");
  await expect(page.getByTestId("xr-log")).toContainText("desktop simulator running");
});

test("can switch the 360 sphere from MP4 to the generated HLS stream", async ({ page }) => {
  await page.goto("/xr/hello");

  await expect(page.getByTestId("sample-video-source")).toContainText("MP4 file");
  await page.getByTestId("load-hls-stream").click();

  await expect(page.getByTestId("sample-video-source")).toContainText("HLS stream");
  await expect(page.getByTestId("sample-video-status")).toContainText(/stream ready|playing/);
});

test("mock WebXR mode can complete Enter VR without a headset", async ({ page }) => {
  await page.goto("/xr/hello?mock-xr=1");

  await expect(page.getByText("Mock XR automation mode")).toBeVisible();
  await expect(page.getByText("immersive-vr: supported")).toBeVisible();

  await page.getByTestId("enter-vr").click();

  await expect(page.getByTestId("xr-message")).toContainText("Mock WebXR session is running");
  await expect(page.getByRole("button", { name: "VR Running" })).toBeVisible();
});
