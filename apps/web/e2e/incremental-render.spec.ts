import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const testVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");

async function createTestSession(page: Page, videoPath: string) {
  const email = `incremental-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "secret123";

  const register = await page.request.post("/api/auth/register", {
    data: { email, password }
  });
  expect(register.status()).toBe(200);

  const upload = await page.request.post("/api/videos/upload", {
    multipart: {
      file: {
        buffer: readFileSync(videoPath),
        mimeType: "video/mp4",
        name: path.basename(videoPath)
      }
    }
  });
  expect(upload.status()).toBe(200);
  const video = (await upload.json()) as { id: string };

  const sessionId = `session_incr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const session = await page.request.post("/api/cut-sessions", {
    data: {
      output: { sessionId, videoId: video.id }
    }
  });
  expect(session.status()).toBe(200);

  return { sessionId, videoId: video.id };
}

async function sendPathPoint(
  page: Page,
  sessionId: string,
  videoId: string,
  tMs: number,
  yaw: number = 0,
  pitch: number = 0
) {
  const response = await page.request.post(`/api/cut-sessions/${sessionId}/path-patches`, {
    data: {
      sessionId,
      videoId,
      takeId: "take_test",
      pathRevision: 1,
      replaceRange: { startMs: tMs, endMs: tMs + 100 },
      reason: "test",
      points: [
        {
          tMs,
          yaw,
          pitch,
          fovH: 90,
          fovV: 60,
          roll: 0,
          enabled: true,
          cut: false,
          locked: false,
          smoothFollow: true,
          interpolation: "linear",
          transitionMs: 0,
          input: "test"
        }
      ]
    }
  });
  expect(response.status()).toBe(200);
}

test("incremental render: triggers segment render at 30s", async ({ page }) => {
  const { sessionId, videoId } = await createTestSession(page, testVideoPath);

  await sendPathPoint(page, sessionId, videoId, 0, 0, 0);
  await sendPathPoint(page, sessionId, videoId, 10000, 10, 0);
  await sendPathPoint(page, sessionId, videoId, 20000, 20, 0);

  await page.waitForTimeout(500);

  let segments = await page.request.get(`/api/cut-sessions/${sessionId}/segment-renders`);
  let segmentData = await segments.json();
  expect(segmentData.segments).toHaveLength(0);

  await sendPathPoint(page, sessionId, videoId, 30000, 30, 0);

  await page.waitForTimeout(1000);

  segments = await page.request.get(`/api/cut-sessions/${sessionId}/segment-renders`);
  segmentData = await segments.json();

  expect(segmentData.segments.length).toBeGreaterThan(0);
  const segment0 = segmentData.segments.find((s: any) => s.segmentIndex === 0);
  expect(segment0).toBeDefined();
  expect(segment0.status).toMatch(/rendering|completed/);
});

test("incremental render: cancels on rewind", async ({ page }) => {
  const { sessionId, videoId } = await createTestSession(page, testVideoPath);

  await sendPathPoint(page, sessionId, videoId, 0, 0, 0);
  await sendPathPoint(page, sessionId, videoId, 30000, 30, 0);

  await page.waitForTimeout(1000);

  await sendPathPoint(page, sessionId, videoId, 15000, 15, 5);

  await page.waitForTimeout(500);

  const segments = await page.request.get(`/api/cut-sessions/${sessionId}/segment-renders`);
  const segmentData = await segments.json();

  const segment0 = segmentData.segments.find((s: any) => s.segmentIndex === 0);
  if (segment0) {
    expect(segment0.status).toBe("cancelled");
  }
});
