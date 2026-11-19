import {
  test,
  expect,
  login,
  dialog,
  field,
  save,
  api,
  campaign,
  shift,
  workspace,
  uid,
} from "./helpers";
import type { Page } from "@playwright/test";

async function loginMobile(page: Page, identifier: string, password: string) {
  const response = await page.request.post("/api/mobile/auth/login", {
    data: { identifier, password },
    headers: { "X-Requested-With": "FaraCode" },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).token as string;
}

async function mobile(
  page: Page,
  token: string,
  path: string,
  data: unknown,
  status: number,
) {
  const result = await page.request.post(`/api${path}`, {
    data,
    headers: {
      "X-Requested-With": "FaraCode",
      Authorization: `Bearer ${token}`,
    },
  });
  expect(result.status(), await result.text()).toBe(status);
  return result.json();
}

test("admin sets field-app credentials and rotated password revokes the previous mobile session", async ({
  page,
}) => {
  await login(page, "admin", "/team");
  const name = uid("QA Mobile teammate");
  const username = `field.${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "Add teammate", exact: true }).click();
  await field(page, "name").fill(name);
  await field(page, "email").fill(`${username}@example.test`);
  await field(page, "username").fill(username);
  await field(page, "password").fill("MobilePassword123!");
  const person = await save(page, "/people");
  const token = await loginMobile(page, username, "MobilePassword123!");
  expect(
    (await workspace(page)).people.find((p) => p.id === person.id)?.username,
  ).toBe(username);
  await page.locator(".collection-bar input").fill(name);
  await page.locator(".profile-card .text-button").click();
  await dialog(page)
    .getByRole("button", { name: "Manage sign-in credentials" })
    .click();
  await field(page, "username").fill(`${username}.new`);
  await field(page, "password").fill("NewMobilePassword123!");
  await save(
    page,
    `/people/${person.id}/credentials`,
    200,
    "Save credentials",
    "PATCH",
  );
  const old = await page.request.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(old.status()).toBe(401);
  const next = await loginMobile(
    page,
    `${username}.new`,
    "NewMobilePassword123!",
  );
  expect(next).not.toBe(token);
});

test("two live campaigns are isolated, update on the map, and respect supervisor access", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, "admin", "/map");
  async function startPoint(
    city: string,
    location: string,
    supervisor: string,
    latitude: number,
    longitude: number,
  ) {
    const name = uid("QA Sharing member");
    const email = `tracking-${location}-${Date.now()}@example.test`;
    const person = await api(page, "/people", {
      name,
      email,
      password: "MobilePassword123!",
      role: "sampler",
      city,
    });
    const group = await campaign(page, { name: uid("QA Live campaign") });
    const planned = await shift(page, {
      campaign_id: group.id,
      location_id: location,
      supervisor_id: supervisor,
      required_staff: 1,
    });
    await api(page, `/shifts/${planned.id}/assignments`, {
      person_id: person.id,
    });
    const token = await loginMobile(page, email, "MobilePassword123!");
    const fix = { latitude, longitude, accuracy: 18 };
    await mobile(page, token, `/shifts/${planned.id}/check-in`, fix, 201);
    const session = await mobile(
      page,
      token,
      `/shifts/${planned.id}/tracking`,
      { consent: true },
      200,
    );
    const samples = `/tracking/${session.id}/samples`;
    const response = await mobile(
      page,
      token,
      samples,
      { samples: [{ ...fix, captured_at: session.started_at }] },
      200,
    );
    expect(response.results).toEqual(["stored"]);
    return {
      name,
      id: person.id,
      campaign: group.id,
      token,
      session: session.id,
      samples,
    };
  }
  const first = await startPoint(
    "تهران",
    "loc-palladium",
    "p-supervisor",
    35.7902,
    51.4105,
  );
  const second = await startPoint(
    "اصفهان",
    "loc-citycenter",
    "p-supervisor2",
    32.5461,
    51.6896,
  );
  await page.reload();
  const card = page.getByRole("region", { name: "Live team locations" });
  const firstRow = card.getByTestId(`live-person-${first.id}`);
  const secondRow = card.getByTestId(`live-person-${second.id}`);
  await expect(firstRow).toContainText(first.name);
  await expect(secondRow).toContainText(second.name);
  const filter = page.getByRole("combobox", { name: "Map campaign" });
  await filter.selectOption(first.campaign);
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toHaveCount(0);
  if ((await workspace(page)).map_available) {
    const frame = card.frameLocator('iframe[title="Iran map"]');
    await expect(
      frame.getByRole("button", { name: first.name, exact: true }),
    ).toBeVisible();
    await expect(
      frame.getByRole("button", { name: second.name, exact: true }),
    ).toHaveCount(0);
  }
  await filter.selectOption(second.campaign);
  await expect(secondRow).toBeVisible();
  await expect(firstRow).toHaveCount(0);
  await filter.selectOption(first.campaign);
  await expect(
    firstRow.getByRole("link", { name: "Open map", exact: true }),
  ).toHaveAttribute("href", "/api/maps/view#lat=35.7902&lon=51.4105");
  await card.getByRole("button", { name: first.name, exact: true }).click();
  await expect(firstRow).toHaveClass(/selected/);

  const nextSlot = new Date(
    Math.ceil(Date.now() / 30_000) * 30_000,
  ).toISOString();
  const changed = await mobile(
    page,
    first.token,
    first.samples,
    {
      samples: [
        {
          latitude: 35.7903,
          longitude: 51.4106,
          accuracy: 29,
          captured_at: nextSlot,
        },
      ],
    },
    200,
  );
  expect(changed.results).toEqual(["stored"]);
  await card.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    firstRow.getByRole("link", { name: "Open map", exact: true }),
  ).toHaveAttribute("href", "/api/maps/view#lat=35.7903&lon=51.4106");

  await login(page, "supervisor", "/map");
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toHaveCount(0);
  expect(
    (
      await page.request.get(
        `/api/tracking/live?campaign_id=${second.campaign}`,
      )
    ).status(),
  ).toBe(403);
  await mobile(page, first.token, `/tracking/${first.session}/stop`, {}, 200);
  await card.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(firstRow).toHaveCount(0);
  await login(page, "admin", "/map");
  await expect(secondRow).toBeVisible();
  await login(page, "sampler", "/map");
  await expect(card).toHaveCount(0);
});
