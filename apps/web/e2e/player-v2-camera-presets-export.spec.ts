import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

test.use({ ignoreHTTPSErrors: true });
test.setTimeout(260_000);

const repoRoot = path.resolve(process.cwd(), "..", "..");
const sampleVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "";
const SEGMENT_MS = 2200;
const RESET_MS = 120;
const BASE_FOV_H = 92;

type TestSession = {
  sessionId: string;
  videoId: string;
};

type CameraPreset = {
  eventName: string;
  label: string;
  params?: Record<string, unknown>;
  renderFallback?: "fail" | "warn";
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

const CAMERA_PRESETS: CameraPreset[] = [
  {
    eventName: "frame.hero_push",
    label: "Hero push",
    params: { curve: "easeOutBackSoft", deltaFovH: -10, peakAtRatio: 0.72, reboundFovH: 1 }
  },
  {
    eventName: "frame.reveal_pull",
    label: "Reveal pull",
    params: { curve: "easeInOutCubic", deltaFovH: 14, deltaPitch: 2 }
  },
  {
    eventName: "frame.drift_left_parallax",
    label: "Drift left",
    params: { curve: "easeInOutSine", deltaFovH: -3, deltaYaw: -8 }
  },
  {
    eventName: "frame.impact_shake",
    label: "Impact shake",
    params: { amplitudePitch: 1.4, amplitudeYaw: 2.6, decay: 0.62, shakes: 4 }
  },
  {
    eventName: "frame.little_planet_pullback",
    label: "Little planet",
    params: {
      peakAtMs: 560,
      peakPitch: -88,
      peakSphereFov: 175,
      previewFlightHeight: 46.8,
      previewFov: 138,
      previewPitch: -90
    },
    renderFallback: "fail"
  },
  {
    eventName: "frame.crystal_ball_pull",
    label: "Crystal ball",
    params: {
      centerPitch: 88,
      peakAtMs: 760,
      peakSphereFov: 165,
      previewFlightHeight: 34,
      previewFov: 145,
      previewMaskFov: 178,
      previewMaskPitch: -78,
      previewPitch: -82,
      roll: 180
    },
    renderFallback: "fail"
  },
  {
    eventName: "frame.look_around",
    label: "Look around",
    params: { returnYaw: -10, sweepYaw: 28, widenFovH: 3 }
  },
  {
    eventName: "frame.dolly_zoom",
    label: "Dolly zoom",
    params: { peakAtMs: 820, peakDeltaFovH: -18, previewDollyDistance: -6.5, previewFov: 64, previewMaskFovDelta: -18 }
  }
];
const TOTAL_DURATION_MS = SEGMENT_MS * CAMERA_PRESETS.length;

async function expectOk(response: APIResponse, label: string) {
  if (!response.ok()) {
    throw new Error(`${label} failed with ${response.status()}: ${await response.text()}`);
  }
}

function apiPath(pathname: string) {
  return apiBaseUrl ? new URL(pathname, apiBaseUrl).toString() : pathname;
}

async function createIsolatedAccount(page: Page) {
  const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const register = await page.request.post(apiPath("/api/auth/register"), {
    data: {
      email: `camera-presets-${stamp}@example.test`,
      password: "camera-presets-e2e"
    }
  });
  await expectOk(register, "register camera presets E2E account");
}

async function uploadSampleVideo(page: Page) {
  const upload = await page.request.post(apiPath("/api/videos/upload"), {
    multipart: {
      file: {
        buffer: readFileSync(sampleVideoPath),
        mimeType: "video/mp4",
        name: `e2e-camera-presets-${Date.now()}.mp4`
      }
    }
  });
  await expectOk(upload, "upload camera presets sample video");
  return (await upload.json()) as { id: string };
}

async function createCutSession(page: Page, videoId: string): Promise<TestSession> {
  const sessionId = `session_player_v2_camera_presets_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const session = await page.request.post(apiPath("/api/cut-sessions"), {
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
  await expectOk(session, "create camera presets cut session");
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
  interpolation = "fast",
  pitch,
  seq,
  tMs,
  transitionMs = 180,
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

function basePoint(seq: number, tMs: number, cut = false) {
  return pathPoint({
    cut,
    fovH: BASE_FOV_H,
    interpolation: cut ? "fast" : "hold",
    pitch: 0,
    seq,
    tMs,
    transitionMs: cut ? 1 : 0,
    yaw: 0
  });
}

function cameraPresetPathPoints() {
  let seq = 1;
  const points = [basePoint(seq++, 0)];

  const addPoint = (segmentIndex: number, offsetMs: number, yaw: number, pitch: number, fovH: number, transitionMs = 260) => {
    points.push(
      pathPoint({
        fovH,
        pitch,
        seq: seq++,
        tMs: segmentIndex * SEGMENT_MS + offsetMs,
        transitionMs,
        yaw
      })
    );
  };

  const closeSegment = (segmentIndex: number) => {
    const endMs = (segmentIndex + 1) * SEGMENT_MS;
    points.push(basePoint(seq++, endMs, segmentIndex < CAMERA_PRESETS.length - 1));
  };

  addPoint(0, Math.round(SEGMENT_MS * 0.72), 0, 0, BASE_FOV_H - 10, 620);
  addPoint(0, SEGMENT_MS - RESET_MS, 0, 0, BASE_FOV_H - 9, 240);
  closeSegment(0);

  addPoint(1, SEGMENT_MS - RESET_MS, 0, 2, BASE_FOV_H + 14, 1100);
  closeSegment(1);

  addPoint(2, SEGMENT_MS - RESET_MS, -8, 0, BASE_FOV_H - 3, 1300);
  closeSegment(2);

  addPoint(3, 140, 2.6, -1.4, BASE_FOV_H, 80);
  addPoint(3, 280, -2.1, 1.1, BASE_FOV_H, 80);
  addPoint(3, 430, 1.4, -0.8, BASE_FOV_H, 90);
  addPoint(3, 620, -0.8, 0.4, BASE_FOV_H, 110);
  addPoint(3, 840, 0, 0, BASE_FOV_H, 160);
  closeSegment(3);

  closeSegment(4);
  closeSegment(5);

  addPoint(6, Math.round(SEGMENT_MS * 0.42), 28, 0, BASE_FOV_H + 3, 880);
  addPoint(6, Math.round(SEGMENT_MS * 0.72), -10, 0, BASE_FOV_H + 1, 620);
  addPoint(6, SEGMENT_MS - RESET_MS, 0, 0, BASE_FOV_H, 360);
  closeSegment(6);

  addPoint(7, 820, 0, 0, BASE_FOV_H - 18, 820);
  addPoint(7, SEGMENT_MS - RESET_MS, 0, 0, BASE_FOV_H, 760);
  closeSegment(7);

  return points;
}

async function writeCameraPresetPath(page: Page, session: TestSession) {
  const response = await page.request.post(apiPath(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/path-patches`), {
    data: {
      pathRevision: 1,
      points: cameraPresetPathPoints(),
      replaceRange: {
        endMs: TOTAL_DURATION_MS,
        reason: "effect",
        startMs: 0
      },
      sessionId: session.sessionId,
      takeId: `camera_presets_path_${Date.now().toString(36)}`,
      version: 1,
      videoId: session.videoId
    }
  });
  await expectOk(response, "write camera presets path");
}

