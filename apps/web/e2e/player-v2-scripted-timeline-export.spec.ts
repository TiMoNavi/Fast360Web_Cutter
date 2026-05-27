import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

test.use({ ignoreHTTPSErrors: true });
test.setTimeout(140_000);

const TEST_EMAIL = "madjad020@gmail.com";
const TEST_PASSWORD = "yanbaojie00000";
const repoRoot = path.resolve(process.cwd(), "..", "..");
const sampleVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");

type TestSession = {
  sessionId: string;
  videoId: string;
};

type ProbeStats = {
  durationMs: number;
  height: number;
  width: number;
};

type PixelStats = {
  mean: number;
  nonDarkRatio: number;
  std: number;
};

async function expectOk(response: APIResponse, label: string) {
  if (!response.ok()) {
    throw new Error(`${label} failed with ${response.status()}: ${await response.text()}`);
  }
}

async function ensureFixedAccount(page: Page) {
  const register = await page.request.post("/api/auth/register", {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    }
  });

  if (register.ok()) {
    return;
  }

  if (register.status() !== 409) {
    throw new Error(`register failed with ${register.status()}: ${await register.text()}`);
  }

  const login = await page.request.post("/api/auth/login", {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    }
  });
  await expectOk(login, "login fixed E2E account");
}

async function uploadSampleVideo(page: Page) {
  const upload = await page.request.post("/api/videos/upload", {
    multipart: {
      file: {
        buffer: readFileSync(sampleVideoPath),
        mimeType: "video/mp4",
        name: `e2e-scripted-timeline-${Date.now()}.mp4`
      }
    }
  });
  await expectOk(upload, "upload sample video");
  return (await upload.json()) as { id: string };
}

async function createCutSession(page: Page, videoId: string): Promise<TestSession> {
  const sessionId = `session_player_v2_scripted_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      videoId
    }
  });
  await expectOk(session, "create scripted cut session");
  return { sessionId, videoId };
}

function verticalFovFromHorizontal(h: number) {
  const radians = 2 * Math.atan(Math.tan((h * Math.PI) / 360) * (9 / 16));
  return Number(((radians * 180) / Math.PI).toFixed(2));
}

function pathPoint({
  cut = false,
  enabled = true,
  fovH,
  interpolation = "linear",
  pitch,
  seq,
  tMs,
  transitionMs = 0,
  yaw
}: {
  cut?: boolean;
  enabled?: boolean;
  fovH: number;
  interpolation?: "fast" | "hold" | "linear";
  pitch: number;
  seq: number;
  tMs: number;
  transitionMs?: number;
  yaw: number;
}) {
  return {
    center: { pitch, yaw },
    cut,
    enabled,
    fov: { h: fovH, v: verticalFovFromHorizontal(fovH) },
    input: "head_gaze",
    interpolation,
    locked: true,
    roll: 0,
    seq,
    smoothFollow: false,
    tMs,
    transitionMs
  };
}

async function writeBasePath(page: Page, session: TestSession) {
  const points = [
    pathPoint({ fovH: 92, pitch: 0, seq: 1, tMs: 0, yaw: 0 }),
    pathPoint({ fovH: 82, interpolation: "fast", pitch: -3, seq: 2, tMs: 900, transitionMs: 400, yaw: 22 }),
    pathPoint({ fovH: 82, interpolation: "hold", pitch: -3, seq: 3, tMs: 1600, yaw: 22 }),
    pathPoint({ fovH: 82, interpolation: "hold", pitch: -3, seq: 4, tMs: 2200, yaw: 22 }),
    pathPoint({ cut: true, fovH: 100, interpolation: "fast", pitch: 5, seq: 5, tMs: 2800, transitionMs: 300, yaw: -18 }),
    pathPoint({ fovH: 78, interpolation: "fast", pitch: -4, seq: 6, tMs: 4200, transitionMs: 260, yaw: 35 }),
    pathPoint({ fovH: 88, pitch: 1, seq: 7, tMs: 5200, yaw: -8 }),
    pathPoint({ fovH: 90, pitch: 0, seq: 8, tMs: 6200, yaw: 10 })
  ];

  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`, {
    data: {
      pathRevision: 1,
      points,
      replaceRange: {
        endMs: 6500,
        reason: "replay",
        startMs: 0
      },
      sessionId: session.sessionId,
      takeId: `scripted_path_${Date.now().toString(36)}`,
      version: 1,
      videoId: session.videoId
    }
  });
  await expectOk(response, "write base path patch");
}

