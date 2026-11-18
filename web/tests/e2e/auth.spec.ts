import {
  test,
  expect,
  login,
  dialog,
  workspace,
  api,
  uid,
  field,
  save,
} from "./helpers";

test("manual sign-out, rejected password, successful password login and HttpOnly session", async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Your account", exact: true }).click();
  const signedOut = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/logout"),
  );
  await dialog(page)
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  expect((await signedOut).status()).toBe(200);
  await expect(page.getByLabel("Work email", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Work email", { exact: true })).toBeVisible();
  await page
    .getByLabel("Work email", { exact: true })
    .fill("admin@faracode.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill("AnIncorrectPassword!");
  let response = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(401);
  await expect(
    page.locator(".login-form-panel").getByRole("alert"),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("Demo@12345!");
  response = page.waitForResponse((r) => r.url().endsWith("/api/auth/login"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator(".main-content")).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "sampling_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect((await workspace(page)).user.role).toBe("admin");
});

test("expired browser session leaves the workspace and stays signed out after reload", async ({
  page,
  context,
}) => {
  await login(page);
  await context.clearCookies();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/workspace"),
  );
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  expect((await response).status()).toBe(401);
  await expect(page.getByLabel("Work email", { exact: true })).toBeVisible();
  await expect(page.locator(".main-content")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Work email", { exact: true })).toBeVisible();
});

test("supported demo role buttons switch roles through the real API", async ({
  page,
}) => {
  await login(page);
  for (const [role, label] of [
    ["sampler", "Sampler"],
    ["supervisor", "Supervisor"],
    ["admin", "Administrator"],
  ]) {
    await page
      .getByRole("button", { name: "Your account", exact: true })
      .click();
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/auth/demo"),
    );
    await dialog(page)
      .locator(".role-switch-buttons")
      .getByRole("button", { name: label, exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect((await workspace(page)).user.role).toBe(role);
  }
});

test("a committed form save remains successful if the subsequent workspace refresh fails", async ({
  page,
}) => {
  await login(page, "admin", "/catalog");
  await page
    .locator(".card-tabs")
    .getByRole("button", { name: /^Clients/ })
    .click();
  await page.getByRole("button", { name: "Add new item", exact: true }).click();
  const name = uid("QA Saved Once");
  await field(page, "name").fill(name);
  // Fault injection affects the follow-up read only; the write goes to real Go/PostgreSQL.
  await page.route(
    "**/api/workspace",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary QA read outage" }),
      });
    },
    { times: 1 },
  );
  await save(page, "/catalog");
  await expect(page.locator(".sync-notice")).toContainText(
    "Your changes were saved",
  );
  expect(
    (await workspace(page)).customers.filter((c) => c.name === name),
  ).toHaveLength(1);
  await page
    .locator(".sync-notice")
    .getByRole("button", { name: "Refresh data", exact: true })
    .click();
  await expect(page.locator(".sync-notice")).toHaveCount(0);
  await page.locator(".collection-bar input").fill(name);
  await expect(page.locator(".catalog-card h2")).toHaveText(name);
});

test("sampler and supervisor permissions reject unassigned writes and exports", async ({
  page,
}) => {
  await login(page, "sampler");
  for (const path of [
    "/campaigns",
    "/locations",
    "/shifts",
    "/catalog",
    "/people",
  ])
    await api(page, path, {}, 403);
  expect((await page.request.get("/api/reports/export?days=30")).status()).toBe(
    403,
  );
  await api(page, "/shifts/shift-5/stock", { kind: "added", quantity: 1 }, 403);
  await login(page, "supervisor");
  await api(page, "/people", {}, 403);
});
