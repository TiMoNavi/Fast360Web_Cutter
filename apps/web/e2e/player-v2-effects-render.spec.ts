import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

test.use({ ignoreHTTPSErrors: true });
test.describe.configure({ mode: "serial" });
test.setTimeout(140_000);

const repoRoot = path.resolve(process.cwd(), "..", "..");
const gridVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");

type PixelStats = {
  mean: number;
  nonDarkRatio: number;
  std: number;
};

type FrameDiffStats = {
  meanAbsDiff: number;
};

type PathPatchRequestBody = {
  points?: Array<{
    center?: {
      pitch?: number;
      yaw?: number;
    };
    fov?: {
      h?: number;
      v?: number;
    };
    tMs?: number;
  }>;
  replaceRange?: {
    endMs?: number;
    reason?: string;
    startMs?: number;
  };
};

function readPostJson(request: Request): unknown {
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
}

async function createGridSession(page: Page) {
  const email = `player-v2-effects-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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
  const sessionId = `session_player_v2_effects_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

async function openPlayerV2(page: Page) {
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/vendor/aframe");
      return response.status();
    }, { timeout: 30_000 })
    .toBe(200);
  const response = await page.goto("/xr/player-v2", { waitUntil: "commit" });
  expect(response?.status()).toBeLessThan(400);
  await page.waitForFunction(() => Boolean(window.AFRAME), { timeout: 20_000 });
  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible();
  await expect(page.getByTestId("aframe-crop-mask-preview")).toBeAttached();
  await expect(page.getByTestId("aframe-viewport-mask-effect-preview")).toBeAttached();
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
}

async function focusShortcutSurface(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function expectViewportMaskPreviewLayerAnchored(page: Page) {
  const measurement = await page.evaluate(() => {
    const preview = document.querySelector("[data-testid='xr-pc-effect-preview']");
    const visual = preview?.querySelector(".xr-pc-effect-preview-visual");
    const pulse = preview?.querySelector(".xr-pc-effect-preview-pulse");
    const layer = [visual, pulse].find((candidate) => candidate && getComputedStyle(candidate).display !== "none");

    if (!layer) {
      return null;
    }

    const rect = layer.getBoundingClientRect();
    const style = getComputedStyle(layer);

    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      height: rect.height,
      maskLeft: Number.parseFloat(style.getPropertyValue("--pc-mask-left")),
      maskTop: Number.parseFloat(style.getPropertyValue("--pc-mask-top")),
      transform: style.getPropertyValue("--pc-mask-transform").trim(),
      width: rect.width
    };
  });

  expect(measurement).not.toBeNull();
  expect(measurement?.width).toBeGreaterThan(80);
  expect(measurement?.height).toBeGreaterThan(45);
  expect(Math.abs((measurement?.centerX ?? 0) - (measurement?.maskLeft ?? 0))).toBeLessThan(1.5);
  expect(Math.abs((measurement?.centerY ?? 0) - (measurement?.maskTop ?? 0))).toBeLessThan(1.5);
  expect(measurement?.transform).toBe("translate(-50%, -50%)");
}

async function analyzeImage(pathname: string): Promise<PixelStats> {
  const result = spawnSync(
    "python",
    [
      "-c",
      [
        "import cv2, json, numpy as np, sys",
        "img = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)",
        "assert img is not None, sys.argv[1]",
        "non_dark = (np.max(img, axis=2) > 18).mean()",
        "print(json.dumps({'mean': float(img.mean()), 'std': float(img.std()), 'nonDarkRatio': float(non_dark)}))"
      ].join("; "),
      pathname
    ],
    {
      cwd: repoRoot,
      encoding: "utf-8"
    }
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout || "{}") as PixelStats;
}

