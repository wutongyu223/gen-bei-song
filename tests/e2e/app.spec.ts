import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const secrets = readFileSync(".dev.vars", "utf8");
const write = secrets.match(/WRITE_TOKEN="(.*)"/)![1],
  read = secrets.match(/READ_TOKEN="(.*)"/)![1];
const apiUrl = "http://127.0.0.1:8790/api";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("gbs-v1"))
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({ settings: { apiUrl: "" } }),
      );
  });
});
test("readable home, partial mastery, hidden text, persisted resume and translation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /每天一点，\s*慢慢成章。/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /开始背诵/ }).click();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page
    .getByRole("button", { name: /确认这一段背准/ })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: /确认这一段背准/ })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "隐藏", exact: true }).click();
  await expect(
    page.getByText("孙子曰：兵者，国之大事，死生之地，存亡之道，不可不察也。", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "看原文核对", exact: true }).click();
  await expect(
    page.getByText("孙子曰：兵者，国之大事，死生之地，存亡之道，不可不察也。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "今天练到这里" }).click();
  await expect(page.getByText("已背准 2 段", { exact: false })).toBeVisible();
  await page.reload();
  await page
    .locator(".practice-card.bei")
    .getByRole("button", { name: "继续练习" })
    .click();
  await expect(
    page.getByRole("button", { name: "已背准 · 可撤销" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "保存并返回" }).click();
  await page.getByRole("button", { name: /开始诵读/ }).click();
  await page.getByRole("button", { name: "译文与注释" }).click();
  await expect(
    page.getByText("学业或本领是否精通，由我自己决定。"),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
test("continuous audio, speed and loop controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /开始跟读/ }).click();
  await expect(page.getByRole("button", { name: "播放音频" })).toBeEnabled();
  await page.getByRole("button", { name: "播放音频" }).click();
  await expect(page.getByRole("button", { name: "暂停播放" })).toBeVisible();
  await page.getByLabel("播放速度").selectOption("0.8");
  expect(
    await page
      .locator("audio")
      .evaluate((a: HTMLAudioElement) => a.playbackRate),
  ).toBe(0.8);
  await page.getByText("练一个困难片段", { exact: false }).click();
  await page.getByRole("button", { name: "设起点" }).click();
  await page.locator("audio").evaluate((a: HTMLAudioElement) => {
    a.currentTime = 1.2;
  });
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "设终点" }).click();
  await page.getByRole("button", { name: "开始循环", exact: true }).click();
  await expect(page.getByRole("button", { name: "关闭循环" })).toBeVisible();
  await page.waitForTimeout(1800);
  expect(
    await page
      .locator("audio")
      .evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeLessThan(1.5);
  await page.getByRole("button", { name: "暂停播放" }).click();
});
test("preview and import a material with original and translation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /材料$/ }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "test.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          id: "e2e-material",
          version: 1,
          title: "我的练习段落",
          author: "测试作者",
          source: "测试用户提供",
          modules: ["song"],
          visibility: "private",
          segments: [
            {
              id: "p1",
              text: "这是预览中的原文。",
              translation: "这是译文。",
              uncertain: false,
            },
          ],
        }),
      ),
    });
  await expect(
    page.getByRole("heading", { name: "先看一眼材料" }),
  ).toBeVisible();
  await expect(page.getByText("这是预览中的原文。")).toBeVisible();
  await page.getByRole("button", { name: "确认导入此设备" }).click();
  await expect(
    page.getByRole("heading", { name: "我的练习段落" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /材料$/ }).click();
  await expect(
    page.getByRole("heading", { name: "我的练习段落" }),
  ).toBeVisible();
});
test("worker deduplicates retry, denies read-token writes and honors audio ranges", async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${write}` };
  const readonly = { Authorization: `Bearer ${read}` };
  const unauthorized = await request.get(`${apiUrl}/events`);
  expect(unauthorized.status()).toBe(401);
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  const e = {
    id,
    kind: "practice",
    module: "bei",
    materialId: "sunzi-jipian",
    version: 1,
    startedAt: now,
    endedAt: now,
    day: "2026-10-06",
    seconds: 2,
    position: 2,
    confirmed: ["s1", "s3"],
    revoked: [],
    completed: true,
  };
  const payload = { events: [e] };
  expect(
    (await request.post(`${apiUrl}/events`, { headers, data: payload })).ok(),
  ).toBeTruthy();
  expect(
    (await request.post(`${apiUrl}/events`, { headers, data: payload })).ok(),
  ).toBeTruthy();
  const data = await (
    await request.get(`${apiUrl}/events`, { headers })
  ).json();
  expect(data.events.filter((x: { id: string }) => x.id === id)).toHaveLength(
    1,
  );
  expect(
    (
      await request.post(`${apiUrl}/events`, {
        headers: readonly,
        data: payload,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${apiUrl}/events`, {
        headers,
        data: { events: [{ ...e, seconds: 9 }] },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await request.get(`${apiUrl}/progress`, { headers: readonly })).ok(),
  ).toBeTruthy();
  const materialId = `range-${crypto.randomUUID()}`;
  const material = {
    schemaVersion: 1,
    id: materialId,
    version: 1,
    title: "Range 测试",
    author: "测试",
    source: "自动测试",
    modules: ["gen"],
    visibility: "private",
    audioFile: "test.mp3",
    segments: [{ id: "s1", text: "测试", uncertain: false }],
  };
  expect(
    (
      await request.post(`${apiUrl}/materials`, { headers, data: material })
    ).ok(),
  ).toBeTruthy();
  const bytes = readFileSync(resolve("media/xiaolai-expression-5min.mp3"));
  expect(
    (
      await request.put(`${apiUrl}/audio/${materialId}/1`, {
        headers: { ...headers, "Content-Type": "audio/mpeg" },
        data: bytes,
      })
    ).ok(),
  ).toBeTruthy();
  const range = await request.get(`${apiUrl}/audio/${materialId}/1`, {
    headers: { ...readonly, Range: "bytes=0-9" },
  });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(10);
  expect(range.headers()["content-range"]).toBe(`bytes 0-9/${bytes.length}`);
  const denied = await request.get(`${apiUrl}/events`, {
    headers: { ...headers, Origin: "https://untrusted.invalid" },
  });
  expect(denied.status()).toBe(403);
});

