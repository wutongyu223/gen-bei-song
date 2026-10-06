import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gbs-v1",
      JSON.stringify({ settings: { apiUrl: "" } }),
    );
  });
});

test("daily overview fits phone, safe areas, tablet, landscape and desktop windows", async ({
  page,
}) => {
  await page.goto("/");
  const windows = [
    { width: 402, height: 874, top: 62, bottom: 34 },
    { width: 402, height: 700 },
    { width: 390, height: 664 },
    { width: 360, height: 640 },
    { width: 600, height: 900 },
    { width: 768, height: 1024 },
    { width: 800, height: 600 },
    { width: 1024, height: 530 },
    { width: 874, height: 402, left: 62, right: 62, bottom: 21 },
    { width: 1280, height: 720 },
  ];
  for (const viewport of windows) {
    await page.setViewportSize(viewport);
    const safe = { top: 0, right: 0, bottom: 0, left: 0, ...viewport };
    const override = await page.addStyleTag({
      content: `:root {
      --safe-top: ${safe.top}px; --safe-right: ${safe.right}px;
      --safe-bottom: ${safe.bottom}px; --safe-left: ${safe.left}px;
    }`,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            horizontal: document.documentElement.scrollWidth - innerWidth,
            vertical: document.documentElement.scrollHeight - innerHeight,
          })),
        { message: JSON.stringify(viewport) },
      )
      .toEqual({ horizontal: 0, vertical: 0 });
    for (const button of await page
      .locator(".site-header button, .card-start, .bottom-nav button")
      .all()) {
      expect(
        await button.evaluate((el, inset) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return (
            r.width >= 48 &&
            r.height >= 48 &&
            r.top >= inset.top &&
            r.bottom <= innerHeight - inset.bottom &&
            r.left >= inset.left &&
            r.right <= innerWidth - inset.right &&
            (top === el || el.contains(top))
          );
        }, safe),
        `${viewport.width}×${viewport.height}: ${await button.textContent()}`,
      ).toBe(true);
    }
    const nav = await page
      .getByRole("navigation", { name: "主导航" })
      .boundingBox();
    expect(nav).not.toBeNull();
    if (viewport.width < 600) expect(nav!.width).toBe(viewport.width);
    else if (viewport.width < 1200) expect(nav!.width).toBeLessThan(160);
    await override.evaluate((el) => el.parentNode?.removeChild(el));
  }
});

test("tablet rail changes destinations and disappears during practice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await page.getByRole("button", { name: /材料$/ }).click();
  await expect(page.getByRole("button", { name: /材料$/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "你的材料" })).toBeVisible();
  await page.getByRole("button", { name: /记录$/ }).click();
  await expect(page.getByRole("button", { name: /记录$/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: /今日$/ }).click();
  await page.getByRole("button", { name: /开始背诵/ }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(0);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.getByRole("button", { name: "保存并返回" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
});

test("reading controls remain large and reachable within home-screen safe areas", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".practice-card.bei").getByRole("button").click();
  await page.getByRole("button", { name: "隐藏", exact: true }).click();
  const windows = [
    { width: 402, height: 874, top: 62, bottom: 34, left: 0, right: 0 },
    { width: 360, height: 640, top: 24, bottom: 24, left: 0, right: 0 },
    { width: 874, height: 402, top: 0, bottom: 21, left: 62, right: 62 },
    { width: 768, height: 1024, top: 24, bottom: 24, left: 0, right: 0 },
  ];
  for (const view of windows) {
    await page.setViewportSize(view);
    const style = await page.addStyleTag({
      content: `:root { --safe-top:${view.top}px; --safe-bottom:${view.bottom}px; --safe-left:${view.left}px; --safe-right:${view.right}px; }`,
    });
    const controls = page.locator(".practice-footer button");
    for (const button of await controls.all()) {
      expect(
        await button.evaluate((el, safe) => {
          const r = el.getBoundingClientRect(),
            hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
          return (
            r.width >= 48 &&
            r.height >= 48 &&
            r.left >= safe.left &&
            r.right <= innerWidth - safe.right &&
            r.top >= safe.top &&
            r.bottom <= innerHeight - safe.bottom &&
            (el === hit || el.contains(hit))
          );
        }, view),
        `${view.width}×${view.height} ${await button.textContent()}`,
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "保存并返回" })
      .scrollIntoViewIfNeeded();
    expect(
      (await page.getByRole("button", { name: "保存并返回" }).boundingBox())!.y,
    ).toBeGreaterThanOrEqual(view.top);
    expect(
      await page
        .locator(".mastery-button")
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("13px");
    await expect(page.locator(".timer small")).toBeVisible();
    await style.evaluate((el) => el.parentNode?.removeChild(el));
  }
});

test("home screen manifest resolves inside the project and supplies app icons", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .evaluate((el: HTMLLinkElement) => el.href);
  const r = await request.get(manifestUrl);
  expect(r.ok()).toBe(true);
  const manifest = await r.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, manifestUrl).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
});