async function analyzeVideoFrame(pathname: string, frameMs: number): Promise<PixelStats> {
  const result = spawnSync(
    "python",
    [
      "-c",
      [
        "import cv2, json, numpy as np, sys",
        "video = sys.argv[1]",
        "frame_ms = int(sys.argv[2])",
        "cap = cv2.VideoCapture(video)",
        "assert cap.isOpened(), video",
        "cap.set(cv2.CAP_PROP_POS_MSEC, frame_ms)",
        "ok, frame = cap.read()",
        "assert ok and frame is not None, video",
        "non_dark = (np.max(frame, axis=2) > 18).mean()",
        "print(json.dumps({'mean': float(frame.mean()), 'std': float(frame.std()), 'nonDarkRatio': float(non_dark)}))"
      ].join("; "),
      pathname,
      String(frameMs)
    ],
    {
      cwd: repoRoot,
      encoding: "utf-8"
    }
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout || "{}") as PixelStats;
}

async function analyzeVideoFrameDifference(leftPath: string, rightPath: string, frameMs: number): Promise<FrameDiffStats> {
  const result = spawnSync(
    "python",
    [
      "-c",
      [
        "import cv2, json, numpy as np, sys",
        "left_path, right_path, frame_ms = sys.argv[1], sys.argv[2], int(sys.argv[3])",
        "def read_frame(path):",
        "    cap = cv2.VideoCapture(path)",
        "    assert cap.isOpened(), path",
        "    cap.set(cv2.CAP_PROP_POS_MSEC, frame_ms)",
        "    ok, frame = cap.read()",
        "    assert ok and frame is not None, path",
        "    return frame",
        "left = read_frame(left_path)",
        "right = read_frame(right_path)",
        "if left.shape != right.shape:",
        "    right = cv2.resize(right, (left.shape[1], left.shape[0]))",
        "diff = np.abs(left.astype(np.float32) - right.astype(np.float32)).mean()",
        "print(json.dumps({'meanAbsDiff': float(diff)}))"
      ].join("\n"),
      leftPath,
      rightPath,
      String(frameMs)
    ],
    {
      cwd: repoRoot,
      encoding: "utf-8"
    }
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout || "{}") as FrameDiffStats;
}

async function writeBaselinePath(page: Page, session: { sessionId: string; videoId: string }) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`, {
    data: {
      pathRevision: 1,
      points: [0, 1400].map((tMs, index) => ({
        center: { pitch: 0, yaw: 0 },
        cut: false,
        enabled: true,
        fov: { h: 90, v: 58.72 },
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
        endMs: 1600,
        reason: "replay",
        startMs: 0
      },
      sessionId: session.sessionId,
      takeId: `effects_baseline_${Date.now().toString(36)}`,
      version: 1,
      videoId: session.videoId
    }
  });
  expect(response.status()).toBe(200);
}

async function writeHeroPushPath(page: Page, session: { sessionId: string; videoId: string }) {
  const points = [
    {
      center: { pitch: 0, yaw: 0 },
      fov: { h: 90, v: 58.72 },
      interpolation: "hold",
      tMs: 0,
      transitionMs: 0
    },
    {
      center: { pitch: 0, yaw: 0 },
      fov: { h: 80, v: 48.46 },
      interpolation: "fast",
      tMs: 648,
      transitionMs: 648
    },
    {
      center: { pitch: 0, yaw: 0 },
      fov: { h: 81, v: 49.24 },
      interpolation: "fast",
      tMs: 900,
      transitionMs: 252
    }
  ].map((point, index) => ({
    ...point,
    cut: false,
    enabled: true,
    input: "head_gaze",
    locked: true,
    roll: 0,
    seq: index + 1,
    smoothFollow: false
  }));

  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`, {
    data: {
      pathRevision: 1,
      points,
      replaceRange: {
        endMs: 1000,
        reason: "fov",
        startMs: 0
      },
      sessionId: session.sessionId,
      takeId: `effects_hero_push_${Date.now().toString(36)}`,
      version: 1,
      videoId: session.videoId
    }
  });
  expect(response.status()).toBe(200);
}

