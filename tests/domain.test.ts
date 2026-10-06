import { describe, it, expect } from "vitest";
import {
  hints,
  mergeEvents,
  progressFor,
  dayKey,
  shortParts,
  reviewTarget,
  type PracticeEvent,
} from "../src/domain";
const event = (
  id: string,
  at: string,
  extra: Partial<PracticeEvent> = {},
): PracticeEvent => ({
  id,
  kind: "practice",
  module: "bei",
  materialId: "classic",
  version: 1,
  startedAt: at,
  endedAt: at,
  day: "2026-10-06",
  seconds: 60,
  position: 0,
  confirmed: [],
  revoked: [],
  completed: true,
  ...extra,
});
describe("practice ledger", () => {
  it("does not double count retries or copies from another device", () => {
    const a = event("a", "2026-10-06T01:00:00.000Z");
    expect(mergeEvents([a], [a]).length).toBe(1);
    expect(
      progressFor(mergeEvents([a], [a]), "bei", "classic", 1).seconds,
    ).toBe(60);
  });
  it("keeps separate confirmed paragraphs and respects later corrections", () => {
    const events = [
      event("a", "2026-10-06T01:00:00.000Z", { confirmed: ["p1", "p3"] }),
      event("b", "2026-10-06T02:00:00.000Z", {
        kind: "correction",
        seconds: 0,
        revoked: ["p1"],
        confirmed: ["p2"],
        completed: false,
      }),
    ];
    expect(progressFor(events, "bei", "classic", 1).mastered).toEqual([
      "p2",
      "p3",
    ]);
  });
  it("returns the last chosen position, not the maximum ever reached", () => {
    expect(
      progressFor(
        [
          event("a", "2026-10-06T01:00:00.000Z", { position: 8 }),
          event("b", "2026-10-06T02:00:00.000Z", { position: 2 }),
        ],
        "bei",
        "classic",
        1,
      ).position,
    ).toBe(2);
  });
  it("does not carry mastery into a new text version or a different module", () => {
    expect(
      progressFor(
        [event("a", "2026-10-06T01:00:00.000Z", { confirmed: ["p1"] })],
        "bei",
        "classic",
        2,
      ).mastered,
    ).toEqual([]);
    expect(
      progressFor(
        [event("a", "2026-10-06T01:00:00.000Z")],
        "song",
        "classic",
        1,
      ).seconds,
    ).toBe(0);
  });
  it("merges independent devices deterministically regardless of arrival order", () => {
    const a = event("a", "2026-10-06T01:00:00.000Z", { confirmed: ["p1"] });
    const b = event("b", "2026-10-06T01:00:00.000Z", {
      revoked: ["p1"],
      position: 1,
    });
    expect(progressFor([a, b], "bei", "classic", 1)).toEqual(
      progressFor([b, a], "bei", "classic", 1),
    );
    expect(progressFor([a, b], "bei", "classic", 1).mastered).toEqual([]);
  });
});
describe("reading aids", () => {
  it("shows sentence initials without losing paragraph order", () =>
    expect(hints("孙子曰：兵者，国之大事。死生之地，存亡之道！")).toBe(
      "孙… 兵… 国…。 死… 存…！",
    ));
  it("stores the users local day, including timezone boundaries", () =>
    expect(dayKey(new Date("2026-10-05T18:00:00Z"), "Asia/Shanghai")).toBe(
      "2026-10-06",
    ));
});

describe("partial text and review", () => {
  const material = {
    schemaVersion: 1 as const,
    id: "classic",
    version: 1,
    title: "测试",
    author: "测试",
    source: "测试",
    modules: ["bei" as const],
    visibility: "private" as const,
    segments: [{ id: "p1", text: "甲乙丙丁戊己庚辛壬癸", uncertain: false }],
  };
  it("unions overlapping ranges, then revokes only the requested characters", () => {
    const events = [
      event("a", "2026-10-06T01:00:00.000Z", {
        confirmedRanges: [{ segmentId: "p1", start: 0, end: 6 }],
      }),
      event("b", "2026-10-06T02:00:00.000Z", {
        confirmedRanges: [{ segmentId: "p1", start: 4, end: 10 }],
      }),
      event("c", "2026-10-06T03:00:00.000Z", {
        revokedRanges: [{ segmentId: "p1", start: 3, end: 7 }],
      }),
    ];
    expect(
      progressFor(events.slice(0, 2), "bei", "classic", 1, material).mastered,
    ).toEqual(["p1"]);
    expect(progressFor(events, "bei", "classic", 1, material).mastered).toEqual(
      [],
    );
    expect(
      progressFor(events, "bei", "classic", 1, material).masteredRanges,
    ).toEqual([
      { segmentId: "p1", start: 0, end: 3 },
      { segmentId: "p1", start: 7, end: 10 },
    ]);
    expect(
      progressFor([...events].reverse(), "bei", "classic", 1, material),
    ).toEqual(progressFor(events, "bei", "classic", 1, material));
  });
  it("can revoke part of an old whole-paragraph confirmation without losing the rest", () => {
    const events = [
      event("a", "2026-10-06T01:00:00.000Z", { confirmed: ["p1"] }),
      event("b", "2026-10-06T02:00:00.000Z", {
        revokedRanges: [{ segmentId: "p1", start: 2, end: 6 }],
        positionOffset: 6,
      }),
    ];
    const p = progressFor(events, "bei", "classic", 1, material);
    expect(p.masteredRanges).toEqual([
      { segmentId: "p1", start: 0, end: 2 },
      { segmentId: "p1", start: 6, end: 10 },
    ]);
    expect(p.positionOffset).toBe(6);
    expect(
      progressFor(
        [
          ...events,
          event("c", "2026-10-06T03:00:00.000Z", { revoked: ["p1"] }),
        ],
        "bei",
        "classic",
        1,
        material,
      ).masteredRanges,
    ).toEqual([]);
  });
});

it("short units preserve every source character and Unicode offsets", () => {
  const text = "𠮷曰：" + "学".repeat(83) + "，然后再读。";
  const parts = shortParts({ id: "p1", text, uncertain: false });
  expect(parts.map((p) => p.text).join("")).toBe(text);
  expect(parts.every((p) => [...p.text].length <= 40)).toBe(true);
  for (const p of parts)
    expect([...text].slice(p.start, p.end).join("")).toBe(p.text);
});
it("review targets a surviving confirmed unit, even after browsing an unmastered paragraph", () => {
  const m = {
    schemaVersion: 1 as const,
    id: "classic",
    version: 1,
    title: "测试",
    author: "测试",
    source: "测试",
    modules: ["bei" as const],
    visibility: "private" as const,
    segments: [
      { id: "p1", text: "我学一句，".repeat(20), uncertain: false },
      { id: "p2", text: "尚未背准。", uncertain: false },
    ],
  };
  const events = [
    event("a", "2026-10-06T01:00:00.000Z", {
      confirmedRanges: [{ segmentId: "p1", start: 0, end: 5 }],
    }),
    event("b", "2026-10-06T02:00:00.000Z", { position: 1 }),
  ];
  expect(reviewTarget(events, m)?.text).toBe("我学一句，");
  expect(
    reviewTarget(
      [
        ...events,
        event("c", "2026-10-06T03:00:00.000Z", {
          revokedRanges: [{ segmentId: "p1", start: 0, end: 5 }],
        }),
      ],
      m,
    ),
  ).toBeNull();
});
