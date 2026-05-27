import { expect, test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

test("Player V2 smoke test - page loads and renders basic structure", async ({ page }) => {
  const email = `player-v2-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "secret123";

  const register = await page.request.post("/api/auth/register", {
    data: { email, password }
  });
  expect(register.status()).toBe(200);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/xr/player-v2");
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("player-v2-xr-stage")).toBeVisible();
  await expect(page.getByTestId("player-v2-ui-overlay")).toBeVisible();

  await page.waitForTimeout(2000);
  expect(pageErrors).toEqual([]);
});