async function writeBlackSolidEffect(page: Page, session: { sessionId: string; videoId: string }) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`, {
    data: {
      effectRevision: 1,
      events: [
        {
          displayName: "E2E black solid",
          enabled: true,
          endMs: 1200,
          eventName: "black.solid",
          params: {
            color: "#000000",
            opacity: 0.94
          },
          renderPolicy: {
            conflictGroup: "black-field",
            fallback: "fail",
            priority: 100
          },
          seq: 1,
          startMs: 0
        }
      ],
      replaceRange: {
        endMs: 1200,
        reason: "effect",
        startMs: 0
      },
      sessionId: session.sessionId,
      version: 1,
      videoId: session.videoId
    }
  });
  expect(response.status()).toBe(200);
}

async function writeWhiteFlashEffect(page: Page, session: { sessionId: string; videoId: string }) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`, {
    data: {
      effectRevision: 1,
      events: [
        {
          displayName: "E2E white flash",
          enabled: true,
          endMs: 1000,
          eventName: "transition.flash_white",
          params: {
            color: "#ffffff",
            direction: "hold",
            fadeInMs: 140,
            fadeOutMs: 140,
            peakOpacity: 0.96
          },
          renderPolicy: {
            conflictGroup: "frame.occlusion",
            fallback: "fail",
            priority: 90
          },
          seq: 1,
          startMs: 0
        }
      ],
      replaceRange: {
        endMs: 1000,
        reason: "effect",
        startMs: 0
      },
      sessionId: session.sessionId,
      version: 1,
      videoId: session.videoId
    }
  });
  expect(response.status()).toBe(200);
}

async function writeSoftBlurEffect(page: Page, session: { sessionId: string; videoId: string }) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`, {
    data: {
      effectRevision: 1,
      events: [
        {
          displayName: "E2E soft blur",
          enabled: true,
          endMs: 760,
          eventName: "filter.blur",
          params: {
            edgeMs: 180,
            radius: 21,
            strength: 0.48
          },
          renderPolicy: {
            fallback: "fail",
            priority: 60
          },
          seq: 1,
          startMs: 0
        }
      ],
      replaceRange: {
        endMs: 760,
        reason: "effect",
        startMs: 0
      },
      sessionId: session.sessionId,
      version: 1,
      videoId: session.videoId
    }
  });
  expect(response.status()).toBe(200);
}

async function writeRgbSplitEffect(page: Page, session: { sessionId: string; videoId: string }) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`, {
    data: {
      effectRevision: 1,
      events: [
        {
          displayName: "E2E RGB split",
          enabled: true,
          endMs: 520,
          eventName: "filter.chromatic_aberration",
          params: {
            edgeMs: 110,
            offsetPx: 14,
            strength: 0.88
          },
          renderPolicy: {
            fallback: "fail",
            priority: 70
          },
          seq: 1,
          startMs: 0
        }
      ],
      replaceRange: {
        endMs: 520,
        reason: "effect",
        startMs: 0
      },
      sessionId: session.sessionId,
      version: 1,
      videoId: session.videoId
    }
  });
  expect(response.status()).toBe(200);
}

async function renderAndDownload(page: Page, sessionId: string, outputPath: string) {
  const render = await page.request.post(`/api/cut-sessions/${encodeURIComponent(sessionId)}/render-test`, {
    data: {}
  });
  expect(render.status()).toBe(200);
  const body = (await render.json()) as { exportId: string; status: string };
  expect(body.status).toBe("ready");

  const download = await page.request.get(`/api/exports/${encodeURIComponent(body.exportId)}/download`);
  expect(download.status()).toBe(200);
  const buffer = await download.body();
  expect(buffer.length).toBeGreaterThan(8_000);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return body.exportId;
}

