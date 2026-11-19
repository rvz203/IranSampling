import { randomUUID } from "node:crypto";
import {
  api,
  campaign,
  closeDialog,
  dialog,
  expect,
  login,
  shift,
  test,
  uid,
  workspace,
} from "./helpers";

test("field member and admin share a campaign conversation that stays separate after completion", async ({
  page,
}) => {
  await login(page, "admin", "/campaigns");
  const firstName = uid("QA campaign room");
  const secondName = uid("QA separate room");
  const first = await campaign(page, { name: firstName });
  const second = await campaign(page, { name: secondName });
  const assignedShift = await shift(page, { campaign_id: first.id });
  const email = `${randomUUID()}@example.test`;
  const password = "CampaignTestPassword123!";
  const member = await api(page, "/people", {
    name: "QA Campaign Member",
    role: "sampler",
    city: "تهران",
    email,
    password,
  });
  await api(page, `/shifts/${assignedShift.id}/assignments`, {
    person_id: member.id,
  });
  const signIn = await api(
    page,
    "/mobile/auth/login",
    { identifier: email, password },
    200,
  );
  const headers = {
    Authorization: `Bearer ${signIn.token}`,
    "X-Requested-With": "FaraCode",
  };
  await page.reload();
  const openRoom = async (name: string) => {
    await page
      .getByRole("textbox", { name: "Search campaigns, brands, or clients…" })
      .fill(name);
    await page
      .locator(".rich-campaign-card")
      .filter({ hasText: name })
      .locator(".rich-title")
      .click();
  };
  await openRoom(firstName);
  await dialog(page)
    .getByRole("button", { name: "Conversation", exact: true })
    .click();
  const text = uid("Message scoped to room one");
  await dialog(page).getByLabel("Your message").fill(text);
  await dialog(page)
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(dialog(page).getByText(text, { exact: true })).toBeVisible();
  const endpoint = `/api/campaigns/${first.id}/messages`;
  const inbox = await page.request.get(endpoint, { headers });
  expect(inbox.status()).toBe(200);
  expect((await inbox.json()).messages[0].body).toBe(text);
  const response = await page.request.post(endpoint, {
    headers,
    data: { body: "Reply sent from the field", client_id: randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(200);
  await expect(
    dialog(page).getByText("Reply sent from the field", { exact: true }),
  ).toBeVisible();
  const denied = await page.request.get(
    `/api/campaigns/${second.id}/messages`,
    { headers },
  );
  expect(denied.status()).toBe(403);

  await api(
    page,
    `/campaigns/${first.id}`,
    { status: "completed" },
    200,
    "PATCH",
  );
  await dialog(page)
    .getByRole("button", { name: "History", exact: true })
    .click();
  await expect(dialog(page).getByText(/پایان‌یافته/)).toBeVisible();
  await closeDialog(page);
  await openRoom(secondName);
  await dialog(page)
    .getByRole("button", { name: "Conversation", exact: true })
    .click();
  await expect(dialog(page).getByText("Start the conversation")).toBeVisible();
  await expect(dialog(page).getByText(text, { exact: true })).toHaveCount(0);
  await closeDialog(page);
  await openRoom(firstName);
  await dialog(page)
    .getByRole("button", { name: "Conversation", exact: true })
    .click();
  await expect(dialog(page).getByText(text, { exact: true })).toBeVisible();
});

test("operations map limits markers to the selected campaign and opens its local location", async ({
  page,
}) => {
  await login(page, "admin", "/map");
  const data = await workspace(page);
  const point = data.shifts.find((item) => item.status === "active")!;
  const assigned = new Set(
    data.shifts
      .filter((item) => item.campaign_id === point.campaign_id)
      .map((item) => item.location_id),
  );
  const outside = data.locations.find((item) => !assigned.has(item.id))!;
  await page
    .getByRole("combobox", { name: "Map campaign" })
    .selectOption(point.campaign_id);
  const map = page.locator(".map-canvas");
  if (data.map_available) {
    const frame = map.frameLocator('iframe[title="Iran map"]');
    await expect(frame.locator("body")).toHaveAttribute(
      "data-map-state",
      "ready",
      { timeout: 30_000 },
    );
    await expect(
      frame.getByRole("button", { name: point.location_name, exact: true }),
    ).toBeVisible();
    await expect(
      frame.getByRole("button", { name: outside.name, exact: true }),
    ).toHaveCount(0);
    await frame
      .getByRole("button", { name: point.location_name, exact: true })
      .click();
  } else {
    await expect(
      map.getByRole("button", { name: new RegExp(outside.name) }),
    ).toHaveCount(0);
    await map
      .getByRole("button", { name: new RegExp(point.location_name) })
      .click();
  }
  await expect(
    dialog(page).locator('a[href^="/api/maps/view#lat="]'),
  ).toBeVisible();
});
