import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const write = readFileSync(".dev.vars", "utf8").match(/WRITE_TOKEN="(.*)"/)![1];
const apiUrl = "http://127.0.0.1:8790/api";
const longMaterial = (id: string) => ({
  schemaVersion: 1,
  id,
  version: 1,
  title: "长家书练习",
  author: "测试",
  source: "自动验收用原文",
  modules: ["bei", "song"],
  visibility: "private",
  segments: [
    {
      id: "p1",
      text: "今天只背准这一句，明天仍从这一句起，".repeat(9),
      translation:
        "本信完整译文（与句子未逐一对齐）：\n" +
        "这是尚未逐句对齐的整篇译文。\n".repeat(100),
      uncertain: false,
    },
    ...Array.from({ length: 12 }, (_, n) => ({
      id: `p${n + 2}`,
      text: `第${n + 2}段是以后慢慢读的原文。`,
      uncertain: false,
    })),
  ],
});
const reachable = async (page: Page, name: string) => {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  expect(
    await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return (
        r.y >= 0 && r.bottom <= innerHeight && (top === el || el.contains(top))
      );
    }),
  ).toBe(true);
};
test("actual material resumes, partial clauses persist, and review returns to the saved clause", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const m = longMaterial(`ux-${crypto.randomUUID()}`);
  await page.addInitScript(
    (material) =>
      !localStorage.getItem("gbs-v1") &&
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [material],
          selected: { bei: "sunzi-jipian@1" },
          settings: { apiUrl: "" },
        }),
      ),
    m,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /材料$/ }).click();
  await page
    .locator(".library-card")
    .filter({ has: page.getByRole("heading", { name: m.title }) })
    .getByRole("button", { name: "背 · 练习", exact: true })
    .click();
  const parts = page.locator('.passage[data-segment="p1"] .practice-part');
  await parts.nth(0).getByRole("button").click();
  await parts.nth(3).click();
  await reachable(page, "暂停计时");
  await reachable(page, "隐藏");
  await page.getByRole("button", { name: "今天练到这里" }).click();
  await page.getByRole("button", { name: /今日$/ }).click();
  await expect(page.locator(".practice-card.bei")).toContainText(m.title);
  await expect(page.locator(".practice-card.bei")).not.toContainText(
    "已背准 1 段",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gbs-v1")!).events.at(-1),
  );
  expect(saved.confirmed).toEqual([]);
  expect(saved.confirmedRanges).toHaveLength(1);
  expect(saved.confirmedRanges[0].end).toBe(9);
  expect(saved.positionOffset).toBe(27);
  await page.reload();
  await page.locator(".practice-card.bei").getByRole("button").click();
  await expect(parts.nth(0)).toHaveClass(/current-part/);
  await expect(page.getByText("这句已经背准，先试着回忆")).toBeVisible();
  await reachable(page, "看原文核对");
  await reachable(page, "开始练习");
  await page.getByRole("button", { name: "跳过复习" }).click();
  await expect(parts.nth(3)).toHaveClass(/current-part/);
  await page.getByRole("button", { name: "今天练到这里" }).click();
  await page.getByRole("button", { name: /今日$/ }).click();
  await page.locator(".practice-card.bei").getByRole("button").click();
  await expect(page.getByRole("button", { name: "跳过复习" })).toBeVisible();
  await parts.nth(4).click();
  await expect(page.getByRole("button", { name: "跳过复习" })).toHaveCount(0);
  await page.getByRole("button", { name: "今天练到这里" }).click();
  const chosen = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gbs-v1")!).events.at(-1),
  );
  expect(chosen.positionOffset).toBe(36);
  await page.getByRole("button", { name: /今日$/ }).click();
  await page.locator(".practice-card.bei").getByRole("button").click();
  await page.getByRole("button", { name: "跳过复习" }).click();
  await expect(parts.nth(4)).toHaveClass(/current-part/);
  await parts.nth(0).getByRole("button").click();
  await page.getByRole("button", { name: "今天练到这里" }).click();
  const revoked = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gbs-v1")!).events.at(-1),
  );
  expect(revoked.revokedRanges).toEqual(saved.confirmedRanges);
});
test("long translation opens independently and preserves the original reading position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const m = longMaterial(`translation-${crypto.randomUUID()}`);
  await page.addInitScript(
    (material) =>
      !localStorage.getItem("gbs-v1") &&
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [material],
          selected: { song: `${material.id}@1` },
          settings: { apiUrl: "" },
        }),
      ),
    m,
  );
  await page.goto("/");
  await page.locator(".practice-card.song").getByRole("button").click();
  await page
    .locator(".passage")
    .nth(10)
    .getByRole("button", { name: "读到这里" })
    .click();
  const before = await page.locator(".reading-sheet").boundingBox();
  const scroll = await page.evaluate(() => scrollY);
  await reachable(page, "译文与注释");
  await page.getByRole("button", { name: "译文与注释" }).click();
  await expect(page.getByRole("dialog")).toContainText("完整译文 · 未逐句对齐");
  await page.locator("dialog").evaluate((el) => (el.scrollTop = 1500));
  await reachable(page, "返回原文");
  await page.getByRole("button", { name: "返回原文" }).click();
  expect((await page.locator(".reading-sheet").boundingBox())?.height).toBe(
    before?.height,
  );
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await reachable(page, "暂停计时");
  await page.getByRole("button", { name: "今天练到这里" }).click();
  await page.getByRole("button", { name: /今日$/ }).click();
  await page.reload();
  await page.locator(".practice-card.song").getByRole("button").click();
  await expect(page.locator(".passage").nth(10)).toHaveClass(/current/);
  await reachable(page, "开始练习");
});
test("audio play control is reachable on a short phone without scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "gbs-v1",
      JSON.stringify({ settings: { apiUrl: "" } }),
    ),
  );
  await page.goto("/");
  await page.locator(".practice-card.gen").getByRole("button").click();
  await expect(
    page.getByRole("button", { name: "播放音频", exact: true }),
  ).toBeEnabled();
  await reachable(page, "播放音频");
  await page.getByRole("button", { name: "播放音频", exact: true }).click();
  await reachable(page, "暂停播放");
});
test("partial ranges sync to another device and Agent, and invalid ranges are rejected", async ({
  request,
  browser,
}) => {
  const m = longMaterial(`range-ux-${crypto.randomUUID()}`);
  const headers = { Authorization: `Bearer ${write}` };
  expect(
    (await request.post(`${apiUrl}/materials`, { headers, data: m })).ok(),
  ).toBe(true);
  const now = new Date().toISOString();
  const e = {
    id: crypto.randomUUID(),
    kind: "practice",
    module: "bei",
    materialId: m.id,
    version: 1,
    startedAt: now,
    endedAt: now,
    day: "2026-10-06",
    seconds: 10,
    position: 0,
    positionOffset: 10,
    confirmed: [],
    revoked: [],
    confirmedRanges: [{ segmentId: "p1", start: 0, end: 10 }],
    completed: true,
  };
  expect(
    (
      await request.post(`${apiUrl}/events`, { headers, data: { events: [e] } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`${apiUrl}/events`, { headers, data: { events: [e] } })
    ).ok(),
  ).toBe(true);
  const read = readFileSync(".dev.vars", "utf8").match(/READ_TOKEN="(.*)"/)![1];
  const progress = await (
    await request.get(`${apiUrl}/progress`, {
      headers: { Authorization: `Bearer ${read}` },
    })
  ).json();
  const remote = progress.progress.find(
    (p: { materialId: string }) => p.materialId === m.id,
  );
  expect(remote.mastered).toEqual([]);
  expect(remote.masteredRanges).toEqual(e.confirmedRanges);
  expect(remote.positionOffset).toBe(10);
  expect(
    (
      await request.post(`${apiUrl}/events`, {
        headers,
        data: {
          events: [
            {
              ...e,
              id: crypto.randomUUID(),
              confirmedRanges: [{ segmentId: "p1", start: 0, end: 5000 }],
            },
          ],
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`${apiUrl}/events`, {
        headers,
        data: { events: [{ ...e, id: crypto.randomUUID(), position: 90 }] },
      })
    ).status(),
  ).toBe(400);
  const context = await browser.newContext();
  try {
    await context.addInitScript(
      (material) =>
        localStorage.setItem(
          "gbs-v1",
          JSON.stringify({
            materials: [material],
            selected: { bei: `${material.id}@1` },
            settings: { apiUrl: "/api" },
          }),
        ),
      m,
    );
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".practice-card.bei")).toContainText(
      "已背准 9 字",
    );
    await page.locator(".practice-card.bei").getByRole("button").click();
    await expect(
      page.getByRole("button", { name: /已背准 · 可撤销/ }),
    ).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("a local-only material cannot block built-in progress or silently upload", async ({
  page,
  request,
}) => {
  const m = longMaterial(`private-${crypto.randomUUID()}`);
  const now = new Date().toISOString();
  const base = {
    kind: "practice",
    module: "bei",
    version: 1,
    startedAt: now,
    endedAt: now,
    day: "2026-10-06",
    seconds: 1,
    position: 0,
    confirmed: [],
    revoked: [],
    completed: true,
  };
  const local = { ...base, id: crypto.randomUUID(), materialId: m.id },
    builtin = { ...base, id: crypto.randomUUID(), materialId: "sunzi-jipian" };
  await page.addInitScript(
    ({ material, events }) =>
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [material],
          events,
          pending: events.map((e) => e.id),
          settings: { apiUrl: "/api" },
        }),
      ),
    { material: m, events: [local, builtin] },
  );
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("gbs-v1")!).pending),
    )
    .toEqual([local.id]);
  await page.getByRole("button", { name: "1 条待同步" }).click();
  await expect(
    page.getByText(
      "这份材料的练习记录保存在此设备。先同步材料，其他设备和 Agent 才能看到这些记录。",
    ),
  ).toBeVisible();
  const headers = { Authorization: `Bearer ${write}` };
  const all = await (await request.get(`${apiUrl}/events`, { headers })).json();
  expect(all.events.some((e: { id: string }) => e.id === builtin.id)).toBe(
    true,
  );
  expect(all.events.some((e: { id: string }) => e.id === local.id)).toBe(false);
  const packages = await (
    await request.get(`${apiUrl}/materials`, { headers })
  ).json();
  expect(packages.materials.some((x: { id: string }) => x.id === m.id)).toBe(
    false,
  );
  await request.post(`${apiUrl}/materials`, { headers, data: m });
  await page.getByRole("button", { name: "1 条待同步" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("gbs-v1")!).pending),
    )
    .toEqual([]);
});
test("previewing another material leaves the actual continuation unchanged", async ({
  page,
}) => {
  const m = longMaterial(`preview-${crypto.randomUUID()}`);
  await page.addInitScript(
    (material) =>
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [material],
          selected: { bei: "sunzi-jipian@1" },
          settings: { apiUrl: "" },
        }),
      ),
    m,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /材料$/ }).click();
  await page
    .locator(".library-card")
    .filter({ has: page.getByRole("heading", { name: m.title }) })
    .getByRole("button", { name: "背 · 练习", exact: true })
    .click();
  await page.getByRole("button", { name: "保存并返回" }).click();
  await page.getByRole("button", { name: /今日$/ }).click();
  await expect(page.locator(".practice-card.bei")).toContainText(
    "兵者，国之大事",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gbs-v1")!).events ?? [],
    ),
  ).toEqual([]);
});
test("an acknowledged record stays out of the queue when another tab saves", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const a = await context.newPage();
    await a.addInitScript(() => {
      if (localStorage.getItem("gbs-v1")) return;
      const now = new Date().toISOString();
      const e = {
        id: crypto.randomUUID(),
        kind: "practice",
        module: "bei",
        materialId: "sunzi-jipian",
        version: 1,
        startedAt: now,
        endedAt: now,
        day: "2026-10-06",
        seconds: 1,
        position: 0,
        confirmed: [],
        revoked: [],
        completed: true,
      };
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          events: [e],
          pending: [e.id],
          settings: { apiUrl: "" },
        }),
      );
    });
    await a.goto("/");
    const id = await a.evaluate(
      () => JSON.parse(localStorage.getItem("gbs-v1")!).pending[0],
    );
    const b = await context.newPage();
    await b.goto("/");
    // A server acknowledgement is a stored empty queue, not an instruction to union stale queues.
    await a.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("gbs-v1")!);
      s.pending = [];
      s.lastSync = new Date().toISOString();
      localStorage.setItem("gbs-v1", JSON.stringify(s));
    });
    await expect(
      b.getByRole("button", { name: "已同步", exact: true }),
    ).toBeVisible();
    await b.locator(".practice-card.song").getByRole("button").click();
    await b.getByRole("button", { name: "今天练到这里" }).click();
    expect(
      await b.evaluate(
        () => JSON.parse(localStorage.getItem("gbs-v1")!).pending,
      ),
    ).not.toContain(id);
  } finally {
    await context.close();
  }
});
test("cloud audio is cached after the first download", async ({ page }) => {
  const id = `cloud-audio-${crypto.randomUUID()}`;
  const m = { ...longMaterial(id), modules: ["gen"], audioFile: "clip.mp3" };
  await page.addInitScript(
    (material) =>
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [material],
          selected: { gen: `${material.id}@1` },
          settings: { apiUrl: "/api" },
        }),
      ),
    m,
  );
  let downloads = 0;
  await page.route(`**/api/audio/${id}/1`, (route) => {
    downloads++;
    return route.fulfill({
      path: "media/xiaolai-expression-5min.mp3",
      contentType: "audio/mpeg",
    });
  });
  await page.goto("/");
  await page.locator(".practice-card.gen").getByRole("button").click();
  await expect(
    page.getByRole("button", { name: "播放音频", exact: true }),
  ).toBeEnabled();
  expect(downloads).toBe(1);
  await page.getByRole("button", { name: "保存并返回" }).click();
  await page.locator(".practice-card.gen").getByRole("button").click();
  await expect(
    page.getByRole("button", { name: "播放音频", exact: true }),
  ).toBeEnabled();
  expect(downloads).toBe(1);
});
test("review is a soft duration and the final passage stays above the dock", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const m = longMaterial(`dock-${crypto.randomUUID()}`);
  await page.addInitScript((material) => {
    const now = new Date().toISOString();
    const e = {
      id: crypto.randomUUID(),
      kind: "practice",
      module: "bei",
      materialId: material.id,
      version: 1,
      startedAt: now,
      endedAt: now,
      day: "2026-10-06",
      seconds: 1,
      position: 12,
      confirmed: [],
      revoked: [],
      confirmedRanges: [{ segmentId: "p1", start: 0, end: 9 }],
      completed: true,
    };
    localStorage.setItem(
      "gbs-v1",
      JSON.stringify({
        materials: [material],
        events: [e],
        selected: { bei: `${material.id}@1` },
        settings: { apiUrl: "", reviewSeconds: 1 },
      }),
    );
  }, m);
  await page.goto("/");
  await page.locator(".practice-card.bei").getByRole("button").click();
  await page.getByRole("button", { name: "提示", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停计时", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "继续往下练", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "提示", exact: true }),
  ).toHaveClass("active");
  await expect(
    page.locator('.passage[data-segment="p1"] .practice-part').first(),
  ).toHaveClass(/current-part/);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const lastButton = page.locator(".passage").last().getByRole("button");
  expect(
    await lastButton.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const dock = document
        .querySelector(".practice-footer")!
        .getBoundingClientRect();
      return r.y >= 0 && r.bottom < dock.top;
    }),
  ).toBe(true);
  const dock = await page.locator(".practice-footer").boundingBox();
  expect(dock!.height).toBeLessThan(270);
});