test("Player V2 renders real PC pixels and an A-Frame VR black-field preview entity", async ({ page }, testInfo) => {
  await createGridSession(page);
  await openPlayerV2(page);

  const stageBox = await page.getByTestId("player-v2-xr-stage").boundingBox();
  if (!stageBox) {
    throw new Error("Player V2 XR stage did not expose a bounding box");
  }

  const screenshotPath = testInfo.outputPath("player-v2-pc-render.png");
  await page.screenshot({
    path: screenshotPath,
    clip: {
      x: Math.max(0, stageBox.x),
      y: Math.max(0, stageBox.y),
      width: Math.max(1, stageBox.width),
      height: Math.max(1, stageBox.height)
    }
  });
  const pcStats = await analyzeImage(screenshotPath);
  expect(pcStats.nonDarkRatio).toBeGreaterThan(0.08);
  expect(pcStats.std).toBeGreaterThan(8);

  await testInfo.attach("Player V2 PC render", {
    contentType: "image/png",
    path: screenshotPath
  });

  await page.getByTestId("player-v2-xr-stage").dispatchEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const camera = document.querySelector("#main-camera") as
          | (Element & { components?: Record<string, { data?: { fov?: number } }> })
          | null;
        return camera?.components?.camera?.data?.fov ?? 0;
      })
    )
    .toBeGreaterThan(93);

  await focusShortcutSurface(page);
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Effects");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active ? active.tagName.toLowerCase() : "";
      })
    )
    .not.toBe("button");

  await page.keyboard.press("1");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Transition");
  await page.keyboard.down("1");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-effect", "black-fade");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-target", "viewport-mask");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-mode", "hold");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = document.querySelector("[data-testid='aframe-viewport-mask-effect-preview']") as
          | (HTMLElement & {
              components?: Record<string, { data?: { active?: boolean; colorR?: number; opacity?: number } }>;
              getObject3D?: (name: string) => unknown;
            })
          | null;
        const component = preview?.components?.["pc-viewport-mask-effect-preview"];
        return {
          active: component?.data?.active === true,
          colorR: component?.data?.colorR ?? 0,
          hasMesh: Boolean(preview?.getObject3D?.("mesh")),
          opacity: component?.data?.opacity ?? 0
        };
      })
    )
    .toEqual(expect.objectContaining({ active: true, colorR: 0, hasMesh: true }));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const aframe = window.AFRAME as { THREE?: { Vector3: new () => { x: number; y: number; z: number } } } | undefined;
        const Vector3 = aframe?.THREE?.Vector3;
        const maskRig = document.querySelector("[data-testid='aframe-crop-viewport-rig']") as
          | (HTMLElement & { object3D?: { getWorldPosition?: (target: unknown) => unknown } })
          | null;
        const effectRig = document.querySelector("[data-testid='aframe-viewport-mask-effect-preview']") as
          | (HTMLElement & { object3D?: { getWorldPosition?: (target: unknown) => unknown } })
          | null;

        if (!Vector3 || !maskRig?.object3D?.getWorldPosition || !effectRig?.object3D?.getWorldPosition) {
          return Number.POSITIVE_INFINITY;
        }

        const maskPosition = maskRig.object3D.getWorldPosition(new Vector3()) as { x: number; y: number; z: number };
        const effectPosition = effectRig.object3D.getWorldPosition(new Vector3()) as { x: number; y: number; z: number };

        return Math.hypot(
          maskPosition.x - effectPosition.x,
          maskPosition.y - effectPosition.y,
          maskPosition.z - effectPosition.z
        );
      })
    )
    .toBeLessThan(0.01);
  const previewBox = await page.getByTestId("xr-pc-effect-preview").boundingBox();
  if (!previewBox) {
    throw new Error("Web black-field preview visual did not render");
  }
  expect(previewBox.width).toBeGreaterThan(80);
  expect(previewBox.height).toBeGreaterThan(45);
  expect(previewBox.width).toBeLessThanOrEqual(stageBox.width + 2);
  expect(previewBox.height).toBeLessThanOrEqual(stageBox.height + 2);
  await expectViewportMaskPreviewLayerAnchored(page);
  await page.keyboard.up("1");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await page.keyboard.press("1");
  await page.keyboard.down("2");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-effect", "white-fade");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-target", "viewport-mask");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-mode", "hold");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = document.querySelector("[data-testid='aframe-viewport-mask-effect-preview']") as
          | (HTMLElement & {
              components?: Record<string, { data?: { active?: boolean; colorR?: number; opacity?: number } }>;
              getObject3D?: (name: string) => unknown;
            })
          | null;
        const component = preview?.components?.["pc-viewport-mask-effect-preview"];
        return {
          active: component?.data?.active === true,
          colorR: component?.data?.colorR ?? 0,
          hasMesh: Boolean(preview?.getObject3D?.("mesh")),
          opacity: component?.data?.opacity ?? 0
        };
      })
    )
    .toEqual(expect.objectContaining({ active: true, colorR: 1, hasMesh: true }));
  const whitePreviewBox = await page.getByTestId("xr-pc-effect-preview").boundingBox();
  if (!whitePreviewBox) {
    throw new Error("Web white-field preview pulse did not render");
  }
  expect(whitePreviewBox.width).toBeGreaterThan(80);
  expect(whitePreviewBox.height).toBeGreaterThan(45);
  expect(whitePreviewBox.width).toBeLessThanOrEqual(stageBox.width + 2);
  expect(whitePreviewBox.height).toBeLessThanOrEqual(stageBox.height + 2);
  await expectViewportMaskPreviewLayerAnchored(page);
  await page.keyboard.up("2");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Effects");
  await page.keyboard.press("2");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Cyan boost");
  await page.keyboard.down("1");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-effect", "cyan-boost");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-event", "filter.color_grade");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-target", "viewport-mask");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = document.querySelector("[data-testid='aframe-viewport-mask-effect-preview']") as
          | (HTMLElement & {
              components?: Record<string, { data?: { active?: boolean; colorB?: number; colorG?: number; opacity?: number } }>;
              getObject3D?: (name: string) => unknown;
            })
          | null;
        const component = preview?.components?.["pc-viewport-mask-effect-preview"];
        const data = component?.data;
        return Boolean(
          data?.active === true &&
            (data.colorB ?? 0) > 0.5 &&
            (data.colorG ?? 0) > 0.5 &&
            (data.opacity ?? 0) > 0.2 &&
            preview?.getObject3D?.("mesh")
        );
      })
    )
    .toBe(true);
  await expectViewportMaskPreviewLayerAnchored(page);
  await page.keyboard.up("1");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Effects");
  await page.keyboard.press("5");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("RGB split");
  await page.keyboard.down("1");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-effect", "rgb-split");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-event", "filter.chromatic_aberration");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = document.querySelector("[data-testid='aframe-viewport-mask-effect-preview']") as
          | (HTMLElement & {
              components?: Record<string, { data?: { active?: boolean; colorB?: number; colorR?: number; opacity?: number } }>;
              getObject3D?: (name: string) => unknown;
            })
          | null;
        const component = preview?.components?.["pc-viewport-mask-effect-preview"];
        const data = component?.data;
        return Boolean(
          data?.active === true &&
            (data.colorB ?? 0) > 0.5 &&
            (data.colorR ?? 0) > 0.5 &&
            (data.opacity ?? 0) > 0.2 &&
            preview?.getObject3D?.("mesh")
        );
      })
    )
    .toBe(true);
  await page.keyboard.up("1");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Effects");
  await page.keyboard.press("7");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Letterbox");
  await page.keyboard.down("2");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-effect", "letterbox-bars");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-event", "overlay.letterbox");
  await expect(page.getByTestId("xr-pc-effect-preview")).toHaveAttribute("data-target", "viewport-mask");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = document.querySelector("[data-testid='aframe-viewport-mask-effect-preview']") as
          | (HTMLElement & {
              components?: Record<string, { data?: { active?: boolean; opacity?: number } }>;
              getObject3D?: (name: string) => unknown;
            })
          | null;
        const component = preview?.components?.["pc-viewport-mask-effect-preview"];
        const data = component?.data;
        return Boolean(data?.active === true && (data.opacity ?? 0) > 0.2 && preview?.getObject3D?.("mesh"));
      })
    )
    .toBe(true);
  await page.keyboard.up("2");

  const previewIsSceneChild = await page.evaluate(() => {
    const target = document.querySelector("[data-testid='aframe-viewport-mask-effect-preview']");
    return Boolean(target?.closest("a-scene"));
  });
  expect(previewIsSceneChild).toBe(true);
});

