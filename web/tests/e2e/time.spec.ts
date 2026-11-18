import {
  test,
  expect,
  login,
  campaign,
  field,
  save,
  workspace,
} from "./helpers";

test.use({ timezoneId: "UTC" });

test("shift form keeps Tehran wall time when the browser uses another timezone", async ({
  page,
}) => {
  await login(page, "admin", "/shifts");
  const c = await campaign(page, {
    start_date: "2027-02-10",
    end_date: "2027-02-10",
  });
  await page.getByRole("button", { name: "New shift", exact: true }).click();
  await field(page, "campaign_id").selectOption(c.id);
  await field(page, "starts_at").fill("2027-02-10T00:30");
  await field(page, "ends_at").fill("2027-02-10T01:30");
  const s = await save(page, "/shifts");
  const persisted = (await workspace(page)).shifts.find((x) => x.id === s.id)!;
  expect(new Date(persisted.starts_at).toISOString()).toBe(
    "2027-02-09T21:00:00.000Z",
  );
  expect(new Date(persisted.ends_at).toISOString()).toBe(
    "2027-02-09T22:00:00.000Z",
  );
});
