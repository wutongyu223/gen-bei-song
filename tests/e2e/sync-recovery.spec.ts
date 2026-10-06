import { test, expect } from "@playwright/test";

async function stalledSync(page: import("@playwright/test").Page) {
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem(
      "gbs-v1",
      JSON.stringify({
        settings: {
          apiUrl: "https://sync-test.invalid/api",
          token: "a".repeat(64),
        },
      }),
    );
    const nativeFetch = window.fetch.bind(window);
    const control = { healthy: false, requests: 0 };
    (window as unknown as { syncTest: typeof control }).syncTest = control;
    window.fetch = (input, init) => {
      const url = String(input);
      if (!url.startsWith("https://sync-test.invalid/api/"))
        return nativeFetch(input, init);
      control.requests++;
      // Deliberately ignore cancellation: the UI deadline must still release.
      if (!control.healthy) return new Promise<Response>(() => {});
      return Promise.resolve(
        Response.json(
          url.endsWith("/materials")
            ? { materials: [] }
            : { events: [], cursor: 0, hasMore: false },
        ),
      );
    };
  });
  await page.goto("/");
}

test("manual sync exits after a stall and retries without reloading", async ({
  page,
}) => {
  await stalledSync(page);
  await expect(
    page.getByRole("button", { name: "此设备保存", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "此设备保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "同步中…", exact: true }),
  ).toBeVisible();
  await page.clock.runFor(20_001);
  await expect(
    page.getByRole("button", { name: "同步中…", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".global-notice")).toContainText("同步等待太久");
  await page.evaluate(() => {
    (window as unknown as { syncTest: { healthy: boolean } }).syncTest.healthy =
      true;
  });
  await page.getByRole("button", { name: "此设备保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已同步", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".global-notice")).toContainText("记录已同步");
});

test("background checks stay quiet and returning from suspension starts a fresh sync", async ({
  page,
}) => {
  await stalledSync(page);
  await expect(
    page.getByRole("button", { name: "同步中…", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(31_000);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { syncTest: { requests: number } }).syncTest
          .requests,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    (window as unknown as { syncTest: { healthy: boolean } }).syncTest.healthy =
      true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("button", { name: "已同步", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".global-notice")).toHaveCount(0);
});
