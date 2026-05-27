import { expect, test } from "@playwright/test";

function verticalFovFromHorizontal(horizontalFov: number) {
  return Number((2 * Math.atan(Math.tan((horizontalFov * Math.PI / 180) / 2) / (16 / 9)) * 180 / Math.PI).toFixed(2));
}

async function readCropMaskState(page: import("@playwright/test").Page) {
  const raw = await page.getByTestId("aframe-crop-mask-state").textContent();
  return JSON.parse(raw || "{}") as {
    aspect?: string;
    center?: { yaw: number; pitch: number };
    fov?: { h: number; v: number };
    input?: string;
    locked?: boolean;
    maskOpacity?: number;
  };
}

async function readTimelineBridgeState(page: import("@playwright/test").Page) {
  const raw = await page.getByTestId("aframe-timeline-bridge-state").textContent();
  return JSON.parse(raw || "null") as null | {
    lastAcceptedPathPatch?: {
      acceptedPoints: number;
      firstPoint?: {
        center?: { yaw: number; pitch: number };
        fov?: { h: number; v: number };
        tMs: number;
      };
      lastPoint?: {
        center?: { yaw: number; pitch: number };
        fov?: { h: number; v: number };
        tMs: number;
      };
      pathRevision: number;
      status?: string;
    } | null;
    lastPatchRevision?: number;
  };
}

async function readVideoControlState(page: import("@playwright/test").Page) {
  const raw = await page.getByTestId("aframe-video-control-state").textContent();
  return JSON.parse(raw || "{}") as {
    camera?: { pitch: number; yaw: number };
    edgePanActive?: boolean;
    fov?: number;
    maskDragArmed?: boolean;
    currentSourceId?: string | null;
    effectSpeed?: number;
    playbackRate?: number;
    recordingRate?: number;
    sourceCount?: number;
  };
}

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
  const playlist = await request.get("/xr/sample-stream/index.m3u8");

  expect(playlist.status()).toBe(200);
  expect(playlist.headers()["content-type"]).toContain("application/vnd.apple.mpegurl");
  expect(await playlist.text()).toContain("#EXTM3U");

  const segment = await request.get("/xr/sample-stream/segment_000.ts", {
    headers: {
      Range: "bytes=0-99"
    }
  });

  expect(segment.status()).toBe(206);
  expect(segment.headers()["content-type"]).toContain("video/mp2t");
});

test("serves the A-Frame 360 video source list", async ({ request }) => {
  const response = await request.get("/api/xr/video-sources");

  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    videos: Array<{ id: string; kind: string; sourceUrl: string }>;
  };

  expect(body.videos).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "sample-mp4", kind: "mp4", sourceUrl: "/api/sample-video" }),
      expect.objectContaining({ id: "sample-hls", kind: "hls", sourceUrl: "/xr/sample-stream/index.m3u8" })
    ])
  );
});

test("serves public demo 360 videos without authentication", async ({ request }) => {
  const response = await request.get("/api/demo-videos");

  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    videos: Array<{ id: string; sourceUrl: string; thumbnailUrl?: string | null }>;
  };

  expect(body.videos).toHaveLength(3);
  expect(body.videos).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "norah-head-walk" }),
      expect.objectContaining({ id: "ghost-road-bike" }),
      expect.objectContaining({ id: "default-sample-1" })
    ])
  );
  expect(body.videos[0].sourceUrl).toMatch(/^\/api\/demo-videos\/.+\/stream$/);
});

