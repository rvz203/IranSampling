import {
  test,
  expect,
  login,
  uid,
  dialog,
  field,
  save,
  workspace,
  ymd,
  localMinute,
  closeDialog,
} from "./helpers";

test("catalog, person, campaign, location and shift forms persist through the Go API", async ({
  page,
}) => {
  const client = uid("QA Client"),
    brand = uid("QA Brand"),
    product = uid("QA Product"),
    person = uid("QA Sampler"),
    name = uid("QA Campaign"),
    point = uid("QA Point");
  await login(page, "admin", "/catalog");
  for (const [tab, label] of [
    ["Clients", client],
    ["Brands", brand],
    ["Products", product],
  ]) {
    await page
      .locator(".card-tabs")
      .getByRole("button", { name: new RegExp(`^${tab}`) })
      .click();
    await page
      .getByRole("button", { name: "Add new item", exact: true })
      .click();
    await field(page, "name").fill(label);
    if (tab === "Brands")
      await field(page, "parentID").selectOption({ label: client });
    if (tab === "Products") {
      await field(page, "parentID").selectOption({ label: brand });
      await field(page, "unit").fill("sample");
    }
    await save(page, "/catalog");
    await page.locator(".collection-bar input").fill(label);
    await expect(page.locator(".catalog-card h2")).toHaveText(label);
    await page.locator(".collection-bar input").fill("");
  }
  await page.goto("/team");
  await page.getByRole("button", { name: "Add teammate", exact: true }).click();
  await field(page, "name").fill(person);
  const email = `qa-${Date.now()}@example.test`;
  await field(page, "email").fill(email);
  await field(page, "password").fill("QaPassword12345!");
  await field(page, "phone").fill("09121234567");
  await save(page, "/people");
  expect(
    (await workspace(page)).people.some(
      (p) => p.email === email && p.name === person,
    ),
  ).toBe(true);
  await page.goto("/campaigns");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await field(page, "name").fill(name);
  await field(page, "brand_id").selectOption({ label: brand });
  await field(page, "product_id").selectOption({ label: product });
  await field(page, "start_date").fill(ymd(-1));
  await field(page, "end_date").fill(ymd(2));
  await field(page, "target").fill("100");
  await field(page, "status").selectOption("active");
  await field(page, "description").fill(
    "QA instructions, written through the actual campaign form.",
  );
  const c = await save(page, "/campaigns");
  await page.reload();
  await page.locator(".collection-bar input").fill(name);
  await page.locator(".rich-title").filter({ hasText: name }).click();
  const statusChanged = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/campaigns/${c.id}`) &&
      r.request().method() === "PATCH",
  );
  await dialog(page).getByLabel("Campaign status").selectOption("paused");
  expect((await statusChanged).status()).toBe(200);
  expect(
    (await workspace(page)).campaigns.find((x) => x.id === c.id)?.status,
  ).toBe("paused");
  const resumed = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/campaigns/${c.id}`) &&
      r.request().method() === "PATCH",
  );
  await dialog(page).getByLabel("Campaign status").selectOption("active");
  await resumed;
  await closeDialog(page);
  await page.goto("/map");
  await page.getByRole("button", { name: "Add location", exact: true }).click();
  await field(page, "name").fill(point);
  await field(page, "address").fill("QA street, test-only activation point");
  await field(page, "latitude").fill("35.7902");
  await field(page, "longitude").fill("51.4105");
  await field(page, "radius").fill("350");
  const location = await save(page, "/locations");
  await page.goto("/shifts");
  await page.getByRole("button", { name: "New shift", exact: true }).click();
  await field(page, "campaign_id").selectOption(c.id);
  await field(page, "location_id").selectOption(location.id);
  await field(page, "supervisor_id").selectOption("p-supervisor");
  const starts = new Date(Date.now() - 45 * 60 * 1000),
    ends = new Date(Date.now() + 75 * 60 * 1000);
  await field(page, "starts_at").fill(localMinute(starts));
  await field(page, "ends_at").fill(localMinute(ends));
  await field(page, "target").fill("100");
  await field(page, "required_staff").fill("1");
  const s = await save(page, "/shifts");
  const persisted = (await workspace(page)).shifts.find((x) => x.id === s.id)!;
  expect(persisted.campaign_id).toBe(c.id);
  expect(persisted.location_id).toBe(location.id);
  expect(
    Math.abs(new Date(persisted.starts_at).getTime() - starts.getTime()),
  ).toBeLessThan(60_000);
  expect(persisted.required_staff).toBe(1);
  await page.reload();
  await expect(
    page.locator(".shift-title").filter({ hasText: point }),
  ).toBeVisible();
});

test("form validation prevents empty submissions and displays backend errors without losing fields", async ({
  page,
}) => {
  await login(page, "admin", "/campaigns");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await dialog(page).locator('button[type="submit"]').click();
  expect(
    await field(page, "name").evaluate(
      (e: HTMLInputElement) => e.validity.valueMissing,
    ),
  ).toBe(true);
  const name = uid("QA invalid range");
  await field(page, "name").fill(name);
  await field(page, "target").fill("100");
  await field(page, "start_date").fill(ymd(2));
  await field(page, "end_date").fill(ymd(-1));
  await save(page, "/campaigns", 400);
  await expect(field(page, "name")).toHaveValue(name);
  await expect(dialog(page).getByRole("alert")).toContainText(
    "Invalid date range",
  );
  await closeDialog(page);
  await page.goto("/catalog");
  await page
    .locator(".card-tabs")
    .getByRole("button", { name: /^Clients/ })
    .click();
  await page.getByRole("button", { name: "Add new item", exact: true }).click();
  const existing = (await workspace(page)).customers[0].name;
  await field(page, "name").fill(existing);
  await save(page, "/catalog", 409);
  await expect(dialog(page).getByRole("alert")).toContainText(
    "Conflicting or invalid data",
  );
  await closeDialog(page);
});
