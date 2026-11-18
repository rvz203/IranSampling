import { test, expect, login, dialog, closeDialog, workspace } from "./helpers";

const pages = [
  ["/", "Overview"],
  ["/campaigns", "Campaigns"],
  ["/shifts", "Shifts & schedule"],
  ["/map", "Operations map"],
  ["/team", "People & teams"],
  ["/attendance", "Attendance"],
  ["/inventory", "Stock & distribution"],
  ["/issues", "Issues & follow-ups"],
  ["/reports", "Reports & reviews"],
  ["/catalog", "Brands & products"],
];

for (const [route, title] of pages) {
  test(`page ${route}: rendering, artwork, navigation and controls`, async ({
    page,
  }) => {
    await login(page, "admin", route);
    await expect(page.locator(".main-content h1")).toHaveCount(1);
    await expect(
      page.locator(`.sidebar nav a[href="${route}"]`),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(`.sidebar nav a[href="${route}"]`)).toContainText(
      title,
    );
    for (const image of await page
      .locator(".page-hero-art img, .command-hero img")
      .all()) {
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
          ),
        )
        .toBeTruthy();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    expect(overflow, "The document must not overflow horizontally").toBe(false);
    if (await page.locator(".view-switch").count()) {
      await page
        .getByRole("button", { name: "List view", exact: true })
        .click();
      await expect(page.locator(".data-table")).toBeVisible();
      await page
        .getByRole("button", {
          name: route === "/issues" ? "Board view" : "Grid view",
          exact: true,
        })
        .click();
      await expect(page.locator(".data-table")).toHaveCount(0);
    }
    const search = page.locator(".collection-bar input");
    if (await search.count()) {
      await search.fill("No matching QA record 793461");
      await expect(
        page.locator(".empty-state, .issue-lane-empty").first(),
      ).toBeVisible();
      await search.fill("");
    }
    for (const filter of await page.locator(".collection-bar select").all()) {
      const options = await filter
        .locator("option")
        .evaluateAll((options) =>
          options.map((o) => (o as HTMLOptionElement).value),
        );
      if (options.length > 1) {
        await filter.selectOption(options.at(-1)!);
        await filter.selectOption(options[0]);
      }
    }
  });
}

test("global search, refresh, notifications, help, account and language persistence", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Search workspace", exact: true })
    .click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("textbox").fill("پالادیوم");
  await expect(
    dialog(page).locator(".search-results > button").first(),
  ).toBeVisible();
  await closeDialog(page);
  await page.keyboard.press("Control+k");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const refreshed = page.waitForResponse((r) =>
    r.url().endsWith("/api/workspace"),
  );
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  expect((await refreshed).status()).toBe(200);
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(dialog(page).locator(".notification-list")).toBeVisible();
  await closeDialog(page);
  await page
    .locator(".sidebar-utility")
    .getByRole("button", { name: "Help center" })
    .click();
  await expect(dialog(page).locator(".help-steps")).toBeVisible();
  await closeDialog(page);
  await page.getByRole("button", { name: "Your account", exact: true }).click();
  await dialog(page).getByLabel("Interface language").selectOption("fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await closeDialog(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  await expect(page.locator(".main-content")).toBeVisible();
});

test("mobile navigation reaches every operational page in Persian", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Your account", exact: true }).click();
  await dialog(page).getByLabel("Interface language").selectOption("fa");
  await closeDialog(page);
  for (const [route] of pages.slice(1)) {
    await page.locator(".mobile-menu").click();
    await page.locator(`.sidebar a[href="${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator(".main-content h1")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".sidebar-scrim")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});

test("all five demo roles load real scoped workspace data", async ({
  page,
}) => {
  for (const role of [
    "admin",
    "manager",
    "coordinator",
    "supervisor",
    "sampler",
  ]) {
    await login(page, role, "/team");
    const data = await workspace(page);
    expect(data.user.role).toBe(role);
    if (["admin", "manager", "coordinator"].includes(role))
      expect(data.campaigns.length).toBeGreaterThanOrEqual(6);
    else {
      expect(data.shifts.length).toBeGreaterThan(0);
      expect(
        data.shifts.every(
          (s) =>
            s.supervisor_id === data.user.id ||
            s.team.some((p) => p.id === data.user.id),
        ),
      ).toBe(true);
    }
    if (["admin", "manager"].includes(role))
      await expect(
        page.getByRole("button", { name: "Add teammate", exact: true }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("button", { name: "Add teammate", exact: true }),
      ).toHaveCount(0);
  }
});

test("unknown routes return the not-found page", async ({ page }) => {
  const response = await page.goto("/qa-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading")).toBeVisible();
});
