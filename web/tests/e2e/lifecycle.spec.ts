import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  login,
  loginPerson,
  uid,
  dialog,
  field,
  save,
  closeDialog,
  api,
  shift,
  workspace,
  openShift,
  stockForm,
} from "./helpers";

test("complete field lifecycle: staffing, GPS, stock, evidence, issues, report return/resubmit, approval and CSV", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await login(page);
  const email = `field-${Date.now()}@example.test`,
    password = "QaPassword12345!",
    pointName = uid("QA Field Point");
  const person = await api(page, "/people", {
    name: uid("QA Field Sampler"),
    email,
    password,
    role: "sampler",
    city: "تهران",
  });
  const point = await api(page, "/locations", {
    name: pointName,
    city: "تهران",
    address: "A test-only activation point",
    latitude: 35.7902,
    longitude: 51.4105,
    radius: 350,
  });
  const { id: sid } = await shift(page, {
    location_id: point.id,
    required_staff: 1,
  });
  await openShift(page, pointName);
  await dialog(page)
    .getByRole("button", { name: "Team & attendance", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Assign teammate", exact: true })
    .click();
  await field(page, "person_id").selectOption(person.id);
  await save(page, `/shifts/${sid}/assignments`);
  expect(
    (await workspace(page)).shifts.find((s) => s.id === sid)?.team[0].id,
  ).toBe(person.id);
  await dialog(page)
    .getByRole("button", { name: "Workspace", exact: true })
    .click();
  const ready = page.waitForResponse((r) =>
    r.url().endsWith(`/api/shifts/${sid}/readiness`),
  );
  await dialog(page)
    .getByRole("button", { name: "Confirm readiness", exact: true })
    .click();
  expect((await ready).status()).toBe(200);
  await expect(
    dialog(page).getByRole("button", {
      name: "Confirm readiness",
      exact: true,
    }),
  ).toHaveCount(0);
  await stockForm(page, sid, "initial", 100);
  await stockForm(page, sid, "added", 10);
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3001",
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Tehran",
    permissions: ["geolocation"],
    geolocation: { latitude: 34, longitude: 51.4105, accuracy: 15 },
  });
  const sampler = await context.newPage();
  const childErrors: string[] = [];
  sampler.on("pageerror", (e) => childErrors.push(e.message));
  try {
    await loginPerson(sampler, context, email, password);
    const scoped = await workspace(sampler);
    expect(scoped.shifts.map((s) => s.id)).toEqual([sid]);
    await sampler.locator(".shift-title").click();
    let gps = sampler.waitForResponse((r) =>
      r.url().endsWith(`/api/shifts/${sid}/check-in`),
    );
    await dialog(sampler)
      .getByRole("button", { name: "Check in with GPS", exact: true })
      .click();
    expect((await gps).status()).toBe(400);
    await expect(dialog(sampler).getByRole("alert")).toContainText(
      "outside the location geofence",
    );
    await context.setGeolocation({
      latitude: 35.7902,
      longitude: 51.4105,
      accuracy: 15,
    });
    gps = sampler.waitForResponse((r) =>
      r.url().endsWith(`/api/shifts/${sid}/check-in`),
    );
    await dialog(sampler)
      .getByRole("button", { name: "Check in with GPS", exact: true })
      .click();
    expect((await gps).status()).toBe(201);
    await expect(
      dialog(sampler).getByRole("button", {
        name: "Check out with GPS",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await workspace(sampler)).attendance.find((a) => a.shift_id === sid)
        ?.in_accuracy,
    ).toBe(15);
    await stockForm(sampler, sid, "distributed", 40);
    await stockForm(sampler, sid, "distributed", 1000, 400);
    await expect(dialog(sampler).getByRole("alert")).toContainText(
      "exceeds available stock",
    );
    await field(sampler, "quantity").fill("50");
    await save(sampler, `/shifts/${sid}/stock`);
    await stockForm(sampler, sid, "damaged", 3);
    await stockForm(sampler, sid, "returned", 17);
    expect(
      (await workspace(sampler)).shifts.find((s) => s.id === sid),
    ).toMatchObject({
      received: 110,
      distributed: 90,
      damaged: 3,
      returned: 17,
      remaining: 0,
    });
    await dialog(sampler)
      .getByRole("button", { name: "Upload a photo", exact: true })
      .click();
    await dialog(sampler)
      .locator('input[type="file"]')
      .setInputFiles({
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      });
    await save(sampler, `/shifts/${sid}/evidence`, 400);
    await dialog(sampler)
      .locator('input[type="file"]')
      .setInputFiles(path.resolve("public/brand/pages/campaigns.png"));
    await dialog(sampler)
      .getByLabel("Photo caption")
      .fill("QA field evidence, verified upload");
    await save(sampler, `/shifts/${sid}/evidence`);
    const evidence = (await workspace(sampler)).evidence.find(
      (e) => e.shift_id === sid,
    )!;
    expect(
      (await sampler.request.get(`/api/evidence/${evidence.id}`)).headers()[
        "content-type"
      ],
    ).toBe("image/png");
    await dialog(sampler)
      .getByRole("button", { name: "Report an issue", exact: true })
      .click();
    const issueTitle = uid("QA urgent equipment issue");
    await field(sampler, "title").fill(issueTitle);
    await field(sampler, "priority").selectOption("urgent");
    await field(sampler, "description").fill(
      "This test issue must be resolved before final report approval.",
    );
    const issue = await save(sampler, "/issues");
    await dialog(sampler)
      .getByRole("button", { name: "Submit shift report", exact: true })
      .click();
    await field(sampler, "summary").fill(
      "The shift is complete. All stock is reconciled and a field photo is attached.",
    );
    await save(sampler, `/shifts/${sid}/report`, 400);
    await expect(dialog(sampler).getByRole("alert")).toContainText(
      "All team members must check out",
    );
    await closeDialog(sampler);
    gps = sampler.waitForResponse((r) =>
      r.url().endsWith(`/api/shifts/${sid}/check-out`),
    );
    await dialog(sampler)
      .getByRole("button", { name: "Check out with GPS", exact: true })
      .click();
    expect((await gps).status()).toBe(200);
    await dialog(sampler)
      .getByRole("button", { name: "Submit shift report", exact: true })
      .click();
    await field(sampler, "summary").fill(
      "The shift is complete. All stock is reconciled and a field photo is attached.",
    );
    const report = await save(sampler, `/shifts/${sid}/report`);
    await expect(
      dialog(sampler).getByRole("button", {
        name: "Record distribution / stock",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      dialog(sampler).getByRole("button", {
        name: "Submit shift report",
        exact: true,
      }),
    ).toBeDisabled();
    await openShift(page, pointName);
    await dialog(page)
      .getByRole("button", { name: /^Evidence & report/ })
      .click();
    await expect(dialog(page).locator(".evidence-grid img")).toBeVisible();
    await expect
      .poll(() =>
        dialog(page)
          .locator(".evidence-grid img")
          .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
      )
      .toBe(true);
    await dialog(page)
      .getByRole("button", { name: "Review this report", exact: true })
      .click();
    await save(page, `/reports/${report.id}/review`, 400);
    await expect(dialog(page).getByRole("alert")).toContainText(
      "Resolve urgent issues before approval",
    );
    await field(page, "status").selectOption("returned");
    await field(page, "feedback").fill(
      "Please clarify customer feedback before approval.",
    );
    await save(page, `/reports/${report.id}/review`, 200);
    await openShift(sampler, pointName);
    await dialog(sampler)
      .getByRole("button", { name: /^Evidence & report/ })
      .click();
    await expect(dialog(sampler).locator(".review-feedback")).toContainText(
      "Please clarify",
    );
    await dialog(sampler)
      .getByRole("button", { name: "Revise and resubmit", exact: true })
      .click();
    await field(sampler, "summary").fill(
      "Customer feedback clarified. Evidence is attached and the complete stock balance is zero.",
    );
    const resubmitted = await save(sampler, `/shifts/${sid}/report`);
    expect(resubmitted.id).toBe(report.id);
    await page.goto("/issues");
    await page.locator(".collection-bar input").fill(issueTitle);
    const updated = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/issues/${issue.id}`) &&
        r.request().method() === "PATCH",
    );
    await page.locator(".issue-board-card select").selectOption("resolved");
    expect((await updated).status()).toBe(200);
    await expect(
      page.locator(".issue-lane.resolved .issue-board-card"),
    ).toHaveCount(1);
    await openShift(page, pointName);
    await dialog(page)
      .getByRole("button", { name: /^Evidence & report/ })
      .click();
    await dialog(page)
      .getByRole("button", { name: "Review this report", exact: true })
      .click();
    await save(page, `/reports/${report.id}/review`, 200);
    const final = await workspace(page);
    expect(final.reports.find((r) => r.id === report.id)?.status).toBe(
      "approved",
    );
    expect(final.shifts.find((s) => s.id === sid)).toMatchObject({
      status: "completed",
      remaining: 0,
      distributed: 90,
    });
    expect(
      final.attendance.find((a) => a.shift_id === sid)?.checked_out_at,
    ).toBeTruthy();
    await dialog(page)
      .getByRole("button", { name: "Workspace", exact: true })
      .click();
    for (const button of [
      "Record distribution / stock",
      "Upload a photo",
      "Report an issue",
      "Submit shift report",
    ])
      await expect(
        dialog(page).getByRole("button", { name: button, exact: true }),
      ).toBeDisabled();
    await closeDialog(page);
    await page.goto("/issues");
    await page.locator(".collection-bar input").fill(issueTitle);
    await expect(page.locator(".issue-board-card select")).toBeDisabled();
    await page.goto("/reports");
    await page
      .getByRole("button", { name: "Export reports", exact: true })
      .click();
    const downloaded = page.waitForEvent("download");
    await dialog(page)
      .getByRole("button", { name: /Download/ })
      .click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/faracode-operations-.*\.csv/);
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
    expect(bytes.toString("utf8")).toContain(pointName);
    expect(bytes.toString("utf8")).toMatch(/,90,0,approved/);
    await sampler.reload();
    await expect(sampler.locator(".main-content")).toBeVisible();
    expect(
      (await workspace(sampler)).shifts.find((s) => s.id === sid)?.status,
    ).toBe("completed");
    expect(childErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