test("Player V2 one-key frame presets write real viewport path patches", async ({ page }) => {
  const session = await createGridSession(page);
  await openPlayerV2(page);
  await focusShortcutSurface(page);

  const heroPushResponse = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    if (!response.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`)) {
      return false;
    }
    const body = readPostJson(response.request()) as PathPatchRequestBody | null;
    return Boolean(
      body?.replaceRange?.reason === "fov" &&
        body.points?.length === 3 &&
        body.points?.some((point) => (point.fov?.h ?? 999) < 82)
    );
  });

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Effects");
  await page.keyboard.press("4");
  await expect(page.getByTestId("xr-pc-effect-shortcut-overlay")).toContainText("Frame");
  await page.keyboard.press("1");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const mask = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
          | (Element & {
              components?: Record<string, { data?: { centerPitch?: number; fovH?: number }; center?: { pitch?: number }; fovH?: number }>;
            })
          | null;
        const component = mask?.components?.["pc-crop-viewport-mask"];
        return component?.data?.fovH ?? component?.fovH ?? 0;
      })
    )
    .toBeLessThan(86);

  const heroResponse = await heroPushResponse;
  expect(heroResponse.status()).toBe(200);
  const heroResult = (await heroResponse.json()) as { acceptedPoints?: number; status?: string };
  expect(heroResult).toEqual(expect.objectContaining({ acceptedPoints: 3, status: "accepted" }));

  const heroBody = readPostJson(heroResponse.request()) as PathPatchRequestBody;
  const heroPoints = [...(heroBody.points ?? [])].sort((left, right) => (left.tMs ?? 0) - (right.tMs ?? 0));
  expect(heroPoints).toHaveLength(3);
  const [heroStart, heroPeak, heroEnd] = heroPoints;
  expect(heroBody.replaceRange).toEqual(expect.objectContaining({ reason: "fov", startMs: heroStart.tMs }));
  expect((heroPeak.tMs ?? 0) - (heroStart.tMs ?? 0)).toBeGreaterThanOrEqual(620);
  expect((heroPeak.tMs ?? 0) - (heroStart.tMs ?? 0)).toBeLessThanOrEqual(670);
  expect((heroEnd.tMs ?? 0) - (heroStart.tMs ?? 0)).toBeGreaterThanOrEqual(880);
  expect(heroPeak.fov?.h).toBeLessThan((heroStart.fov?.h ?? 90) - 8);
  expect(heroEnd.fov?.h).toBeLessThan((heroStart.fov?.h ?? 90) - 7);

  await page.keyboard.press("Escape");

  const driftResponsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    if (!response.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`)) {
      return false;
    }
    const body = readPostJson(response.request()) as PathPatchRequestBody | null;
    if (body?.replaceRange?.reason !== "fov" || body.points?.length !== 2) {
      return false;
    }
    const points = [...(body.points ?? [])].sort((left, right) => (left.tMs ?? 0) - (right.tMs ?? 0));
    const startYaw = points[0]?.center?.yaw ?? 0;
    const endYaw = points[1]?.center?.yaw ?? 0;
    return endYaw < startYaw - 6;
  });

  await page.keyboard.press("Tab");
  await page.keyboard.press("4");
  await page.keyboard.press("3");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const mask = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
          | (Element & {
              components?: Record<string, { data?: { centerYaw?: number; fovH?: number }; center?: { yaw?: number }; fovH?: number }>;
            })
          | null;
        const component = mask?.components?.["pc-crop-viewport-mask"];
        return component?.data?.centerYaw ?? component?.center?.yaw ?? 0;
      })
    )
    .toBeLessThan(-5);

  const driftResponse = await driftResponsePromise;
  expect(driftResponse.status()).toBe(200);
  const driftResult = (await driftResponse.json()) as { acceptedPoints?: number; status?: string };
  expect(driftResult).toEqual(expect.objectContaining({ acceptedPoints: 2, status: "accepted" }));

  await page.keyboard.press("Escape");

  const shakeResponsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    if (!response.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`)) {
      return false;
    }
    const body = readPostJson(response.request()) as PathPatchRequestBody | null;
    if (body?.replaceRange?.reason !== "lock" || (body.points?.length ?? 0) < 6) {
      return false;
    }
    const points = [...(body.points ?? [])].sort((left, right) => (left.tMs ?? 0) - (right.tMs ?? 0));
    const startYaw = points[0]?.center?.yaw ?? 0;
    return points.some((point) => Math.abs((point.center?.yaw ?? startYaw) - startYaw) > 1.8);
  });

  await page.keyboard.press("Tab");
  await page.keyboard.press("4");
  await page.keyboard.press("4");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const mask = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
          | (Element & {
              components?: Record<string, { data?: { centerYaw?: number }; center?: { yaw?: number } }>;
            })
          | null;
        const component = mask?.components?.["pc-crop-viewport-mask"];
        return component?.data?.centerYaw ?? component?.center?.yaw ?? 0;
      })
    )
    .not.toBeCloseTo(0, 1);

  const shakeResponse = await shakeResponsePromise;
  expect(shakeResponse.status()).toBe(200);
  const shakeResult = (await shakeResponse.json()) as { acceptedPoints?: number; status?: string };
  expect(shakeResult).toEqual(expect.objectContaining({ acceptedPoints: 6, status: "accepted" }));
});

test("Player V2 fixed frame motion duration follows FX speed wheel scaling", async ({ page }) => {
  const session = await createGridSession(page);
  await openPlayerV2(page);
  await focusShortcutSurface(page);

  await page.getByTestId("player-v2-xr-stage").hover();
  await page.keyboard.down("c");
  await page.mouse.wheel(0, -900);
  await page.mouse.wheel(0, -900);
  await page.keyboard.up("c");
  await expect(page.getByTestId("xr-session-effect-speed")).toContainText(/FX 1\.[12]x/);

  const pathPatchResponse = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    if (!response.url().includes(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`)) {
      return false;
    }
    const body = readPostJson(response.request()) as PathPatchRequestBody | null;
    return Boolean(
      body?.replaceRange?.reason === "fov" &&
        body.points?.length === 3 &&
        body.points?.some((point) => (point.fov?.h ?? 999) < 82)
    );
  });

  await page.keyboard.press("Tab");
  await page.keyboard.press("4");
  await page.keyboard.press("1");

  const response = await pathPatchResponse;
  expect(response.status()).toBe(200);
  const body = readPostJson(response.request()) as PathPatchRequestBody;
  const points = [...(body.points ?? [])].sort((left, right) => (left.tMs ?? 0) - (right.tMs ?? 0));
  expect(points).toHaveLength(3);

  const [start, peak, end] = points;
  const peakOffsetMs = (peak.tMs ?? 0) - (start.tMs ?? 0);
  const durationMs = (end.tMs ?? 0) - (start.tMs ?? 0);
  expect(peakOffsetMs).toBeGreaterThanOrEqual(500);
  expect(peakOffsetMs).toBeLessThan(620);
  expect(durationMs).toBeGreaterThan(680);
  expect(durationMs).toBeLessThan(880);
});

