import { chromium, devices, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3002";
const EMAIL = process.env.E2E_EMAIL ?? "demo@invisible.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "password123";
const SOURCE_VIDEO =
  process.env.E2E_SOURCE_VIDEO ??
  path.join(ROOT, "storage", "videos", "video_training_07e4e3c1e9b6_old_ghost_road_mountain_bike.mp4");
const RUN_ID = process.env.E2E_RUN_ID ?? `e2e-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}`;
const ARTIFACT_DIR =
  process.env.E2E_ARTIFACT_DIR ??
  path.join(ROOT, "storage", "e2e-artifacts", "2026-05-24-first-full-chain", RUN_ID);

const result = {
  runId: RUN_ID,
  baseUrl: BASE_URL,
  email: EMAIL,
  sourceVideo: SOURCE_VIDEO,
  videoId: null,
  sessionId: null,
  exportId: null,
  desktopVideo: null,
  steps: [],
  errors: [],
  android: {
    adbAvailable: false,
    adbPath: null,
    deviceSerial: null,
    simulatedDownload: false,
    realDeviceDownload: false,
    shareExecuted: false,
    note: ""
  }
};

function logStep(name, detail = "") {
  const line = detail ? `${name}: ${detail}` : name;
  console.log(line);
  result.steps.push(line);
}

function failStep(name, error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`${name}: ${message}`);
  result.errors.push(`${name}: ${message}`);
}

function appendAndroidNote(note) {
  result.android.note = result.android.note ? `${result.android.note} ${note}` : note;
}

function uniqueDefined(values) {
  return [...new Set(values.filter(Boolean))];
}

function resolveAdbPath() {
  const adbExecutable = process.platform === "win32" ? "adb.exe" : "adb";
  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  const candidates = uniqueDefined([
    process.env.E2E_ADB,
    "adb",
    ...sdkRoots.map((root) => (root ? path.join(root, "platform-tools", adbExecutable) : null)),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", adbExecutable)
      : null
  ]);

  for (const candidate of candidates) {
    const proc = spawnSync(candidate, ["devices"], {
      cwd: ROOT,
      encoding: "utf8",
      shell: false
    });
    if (proc.status === 0) {
      return { path: candidate, devicesOutput: proc.stdout ?? "" };
    }
  }

  return null;
}

function runAdb(args, options = {}) {
  if (!result.android.adbPath) {
    throw new Error("ADB path has not been resolved.");
  }
  const spawnOptions = {
    cwd: ROOT,
    shell: false,
    ...options
  };
  if (!Object.prototype.hasOwnProperty.call(spawnOptions, "encoding")) {
    spawnOptions.encoding = "utf8";
  }
  return spawnSync(result.android.adbPath, args, spawnOptions);
}

function parseFirstDevice(devicesOutput) {
  return (
    devicesOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /\tdevice$/.test(line))
      ?.split(/\s+/)[0] ?? null
  );
}

function portsForAdbReverse() {
  const urls = uniqueDefined([
    BASE_URL,
    process.env.E2E_API_BASE_URL,
    process.env.API_BASE_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL
  ]);
  const ports = new Set();

  for (const value of urls) {
    try {
      const url = new URL(value);
      const port = url.port || (url.protocol === "https:" ? "443" : "80");
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        ports.add(port);
      }
    } catch {
      // Ignore non-URL values.
    }
  }

  return [...ports];
}

async function saveAndroidScreencap(filename) {
  const proc = runAdb(["exec-out", "screencap", "-p"], { encoding: null });
  if (proc.status === 0 && proc.stdout) {
    await writeFile(path.join(ARTIFACT_DIR, filename), proc.stdout);
  }
}

async function screenshot(page, filename, options = {}) {
  await page.screenshot({ path: path.join(ARTIFACT_DIR, filename), fullPage: true, ...options });
}