async function writeDiscardOverlay(page: Page, session: TestSession) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`, {
    data: {
      pathRevision: 2,
      points: [
        pathPoint({ enabled: false, fovH: 100, pitch: 5, seq: 9, tMs: 3000, yaw: -18 }),
        pathPoint({ enabled: true, fovH: 78, interpolation: "fast", pitch: -4, seq: 10, tMs: 4200, transitionMs: 260, yaw: 35 })
      ],
      replaceRange: {
        endMs: 4300,
        reason: "discard",
        startMs: 3000
      },
      sessionId: session.sessionId,
      takeId: `scripted_discard_${Date.now().toString(36)}`,
      version: 1,
      videoId: session.videoId
    }
  });
  await expectOk(response, "write discard path overlay");
}

async function reportPlaybackNode(page: Page, session: TestSession, videoTimeMs: number, samplingPaused: boolean, discardMode = false) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/playback-state`, {
    data: {
      clientTimeMs: Date.now(),
      discardFastForwardRate: 5,
      playbackRate: discardMode ? 5 : 1,
      preview: {
        brightness: 1,
        contrast: 1,
        overlayOpacity: 0.55
      },
      recording: {
        discardMode,
        recordingRate: 1,
        samplingPaused
      },
      sessionId: session.sessionId,
      videoId: session.videoId,
      videoTimeMs
    }
  });
  await expectOk(response, `report playback node ${videoTimeMs}`);
}

async function writeEffectTrack(page: Page, session: TestSession) {
  const response = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`, {
    data: {
      effectRevision: 1,
      events: [
        {
          displayName: "E2E flash intro",
          enabled: true,
          endMs: 850,
          eventName: "transition.flash_white",
          params: { direction: "hold", fadeInMs: 100, fadeOutMs: 160, peakOpacity: 0.98 },
          renderPolicy: { fallback: "fail", priority: 100 },
          seq: 1,
          startMs: 220
        },
        {
          displayName: "E2E cyan grade",
          enabled: true,
          endMs: 2100,
          eventName: "filter.color_grade",
          params: { blueBias: 8, contrast: 1.08, greenBias: 8, saturation: 1.16, strength: 0.85, tint: 0.32, warmth: -0.18 },
          renderPolicy: { fallback: "fail", priority: 40 },
          seq: 2,
          startMs: 900
        },
        {
          displayName: "E2E hold blur",
          enabled: true,
          endMs: 2700,
          eventName: "filter.blur",
          params: { edgeMs: 180, radius: 17, strength: 0.36 },
          renderPolicy: { fallback: "fail", priority: 45 },
          seq: 3,
          startMs: 1500
        },
        {
          displayName: "E2E RGB split before discard",
          enabled: true,
          endMs: 3200,
          eventName: "filter.chromatic_aberration",
          params: { edgeMs: 120, offsetPx: 12, strength: 0.8 },
          renderPolicy: { fallback: "fail", priority: 50 },
          seq: 4,
          startMs: 2300
        },
        {
          displayName: "E2E fade across discard edge",
          enabled: true,
          endMs: 3150,
          eventName: "transition.fade_black",
          params: { direction: "out", peakOpacity: 0.72 },
          renderPolicy: { fallback: "fail", priority: 65 },
          seq: 5,
          startMs: 2850
        },
        {
          displayName: "E2E vignette restore",
          enabled: true,
          endMs: 5400,
          eventName: "filter.vignette",
          params: { edgeMs: 220, radius: 0.62, strength: 0.5 },
          renderPolicy: { fallback: "fail", priority: 35 },
          seq: 6,
          startMs: 4200
        },
        {
          displayName: "E2E letterbox finale",
          enabled: true,
          endMs: 6200,
          eventName: "overlay.letterbox",
          params: { color: "#000000", opacity: 0.86, ratio: 0.13 },
          renderPolicy: { fallback: "fail", priority: 80 },
          seq: 7,
          startMs: 4400
        },
        {
          displayName: "E2E text finale",
          enabled: true,
          endMs: 6000,
          eventName: "overlay.text",
          params: {
            backgroundOpacity: 0.55,
            color: "#ffffff",
            position: "bottom_center",
            scale: 1.15,
            text: "E2E TIMELINE"
          },
          renderPolicy: { fallback: "fail", priority: 90 },
          seq: 8,
          startMs: 4500
        }
      ],
      replaceRange: {
        endMs: 6500,
        reason: "effect",
        startMs: 0
      },
      sessionId: session.sessionId,
      version: 1,
      videoId: session.videoId
    }
  });
  await expectOk(response, "write scripted effect track");
  const body = (await response.json()) as { acceptedEvents: number; status: string };
  expect(body).toEqual(expect.objectContaining({ acceptedEvents: 8, status: "accepted" }));
}

async function renderAndDownload(page: Page, session: TestSession, testInfo: TestInfo) {
  const render = await page.request.post(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/render-test`, {
    data: {}
  });
  await expectOk(render, "render scripted timeline");
  const body = (await render.json()) as { downloadReady: boolean; durationMs: number; exportId: string; status: string };
  expect(body).toEqual(expect.objectContaining({ downloadReady: true, status: "ready" }));
  expect(body.durationMs).toBeGreaterThanOrEqual(4900);
  expect(body.durationMs).toBeLessThanOrEqual(5100);

  const download = await page.request.get(`/api/exports/${encodeURIComponent(body.exportId)}/download`);
  await expectOk(download, "download scripted export");
  const buffer = await download.body();
  expect(buffer.length).toBeGreaterThan(20_000);

  const outputPath = testInfo.outputPath(`${body.exportId}.mp4`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return { exportId: body.exportId, outputPath };
}

