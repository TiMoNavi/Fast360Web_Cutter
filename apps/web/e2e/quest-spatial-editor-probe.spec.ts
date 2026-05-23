import { expect, test } from "@playwright/test";

async function readProbeState(page: import("@playwright/test").Page) {
  const raw = await page.getByTestId("quest-probe-state").textContent();
  return JSON.parse(raw || "{}") as {
    activeModule?: string | null;
    eventCount?: number;
    fov?: number;
    gazeMode?: string;
    locked?: boolean;
    playerHidden?: boolean;
    radialOpen?: boolean;
    runId?: string;
  };
}

test("Quest spatial editor probe exposes repeatable unit operations", async ({ page }) => {
  const response = await page.goto("/xr/quest-spatial-editor-probe?auto=1");
  expect(response?.status()).toBeLessThan(400);

  await page.waitForFunction(() => Boolean(window.AFRAME));
  await expect(page.locator("a-scene")).toHaveCount(1);
  await expect(page.getByTestId("quest-probe-viewing-layer")).toHaveCount(1);
  await expect(page.getByTestId("quest-probe-player-panel")).toHaveCount(1);
  await expect(page.getByTestId("quest-probe-workbench")).toHaveCount(1);

  await expect.poll(async () => (await readProbeState(page)).eventCount ?? 0).toBeGreaterThan(8);
  await expect(page.getByTestId("quest-probe-events")).toContainText("auto-sequence-complete");
  await expect(page.getByTestId("quest-probe-events")).toContainText("trigger-release-lock-patch");
  await expect(page.getByTestId("quest-probe-events")).toContainText("grip-release-lock-ray");

  const state = await readProbeState(page);
  expect(state.locked).toBe(true);
  expect(state.gazeMode).toBe("idle");
  expect(state.playerHidden).toBe(false);
  expect(state.radialOpen).toBe(false);
});

test("Quest spatial editor probe posts events to the local collection API", async ({ page, request }) => {
  await page.goto("/xr/quest-spatial-editor-probe?auto=1");
  await expect.poll(async () => (await readProbeState(page)).eventCount ?? 0).toBeGreaterThan(8);
  await expect(page.getByTestId("quest-probe-events")).toContainText("auto-sequence-complete");

  const state = await readProbeState(page);
  expect(state.runId).toBeTruthy();

  const response = await request.get(`/api/xr/quest-spatial-probe/events?runId=${state.runId}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    count: number;
    events: Array<{ step: string; status: string }>;
  };

  expect(body.count).toBeGreaterThan(8);
  expect(body.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: "pass", step: "aframe-scene-loaded" }),
      expect.objectContaining({ status: "pass", step: "auto-sequence-complete" })
    ])
  );
});
