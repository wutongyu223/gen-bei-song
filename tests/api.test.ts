import { afterEach, expect, it, vi } from "vitest";
import { synchronize } from "../src/api";
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
afterEach(() => vi.unstubAllGlobals());
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