test("two devices merge practice and recover a pending event after a failed connection", async ({
  browser,
  request,
}) => {
  const id = `devices-${crypto.randomUUID()}`;
  const m = {
    schemaVersion: 1,
    id,
    version: 1,
    title: "跨设备材料",
    author: "测试",
    source: "测试",
    modules: ["bei"],
    visibility: "private",
    segments: [
      { id: "p1", text: "第一小段。", uncertain: false },
      { id: "p2", text: "第二小段。", uncertain: false },
    ],
  };
  await request.post(`${apiUrl}/materials`, {
    headers: { Authorization: `Bearer ${write}` },
    data: m,
  });
  const first = await browser.newContext(),
    second = await browser.newContext();
  const prepare = async (context: typeof first) => {
    await context.addInitScript((material) => {
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [material],
          selected: { bei: `${material.id}@1` },
          settings: { apiUrl: "/api" },
        }),
      );
    }, m);
  };
  await prepare(first);
  await prepare(second);
  const a = await first.newPage();
  await a.goto("/");
  await a.route("**/api/events", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await a.locator(".practice-card.bei").getByRole("button").click();
  await a.getByRole("button", { name: "开始练习", exact: true }).click();
  await a
    .getByRole("button", { name: /确认这一段背准/ })
    .first()
    .click();
  await a.waitForTimeout(1100);
  await a.getByRole("button", { name: "今天练到这里" }).click();
  await expect(a.getByRole("button", { name: "1 条待同步" })).toBeVisible();
  await a.unroute("**/api/events");
  await a.getByRole("button", { name: "1 条待同步" }).click();
  await expect(
    a.getByRole("button", { name: "已同步", exact: true }),
  ).toBeVisible();
  const b = await second.newPage();
  await b.goto("/");
  await expect(b.getByText("已背准 1 段", { exact: false })).toBeVisible();
  await b.locator(".practice-card.bei").getByRole("button").click();
  await expect(b.getByRole("button", { name: /已背准 · 可撤销/ })).toHaveCount(
    1,
  );
  await first.close();
  await second.close();
});

test("saving a reading position works without timing, and refreshing preserves an active session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /开始诵读/ }).click();
  await page
    .getByRole("button", { name: "读到这里", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "今天练到这里" }).click();
  await page.locator(".practice-card.song").getByRole("button").click();
  await expect(page.getByText("3 / 3 段", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.locator(".practice-card.song").getByRole("button").click();
  await expect(page.getByText("3 / 3 段", { exact: true })).toBeVisible();
  const events = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gbs-v1")!).events,
  );
  expect(events.some((e: { seconds: number }) => e.seconds > 0)).toBeTruthy();
});

test("two tabs share saved progress without triggering repeated storage writes", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { sharedWrites: number }).sharedWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === "gbs-v1")
        (window as unknown as { sharedWrites: number }).sharedWrites++;
      return original.call(this, key, value);
    };
  });
  await page.locator(".practice-card.bei").getByRole("button").click();
  await page
    .getByRole("button", { name: /确认这一段背准/ })
    .first()
    .click();
  await page.getByRole("button", { name: "今天练到这里" }).click();
  await expect(other.getByText("已背准 1 段", { exact: false })).toBeVisible();
  await other.waitForTimeout(300);
  expect(
    await other.evaluate(
      () => (window as unknown as { sharedWrites: number }).sharedWrites,
    ),
  ).toBe(0);
});
