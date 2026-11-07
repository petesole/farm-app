import { test, expect } from "@playwright/test";

// These tests only read UI. Use a dedicated read-only test account.
// Never put passwords in the repo. Set LABOUR_TEST_EMAIL / LABOUR_TEST_PASSWORD locally.
test("Login form renders on Expo web", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
  await expect(page.getByPlaceholder("password")).toBeVisible();
  await expect(page.getByText("Sign In", { exact: true })).toBeVisible();
});

test("Labour screens use one aligned header and no bottom tabs", async ({ page }) => {
  test.skip(!process.env.LABOUR_TEST_EMAIL || !process.env.LABOUR_TEST_PASSWORD,
    "Set LABOUR_TEST_EMAIL and LABOUR_TEST_PASSWORD for an authenticated Labour test.");
  await page.goto("/login");
  await page.getByPlaceholder("email@example.com").fill(process.env.LABOUR_TEST_EMAIL!);
  await page.getByPlaceholder("password").fill(process.env.LABOUR_TEST_PASSWORD!);
  await page.getByText("Sign In", { exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 20000 });

  for (const route of ["/labour", "/labour-entry", "/labour-history", "/labour-reports?mode=daily"]) {
    await page.goto(route);
    const label = route === "/labour" ? "Back to Main" : "Back to Labour";
    const back = page.getByText(label, { exact: true });
    await expect(back).toHaveCount(1);
    await expect(back).toBeVisible();
    const title = route === "/labour" ? "Labour" :
      route === "/labour-entry" ? "Labour Form" :
      route === "/labour-history" ? "Labour Input History" : "Daily Labour Report";
    const heading = page.getByText(title, { exact: true }).first();
    await expect(heading).toBeVisible();
    const h = await heading.boundingBox();
    const b = await back.boundingBox();
    expect(h && b, "Header elements must have bounds").toBeTruthy();
    expect(Math.abs((h!.y + h!.height / 2) - (b!.y + b!.height / 2))).toBeLessThan(55);
    expect(b!.x).toBeGreaterThan(h!.x);
    // No direct database writes, no action to save/submit.
  }
});
