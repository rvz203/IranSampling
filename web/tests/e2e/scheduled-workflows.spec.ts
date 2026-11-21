import { join } from "node:path";
import {
  api,
  closeDialog,
  dialog,
  expect,
  field,
  localMinute,
  login,
  openShift,
  save,
  shift,
  test,
  uid,
  workspace,
} from "./helpers";

const previews = process.env.SAMPLING_WORKFLOW_PREVIEW_DIR;

test("admin changes working hours and the roster, reviews a route, and closes a shift", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page, "admin", "/shifts");
  const name = uid("Field Sampler");
  const identifier = `${Date.now()}@example.test`;
  const password = "WorkflowDemoPassword2026!";
  const person = await api(page, "/people", {
    name,
    email: identifier,
    role: "sampler",
    city: "تهران",
    password,
  });
  const place = uid("Tehran activation");
  const location = await api(page, "/locations", {
    name: place,
    city: "تهران",
    address: "تجریش",
    latitude: 35.7902,
    longitude: 51.4105,
    radius: 500,
  });
  const planned = await shift(page, { location_id: location.id });
  await openShift(page, place);
  await dialog(page)
    .getByRole("button", { name: "Edit schedule and team", exact: true })
    .click();
  await field(page, "break_starts_at").fill(
    localMinute(new Date(Date.now() + 10 * 60_000)),
  );
  await save(
    page,
    `/shifts/${planned.id}/schedule`,
    400,
    "Save schedule and team",
    "PATCH",
  );
  await field(page, "break_ends_at").fill(
    localMinute(new Date(Date.now() + 30 * 60_000)),
  );
  const workEnd = new Date(Date.now() + 75 * 60_000);
  await field(page, "ends_at").fill(localMinute(workEnd));
  await dialog(page)
    .getByRole("checkbox", { name: new RegExp(name) })
    .check();
  if (previews)
    await page.screenshot({
      path: join(previews, "shift-schedule-editor.png"),
    });
  await save(
    page,
    `/shifts/${planned.id}/schedule`,
    200,
    "Save schedule and team",
    "PATCH",
  );
  await expect(
    dialog(page).getByText("Lunch break", { exact: true }),
  ).toBeVisible();
  await dialog(page).getByRole("button", { name: "Team & attendance" }).click();
  await expect(dialog(page).getByText(name, { exact: true })).toBeVisible();
  await expect(
    dialog(page).getByText("Supervisor", { exact: true }),
  ).toBeVisible();
  const saved = (await workspace(page)).shifts.find(
    (item) => item.id === planned.id,
  )!;
  expect(saved.team.map((member) => member.id)).toEqual([person.id]);
  expect(saved.break_starts_at).toBeTruthy();
  expect(Math.abs(Date.parse(saved.ends_at) - workEnd.getTime())).toBeLessThan(
    60_000,
  );

  const { token } = await api(
    page,
    "/mobile/auth/login",
    { identifier, password },
    200,
  );
  const phoneHeaders = {
    Authorization: `Bearer ${token}`,
    "X-Requested-With": "FaraCode",
  };
  const geo = { latitude: 35.7902, longitude: 51.4105, accuracy: 12 };
  const arrival = await page.request.post(
    `/api/shifts/${planned.id}/check-in`,
    { headers: phoneHeaders, data: geo },
  );
  expect(arrival.status(), await arrival.text()).toBe(201);
  const sharing = await page.request.post(
    `/api/shifts/${planned.id}/tracking`,
    { headers: phoneHeaders, data: { consent: true } },
  );
  expect(sharing.ok(), await sharing.text()).toBe(true);
  const session = await sharing.json();
  const nextFix = Date.parse(session.started_at) + 30_001;
  const samples = await page.request.post(
    `/api/tracking/${session.id}/samples`,
    {
      headers: phoneHeaders,
      data: {
        samples: [
          { ...geo, captured_at: session.started_at },
          {
            ...geo,
            latitude: 35.7909,
            longitude: 51.4135,
            captured_at: new Date(nextFix).toISOString(),
          },
        ],
      },
    },
  );
  expect(samples.ok(), await samples.text()).toBe(true);
  expect((await samples.json()).results).toEqual(["stored", "stored"]);
  const denied = await page.request.get(
    `/api/shifts/${planned.id}/tracking-history?person_id=${person.id}`,
    { headers: phoneHeaders },
  );
  expect(denied.status()).toBe(403);

  await dialog(page)
    .getByRole("button", { name: "Location history", exact: true })
    .click();
  await dialog(page)
    .getByLabel("Team member for history")
    .selectOption(person.id);
  const rows = dialog(page)
    .getByRole("list", { name: "Route points" })
    .getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole("button").click();
  await expect(rows.first().getByRole("button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if ((await workspace(page)).map_available) {
    const mapFrame = page.locator(".track-history-map iframe");
    await expect(mapFrame).toHaveCSS("position", "static");
    const map = mapFrame.contentFrame().locator("body");
    await expect(map).toHaveAttribute("data-map-state", "ready", {
      timeout: 35_000,
    });
    await expect(map).toHaveAttribute("data-route-count", "1");
  }
  if (previews)
    await page.screenshot({
      path: join(previews, "shift-location-history.png"),
    });

  await dialog(page)
    .getByRole("button", { name: "End shift", exact: true })
    .click();
  await save(
    page,
    `/shifts/${planned.id}/end`,
    200,
    "End shift and create report",
  );
  await dialog(page)
    .getByRole("button", { name: /Evidence & report/ })
    .click();
  const summary = dialog(page).getByRole("region", {
    name: "Automatic shift summary",
  });
  await expect(summary.getByText(name, { exact: true })).toBeVisible();
  await expect(summary.getByText("Auto-closed", { exact: true })).toBeVisible();
  await expect(
    dialog(page).getByRole("button", { name: "End shift", exact: true }),
  ).toHaveCount(0);
  await closeDialog(page);
  await page.getByRole("link", { name: /Reports & reviews/ }).click();
  await page.getByRole("button", { name: /Automatic summaries/ }).click();
  await page.getByRole("button", { name: new RegExp(place) }).click();
  await expect(
    dialog(page).getByRole("region", { name: "Automatic shift summary" }),
  ).toBeVisible();
  if (previews)
    await page.screenshot({
      path: join(previews, "shift-closeout-report.png"),
    });
});

