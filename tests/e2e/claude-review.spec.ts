import { test, expect } from "@playwright/test";

const material = (module: "bei" | "gen" = "bei") => ({
  schemaVersion: 1,
  id: `review-${crypto.randomUUID()}`,
  version: 1,
  title: "审查用材料",
  author: "测试",
  source: "自动验收",
  modules: [module],
  visibility: "private",
  ...(module === "gen" ? { audioFile: "original.mp3" } : {}),
  segments: [
    { id: "p1", text: "第一句需要独立回忆。", uncertain: false },
    { id: "p2", text: "第二句还没有回忆。", uncertain: false },
    { id: "p3", text: "第三句不要提前露出。", uncertain: false },
  ],
});
const wave = () => {
  const bytes = Buffer.alloc(44 + 16000 * 2 * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
};

test("checking reveals only the current clause and closes when confirming or choosing another", async ({
  page,
}) => {
  const m = material();
  await page.addInitScript(
    (m) =>
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [m],
          selected: { bei: `${m.id}@1` },
          settings: { apiUrl: "" },
        }),
      ),
    m,
  );
  await page.goto("/");
  await page.locator(".practice-card.bei").getByRole("button").click();
  await page.getByRole("button", { name: "隐藏", exact: true }).click();
  await page.getByRole("button", { name: "看原文核对", exact: true }).click();
  await expect(
    page.getByText(m.segments[0].text, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(m.segments[1].text, { exact: true })).toHaveCount(
    0,
  );
  await page.locator(".practice-part").first().getByRole("button").click();
  await expect(page.getByText(m.segments[0].text, { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "看原文核对", exact: true }).click();
  await page.locator(".practice-part").nth(1).click();
  await expect(page.getByText(m.segments[0].text, { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText(m.segments[1].text, { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "看原文核对", exact: true }).click();
  await expect(
    page.getByText(m.segments[1].text, { exact: true }),
  ).toBeVisible();
});

test("a process lost without pagehide restores a durable draft without adding fragmented records", async ({
  page,
  context,
}) => {
  const m = material();
  await page.addInitScript((m) => {
    localStorage.setItem(
      "gbs-v1",
      JSON.stringify({
        materials: [m],
        selected: { bei: `${m.id}@1` },
        settings: { apiUrl: "", reviewSeconds: 0 },
      }),
    );
    window.addEventListener(
      "pagehide",
      (e) => e.stopImmediatePropagation(),
      true,
    );
  }, m);
  await page.goto("/");
  await page.locator(".practice-card.bei").getByRole("button").click();
  await page.locator(".practice-part").first().getByRole("button").click();
  await page.locator(".practice-part").nth(2).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "暂停计时", exact: true }).click();
  const key = `gbs-practice:bei:${m.id}@1`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).seconds,
        key,
      ),
    )
    .toBeGreaterThanOrEqual(1);
  const draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(draft.confirmed).toEqual(["p1"]);
  expect(draft.position).toBe(2);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gbs-v1")!).events ?? [],
    ),
  ).toEqual([]);
  await page.close();
  const resumed = await context.newPage();
  await resumed.goto("/");
  await resumed.locator(".practice-card.bei").getByRole("button").click();
  await expect(resumed.locator(".practice-part").nth(2)).toHaveClass(
    /current-part/,
  );
  await expect(
    resumed.getByRole("button", { name: /已背准 · 可撤销/ }),
  ).toHaveCount(1);
  await expect(
    resumed.getByRole("button", { name: "继续计时", exact: true }),
  ).toBeVisible();
  await resumed.locator(".practice-part").first().getByRole("button").click();
  await resumed.getByRole("button", { name: "今天练到这里" }).click();
  const saved = await resumed.evaluate(
    () => JSON.parse(localStorage.getItem("gbs-v1")!).events,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].id).toBe(draft.id);
  expect(saved[0].confirmed).toEqual([]);
  expect(
    await resumed.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
});