test("serves a public demo 360 video stream with range requests", async ({ request }) => {
  const response = await request.get("/api/demo-videos/norah-head-walk/stream", {
    headers: {
      Range: "bytes=0-99"
    }
  });

  expect(response.status()).toBe(206);
  expect(response.headers()["content-type"]).toContain("video/mp4");
  expect(response.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
});

test("requires authentication before starting a public demo", async ({ request }) => {
  const response = await request.post("/api/demo-videos/norah-head-walk/start");

  expect(response.status()).toBe(401);
});

test("opens a real XR session page and sends crop-mask aligned path patches", async ({ page }) => {
  const email = `pc-webxr-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "secret123";

  const register = await page.request.post("/api/auth/register", {
    data: { email, password }
  });
  expect(register.status()).toBe(200);

  const started = await page.request.post("/api/demo-videos/norah-head-walk/start");
  expect(started.status()).toBe(200);
  const session = (await started.json()) as {
    sessionId: string;
    videoId: string;
    xrPath: string;
  };
  const secondStarted = await page.request.post("/api/demo-videos/ghost-road-bike/start");
  expect(secondStarted.status()).toBe(200);

  const response = await page.goto(`/xr/videos/${encodeURIComponent(session.videoId)}/session/${encodeURIComponent(session.sessionId)}`);
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("aframe-video-sphere-player")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.AFRAME));
  await expect(page.locator("a-scene")).toHaveCount(1);
  await expect(page.locator("a-videosphere")).toHaveCount(1);
  await expect(page.getByTestId("aframe-crop-mask-preview")).toHaveCount(1);
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { initialized?: boolean }> })
      | null;
    return Boolean(el?.components?.["crop-viewport-mask"]?.initialized);
  });
  await expect(page.getByTestId("xr-pc-workbench")).toBeVisible();
  await expect(page.getByTestId("xr-session-player-ui")).toBeVisible();
  await expect(page.getByTestId("xr-pc-gesture-hint")).toHaveCount(0);
  await expect(page.getByTestId("xr-pc-shortcuts")).toHaveCount(0);
  await expect(page.getByTestId("xr-pc-fov-in")).toContainText("Q");
  await expect(page.getByTestId("xr-pc-fov-out")).toContainText("E");
  await expect(page.getByTestId("xr-pc-flush")).toContainText("F");
  await expect(page.getByTestId("xr-pc-cut")).toContainText("UI");
  await expect(page.getByTestId("xr-spatial-player-control-bar")).toHaveCount(0);
  await expect(page.getByTestId("aframe-crop-mask-controls")).toBeVisible();
  await expect(page.getByTestId("aframe-player-start-meta-vr")).toBeVisible();
  await expect
    .poll(async () => (await readVideoControlState(page)).sourceCount ?? 0)
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => (await readVideoControlState(page)).currentSourceId)
    .toMatch(/^video_demo_/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
        return video?.error?.code ?? null;
      })
    )
    .toBeNull();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
        return video?.readyState ?? 0;
      })
    )
    .toBeGreaterThan(1);
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"playbackRate":1');
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"recordingRate":1');
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"effectSpeed":1');
  await expect(page.getByTestId("xr-session-playback-rate")).toContainText("Hold Z + wheel");
  await expect(page.getByTestId("xr-session-recording-rate")).toContainText("Hold X + wheel");
  await expect(page.getByTestId("xr-session-effect-speed")).toContainText("Hold C + wheel");
  await page.getByTestId("aframe-video-sphere-player").hover();
  const revisionBeforePlaybackWheel = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0;
  await page.keyboard.down("z");
  await page.mouse.wheel(0, -900);
  await page.keyboard.up("z");
  await expect
    .poll(async () => (await readVideoControlState(page)).playbackRate ?? 0)
    .toBeGreaterThan(1);
  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0, { timeout: 1000 })
    .toBe(revisionBeforePlaybackWheel);
  const playbackRateAfterWheel = (await readVideoControlState(page)).playbackRate ?? 1;
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
        return video?.playbackRate ?? 0;
      })
    )
    .toBeCloseTo(playbackRateAfterWheel, 1);
  const videoRateBeforeRecordingWheel = await page.evaluate(() => {
    const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
    return video?.playbackRate ?? 0;
  });
  await page.keyboard.down("x");
  await page.mouse.wheel(0, -900);
  await page.keyboard.up("x");
  await expect
    .poll(async () => (await readVideoControlState(page)).recordingRate ?? 0)
    .toBeGreaterThan(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector("video[id^='session-video-']") as HTMLVideoElement | null;
        return video?.playbackRate ?? 0;
      })
    )
    .toBeCloseTo(videoRateBeforeRecordingWheel, 1);
  const revisionBeforeEffectWheel = (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0;
  await page.keyboard.press("c");
  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0, { timeout: 1000 })
    .toBe(revisionBeforeEffectWheel);
  await page.keyboard.down("c");
  await page.mouse.wheel(0, -900);
  await page.keyboard.up("c");
  await expect
    .poll(async () => (await readVideoControlState(page)).effectSpeed ?? 0)
    .toBeGreaterThan(1);
  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0, { timeout: 1000 })
    .toBe(revisionBeforeEffectWheel);

  await expect.poll(async () => (await readCropMaskState(page)).fov?.h).toBe(82);
  const initial = await readCropMaskState(page);

  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"fov":80');
  await page.getByTestId("aframe-video-sphere-player").hover();
  await page.mouse.wheel(0, -400);
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"fov":75');

  await page.getByTestId("xr-pc-fov-in").click();
  await expect.poll(async () => (await readCropMaskState(page)).fov?.h ?? 0).toBeCloseTo((initial.fov?.h ?? 0) - 5, 1);
  const zoomed = await readCropMaskState(page);

  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.status)
    .toBe("accepted");
  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.lastPoint?.fov?.h ?? 0)
    .toBeCloseTo(zoomed.fov?.h ?? 0, 1);

  const acceptedAfterFov = await readTimelineBridgeState(page);
  const fovRevision = acceptedAfterFov?.lastAcceptedPathPatch?.pathRevision ?? 0;
  await page.keyboard.down("Control");
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"maskDragArmed":false');
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await readVideoControlState(page)).edgePanActive)
    .toBe(false);

  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await page.waitForTimeout(260);
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  await expect
    .poll(async () => (await readCropMaskState(page)).center?.yaw ?? 0)
    .toBeGreaterThan(zoomed.center?.yaw ?? -180);
  await expect
    .poll(async () => (await readCropMaskState(page)).center?.pitch ?? 0)
    .toBeGreaterThan(zoomed.center?.pitch ?? -85);
  const nudged = await readCropMaskState(page);
  const arcRotation = await page.evaluate(() => {
    const raw = document.querySelector("[data-testid='aframe-crop-viewport-arcs']")?.getAttribute("rotation") ?? "";
    if (typeof raw === "object" && raw !== null) {
      const value = raw as { x?: number; y?: number };
      return { pitch: value.x ?? 0, yaw: value.y ?? 0 };
    }
    const [pitch = 0, yaw = 0] = raw.split(/\s+/).map(Number);
    return { pitch, yaw };
  });
  expect(Math.abs(arcRotation.yaw)).toBeCloseTo(Math.abs(nudged.center?.yaw ?? 0), 0);
  expect(arcRotation.pitch).toBeCloseTo(nudged.center?.pitch ?? 0, 1);

  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.pathRevision ?? 0)
    .toBeGreaterThan(fovRevision);
  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.lastPoint?.center?.yaw ?? -999)
    .toBeCloseTo(nudged.center?.yaw ?? 0, 1);
  await expect
    .poll(async () => (await readTimelineBridgeState(page))?.lastAcceptedPathPatch?.lastPoint?.fov?.h ?? 0)
    .toBeCloseTo(nudged.fov?.h ?? 0, 1);

  await expect(page.getByTestId("xr-pc-last-patch")).toContainText('"status":"accepted"');
  await expect(page.getByTestId("xr-pc-events-list")).toContainText("No timeline events");
});

test("dev/legacy - opens the Meta WebXR player without lab-only controls", async ({ page }) => {
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

test("dev/legacy - opens the minimal A-Frame 360 video sphere player", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/aframe-player");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("aframe-video-sphere-player")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.AFRAME));
  await expect(page.locator("a-scene")).toHaveCount(1);
  await expect(page.locator("a-videosphere")).toHaveCount(1);
  await expect(page.getByTestId("aframe-crop-viewport-rig")).toHaveCount(1);
  await expect(page.getByTestId("aframe-crop-mask-preview")).toHaveCount(1);
  await expect(page.getByTestId("aframe-crop-viewport-arcs")).toHaveCount(1);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("video#aframe-360-source-video")).toHaveCount(1);
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"sourceCount":2');
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"currentSourceId":"sample-mp4"');
  await expect(page.getByTestId("aframe-video-control-state")).toContainText('"currentSourceKind":"mp4"');
  await expect(page.getByTestId("aframe-crop-mask-state")).toContainText('"aspect":"16:9"');
  await expect(page.getByTestId("aframe-crop-mask-state")).toContainText('"h":82');
  await expect(page.getByText("Internal Server Error")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("dev/legacy - A-Frame crop viewport mask supports keyboard preview controls", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/xr/aframe-player");
  await page.waitForFunction(() => Boolean(window.AFRAME));
  await expect(page.getByTestId("aframe-crop-viewport-rig")).toHaveCount(1);
  await expect(page.getByTestId("aframe-crop-mask-preview")).toHaveCount(1);
  await expect(page.getByTestId("aframe-crop-viewport-arcs")).toHaveCount(1);
  await expect(page.getByTestId("aframe-crop-arc-top-right")).toHaveCount(1);
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid='aframe-crop-mask-preview']") as
      | (Element & { components?: Record<string, { initialized?: boolean }> })
      | null;
    return Boolean(el?.components?.["crop-viewport-mask"]?.initialized);
  });
  await expect(page.getByTestId("aframe-crop-mask-state")).toContainText('"aspect":"16:9"');

  const initial = await readCropMaskState(page);
  expect(initial.aspect).toBe("16:9");
  expect(initial.fov?.h).toBe(82);
  expect(initial.fov?.v).toBeCloseTo(verticalFovFromHorizontal(82), 2);
  expect(initial.locked).toBe(true);
  expect(initial.input).toBe("keyboard");
  expect(initial.maskOpacity).toBeCloseTo(0.74, 2);

  await page.keyboard.press("=");
  await expect
    .poll(async () => (await readCropMaskState(page)).fov?.h)
    .toBeLessThan(initial.fov?.h ?? 0);

  const zoomed = await readCropMaskState(page);
  expect(zoomed.fov?.v).toBeCloseTo(verticalFovFromHorizontal(zoomed.fov?.h ?? 0), 2);

  await page.keyboard.press("-");
  await expect
    .poll(async () => (await readCropMaskState(page)).fov?.h)
    .toBe(initial.fov?.h);

  await page.getByTestId("aframe-crop-arc-top-right").dispatchEvent("mouseover", {
    bubbles: true
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const arc = document.querySelector("[data-testid='aframe-crop-arc-top-right']") as
          | (Element & { object3D?: { scale?: { x: number } } })
          | null;
        return arc?.object3D?.scale?.x ?? 0;
      })
    )
    .toBeCloseTo(1.26, 2);

  const topRightPosition = await page.evaluate(() => {
    const arc = document.querySelector("[data-testid='aframe-crop-arc-top-right']") as
      | (Element & { object3D?: { position?: { x: number; y: number; z: number } } })
      | null;
    const position = arc?.object3D?.position;
    return position ? { x: position.x, y: position.y, z: position.z } : null;
  });
  expect(topRightPosition?.x).toBeGreaterThan(0.5);
  expect(topRightPosition?.y).toBeGreaterThan(0.2);
  expect(topRightPosition?.z).toBeLessThan(-2.5);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const mask = document.querySelector("[data-testid='aframe-crop-mask-preview']");
        const arcs = document.querySelector("[data-testid='aframe-crop-viewport-arcs']");
        const rig = document.querySelector("[data-testid='aframe-crop-viewport-rig']");
        return mask?.parentElement === rig && arcs?.parentElement === rig;
      })
    )
    .toBe(true);

  await page.evaluate(() => {
    const arc = document.querySelector("[data-testid='aframe-crop-arc-top-right']");
    arc?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientY: 100 }));
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientY: 160 }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect
    .poll(async () => (await readCropMaskState(page)).fov?.h)
    .toBeGreaterThan(initial.fov?.h ?? 0);

  const locked = await readCropMaskState(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");

  await expect.poll(async () => (await readCropMaskState(page)).center?.yaw).not.toBe(locked.center?.yaw);
  await expect.poll(async () => (await readCropMaskState(page)).center?.pitch).not.toBe(locked.center?.pitch);
  const nudged = await readCropMaskState(page);
  expect(nudged.center?.yaw).toBeGreaterThanOrEqual(-180);
  expect(nudged.center?.yaw).toBeLessThanOrEqual(180);
  expect(nudged.center?.pitch).toBeGreaterThanOrEqual(-85);
  expect(nudged.center?.pitch).toBeLessThanOrEqual(85);
  expect(nudged.input).toBe("keyboard");

  await page.getByTestId("aframe-crop-mask-opacity").fill("0.25");
  await expect
    .poll(async () => (await readCropMaskState(page)).maskOpacity)
    .toBeCloseTo(0.25, 2);

  await page.getByTestId("aframe-crop-mask-fade-out").click();
  await expect
    .poll(async () => (await readCropMaskState(page)).maskOpacity, { timeout: 2_000 })
    .toBeCloseTo(0, 2);

  await page.getByTestId("aframe-crop-mask-fade-in").click();
  await expect
    .poll(async () => (await readCropMaskState(page)).maskOpacity, { timeout: 2_500 })
    .toBeCloseTo(0.74, 2);

  await page.keyboard.press("L");
  await expect
    .poll(async () => (await readCropMaskState(page)).locked)
    .toBe(false);
  expect(pageErrors).toEqual([]);
});

test("dev/legacy - handles non-visual A-Frame 360 video playback commands", async ({ page }) => {
  await page.goto("/xr/aframe-player");
  await page.waitForFunction(() => Boolean(window.AFRAME));
  const state = page.getByTestId("aframe-video-control-state");

  await expect(state).toContainText('"currentSourceId":"sample-mp4"');
  await expect(state).toContainText('"fov":80');

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("aframe-360-video-control", {
        detail: { command: "zoom-in", source: "test" }
      })
    );
  });
  await expect(state).toContainText('"lastCommand":"zoom-in"');
  await expect(state).toContainText('"fov":75');

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("aframe-360-video-control", {
        detail: { command: "next", source: "test" }
      })
    );
  });
  await expect(state).toContainText('"lastCommand":"loaded-source"');
  await expect(state).toContainText('"currentSourceId":"sample-hls"');
  await expect(state).toContainText('"currentSourceKind":"hls"');

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("aframe-360-video-control", {
        detail: { command: "previous", source: "test" }
      })
    );
  });
  await expect(state).toContainText('"currentSourceId":"sample-mp4"');

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("aframe-360-video-control", {
        detail: { command: "pause", source: "test" }
      })
    );
  });
  await expect(state).toContainText('"lastCommand":"pause"');
  await expect(state).toContainText(/"status":"paused"|"status":"ready"/);
});

test("dev/legacy - opens the minimal A-Frame XR login UI lab", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/login");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("aframe-xr-login")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.AFRAME));
  await expect(page.locator("a-scene")).toHaveCount(1);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("aframe-login-spatial-panel")).toHaveCount(1);
  await expect(page.getByTestId("aframe-login-background-status")).toContainText(/Passthrough|360/);
  await expect(page.getByTestId("aframe-login-xr-status")).toContainText("immersive-vr");
  await expect(page.getByTestId("aframe-login-compat-status")).toContainText("XRWebGLBinding fallback armed");
  await expect(page.locator("#aframe-login-enter-vr")).toBeVisible();
  await expect(page.locator("#aframe-login-enter-ar")).toHaveCount(1);

  await page.getByTestId("select-geometric-background").click();
  await expect(page.getByTestId("aframe-geometric-sky-background")).toHaveCount(1);
  await expect(page.locator("a-sky")).toHaveCount(1);
  await expect(page.getByText("Internal Server Error")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("dev/legacy - opens the playback lab and starts the desktop stereo simulator", async ({ page }) => {
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

test("dev/legacy - can switch the 360 sphere from MP4 to the generated HLS stream", async ({ page }) => {
  await page.goto("/xr/playback-lab");

  await expect(page.getByTestId("sample-video-source")).toContainText("MP4 file");
  await page.getByTestId("load-hls-stream").click();

  await expect(page.getByTestId("sample-video-source")).toContainText("HLS stream");
  await expect(page.getByTestId("sample-video-status")).toContainText(/ready|stream ready|playing/);
});

test("dev/legacy - mock WebXR mode can complete Enter VR without a headset", async ({ page }) => {
  await page.goto("/xr/playback-lab?mock-xr=1");

  await expect(page.getByText("Mock XR automation mode")).toBeVisible();
  await expect(page.getByText("immersive-vr: supported")).toBeVisible();

  await page.getByTestId("enter-vr").click();

  await expect(page.getByTestId("xr-message")).toContainText("Mock WebXR session is running");
  await expect(page.getByRole("button", { name: "VR Running" })).toBeVisible();
});

test("dev/legacy - opens the XR workbench UI prototype", async ({ page }) => {
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
