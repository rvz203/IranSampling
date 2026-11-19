import { join } from "node:path";
import { expect, test } from "./helpers";

test("the full Iran archive renders national and street views with no external requests", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(110_000);
  await page.setViewportSize({ width: 1200, height: 950 });
  const range = await page.request.get("/api/maps/iran.pmtiles", {
    headers: { Range: "bytes=0-7" },
  });
  test.skip(
    range.status() === 404,
    "The Iran PMTiles data bundle must be provisioned for real map rendering",
  );
  expect(range.status()).toBe(206);
  expect(range.headers()["content-range"]).toMatch(/^bytes 0-7\/\d+$/);
  expect((await range.body()).subarray(0, 7).toString()).toBe("PMTiles");

  const external = new Set<string>();
  const local = new Set<string>();
  let tileReads = 0;
  const origin = new URL(baseURL!).origin;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.add(url.host);
      await route.abort();
    } else {
      local.add(url.pathname);
      await route.continue();
    }
  });
  page.on("response", (response) => {
    if (
      response.url().endsWith("/api/maps/iran.pmtiles") &&
      response.status() === 206
    )
      tileReads++;
  });

  await page.goto("/api/maps/view");
  await expect(page.locator("body")).toHaveAttribute(
    "data-map-state",
    "ready",
    { timeout: 35_000 },
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-map-zoom",
    /^[45]\./,
    { timeout: 25_000 },
  );
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib-inner")).toContainText(
    "© OpenStreetMap contributors",
  );
  const previews = process.env.SAMPLING_MAP_PREVIEW_DIR;
  if (previews)
    await page.screenshot({ path: join(previews, "iran-map-overview.png") });

  await page.goto("/api/maps/view#lat=35.7017&lon=51.4014");
  await expect(
    page.getByRole("button", { name: "نقطه روی نقشه", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute(
    "data-map-zoom",
    /^1[5-9]\./,
    { timeout: 30_000 },
  );
  if (previews)
    await page.screenshot({ path: join(previews, "iran-map-tehran.png") });

  expect(tileReads).toBeGreaterThan(2);
  expect(
    [...local].some((path) => path.startsWith("/api/maps/assets/fonts/")),
  ).toBe(true);
  expect(
    [...local].some((path) => path.startsWith("/api/maps/assets/sprites/")),
  ).toBe(true);
  expect([...external]).toEqual([]);
});
