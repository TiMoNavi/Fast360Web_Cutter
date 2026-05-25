import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type CropMaskState = {
  center?: { yaw: number; pitch: number };
  fov?: { h: number; v: number };
  locked?: boolean;
  maskOpacity?: number;
};

type TimelineBridgeState = {
  lastAcceptedPathPatch?: {
    acceptedPoints: number;
    lastPoint?: {
      center?: { yaw: number; pitch: number };
      fov?: { h: number; v: number };
      tMs: number;
    };
    pathRevision: number;
    status?: string;
  } | null;
  pendingPathPoints?: number;
  queuedPathBatches?: number;
};

type AcceptedPathPoint = {
  center: { yaw: number; pitch: number };
  fov: { h: number; v: number };
  tMs: number;
};

type AxisCase = {
  axis: "horizontal" | "vertical";
  key: string;
  minimumDelta: number;
  name: string;
};

const repoRoot = path.resolve(process.cwd(), "..", "..");
const gridVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");
const analyzerPath = path.join(repoRoot, "scripts", "analyze_grid_export.py");

async function readCropMaskState(page: Page) {
  const raw = await page.getByTestId("aframe-crop-mask-state").textContent();
  return JSON.parse(raw || "{}") as CropMaskState;
}

async function readTimelineBridgeState(page: Page) {
  const raw = await page.getByTestId("aframe-timeline-bridge-state").textContent();
  return JSON.parse(raw || "null") as TimelineBridgeState | null;
}

async function createGridSession(page: Page) {
  const email = `pc-grid-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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
  const sessionId = `session_grid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

  return {
    sessionId,
    videoId: video.id,
    xrPath: `/xr/videos/${encodeURIComponent(video.id)}/session/${encodeURIComponent(sessionId)}`
  };
}

async function openPcEditor(page: Page, xrPath: string) {
  const response = await page.goto(xrPath);
  expect(response?.status()).toBeLessThan(400);
  await page.waitForFunction(() => Boolean(window.AFRAME));
  await expect(page.getByTestId("aframe-video-sphere-player")).toBeVisible();
  await expect(page.getByTestId("xr-pc-workbench")).toBeVisible();
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { initialized?: boolean }> })
      | null;
    return Boolean(el?.components?.["crop-viewport-mask"]?.initialized);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
        return video?.readyState ?? 0;
      })
    )
    .toBeGreaterThan(1);
}

async function runSingleAxisMove(page: Page, axisCase: AxisCase) {
  const before = await readCropMaskState(page);
  const beforeRevision = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0;

  await page.evaluate(async () => {
    const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
    if (!video) {
      throw new Error("session video element missing");
    }
    video.currentTime = 0.15;
    video.playbackRate = 9.5;
    await video.play().catch(() => undefined);
  });

  await page.getByTestId("aframe-video-sphere-player").hover();
  await page.waitForTimeout(250);
  await page.keyboard.down(axisCase.key);
  await page.waitForTimeout(280);
  await page.keyboard.up(axisCase.key);
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
    video?.pause();
  });
  const finalCrop = await readCropMaskState(page);
  const lastPoint = await flushAndReadLastPoint(page, {
    afterRevision: beforeRevision,
    expected: finalCrop
  });

  if (axisCase.axis === "horizontal") {
    expect((lastPoint?.center?.yaw ?? 0) - (before.center?.yaw ?? 0)).toBeGreaterThan(axisCase.minimumDelta);
    expect(Math.abs((lastPoint?.center?.pitch ?? 0) - (before.center?.pitch ?? 0))).toBeLessThan(2);
  } else {
    expect((lastPoint?.center?.pitch ?? 0) - (before.center?.pitch ?? 0)).toBeGreaterThan(axisCase.minimumDelta);
    expect(Math.abs((lastPoint?.center?.yaw ?? 0) - (before.center?.yaw ?? 0))).toBeLessThan(2);
  }

  return lastPoint;
}

