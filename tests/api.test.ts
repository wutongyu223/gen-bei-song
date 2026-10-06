import { afterEach, expect, it, vi } from "vitest";
import { synchronize, SYNC_TIMEOUT_MS } from "../src/api";
import { defaults, type State } from "../src/storage";
import type { PracticeEvent } from "../src/domain";
const event = (materialId: string): PracticeEvent => ({
  id: crypto.randomUUID(),
  kind: "practice",
  module: "bei",
  materialId,
  version: 1,
  startedAt: "2026-10-06T01:00:00.000Z",
  endedAt: "2026-10-06T01:00:00.000Z",
  day: "2026-10-06",
  seconds: 1,
  position: 0,
  confirmed: [],
  revoked: [],
  completed: true,
});
const emptyState = (): State => ({
  events: [],
  pending: [],
  materials: [],
  selected: {},
  settings: { ...defaults, apiUrl: "https://test.invalid/api" },
  lastSync: null,
  waitingMaterials: [],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("keeps local-only materials private without blocking other pending practice", async () => {
  const local = event("private-letter"),
    builtin = event("sunzi-jipian");
  const sent: PracticeEvent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/materials")) return Response.json({ materials: [] });
      if (init.method === "POST") {
        const { events } = JSON.parse(String(init.body));
        sent.push(...events);
        return Response.json({
          accepted: events.map((e: PracticeEvent) => e.id),
        });
      }
      return Response.json({ events: [builtin], cursor: 1, hasMore: false });
    }),
  );
  const state: State = {
    events: [local, builtin],
    pending: [local.id, builtin.id],
    materials: [],
    selected: {},
    settings: { ...defaults, apiUrl: "https://test.invalid/api" },
    lastSync: null,
    waitingMaterials: [],
  };
  const result = await synchronize(state);
  expect(sent.map((e) => e.id)).toEqual([builtin.id]);
  expect(result.pending).toEqual([local.id]);
  expect(result.waitingMaterials).toEqual(["private-letter@1"]);
  expect(result.events).toHaveLength(2);
  expect(result.lastSync).toBeTruthy();
});
it("times out a stalled request without losing pending records, and can retry", async () => {
  vi.useFakeTimers();
  const local = event("sunzi-jipian");
  const state = { ...emptyState(), events: [local], pending: [local.id] };
  let stalledSignal: AbortSignal | undefined;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/materials")) return Response.json({ materials: [] });
    if (init.method === "POST") return Response.json({ accepted: [local.id] });
    return Response.json({ events: [local], cursor: 1, hasMore: false });
  });
  fetch.mockImplementationOnce((_, init) => {
    stalledSignal = init.signal as AbortSignal;
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", fetch);
  const first = synchronize(state);
  const rejection = expect(first).rejects.toThrow("同步等待太久");
  await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS);
  await rejection;
  expect(stalledSignal?.aborted).toBe(true);
  expect(state.pending).toEqual([local.id]);
  expect(state.events).toEqual([local]);
  const retried = await synchronize(state);
  expect(retried.pending).toEqual([]);
  expect(retried.events).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("bounds a stalled response body, not just waiting for headers", async () => {
  vi.useFakeTimers();
  const response = Response.json({ materials: [] });
  vi.spyOn(response, "json").mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  const first = synchronize(emptyState());
  const rejection = expect(first).rejects.toThrow("记录已留在此设备");
  await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS);
  await rejection;
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels a suspended sync immediately, even if fetch ignores its signal", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const first = synchronize(emptyState(), controller.signal);
  const rejection = expect(first).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejection;
  expect(vi.getTimerCount()).toBe(0);
});
it("rejects a repeated pagination cursor instead of polling forever", async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith("/materials")
        ? { materials: [] }
        : { events: [], cursor: 0, hasMore: true },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(synchronize(emptyState())).rejects.toThrow("同步分页没有前进");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("publishes metadata with a clear audio-pending result when R2 is unavailable", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return Response.json(
        url.endsWith("/health") ? { audioSync: false } : { ok: true },
      );
    }),
  );
  const { publishMaterial } = await import("../src/api");
  const material = {
    schemaVersion: 1 as const,
    id: "clip",
    version: 1,
    title: "音频",
    author: "测试",
    source: "用户提供",
    modules: ["gen" as const],
    visibility: "private" as const,
    segments: [{ id: "p1", text: "", uncertain: false }],
  };
  expect(
    await publishMaterial(
      { ...defaults, apiUrl: "https://test.invalid/api" },
      material,
      new Blob(["audio"], { type: "audio/mpeg" }),
    ),
  ).toEqual({ audioPending: true });
  expect(calls.map((x) => new URL(x).pathname)).toEqual([
    "/api/materials",
    "/api/health",
  ]);
});
