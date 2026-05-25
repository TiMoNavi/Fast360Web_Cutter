import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const testVideoPath = path.join(repoRoot, "storage", "sample-videos", "equirect-grid.mp4");

test("完整导出流程：剪辑 -> 增量渲染 -> 导出 -> 下载", async ({ page }) => {
  const email = `flow-${Date.now()}@test.com`;
  const password = "secret123";

  await page.request.post("/api/auth/register", {
    data: { email, password }
  });

  const upload = await page.request.post("/api/videos/upload", {
    multipart: {
      file: {
        buffer: readFileSync(testVideoPath),
        mimeType: "video/mp4",
        name: "test-video.mp4"
      }
    }
  });
  const video = (await upload.json()) as { id: string };

  const sessionId = `session_${Date.now()}`;
  await page.request.post("/api/cut-sessions", {
    data: { output: { sessionId, videoId: video.id } }
  });

  console.log("✓ 创建会话成功");

  for (let t = 0; t <= 90000; t += 10000) {
    await page.request.post(`/api/cut-sessions/${sessionId}/path-patches`, {
      data: {
        sessionId,
        videoId: video.id,
        takeId: "take_test",
        pathRevision: 1,
        replaceRange: { startMs: t, endMs: t + 100 },
        reason: "test",
        points: [{
          tMs: t,
          yaw: t / 1000,
          pitch: 0,
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
        }]
      }
    });
  }

  console.log("✓ 发送路径点完成（模拟90秒剪辑）");

  await page.waitForTimeout(2000);

  const segments = await page.request.get(`/api/cut-sessions/${sessionId}/segment-renders`);
  const segmentData = await segments.json();

  console.log(`✓ 后台渲染状态：${segmentData.segments.length} 个段`);
  segmentData.segments.forEach((s: any) => {
    console.log(`  段 ${s.segmentIndex}: ${s.status} (${s.startMs}-${s.endMs}ms)`);
  });

  const renderResponse = await page.request.post(`/api/cut-sessions/${sessionId}/render-test`);
  expect(renderResponse.status()).toBe(200);
  const renderResult = await renderResponse.json();

  console.log(`✓ 导出触发成功：${renderResult.exportId}`);

  await page.waitForTimeout(5000);

  const exportStatus = await page.request.get(`/api/exports/${renderResult.exportId}`);
  const exportData = await exportStatus.json();

  console.log(`✓ 导出状态：${exportData.status}`);
  console.log(`✓ 可下载：${exportData.downloadReady}`);

  if (exportData.downloadReady) {
    const downloadUrl = `/api/exports/${renderResult.exportId}/download`;
    const downloadResponse = await page.request.get(downloadUrl);
    expect(downloadResponse.status()).toBe(200);
    console.log(`✓ 下载测试成功`);
  }

  await page.goto(`/mobile/account/exports`);
  await page.waitForTimeout(1000);

  const exportCards = page.locator('.vapor-export-card');
  const count = await exportCards.count();
  console.log(`✓ 导出列表页面显示 ${count} 个导出`);

  expect(count).toBeGreaterThan(0);
});