async function clickStageAt(page: Page, xRatio: number, yRatio: number) {
  const box = await page.getByTestId("aframe-video-sphere-player").boundingBox();
  if (!box) {
    throw new Error("PC editor stage is not visible");
  }

  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
}

async function ctrlClickStageAt(page: Page, xRatio: number, yRatio: number) {
  await page.keyboard.down("Control");
  await clickStageAt(page, xRatio, yRatio);
  await page.keyboard.up("Control");
}

async function dragStage(page: Page, from: { xRatio: number; yRatio: number }, to: { xRatio: number; yRatio: number }) {
  const box = await page.getByTestId("aframe-video-sphere-player").boundingBox();
  if (!box) {
    throw new Error("PC editor stage is not visible");
  }

  const startX = box.x + box.width * from.xRatio;
  const startY = box.y + box.height * from.yRatio;
  const endX = box.x + box.width * to.xRatio;
  const endY = box.y + box.height * to.yRatio;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
}

async function dragStageToAndHold(
  page: Page,
  from: { xRatio: number; yRatio: number },
  to: { xRatio: number; yRatio: number },
  holdMs: number
) {
  const box = await page.getByTestId("aframe-video-sphere-player").boundingBox();
  if (!box) {
    throw new Error("PC editor stage is not visible");
  }

  const startX = box.x + box.width * from.xRatio;
  const startY = box.y + box.height * from.yRatio;
  const endX = box.x + box.width * to.xRatio;
  const endY = box.y + box.height * to.yRatio;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

async function readCameraState(page: Page) {
  const raw = await page.getByTestId("aframe-video-control-state").textContent();
  return JSON.parse(raw || "{}") as {
    camera?: { yaw: number; pitch: number };
    fov?: number;
  };
}

async function readVideoControlState(page: Page) {
  const raw = await page.getByTestId("aframe-video-control-state").textContent();
  return JSON.parse(raw || "{}") as {
    status?: string;
  };
}

async function readAFrameLookControlsState(page: Page) {
  return page.evaluate(() => {
    const camera = document.querySelector("a-camera") as
      | (HTMLElement & {
          components?: {
            "look-controls"?: {
              pitchObject?: { rotation?: { x: number } };
              yawObject?: { rotation?: { y: number } };
            };
          };
        })
      | null;
    const controls = camera?.components?.["look-controls"];
    return {
      pitch: ((controls?.pitchObject?.rotation?.x ?? 0) * 180) / Math.PI,
      yaw: ((controls?.yawObject?.rotation?.y ?? 0) * 180) / Math.PI
    };
  });
}

async function setMaskCenter(page: Page, center: { yaw: number; pitch: number }) {
  await page.evaluate((nextCenter) => {
    window.dispatchEvent(
      new CustomEvent("webxr:crop-mask-center", {
        detail: nextCenter
      })
    );
  }, center);
  await expect.poll(async () => (await readCropMaskState(page)).center?.yaw ?? Number.NaN).toBeCloseTo(center.yaw, 1);
  await expect.poll(async () => (await readCropMaskState(page)).center?.pitch ?? Number.NaN).toBeCloseTo(center.pitch, 1);
}

async function setVideoForRecording(page: Page, playbackRate: number) {
  await page.evaluate(async (rate) => {
    const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
    if (!video) {
      throw new Error("session video element missing");
    }
    video.currentTime = 0.15;
    video.playbackRate = rate;
    await video.play().catch(() => undefined);
  }, playbackRate);
}

async function replaceStoredPathBaseline(
  page: Page,
  session: { sessionId: string; videoId: string },
  point: AcceptedPathPoint
) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`, {
    data: {
      pathRevision: Math.max(1, Math.round(Date.now() % 1_000_000)),
      points: [0, 100].map((tMs, index) => ({
        center: point.center,
        cut: false,
        enabled: true,
        fov: point.fov,
        input: "head_gaze",
        interpolation: "linear",
        locked: true,
        roll: 0,
        seq: index + 1,
        smoothFollow: false,
        tMs,
        transitionMs: 0
      })),
      replaceRange: {
        endMs: 60_000,
        reason: "replay",
        startMs: 0
      },
      sessionId: session.sessionId,
      takeId: `baseline_${Date.now().toString(36)}`,
      version: 1,
      videoId: session.videoId
    }
  });
  expect(response.status()).toBe(200);
}

function cropStateToAcceptedPoint(cropState: CropMaskState): AcceptedPathPoint {
  if (!cropState.center || !cropState.fov) {
    throw new Error("crop mask did not expose a center/fov");
  }

  return {
    center: cropState.center,
    fov: cropState.fov,
    tMs: 0
  };
}

async function pauseVideo(page: Page) {
  await page.evaluate(() => {
    const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
    video?.pause();
  });
}

async function flushAndReadLastPoint(
  page: Page,
  options: {
    afterRevision?: number;
    expected?: CropMaskState;
    tolerance?: number;
  } = {}
) {
  const tolerance = options.tolerance ?? 1.5;
  await page.getByTestId("xr-pc-flush").click();
  await expect
    .poll(async () => {
      const state = await readTimelineBridgeState(page);
      const revision = state?.lastAcceptedPathPatch?.pathRevision ?? 0;
      const lastPoint = state?.lastAcceptedPathPatch?.lastPoint;
      const expected = options.expected;
      const matchesExpected =
        !expected?.center || !expected.fov || !lastPoint?.center || !lastPoint.fov
          ? false
          : Math.abs(lastPoint.center.yaw - expected.center.yaw) <= tolerance &&
            Math.abs(lastPoint.center.pitch - expected.center.pitch) <= tolerance &&
            Math.abs(lastPoint.fov.h - expected.fov.h) <= tolerance;
      return {
        accepted: state?.lastAcceptedPathPatch?.status,
        matchesExpected,
        moved: options.afterRevision === undefined ? true : revision > options.afterRevision,
        pending: state?.pendingPathPoints ?? 0,
        queued: state?.queuedPathBatches ?? 0
      };
    })
    .toEqual(expect.objectContaining({ accepted: "accepted", matchesExpected: Boolean(options.expected), moved: true, queued: 0 }));

  const lastPoint = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.lastPoint;
  if (!lastPoint?.center || !lastPoint.fov) {
    throw new Error("accepted path patch did not include a complete last point");
  }

  return {
    center: lastPoint.center,
    fov: lastPoint.fov,
    tMs: lastPoint.tMs
  };
}

async function renderAndDownloadExport(page: Page, sessionId: string, outputPath: string) {
  const render = await page.request.post(`/api/cut-sessions/${encodeURIComponent(sessionId)}/render-test`, {
    data: {}
  });
  expect(render.status()).toBe(200);
  const body = (await render.json()) as { exportId: string; status: string };
  expect(body.status).toBe("ready");

  const download = await page.request.get(`/api/exports/${encodeURIComponent(body.exportId)}/download`);
  expect(download.status()).toBe(200);
  await writeFile(outputPath, await download.body());
  return body.exportId;
}

async function analyzeExportFrame({
  axis,
  exportPath,
  label,
  lastPoint,
  testInfo
}: {
  axis: AxisCase["axis"] | "fov-scale";
  exportPath: string;
  label?: string;
  lastPoint: AcceptedPathPoint;
  testInfo: TestInfo;
}) {
  const filePrefix = label ? `${label}-${axis}` : axis;
  const framePath = testInfo.outputPath(`${filePrefix}-export-last-frame.png`);
  const annotatedPath = testInfo.outputPath(`${filePrefix}-export-axis-check.png`);
  const result = spawnSync(
    "python",
    [
      analyzerPath,
      "--video",
      exportPath,
      "--axis",
      axis,
      "--yaw",
      String(lastPoint.center.yaw),
      "--pitch",
      String(lastPoint.center.pitch),
      "--h-fov",
      String(lastPoint.fov.h),
      "--v-fov",
      String(lastPoint.fov.v),
      "--frame-out",
      framePath,
      "--annotated-out",
      annotatedPath
    ],
    {
      cwd: repoRoot,
      encoding: "utf-8"
    }
  );

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const analysis = JSON.parse(result.stdout || "{}") as {
    coordinateErrorPx?: number;
    errorPx?: number;
    ok?: boolean;
    ratioError?: number;
  };
  expect(analysis.ok).toBe(true);
  expect(analysis.errorPx ?? analysis.coordinateErrorPx ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(48);
  if (typeof analysis.ratioError === "number") {
    expect(analysis.ratioError).toBeLessThanOrEqual(0.12);
  }

  await testInfo.attach(`${filePrefix} export last frame`, {
    contentType: "image/png",
    path: framePath
  });
  await testInfo.attach(`${filePrefix} axis check`, {
    contentType: "image/png",
    path: annotatedPath
  });
}

test.describe("PC WebXR crop render alignment", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const cases: AxisCase[] = [
    { axis: "horizontal", key: "d", minimumDelta: 6, name: "horizontal yaw move" },
    { axis: "vertical", key: "w", minimumDelta: 6, name: "vertical pitch move" }
  ];

  for (const axisCase of cases) {
    test(`${axisCase.name} sends a matching timeline path and render`, async ({ page }, testInfo) => {
      const session = await createGridSession(page);
      await openPcEditor(page, session.xrPath);
      const initial = await readCropMaskState(page);
      if (!initial.center || !initial.fov) {
        throw new Error("crop mask did not expose an initial center/fov");
      }
      await replaceStoredPathBaseline(page, session, {
        center: initial.center,
        fov: initial.fov,
        tMs: 0
      });

      const lastPoint = await runSingleAxisMove(page, axisCase);
      await replaceStoredPathBaseline(page, session, lastPoint);
      const screenshotPath = testInfo.outputPath(`${axisCase.axis}-pc-editor-after-move.png`);
      await page.screenshot({ fullPage: true, path: screenshotPath });
      await testInfo.attach(`${axisCase.axis} PC editor after move`, {
        contentType: "image/png",
        path: screenshotPath
      });

      const exportPath = testInfo.outputPath(`${axisCase.axis}-render-test.mp4`);
      await mkdir(path.dirname(exportPath), { recursive: true });
      await renderAndDownloadExport(page, session.sessionId, exportPath);
      await analyzeExportFrame({
        axis: axisCase.axis,
        exportPath,
        lastPoint,
        testInfo
      });
    });
  }

  test("pointer click on the video sphere moves the mask target and render", async ({ page }, testInfo) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    const initial = await readCropMaskState(page);
    if (!initial.center || !initial.fov) {
      throw new Error("crop mask did not expose an initial center/fov");
    }
    await replaceStoredPathBaseline(page, session, {
      center: initial.center,
      fov: initial.fov,
      tMs: 0
    });

    await setVideoForRecording(page, 1);
    await clickStageAt(page, 0.66, 0.5);
    await expect
      .poll(async () => (await readCropMaskState(page)).center?.yaw ?? -999)
      .toBeGreaterThan((initial.center.yaw ?? 0) + 18);
    await page.waitForTimeout(360);
    await pauseVideo(page);

    await page.getByTestId("xr-pc-flush").click();
    await expect
      .poll(async () => {
        const state = await readTimelineBridgeState(page);
        return state?.lastAcceptedPathPatch?.lastPoint?.center?.yaw ?? 0;
      })
      .toBeGreaterThan(initial.center.yaw + 18);
    const accepted = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.lastPoint;
    if (!accepted?.center || !accepted.fov) {
      throw new Error("pointer click did not produce an accepted crop point");
    }
    const lastPoint = {
      center: accepted.center,
      fov: accepted.fov,
      tMs: accepted.tMs
    };
    expect(lastPoint.center.yaw - initial.center.yaw).toBeGreaterThan(18);
    expect(Math.abs(lastPoint.center.pitch - initial.center.pitch)).toBeLessThan(2);
    await replaceStoredPathBaseline(page, session, lastPoint);

    const screenshotPath = testInfo.outputPath("pointer-click-pc-editor-after-move.png");
    await page.screenshot({ fullPage: true, path: screenshotPath });
    await testInfo.attach("pointer click PC editor after move", {
      contentType: "image/png",
      path: screenshotPath
    });

    const exportPath = testInfo.outputPath("pointer-click-render-test.mp4");
    await mkdir(path.dirname(exportPath), { recursive: true });
    await renderAndDownloadExport(page, session.sessionId, exportPath);
    await analyzeExportFrame({
      axis: "horizontal",
      exportPath,
      label: "pointer-click",
      lastPoint,
      testInfo
    });
  });

  test("pointer clicks on each side of the video sphere move the mask in matching directions", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setVideoForRecording(page, 1);

    await setMaskCenter(page, { yaw: 0, pitch: 0 });
    await clickStageAt(page, 0.66, 0.5);
    await expect.poll(async () => (await readCropMaskState(page)).center?.yaw ?? -999).toBeGreaterThan(18);
    await page.waitForTimeout(320);

    await setMaskCenter(page, { yaw: 0, pitch: 0 });
    await clickStageAt(page, 0.34, 0.5);
    await expect.poll(async () => (await readCropMaskState(page)).center?.yaw ?? 999).toBeLessThan(-18);
    await page.waitForTimeout(320);

    await setMaskCenter(page, { yaw: 0, pitch: 0 });
    await clickStageAt(page, 0.5, 0.32);
    await expect.poll(async () => (await readCropMaskState(page)).center?.pitch ?? -999).toBeGreaterThan(10);
    await page.waitForTimeout(320);

    await setMaskCenter(page, { yaw: 0, pitch: 0 });
    await clickStageAt(page, 0.5, 0.68);
    await expect.poll(async () => (await readCropMaskState(page)).center?.pitch ?? 999).toBeLessThan(-10);

    await pauseVideo(page);
  });

  test("PC lock toggle switches between locked mask and head-gaze follow state", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    const initial = await readCropMaskState(page);
    expect(initial.locked).toBe(true);

    await page.getByTestId("xr-pc-lock-toggle").click();
    await expect.poll(async () => (await readCropMaskState(page)).locked).toBe(false);
    await expect(page.getByTestId("xr-pc-lock-toggle")).toContainText("Lock");

    await page.getByTestId("xr-pc-lock-toggle").click();
    await expect.poll(async () => (await readCropMaskState(page)).locked).toBe(true);
    await expect(page.getByTestId("xr-pc-lock-toggle")).toContainText("Unlock");
  });

  test("plain drag rotates the 360 view without moving the mask", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setMaskCenter(page, { yaw: 0, pitch: 0 });
    const beforeMask = await readCropMaskState(page);
    const beforeCamera = await readCameraState(page);

    await dragStage(page, { xRatio: 0.5, yRatio: 0.5 }, { xRatio: 0.75, yRatio: 0.5 });

    await expect
      .poll(async () => (await readCameraState(page)).camera?.yaw ?? 0)
      .toBeGreaterThan((beforeCamera.camera?.yaw ?? 0) + 5);
    await expect
      .poll(async () => (await readAFrameLookControlsState(page)).yaw)
      .toBeGreaterThan((beforeCamera.camera?.yaw ?? 0) + 5);
    const afterCamera = await readCameraState(page);
    expect(afterCamera.camera?.pitch).toBeCloseTo(beforeCamera.camera?.pitch ?? 0, 1);
    const afterMask = await readCropMaskState(page);
    expect(afterMask.center?.yaw).toBeCloseTo(beforeMask.center?.yaw ?? 0, 1);
    expect(afterMask.center?.pitch).toBeCloseTo(beforeMask.center?.pitch ?? 0, 1);
  });

  test("Ctrl drag on the video sphere moves the mask without moving the camera", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setMaskCenter(page, { yaw: 0, pitch: 0 });
    const beforeMask = await readCropMaskState(page);
    const beforeCamera = await readCameraState(page);

    await page.keyboard.down("Control");
    await dragStage(page, { xRatio: 0.5, yRatio: 0.5 }, { xRatio: 0.75, yRatio: 0.5 });
    await page.keyboard.up("Control");

    await expect
      .poll(async () => (await readCropMaskState(page)).center?.yaw ?? 0)
      .toBeGreaterThan((beforeMask.center?.yaw ?? 0) + 5);
    await expect
      .poll(async () => Math.abs(((await readCropMaskState(page)).center?.pitch ?? 0) - (beforeMask.center?.pitch ?? 0)))
      .toBeLessThan(2);
    const afterCamera = await readCameraState(page);
    expect(afterCamera.camera?.yaw).toBeCloseTo(beforeCamera.camera?.yaw ?? 0, 1);
    expect(afterCamera.camera?.pitch).toBeCloseTo(beforeCamera.camera?.pitch ?? 0, 1);
  });

  test("Ctrl drag at the screen edge pans camera and mask together", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setMaskCenter(page, { yaw: 0, pitch: 0 });
    const beforeMask = await readCropMaskState(page);
    const beforeCamera = await readCameraState(page);

    await page.keyboard.down("Control");
    await dragStageToAndHold(page, { xRatio: 0.5, yRatio: 0.5 }, { xRatio: 0.99, yRatio: 0.5 }, 520);
    await page.keyboard.up("Control");

    await expect
      .poll(async () => (await readCropMaskState(page)).center?.yaw ?? 0)
      .toBeGreaterThan((beforeMask.center?.yaw ?? 0) + 10);
    await expect
      .poll(async () => (await readCameraState(page)).camera?.yaw ?? 0)
      .toBeGreaterThan((beforeCamera.camera?.yaw ?? 0) + 3);
  });

  test("Ctrl click on the video sphere moves the mask without transition", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setMaskCenter(page, { yaw: 0, pitch: 0 });

    await ctrlClickStageAt(page, 0.66, 0.5);

    await expect.poll(async () => (await readCropMaskState(page)).center?.yaw ?? 0, { timeout: 500 }).toBeGreaterThan(15);
  });

  test("holding Q and E resizes the mask continuously", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    const initial = await readCropMaskState(page);
    await page.keyboard.down("q");
    await page.waitForTimeout(260);
    await page.keyboard.up("q");
    await expect.poll(async () => (await readCropMaskState(page)).fov?.h ?? 999).toBeLessThan((initial.fov?.h ?? 0) - 6);

    const narrowed = await readCropMaskState(page);
    await page.keyboard.down("e");
    await page.waitForTimeout(260);
    await page.keyboard.up("e");
    await expect.poll(async () => (await readCropMaskState(page)).fov?.h ?? 0).toBeGreaterThan((narrowed.fov?.h ?? 0) + 6);
  });

  test("holding WASD moves the mask continuously", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setMaskCenter(page, { yaw: 0, pitch: 0 });

    await page.keyboard.down("d");
    await page.waitForTimeout(260);
    await page.keyboard.up("d");

    await expect.poll(async () => (await readCropMaskState(page)).center?.yaw ?? 0).toBeGreaterThan(6);
  });

  test("Space toggles PC editor playback only once", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setVideoForRecording(page, 1);

    await expect.poll(async () => (await readCameraState(page)).camera !== undefined).toBe(true);
    await expect.poll(async () => (await readVideoControlState(page)).status).toBe("playing");

    await page.keyboard.press("Space");
    await expect.poll(async () => (await readVideoControlState(page)).status).toBe("paused");

    await page.keyboard.press("Space");
    await expect.poll(async () => (await readVideoControlState(page)).status).toBe("playing");
  });

  test("mouse wheel can zoom the 360 camera into tiny-planet style FOV", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await page.getByTestId("xr-pc-stage-hit-layer").hover();
    for (let index = 0; index < 18; index += 1) {
      await page.mouse.wheel(0, -900);
    }
    await expect.poll(async () => (await readCameraState(page)).fov ?? 999).toBeLessThan(3);
  });

  test("holding H and using the wheel adjusts mask opacity", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    const initial = await readCropMaskState(page);
    const beforeCamera = await readCameraState(page);

    await page.getByTestId("xr-pc-stage-hit-layer").hover();
    await page.keyboard.down("h");
    await page.mouse.wheel(0, -900);
    await page.keyboard.up("h");

    await expect
      .poll(async () => (await readCropMaskState(page)).maskOpacity ?? 0)
      .toBeGreaterThan((initial.maskOpacity ?? 0) + 0.08);
    expect((await readCameraState(page)).fov).toBeCloseTo(beforeCamera.fov ?? 80, 1);
  });

  test("effect rack sends an effect event and shows a WebXR preview", async ({ page }) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);

    const effectPatch = page.waitForResponse((response) =>
      response.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`) &&
      response.request().method() === "POST"
    );
    await page.getByTestId("xr-pc-effect-transition-black-fade").click();

    await expect(page.getByTestId("xr-pc-effect-preview")).toBeVisible();
    const response = await effectPatch;
    expect(response.status()).toBeLessThan(400);
  });

  test("vertical 90 degree pitch stress sends a matching timeline path and render", async ({ page }, testInfo) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await setMaskCenter(page, { yaw: 0, pitch: -45 });
    await replaceStoredPathBaseline(page, session, cropStateToAcceptedPoint(await readCropMaskState(page)));

    const before = await readCropMaskState(page);
    const beforeRevision = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0;
    await setVideoForRecording(page, 1);
    await page.getByTestId("aframe-video-sphere-player").hover();
    await page.keyboard.down("w");
    await expect.poll(async () => (await readCropMaskState(page)).center?.pitch ?? -90, { timeout: 4_500 }).toBeGreaterThan(44);
    await page.keyboard.up("w");
    await pauseVideo(page);

    const lastPoint = await flushAndReadLastPoint(page, {
      afterRevision: beforeRevision,
      expected: await readCropMaskState(page)
    });
    expect((lastPoint.center.pitch ?? 0) - (before.center?.pitch ?? 0)).toBeGreaterThan(85);
    await replaceStoredPathBaseline(page, session, lastPoint);

    const exportPath = testInfo.outputPath("vertical-90-render-test.mp4");
    await mkdir(path.dirname(exportPath), { recursive: true });
    await renderAndDownloadExport(page, session.sessionId, exportPath);
    await analyzeExportFrame({
      axis: "vertical",
      exportPath,
      label: "vertical-90",
      lastPoint,
      testInfo
    });
  });

  for (const fovCase of [
    { direction: "in", expected: "less", testId: "xr-pc-fov-in" },
    { direction: "out", expected: "greater", testId: "xr-pc-fov-out" }
  ] as const) {
    test(`FOV zoom ${fovCase.direction} sends a matching timeline path and render`, async ({ page }, testInfo) => {
      const session = await createGridSession(page);
      await openPcEditor(page, session.xrPath);
      await setMaskCenter(page, { yaw: 20, pitch: 20 });
      await replaceStoredPathBaseline(page, session, cropStateToAcceptedPoint(await readCropMaskState(page)));

      const before = await readCropMaskState(page);
      const beforeRevision = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0;
      await setVideoForRecording(page, 9.5);
      await page.getByTestId(fovCase.testId).click();
      if (fovCase.expected === "less") {
        await expect.poll(async () => (await readCropMaskState(page)).fov?.h ?? 999).toBeLessThan((before.fov?.h ?? 0) - 4);
      } else {
        await expect.poll(async () => (await readCropMaskState(page)).fov?.h ?? 0).toBeGreaterThan((before.fov?.h ?? 0) + 4);
      }
      await page.waitForTimeout(250);
      await pauseVideo(page);

      const lastPoint = await flushAndReadLastPoint(page, {
        afterRevision: beforeRevision,
        expected: await readCropMaskState(page)
      });
      if (fovCase.expected === "less") {
        expect(lastPoint.fov.h).toBeLessThan(before.fov?.h ?? 0);
      } else {
        expect(lastPoint.fov.h).toBeGreaterThan(before.fov?.h ?? 0);
      }
      await replaceStoredPathBaseline(page, session, lastPoint);

      const exportPath = testInfo.outputPath(`fov-${fovCase.direction}-render-test.mp4`);
      await mkdir(path.dirname(exportPath), { recursive: true });
      await renderAndDownloadExport(page, session.sessionId, exportPath);
      await analyzeExportFrame({
        axis: "horizontal",
        exportPath,
        label: `fov-${fovCase.direction}`,
        lastPoint,
        testInfo
      });
      await analyzeExportFrame({
        axis: "vertical",
        exportPath,
        label: `fov-${fovCase.direction}`,
        lastPoint,
        testInfo
      });
      await analyzeExportFrame({
        axis: "fov-scale",
        exportPath,
        label: `fov-${fovCase.direction}`,
        lastPoint,
        testInfo
      });
    });
  }

  test("PC workflow start/end/render buttons run a complete crop export", async ({ page }, testInfo) => {
    const session = await createGridSession(page);
    await openPcEditor(page, session.xrPath);
    await page.evaluate(async () => {
      const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
      if (!video) {
        throw new Error("session video element missing");
      }
      video.currentTime = 0.15;
      video.playbackRate = 9.5;
      video.pause();
    });

    await page.getByTestId("xr-pc-start-crop").click();
    await expect(page.getByTestId("xr-pc-render-status")).toContainText("Recording crop path");
    await page.getByTestId("aframe-video-sphere-player").hover();
    await page.keyboard.down("d");
    await page.waitForTimeout(260);
    await page.keyboard.up("d");
    await page.getByTestId("xr-pc-fov-in").click();
    await page.waitForTimeout(280);
    await page.keyboard.down("w");
    await page.waitForTimeout(260);
    await page.keyboard.up("w");

    await page.getByTestId("xr-pc-end-crop").click();
    await expect(page.getByTestId("xr-pc-render-status")).toContainText("Crop path sealed", { timeout: 10_000 });
    const lastPoint = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.lastPoint;
    if (!lastPoint?.center || !lastPoint.fov) {
      throw new Error("workflow did not expose the final accepted crop point");
    }

    await page.getByTestId("xr-pc-render").click();
    await expect(page.getByTestId("xr-pc-render-status")).toContainText("Export ready", { timeout: 90_000 });
    const downloadLink = page.getByTestId("xr-pc-export-download");
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.getAttribute("href");
    if (!href) {
      throw new Error("workflow render did not expose a download link");
    }

    const download = await page.request.get(href);
    expect(download.status()).toBe(200);
    const exportPath = testInfo.outputPath("pc-workflow-render-test.mp4");
    await mkdir(path.dirname(exportPath), { recursive: true });
    await writeFile(exportPath, await download.body());
    await analyzeExportFrame({
      axis: "fov-scale",
      exportPath,
      label: "pc-workflow",
      lastPoint: {
        center: lastPoint.center,
        fov: lastPoint.fov,
        tMs: lastPoint.tMs
      },
      testInfo
    });
  });
});