function probeVideo(outputPath: string): ProbeStats {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      outputPath
    ],
    { encoding: "utf-8" }
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: Array<{ height?: number; width?: number }>;
  };
  return {
    durationMs: Math.round(Number(parsed.format?.duration ?? 0) * 1000),
    height: parsed.streams?.[0]?.height ?? 0,
    width: parsed.streams?.[0]?.width ?? 0
  };
}

function analyzeVideoFrame(outputPath: string, frameMs: number): PixelStats {
  const result = spawnSync(
    "python",
    [
      "-c",
      [
        "import cv2, json, numpy as np, sys",
        "cap = cv2.VideoCapture(sys.argv[1])",
        "assert cap.isOpened(), sys.argv[1]",
        "cap.set(cv2.CAP_PROP_POS_MSEC, int(sys.argv[2]))",
        "ok, frame = cap.read()",
        "assert ok and frame is not None, sys.argv[1]",
        "non_dark = (np.max(frame, axis=2) > 18).mean()",
        "print(json.dumps({'mean': float(frame.mean()), 'std': float(frame.std()), 'nonDarkRatio': float(non_dark)}))"
      ].join("; "),
      outputPath,
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

test("Player V2 scripted timeline export uses the fixed account, path holds, discard, and effects", async ({ page }, testInfo) => {
  await ensureFixedAccount(page);
  const video = await uploadSampleVideo(page);
  const session = await createCutSession(page, video.id);

  await writeBasePath(page, session);
  await reportPlaybackNode(page, session, 1600, true);
  await reportPlaybackNode(page, session, 2200, false);
  await reportPlaybackNode(page, session, 3000, false, true);
  await writeDiscardOverlay(page, session);
  await reportPlaybackNode(page, session, 4200, false);
  await writeEffectTrack(page, session);

  const statusBeforeRender = await page.request.get(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/status`);
  await expectOk(statusBeforeRender, "read scripted session status");
  await expect((await statusBeforeRender.json()) as { dirtyCount?: number }).toEqual(expect.objectContaining({ dirtyCount: 1 }));

  const { exportId, outputPath } = await renderAndDownload(page, session, testInfo);
  const probe = probeVideo(outputPath);
  expect(probe).toEqual(expect.objectContaining({ height: 720, width: 1280 }));
  expect(probe.durationMs).toBeGreaterThanOrEqual(4700);
  expect(probe.durationMs).toBeLessThanOrEqual(5400);

  const flashFrame = analyzeVideoFrame(outputPath, 420);
  expect(flashFrame.mean).toBeGreaterThan(150);
  expect(flashFrame.nonDarkRatio).toBeGreaterThan(0.9);

  const finaleFrame = analyzeVideoFrame(outputPath, 3900);
  expect(finaleFrame.nonDarkRatio).toBeGreaterThan(0.2);
  expect(finaleFrame.std).toBeGreaterThan(12);

  await testInfo.attach("scripted Player V2 timeline export", {
    contentType: "video/mp4",
    path: outputPath
  });
  testInfo.annotations.push({
    type: "export",
    description: `${exportId} rendered for ${TEST_EMAIL}`
  });
});