test("backend render-test writes a real MP4 with a black-field effect applied", async ({ page }, testInfo) => {
  const session = await createGridSession(page);
  await writeBaselinePath(page, session);
  await writeBlackSolidEffect(page, session);

  const exportPath = testInfo.outputPath("black-solid-render-test.mp4");
  const exportId = await renderAndDownload(page, session.sessionId, exportPath);
  expect(exportId).toMatch(/^export_/);

  const frameStats = await analyzeVideoFrame(exportPath, 500);
  expect(frameStats.mean).toBeLessThan(28);
  expect(frameStats.nonDarkRatio).toBeLessThan(0.18);

  await testInfo.attach("black solid render-test mp4", {
    contentType: "video/mp4",
    path: exportPath
  });
});

test("backend render-test writes a real MP4 with a white-field effect applied", async ({ page }, testInfo) => {
  const session = await createGridSession(page);
  await writeBaselinePath(page, session);
  await writeWhiteFlashEffect(page, session);

  const exportPath = testInfo.outputPath("white-flash-render-test.mp4");
  const exportId = await renderAndDownload(page, session.sessionId, exportPath);
  expect(exportId).toMatch(/^export_/);

  const frameStats = await analyzeVideoFrame(exportPath, 500);
  expect(frameStats.mean).toBeGreaterThan(210);
  expect(frameStats.nonDarkRatio).toBeGreaterThan(0.96);

  await testInfo.attach("white flash render-test mp4", {
    contentType: "video/mp4",
    path: exportPath
  });
});

