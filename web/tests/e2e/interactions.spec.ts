import { test, expect, login, dialog, closeDialog, workspace } from "./helpers";

test("dashboard chart ranges, campaign tabs, activity and service links", async ({
  page,
}) => {
  await login(page);
  const range = page.getByLabel("Chart range", { exact: true });
  const options = await range
    .locator("option")
    .evaluateAll((items) => items.map((x) => (x as HTMLOptionElement).value));
  for (const value of options) {
    await range.selectOption(value);
    await expect(page.locator(".distribution-chart")).toBeVisible();
  }
  for (const button of await page
    .locator(".campaigns-overview .card-tabs button")
    .all()) {
    await button.click();
    await expect(button).toHaveClass(/active/);
  }
  await page.locator(".activity-more").click();
  await expect(dialog(page).locator(".audit-list")).toBeVisible();
  await closeDialog(page);
  for (const href of ["/campaigns", "/shifts", "/team", "/reports"])
    await expect(page.locator(`.shortcut-card[href="${href}"]`)).toBeVisible();
});

test("map city changes, zoom and local point details", async ({ page }) => {
  await login(page, "admin", "/map");
  const city = page.getByLabel("Select city", { exact: true });
  const options = await city
    .locator("option")
    .evaluateAll((items) => items.map((x) => (x as HTMLOptionElement).value));
  if ((await workspace(page)).map_available) {
    const frame = page
      .locator(".map-canvas")
      .frameLocator('iframe[title="Iran map"]');
    await expect(frame.locator("body")).toHaveAttribute(
      "data-map-state",
      "ready",
      { timeout: 30_000 },
    );
    for (const value of options) {
      await city.selectOption(value);
      await expect(frame.locator(".pin").first()).toBeVisible();
    }
    const before = await frame.locator("body").getAttribute("data-map-zoom");
    await frame
      .getByRole("button", { name: "بزرگ‌نمایی", exact: true })
      .click();
    await expect(frame.locator("body")).not.toHaveAttribute(
      "data-map-zoom",
      before ?? "",
    );
    await frame.locator(".pin").first().click();
  } else {
    for (const value of options) {
      await city.selectOption(value);
      await expect(page.locator(".map-pin").first()).toBeVisible();
    }
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.locator(".map-pin").first().click();
  }
  await expect(dialog(page)).toBeVisible();
  await closeDialog(page);
  await page.locator(".location-card .rich-title").first().click();
  await expect(dialog(page).locator(".location-detail-icon")).toBeVisible();
  await expect(dialog(page).locator(".related-shift").first()).toBeVisible();
  await dialog(page).locator(".related-shift").first().click();
  await expect(page.locator("dialog.drawer[open]")).toBeVisible();
  await expect(dialog(page).locator(".directions-link")).toHaveAttribute(
    "href",
    /^\/api\/maps\/view#lat=/,
  );
});

test("team pagination, profiles, role metrics and table details", async ({
  page,
}) => {
  await login(page, "admin", "/team");
  const original = await page.locator(".profile-card h2").allTextContents();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  expect(await page.locator(".profile-card h2").allTextContents()).not.toEqual(
    original,
  );
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await page.locator(".profile-card .text-button").first().click();
  await expect(dialog(page).locator(".person-detail")).toBeVisible();
  await closeDialog(page);
  await page.locator(".page-insights button").nth(1).click();
  expect(
    await page.getByLabel("Filter roles", { exact: true }).inputValue(),
  ).toBe("supervisor");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.locator(".data-table .icon-button").first().click();
  await expect(dialog(page).locator(".person-detail")).toBeVisible();
});

test("attendance date filtering, GPS guide, ledger tabs and record navigation", async ({
  page,
}) => {
  await login(page, "admin", "/attendance");
  await page.locator(".attendance-insight > button").click();
  await expect(dialog(page).locator(".help-steps")).toBeVisible();
  await closeDialog(page);
  const dates = page.getByLabel("Attendance date", { exact: true });
  const values = await dates
    .locator("option")
    .evaluateAll((items) => items.map((x) => (x as HTMLOptionElement).value));
  await dates.selectOption(values.at(-1)!);
  await expect(page.locator(".data-table")).toBeVisible();
  await page.locator(".data-table .cell-link").first().click();
  await expect(page.locator("dialog.drawer[open]")).toBeVisible();
  await closeDialog(page);
  await page.goto("/inventory");
  await page.locator(".card-tabs button").last().click();
  await expect(page.getByLabel("Movement type", { exact: true })).toBeVisible();
  await page
    .getByLabel("Movement type", { exact: true })
    .selectOption("initial");
  await expect(page.locator(".data-table")).toBeVisible();
  await page.locator(".card-tabs button").first().click();
  await page.locator(".data-table .cell-link").first().click();
  await expect(page.locator("dialog.drawer[open]")).toBeVisible();
});

test("issue and report details, metric filters and catalog campaign links", async ({
  page,
}) => {
  await login(page, "admin", "/issues");
  await page.locator(".issue-board-title").first().click();
  await expect(dialog(page).locator(".details-grid")).toBeVisible();
  await closeDialog(page);
  await page.locator(".mini-stat-grid button").nth(1).click();
  expect(
    await page.getByLabel("Issue status", { exact: true }).inputValue(),
  ).toBe("in_progress");
  await page.goto("/reports");
  await page.locator(".report-card .rich-title").first().click();
  await expect(dialog(page).locator(".detail-banner")).toBeVisible();
  await closeDialog(page);
  await page.locator(".mini-stat-grid button").nth(1).click();
  expect(
    await page.getByLabel("Report status", { exact: true }).inputValue(),
  ).toBe("approved");
  await page.goto("/catalog");
  await page.locator(".catalog-card .text-button").first().click();
  await expect(page.locator("dialog.drawer[open]")).toBeVisible();
  expect((await workspace(page)).brands.length).toBeGreaterThanOrEqual(4);
});
