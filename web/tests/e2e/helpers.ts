import {
  test as base,
  expect,
  type Page,
  type BrowserContext,
  type Locator,
} from "@playwright/test";
import type { WorkspaceData } from "../../src/lib/types";

export const test = base.extend({
  page: async ({ page, context }, use) => {
    await context.addInitScript(() => {
      if (!localStorage.getItem("faracode-locale"))
        localStorage.setItem("faracode-locale", "en");
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "Uncaught browser errors").toEqual([]);
  },
});
export { expect };
export const uid = (label = "QA") =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const dialog = (page: Page): Locator =>
  page.locator("dialog[open]").last();
export const field = (page: Page, name: string) =>
  dialog(page).locator(`[name="${name}"]`);

export async function workspace(page: Page): Promise<WorkspaceData> {
  const response = await page.request.get("/api/workspace");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
export async function api(
  page: Page,
  path: string,
  data: unknown,
  status = 201,
  method = "POST",
) {
  const response = await page.request.fetch(`/api${path}`, {
    method,
    data,
    headers: { "X-Requested-With": "FaraCode" },
  });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(
    status,
  );
  return response.json();
}
export async function login(page: Page, role = "admin", route = "/") {
  await api(page, "/auth/demo", { role }, 200);
  await page.goto(route);
  await expect(page.locator(".main-content")).toBeVisible();
}
export async function loginPerson(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
  route = "/shifts",
) {
  await context.addInitScript(() => {
    if (!localStorage.getItem("faracode-locale"))
      localStorage.setItem("faracode-locale", "en");
  });
  await api(page, "/auth/login", { email, password }, 200);
  await page.goto(route);
  await expect(page.locator(".main-content")).toBeVisible();
}
export async function save(
  page: Page,
  path: string,
  status = 201,
  button?: string,
  method = "POST",
) {
  const responsePromise = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api${path}` &&
      r.request().method() === method,
  );
  await (
    button
      ? dialog(page).getByRole("button", { name: button, exact: true })
      : dialog(page).locator('button[type="submit"]')
  ).click();
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(status);
  if (status < 300)
    await expect(page.locator("dialog[open] .standard-form")).toHaveCount(0);
  else await expect(dialog(page).getByRole("alert")).toBeVisible();
  return response.json();
}
export async function closeDialog(page: Page) {
  await dialog(page).locator(".dialog-header > button").click();
}
export function ymd(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86400000));
}
export function localMinute(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export async function campaign(
  page: Page,
  overrides: Record<string, unknown> = {},
) {
  return api(page, "/campaigns", {
    name: uid("QA campaign"),
    brand_id: "brand-kalleh",
    product_id: "product-yogurt",
    target: 100,
    status: "active",
    start_date: ymd(-1),
    end_date: ymd(2),
    ...overrides,
  });
}
export async function shift(
  page: Page,
  overrides: Record<string, unknown> = {},
) {
  const c = await campaign(page);
  return api(page, "/shifts", {
    campaign_id: c.id,
    location_id: "loc-palladium",
    supervisor_id: "p-supervisor",
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    ends_at: new Date(Date.now() + 3600000).toISOString(),
    target: 100,
    required_staff: 2,
    ...overrides,
  });
}
export async function stockForm(
  page: Page,
  shiftId: string,
  kind: string,
  quantity: number,
  status = 201,
) {
  await dialog(page)
    .getByRole("button", { name: "Record distribution / stock", exact: true })
    .click();
  await field(page, "kind").selectOption(kind);
  await field(page, "quantity").fill(String(quantity));
  await save(page, `/shifts/${shiftId}/stock`, status);
}
export async function openShift(page: Page, locationName: string) {
  await page.goto("/shifts");
  await page.getByLabel("Filter shifts", { exact: true }).selectOption("all");
  await page.locator(".collection-bar input").fill(locationName);
  await page
    .locator(".shift-title")
    .filter({ hasText: locationName })
    .first()
    .click();
  await expect(page.locator("dialog.drawer[open]")).toBeVisible();
}