test("backend render-test writes real MP4s with soft blur and RGB split effects", async ({ page }, testInfo) => {
  const blurSession = await createGridSession(page);
  const blurOutputDir = path.join(repoRoot, "storage", "tmp", "e2e-player-v2-effects", blurSession.sessionId);
  await writeBaselinePath(page, blurSession);
  const blurBaselinePath = path.join(blurOutputDir, "soft-blur-baseline-render-test.mp4");
  await renderAndDownload(page, blurSession.sessionId, blurBaselinePath);

  await writeSoftBlurEffect(page, blurSession);
  const blurPath = path.join(blurOutputDir, "soft-blur-render-test.mp4");
  await renderAndDownload(page, blurSession.sessionId, blurPath);

  const blurDiffStats = await analyzeVideoFrameDifference(blurBaselinePath, blurPath, 380);
  expect(blurDiffStats.meanAbsDiff).toBeGreaterThan(1.4);

  const rgbSession = await createGridSession(page);
  const rgbOutputDir = path.join(repoRoot, "storage", "tmp", "e2e-player-v2-effects", rgbSession.sessionId);
  await writeBaselinePath(page, rgbSession);
  const rgbBaselinePath = path.join(rgbOutputDir, "rgb-split-baseline-render-test.mp4");
  await renderAndDownload(page, rgbSession.sessionId, rgbBaselinePath);

  await writeRgbSplitEffect(page, rgbSession);
  const rgbPath = path.join(rgbOutputDir, "rgb-split-render-test.mp4");
  await renderAndDownload(page, rgbSession.sessionId, rgbPath);

  const rgbDiffStats = await analyzeVideoFrameDifference(rgbBaselinePath, rgbPath, 260);
  expect(rgbDiffStats.meanAbsDiff).toBeGreaterThan(2.5);

  await testInfo.attach("soft blur render-test mp4", {
    contentType: "video/mp4",
    path: blurPath
  });
  await testInfo.attach("rgb split render-test mp4", {
    contentType: "video/mp4",
    path: rgbPath
  });
});

