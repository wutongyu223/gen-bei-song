import { afterEach, expect, it, vi } from "vitest";
import { draftKey, readPracticeDraft } from "../src/practiceDraft";
import type { PracticeEvent } from "../src/domain";
import { seeds } from "../src/seeds";
const m = seeds.find((m) => m.modules.includes("bei"))!;
const now = "2026-10-06T01:00:00.000Z";
const event: PracticeEvent = {
  id: "04df0215-680c-4827-a5af-cdff45e81001",
  kind: "practice",
  module: "bei",
  materialId: m.id,
  version: m.version,
  startedAt: now,
  endedAt: now,
  day: "2026-10-06",
  seconds: 3,
  position: 0,
  positionOffset: 0,
  confirmed: [m.segments[0].id],
  revoked: [],
  completed: false,
};
const prepare = (e: unknown) => {
  const key = draftKey("bei", m),
    memory = new Map([[key, JSON.stringify(e)]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    removeItem: (k: string) => memory.delete(k),
  });
  return { key, memory };
};
afterEach(() => vi.unstubAllGlobals());
it("does not resume or duplicate a draft already committed to the event log", () => {
  const { key, memory } = prepare(event);
  expect(readPracticeDraft(key, "bei", m, [event])).toBeNull();
  expect(memory.has(key)).toBe(false);
});
it("recovers a valid draft but rejects another version, unknown clauses and out-of-bounds positions", () => {
  const { key } = prepare(event);
  expect(readPracticeDraft(key, "bei", m, [])).toEqual(event);
  for (const e of [
    { ...event, version: 2 },
    { ...event, position: m.segments.length },
    { ...event, positionOffset: 12000 },
    { ...event, confirmed: ["missing"] },
    {
      ...event,
      confirmed: [],
      confirmedRanges: [{ segmentId: m.segments[0].id, start: 0, end: 12000 }],
    },
  ]) {
    prepare(e);
    expect(readPracticeDraft(key, "bei", m, [])).toBeNull();
  }
});