async function login(page) {
  await page.goto(`${BASE_URL}/mobile/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/mobile/videos")) {
    return;
  }
  const form = page.locator("form.auth-card");
  await form.hover();
  const hydrated = await page
    .waitForFunction(() => {
      const authForm = document.querySelector("form.auth-card");
      return Boolean(authForm?.style.getPropertyValue("--spotlight-x"));
    }, null, { timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  if (!hydrated) {
    logStep("login.hydration-warning", "Auth form did not expose the client mousemove marker; using API fallback.");
    const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD }
    });
    if (response.status() >= 400) {
      throw new Error(`API login fallback failed with HTTP ${response.status()}: ${await response.text()}`);
    }
    await page.goto(`${BASE_URL}/mobile/videos`, { waitUntil: "networkidle" });
    return;
  }
  await page.locator("input[name='email']").fill(EMAIL);
  await page.locator("input[name='password']").fill(PASSWORD);
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/login") && response.request().method() === "POST",
    { timeout: 20_000 }
  );
  await Promise.all([
    page.waitForURL(/\/mobile\/videos/, { timeout: 20_000 }),
    loginResponsePromise,
    page.locator("form.auth-card button[type='submit']").click()
  ]);
}

async function uploadThroughUi(page) {
  await page.goto(`${BASE_URL}/mobile/videos`, { waitUntil: "networkidle" });
  await screenshot(page, "01-mobile-library-before-upload.png");

  const uploadResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/videos/upload") && response.request().method() === "POST",
    { timeout: 180_000 }
  );
  await page.locator("input[type='file'][name='file']").setInputFiles(SOURCE_VIDEO);
  await page.locator("form.upload-panel button[type='submit']").click();
  const response = await uploadResponsePromise;
  if (response.status() >= 400) {
    throw new Error(`Upload failed with HTTP ${response.status()}: ${await response.text()}`);
  }
  const video = await response.json();
  result.videoId = video.id;
  logStep("upload.ok", `${video.id} ${video.filename ?? ""}`);
  await page.waitForTimeout(1200);
  await screenshot(page, "02-mobile-upload-complete.png");
  return video;
}

async function createSessionThroughUi(page, videoId) {
  await page.goto(`${BASE_URL}/mobile/videos/${encodeURIComponent(videoId)}`, { waitUntil: "networkidle" });
  await screenshot(page, "03-mobile-video-detail-before-session.png");

  const sessionId = `${videoId}-session-${RUN_ID.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}`;
  result.sessionId = sessionId;
  await page.locator(".session-actions input[type='text']").fill(sessionId);
  const sessionResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/cut-sessions") && response.request().method() === "POST",
    { timeout: 30_000 }
  );
  await Promise.all([
    page.waitForURL(new RegExp(`/xr/videos/${encodeURIComponent(videoId)}/session/${encodeURIComponent(sessionId)}`), {
      timeout: 30_000
    }),
    page.locator(".session-actions button").first().click()
  ]);
  const response = await sessionResponsePromise;
  if (response.status() >= 400) {
    throw new Error(`Create session failed with HTTP ${response.status()}: ${await response.text()}`);
  }
  logStep("session.ok", sessionId);
  return sessionId;
}

async function waitForPcEditor(page) {
  await page.waitForFunction(() => Boolean(window.AFRAME), null, { timeout: 30_000 });
  await expect(page.getByTestId("aframe-video-sphere-player")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("xr-pc-workbench")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video[id^='session-video-']");
      return Boolean(video && video.readyState > 1);
    },
    null,
    { timeout: 60_000 }
  );
}

async function setVideoForFastRealEdit(page) {
  await page.evaluate(async () => {
    const video = document.querySelector("video[id^='session-video-']");
    if (!video) {
      throw new Error("session video element missing");
    }
    video.currentTime = 1;
    video.playbackRate = 3;
    video.muted = true;
    video.pause();
  });
}

async function readTimelineBridgeState(page) {
  const raw = await page.getByTestId("aframe-timeline-bridge-state").textContent();
  return JSON.parse(raw || "null");
}

async function runRealPcEdit(page) {
  await waitForPcEditor(page);
  await setVideoForFastRealEdit(page);
  await screenshot(page, "04-webxr-editor-start.png");

  await page.getByTestId("xr-pc-start-crop").click();
  await expect(page.getByTestId("xr-pc-render-status")).toContainText(/Recording crop path|Recording paused/, {
    timeout: 10_000
  });
  await page.getByTestId("aframe-video-sphere-player").hover();
  await page.waitForTimeout(400);

  await page.keyboard.down("d");
  await page.waitForTimeout(850);
  await page.keyboard.up("d");
  await screenshot(page, "05-webxr-yaw-change.png");

  await page.getByTestId("xr-pc-fov-in").click();
  await page.waitForTimeout(350);

  await page.keyboard.down("w");
  await page.waitForTimeout(650);
  await page.keyboard.up("w");
  await screenshot(page, "06-webxr-fov-pitch-change.png");

  await page.getByTestId("xr-pc-cut").click();
  await page.waitForTimeout(400);

  await page.getByTestId("xr-pc-effect-transition-flash-cut").click();
  await page.waitForTimeout(500);
  await screenshot(page, "07-webxr-effect-selected.png");

  await page.keyboard.down("Delete");
  await page.waitForTimeout(1250);
  await page.keyboard.up("Delete");
  await page.waitForTimeout(500);
  await screenshot(page, "08-webxr-discard-marked.png");

  await page.getByTestId("xr-pc-fov-out").click();
  await page.waitForTimeout(450);
  await page.getByTestId("xr-pc-flush").click();
  await page.waitForTimeout(1200);
  await screenshot(page, "09-webxr-patch-accepted.png");

  await page.getByTestId("xr-pc-end-crop").click();
  await expect(page.getByTestId("xr-pc-render-status")).toContainText("Crop path sealed", { timeout: 20_000 });
  await screenshot(page, "10-webxr-crop-sealed.png");

  const state = await readTimelineBridgeState(page);
  logStep("edit.ok", JSON.stringify(state?.lastAcceptedPathPatch ?? null));
}

async function renderThroughWebXr(page) {
  await page.getByTestId("xr-pc-render").click();
  await expect(page.getByTestId("xr-pc-render-status")).toContainText("Export ready", { timeout: 240_000 });
  const message = (await page.getByTestId("xr-pc-render-status").textContent()) ?? "";
  const exportIdMatch = message.match(/export_[a-zA-Z0-9_]+/);
  result.exportId = exportIdMatch?.[0] ?? null;
  await screenshot(page, "11-webxr-render-ready.png");

  const href = await page.getByTestId("xr-pc-export-download").getAttribute("href");
  if (!href) {
    throw new Error("Render finished but no download href was exposed.");
  }
  const download = await page.request.get(new URL(href, BASE_URL).toString());
  if (download.status() !== 200) {
    throw new Error(`Export download failed with HTTP ${download.status()}`);
  }
  await writeFile(path.join(ARTIFACT_DIR, "12-export-result.mp4"), await download.body());
  logStep("render.ok", result.exportId ?? href);
}

async function runMobileBrowserDownload(browser) {
  const mobile = devices["Pixel 5"];
  const context = await browser.newContext({
    ...mobile,
    acceptDownloads: true
  });
  const page = await context.newPage();
  try {
    await login(page);
    await page.goto(`${BASE_URL}/mobile/account/exports`, { waitUntil: "networkidle" });
    await screenshot(page, "13-android-sim-exports-page.png");

    if (!result.exportId) {
      throw new Error("No export id available for mobile download verification.");
    }
    const response = await page.request.get(
      `${BASE_URL}/api/exports/${encodeURIComponent(result.exportId)}/download`
    );
    if (response.status() !== 200) {
      throw new Error(`Mobile-context export download failed with HTTP ${response.status()}`);
    }
    await writeFile(path.join(ARTIFACT_DIR, "14-android-context-download.mp4"), await response.body());
    result.android.simulatedDownload = true;
    appendAndroidNote("Pixel 5 browser-context download verification passed.");
    logStep("android.browser-download.ok", result.exportId);
  } finally {
    await context.close();
  }
}

async function runAndroidRealDeviceVerification() {
  const resolvedAdb = resolveAdbPath();
  if (!resolvedAdb) {
    appendAndroidNote(
      "No adb executable was found on PATH, E2E_ADB, ANDROID_HOME, ANDROID_SDK_ROOT, or LOCALAPPDATA Android SDK."
    );
    logStep("android.real-device.skipped", "adb not found");
    return;
  }

  result.android.adbAvailable = true;
  result.android.adbPath = resolvedAdb.path;
  result.android.deviceSerial = parseFirstDevice(resolvedAdb.devicesOutput);
  if (!result.android.deviceSerial) {
    appendAndroidNote("adb was found, but no authorized Android device was connected.");
    logStep("android.real-device.skipped", "no authorized device");
    return;
  }

  for (const port of portsForAdbReverse()) {
    const reverse = runAdb(["reverse", `tcp:${port}`, `tcp:${port}`]);
    if (reverse.status === 0) {
      logStep("android.adb-reverse.ok", `tcp:${port}`);
    } else {
      appendAndroidNote(`adb reverse tcp:${port} failed: ${(reverse.stderr ?? "").trim()}`);
    }
  }

  await saveAndroidScreencap("17-android-real-before-browser.png").catch(() => {});

  const targetUrl = `${BASE_URL}/mobile/account/exports`;
  const launch = runAdb([
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    targetUrl,
    "com.oculus.browser"
  ]);
  if (launch.status !== 0) {
    runAdb(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", targetUrl]);
  }

  const cdpPort = process.env.E2E_ANDROID_CDP_PORT ?? "9222";
  const forward = runAdb(["forward", `tcp:${cdpPort}`, "localabstract:chrome_devtools_remote"]);
  if (forward.status !== 0) {
    appendAndroidNote(`adb forward for Chrome DevTools failed: ${(forward.stderr ?? "").trim()}`);
    logStep("android.real-device.cdp-skipped", "devtools socket not available");
    return;
  }

  let cdpBrowser = null;
  try {
    cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 20_000 });
    const context = cdpBrowser.contexts()[0] ?? (await cdpBrowser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (page.url().includes("/mobile/login")) {
      await login(page);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    }
    await page.waitForTimeout(1500);
    await screenshot(page, "18-android-real-exports-page.png");

    if (result.exportId) {
      await expect(page.getByText(result.exportId).first()).toBeVisible({ timeout: 15_000 });
    }

    const downloadSelector = result.exportId
      ? `a[href*="${encodeURIComponent(result.exportId)}"][href*="/download"]`
      : `a[href*="/api/exports/"][href*="/download"]`;
    const downloadLink = page.locator(downloadSelector).first();
    if ((await downloadLink.count()) > 0) {
      await downloadLink.click({ timeout: 15_000 });
      await page.waitForTimeout(2500);
      result.android.realDeviceDownload = true;
      await screenshot(page, "19-android-real-download-clicked.png").catch(() => {});
      await saveAndroidScreencap("20-android-real-download-screencap.png").catch(() => {});
      logStep("android.real-download.ok", result.exportId ?? "latest export");
    } else {
      appendAndroidNote("Android export page did not expose a download link.");
    }

    const shareButton = page.getByTestId("mobile-share-export").first();
    if ((await shareButton.count()) > 0) {
      await shareButton.click({ timeout: 15_000 });
      await page.waitForTimeout(3500);
      await saveAndroidScreencap("21-android-real-share-sheet.png").catch(() => {});
      runAdb(["shell", "uiautomator", "dump", "/sdcard/webxr-e2e-window.xml"]);
      const xml = runAdb(["exec-out", "cat", "/sdcard/webxr-e2e-window.xml"]);
      if (xml.status === 0 && xml.stdout) {
        await writeFile(path.join(ARTIFACT_DIR, "22-android-window-after-share.xml"), xml.stdout, "utf8");
        result.android.shareExecuted =
          xml.stdout.includes("com.android.intentresolver") ||
          xml.stdout.includes("ResolverActivity") ||
          xml.stdout.includes("分享") ||
          xml.stdout.includes("Share");
      }
      logStep(
        result.android.shareExecuted ? "android.share-sheet.ok" : "android.share-sheet.attempted",
        result.exportId ?? "latest export"
      );
    } else {
      appendAndroidNote("Android export page did not expose a share button.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendAndroidNote(`Android real-device verification failed: ${message}`);
    logStep("android.real-device.failed", message);
  } finally {
    if (cdpBrowser) {
      await cdpBrowser.close();
    }
  }
}

async function writeDbVerification() {
  if (!result.sessionId) {
    return;
  }
  const code = `
import sqlite3, json
session_id = ${JSON.stringify(result.sessionId)}
conn = sqlite3.connect("storage/app.db")
conn.row_factory = sqlite3.Row
for table in ["view_path_patches", "view_path_points", "effect_event_patches", "effect_events", "minute_segments", "exports"]:
    rows = conn.execute(f"SELECT COUNT(*) AS count FROM {table} WHERE session_id = ?", (session_id,)).fetchone()
    print(table, rows["count"])
print("cut points", conn.execute("SELECT COUNT(*) FROM view_path_points WHERE session_id=? AND cut=1", (session_id,)).fetchone()[0])
print("disabled points", conn.execute("SELECT COUNT(*) FROM view_path_points WHERE session_id=? AND enabled=0", (session_id,)).fetchone()[0])
latest = conn.execute("SELECT id,status,file_path FROM exports WHERE session_id=? ORDER BY created_at DESC LIMIT 1", (session_id,)).fetchone()
print("latest export", dict(latest) if latest else None)
conn.close()
`;
  const proc = spawnSync("python", ["-c", code], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const output = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  await writeFile(path.join(ARTIFACT_DIR, "15-db-verification.txt"), output, "utf8");
  logStep("db.verification", output.replace(/\s+/g, " ").trim());
}

async function writeRunResult() {
  const runDir = path.join(ROOT, "docs", "project-docs", "05-test-plans", "runs");
  await mkdir(runDir, { recursive: true });
  const runPath = path.join(runDir, `${RUN_ID}-result.md`);
  const lines = [
    `# Full Chain E2E Result - ${RUN_ID}`,
    "",
    `Date: 2026-05-24`,
    `Base URL: \`${BASE_URL}\``,
    `Account: \`${EMAIL}\``,
    `Source video: \`${SOURCE_VIDEO}\``,
    `Artifact dir: \`${ARTIFACT_DIR}\``,
    "",
    "## IDs",
    "",
    `- videoId: \`${result.videoId ?? "-"}\``,
    `- sessionId: \`${result.sessionId ?? "-"}\``,
    `- exportId: \`${result.exportId ?? "-"}\``,
    "",
    "## Result",
    "",
    `- desktop import/edit/export: ${result.errors.length ? "CHECK_ERRORS" : "PASS"}`,
    `- Android real device: ${
      result.android.realDeviceDownload || result.android.shareExecuted
        ? "PASS"
        : result.android.adbAvailable
          ? "ATTEMPTED"
          : "BLOCKED_NO_ADB"
    }`,
    `- Android real-device download: ${result.android.realDeviceDownload ? "PASS" : "NOT_RUN"}`,
    `- Android browser-context download: ${result.android.simulatedDownload ? "PASS" : "NOT_RUN"}`,
    `- Android share: ${result.android.shareExecuted ? "PASS" : "NOT_RUN"}`,
    "",
    "## Steps",
    "",
    ...result.steps.map((step) => `- ${step}`),
    "",
    "## Errors",
    "",
    ...(result.errors.length ? result.errors.map((error) => `- ${error}`) : ["- None"]),
    "",
    "## Notes",
    "",
    `- ${result.android.note || "No extra notes."}`,
    `- adb: ${result.android.adbPath || "not resolved"}`,
    `- Android device: ${result.android.deviceSerial || "not detected"}`,
    "- Real editing was driven through PC WebXR editor UI controls and keyboard events. DB checks were read-only verification.",
    ""
  ];
  await writeFile(runPath, lines.join("\n"), "utf8");
  logStep("run-result.written", runPath);
}