test("backend render-test writes a real MP4 with a fixed viewport motion path applied", async ({ page }, testInfo) => {
  const session = await createGridSession(page);
  const outputDir = path.join(repoRoot, "storage", "tmp", "e2e-player-v2-effects", session.sessionId);

  await writeBaselinePath(page, session);
  const baselinePath = path.join(outputDir, "hero-push-baseline-render-test.mp4");
  await renderAndDownload(page, session.sessionId, baselinePath);
  const baselineFrameStats = await analyzeVideoFrame(baselinePath, 700);
  expect(baselineFrameStats.nonDarkRatio).toBeGreaterThan(0.08);

  await writeHeroPushPath(page, session);
  const motionPath = path.join(outputDir, "hero-push-render-test.mp4");
  const exportId = await renderAndDownload(page, session.sessionId, motionPath);
  expect(exportId).toMatch(/^export_/);

  const peakFrameStats = await analyzeVideoFrame(motionPath, 700);
  expect(peakFrameStats.nonDarkRatio).toBeGreaterThan(0.08);
  expect(peakFrameStats.std).toBeGreaterThan(8);

  const startDiffStats = await analyzeVideoFrameDifference(baselinePath, motionPath, 0);
  const peakDiffStats = await analyzeVideoFrameDifference(baselinePath, motionPath, 700);
  expect(startDiffStats.meanAbsDiff).toBeLessThan(3);
  expect(peakDiffStats.meanAbsDiff).toBeGreaterThan(startDiffStats.meanAbsDiff + 2);
  expect(peakDiffStats.meanAbsDiff).toBeGreaterThan(2.5);

  await testInfo.attach("hero push render-test mp4", {
    contentType: "video/mp4",
    path: motionPath
  });
  await testInfo.attach("hero push baseline render-test mp4", {
    contentType: "video/mp4",
    path: baselinePath
  });
});