test("the guided tour highlights every workspace page and can be dismissed on mobile", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page, "admin", "/shifts");
  const tour = page.getByRole("dialog", { name: "Workspace tour" });
  await page
    .getByRole("button", { name: "Take a quick tour", exact: true })
    .click();
  const headings = [
    "Overview",
    "Campaigns",
    "Shift schedule and team",
    "Operations map",
    "People and teams",
    "Attendance",
    "Stock and distribution",
    "Issues and follow-ups",
    "End-of-shift reports",
    "Brands and products",
    "Search and notifications",
    "Account and settings",
  ];
  for (const [index, heading] of headings.entries()) {
    await expect(
      tour.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(tour.locator("progress")).toHaveAttribute(
      "value",
      String(index + 1),
    );
    await expect(tour.locator(".tour-spotlight")).toBeVisible();
    if (index === 2) {
      if (previews)
        await page.screenshot({
          path: join(previews, "workspace-guided-tour.png"),
        });
      await tour.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        tour.getByRole("heading", { name: "Campaigns", exact: true }),
      ).toBeVisible();
      await tour
        .getByRole("button", { name: "Next step", exact: true })
        .click();
      await expect(
        tour.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await tour
      .getByRole("button", {
        name: index < headings.length - 1 ? "Next step" : "Finish tour",
        exact: true,
      })
      .click();
  }
  await expect(tour).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem("faracode-locale", "fa"));
  await page.reload();
  await page
    .getByRole("button", { name: "باز کردن فهرست", exact: true })
    .click();
  await page.getByRole("button", { name: "راهنمای شروع", exact: true }).click();
  const mobileTour = page.getByRole("dialog", { name: "تور راهنمای شروع" });
  await expect(
    mobileTour.getByRole("heading", { name: "نمای کلی", exact: true }),
  ).toBeVisible();
  await expect(
    mobileTour.getByRole("button", { name: "قبلی", exact: true }),
  ).toBeDisabled();
  if (previews)
    await page.screenshot({
      path: join(previews, "workspace-guided-tour-mobile.png"),
    });
  await page.keyboard.press("Escape");
  await expect(mobileTour).toHaveCount(0);
});