async function writeCameraPresetEffects(page: Page, session: TestSession) {
  const events = CAMERA_PRESETS.flatMap((preset, index) => {
    const startMs = index * SEGMENT_MS;
    const endMs = startMs + SEGMENT_MS;
    const label = `${String(index + 1).padStart(2, "0")} ${preset.label}`;
    return [
      {
        displayName: label,
        enabled: true,
        endMs,
        eventName: preset.eventName,
        params: preset.params ?? {},
        renderPolicy: { fallback: preset.renderFallback ?? "warn", priority: 50 },
        seq: index * 2 + 1,
        startMs
      },
      {
        displayName: `${label} label`,
        enabled: true,
        endMs: endMs - 80,
        eventName: "overlay.text",
        params: {
          backgroundOpacity: 0.58,
          color: "#ffffff",
          position: "top_center",
          scale: 1.05,
          text: label
        },
        renderPolicy: { fallback: "fail", priority: 95 },
        seq: index * 2 + 2,
        startMs: startMs + 80
      }
    ];
  });

  const response = await page.request.post(apiPath(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/effect-events`), {
    data: {
      effectRevision: 1,
      events,
      replaceRange: {
        endMs: TOTAL_DURATION_MS,
        reason: "effect",
        startMs: 0
      },
      sessionId: session.sessionId,
      version: 1,
      videoId: session.videoId
    }
  });
  await expectOk(response, "write camera presets effect track");
  const body = (await response.json()) as { acceptedEvents: number; status: string };
  expect(body).toEqual(expect.objectContaining({ acceptedEvents: events.length, status: "accepted" }));
}

async function renderAndDownload(page: Page, session: TestSession, testInfo: TestInfo) {
  const render = await page.request.post(apiPath(`/api/cut-sessions/${encodeURIComponent(session.sessionId)}/render-test`), {
    data: { loopSource: true }
  });
  await expectOk(render, "render camera preset reel");
  const body = (await render.json()) as { downloadReady: boolean; durationMs: number; exportId: string; loopSource?: boolean; status: string };
  expect(body).toEqual(expect.objectContaining({ downloadReady: true, loopSource: true, status: "ready" }));
  expect(body.durationMs).toBeGreaterThanOrEqual(TOTAL_DURATION_MS - 600);
  expect(body.durationMs).toBeLessThanOrEqual(TOTAL_DURATION_MS + 600);

  const download = await page.request.get(apiPath(`/api/exports/${encodeURIComponent(body.exportId)}/download`));
  await expectOk(download, "download camera preset reel");
  const buffer = await download.body();
  expect(buffer.length).toBeGreaterThan(30_000);

  const outputPath = testInfo.outputPath(`camera-preset-reel-${body.exportId}.mp4`);
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

test("Player V2 exports a looped backend reel for every camera preset with effect names", async ({ page }, testInfo) => {
  await createIsolatedAccount(page);
  const video = await uploadSampleVideo(page);
  const session = await createCutSession(page, video.id);

  await writeCameraPresetPath(page, session);
  await writeCameraPresetEffects(page, session);

  const { exportId, outputPath } = await renderAndDownload(page, session, testInfo);
  const probe = probeVideo(outputPath);
  expect(probe).toEqual(expect.objectContaining({ height: 720, width: 1280 }));
  expect(probe.durationMs).toBeGreaterThanOrEqual(TOTAL_DURATION_MS - 800);
  expect(probe.durationMs).toBeLessThanOrEqual(TOTAL_DURATION_MS + 800);

  for (let index = 0; index < CAMERA_PRESETS.length; index += 1) {
    const stats = analyzeVideoFrame(outputPath, index * SEGMENT_MS + Math.round(SEGMENT_MS * 0.5));
    expect(stats.nonDarkRatio, CAMERA_PRESETS[index].label).toBeGreaterThan(0.08);
    expect(stats.std, CAMERA_PRESETS[index].label).toBeGreaterThan(5);
    expect(stats.mean, CAMERA_PRESETS[index].label).toBeGreaterThan(12);
  }

  await testInfo.attach("Player V2 camera preset backend reel", {
    contentType: "video/mp4",
    path: outputPath
  });
  testInfo.annotations.push({
    type: "export",
    description: `${exportId} rendered ${CAMERA_PRESETS.length} camera presets with loopSource`
  });
});