test("a second device can attach renamed audio without changing the material version or progress", async ({
  page,
}) => {
  const m = material("gen");
  const now = new Date().toISOString();
  const event = {
    id: crypto.randomUUID(),
    kind: "practice",
    module: "gen",
    materialId: m.id,
    version: 1,
    startedAt: now,
    endedAt: now,
    day: "2026-10-06",
    seconds: 2,
    position: 1,
    confirmed: [],
    revoked: [],
    completed: false,
  };
  await page.addInitScript(
    (data) =>
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [data.m],
          events: [data.event],
          selected: { gen: `${data.m.id}@1` },
          settings: { apiUrl: "" },
        }),
      ),
    { m, event },
  );
  await page.goto("/");
  await page.locator(".practice-card.gen").getByRole("button").click();
  await expect(page.getByRole("alert")).toContainText("附上本机音频");
  await page.getByRole("button", { name: "保存并返回" }).click();
  await page.getByRole("button", { name: /材料$/ }).click();
  const card = page
    .locator(".library-card")
    .filter({ has: page.getByRole("heading", { name: m.title }) });
  await expect(card).toContainText("本机未附音频");
  // The selected card is remembered by its explicit button, as in a native file picker.
  await card
    .getByRole("button", { name: "附上本机音频", exact: true })
    .click({ noWaitAfter: true });
  await page
    .getByLabel("附上本机音频文件")
    .setInputFiles({
      name: "renamed 2.wav",
      mimeType: "audio/wav",
      buffer: wave(),
    });
  await expect(card).toContainText("本机已附音频");
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gbs-v1")!),
  );
  expect(state.materials[0]).toEqual(m);
  expect(state.events).toEqual([event]);
  await card.getByRole("button", { name: "跟 · 练习", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放音频", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBe(1);
});

test("a playback rejection keeps the audio player mounted and has a working retry", async ({
  page,
}) => {
  const m = material("gen");
  await page.addInitScript(
    (m) =>
      localStorage.setItem(
        "gbs-v1",
        JSON.stringify({
          materials: [m],
          selected: { gen: `${m.id}@1` },
          settings: { apiUrl: "" },
        }),
      ),
    m,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /材料$/ }).click();
  const card = page
    .locator(".library-card")
    .filter({ has: page.getByRole("heading", { name: m.title }) });
  await card
    .getByRole("button", { name: "附上本机音频", exact: true })
    .click({ noWaitAfter: true });
  await page
    .getByLabel("附上本机音频文件")
    .setInputFiles({ name: "clip.wav", mimeType: "audio/wav", buffer: wave() });
  await card.getByRole("button", { name: "跟 · 练习", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放音频", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      HTMLMediaElement.prototype.play = play;
      return Promise.reject(new DOMException("test", "NotAllowedError"));
    };
  });
  await page.getByRole("button", { name: "播放音频", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("播放暂时失败");
  await expect(page.locator("audio")).toHaveCount(1);
  await page.getByRole("button", { name: "重试播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停播放", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unconnected imports cannot select cloud upload and connection settings accept a whole personal link", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "gbs-v1",
      JSON.stringify({
        settings: { apiUrl: "https://test.invalid/api", token: "" },
      }),
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /材料$/ }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "m.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(material())),
    });
  await expect(page.getByRole("checkbox", { name: /同时上传/ })).toBeDisabled();
  await page.getByRole("button", { name: "关闭导入" }).click();
  await page.getByRole("button", { name: "连接同步", exact: true }).click();
  const token = "a".repeat(64);
  await page
    .getByLabel("我的连接密钥或私人连接链接")
    .fill(`https://example.invalid/app/#connect=${token}`);
  await expect(page.getByLabel("我的连接密钥或私人连接链接")).toHaveValue(
    token,
  );
});

test("automatic connection failures stay quiet and manual failures explain that local records are safe", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "gbs-v1",
      JSON.stringify({
        settings: { apiUrl: "https://test.invalid/api", token: "a".repeat(64) },
      }),
    ),
  );
  await page.route("https://test.invalid/**", (route) => route.abort("failed"));
  await page.goto("/");
  await expect(page.locator(".global-notice")).toHaveCount(0);
  await page.getByRole("button", { name: "此设备保存", exact: true }).click();
  await expect(page.locator(".global-notice")).toContainText(
    "记录已留在此设备",
  );
  await page.getByRole("button", { name: "关闭提示" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(300);
  await expect(page.locator(".global-notice")).toHaveCount(0);
});