async function main() {
  if (!existsSync(SOURCE_VIDEO)) {
    throw new Error(`Source video does not exist: ${SOURCE_VIDEO}`);
  }
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    acceptDownloads: true,
    recordVideo: {
      dir: ARTIFACT_DIR,
      size: { width: 1365, height: 768 }
    },
    viewport: { width: 1365, height: 768 }
  });
  const page = await context.newPage();

  try {
    await login(page);
    logStep("login.ok", EMAIL);
    const video = await uploadThroughUi(page);
    const sessionId = await createSessionThroughUi(page, video.id);
    await runRealPcEdit(page);
    await renderThroughWebXr(page);
    await runMobileBrowserDownload(browser);
    await runAndroidRealDeviceVerification();
    await writeDbVerification();
    await screenshot(page, "16-final-desktop-page.png");
  } catch (error) {
    failStep("e2e.failed", error);
    try {
      await screenshot(page, "error-current-page.png");
    } catch {
      // Best-effort diagnostic screenshot.
    }
  } finally {
    await context.close();
    const video = page.video();
    if (video) {
      try {
        result.desktopVideo = await video.path();
      } catch {
        result.desktopVideo = null;
      }
    }
    await browser.close();
    await writeRunResult();
    await writeFile(path.join(ARTIFACT_DIR, "run-result.json"), JSON.stringify(result, null, 2), "utf8");
  }

  if (result.errors.length) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  failStep("fatal", error);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeRunResult();
  await writeFile(path.join(ARTIFACT_DIR, "run-result.json"), JSON.stringify(result, null, 2), "utf8");
  process.exitCode = 1;
});
