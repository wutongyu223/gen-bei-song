import type { z } from "zod";
import type { eventSchema, moduleSchema, Material, TextRange } from "./schema";
export type PracticeEvent = z.infer<typeof eventSchema>;
export type Module = z.infer<typeof moduleSchema>;
const order = (a: PracticeEvent, b: PracticeEvent) =>
  a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id);
export function addRanges(ranges: TextRange[], added: TextRange[]) {
  const sorted = [...ranges, ...added]
    .filter((r) => r.end > r.start)
    .sort(
      (a, b) => a.segmentId.localeCompare(b.segmentId) || a.start - b.start,
    );
  const result: TextRange[] = [];
  for (const r of sorted) {
    const last = result.at(-1);
    if (last?.segmentId === r.segmentId && last.end >= r.start)
      last.end = Math.max(last.end, r.end);
    else result.push({ segmentId: r.segmentId, start: r.start, end: r.end });
  }
  return result;
}
export function subtractRanges(ranges: TextRange[], removed: TextRange[]) {
  let result = addRanges(ranges, []);
  for (const cut of removed)
    result = result.flatMap((r) => {
      if (
        r.segmentId !== cut.segmentId ||
        cut.start >= r.end ||
        cut.end <= r.start
      )
        return [r];
      return [
        ...(cut.start > r.start ? [{ ...r, end: cut.start }] : []),
        ...(cut.end < r.end ? [{ ...r, start: cut.end }] : []),
      ];
    });
  return result;
}
export function isCovered(ranges: TextRange[], target: TextRange) {
  return ranges.some(
    (r) =>
      r.segmentId === target.segmentId &&
      r.start <= target.start &&
      r.end >= target.end,
  );
}
export function shortParts(segment: Material["segments"][number]) {
  const chars = [...segment.text];
  const parts: (TextRange & { text: string })[] = [];
  let start = 0;
  for (let i = 0; i < chars.length; i++) {
    if (
      /[，。！？；：、,!?;:\n]/u.test(chars[i]) ||
      i - start >= 39 ||
      i === chars.length - 1
    ) {
      parts.push({
        segmentId: segment.id,
        start,
        end: i + 1,
        text: chars.slice(start, i + 1).join(""),
      });
      start = i + 1;
    }
  }
  return parts;
}
export function mergeEvents(...sets: PracticeEvent[][]): PracticeEvent[] {
  const unique = new Map<string, PracticeEvent>();
  for (const e of sets.flat()) if (!unique.has(e.id)) unique.set(e.id, e);
  return [...unique.values()].sort(order);
}
export function progressFor(
  events: PracticeEvent[],
  module: Module,
  materialId: string,
  version: number,
  material?: Material,
) {
  const relevant = mergeEvents(events).filter(
    (e) =>
      e.module === module &&
      e.materialId === materialId &&
      e.version === version,
  );
  const mastered = new Set<string>();
  let masteredRanges: TextRange[] = [];
  for (const e of relevant) {
    e.confirmed.forEach((id) => {
      mastered.add(id);
      const s = material?.segments.find((s) => s.id === id);
      if (s)
        masteredRanges = addRanges(masteredRanges, [
          { segmentId: id, start: 0, end: [...s.text].length },
        ]);
    });
    e.revoked.forEach((id) => {
      mastered.delete(id);
      masteredRanges = masteredRanges.filter((r) => r.segmentId !== id);
    });
    masteredRanges = addRanges(masteredRanges, e.confirmedRanges ?? []);
    masteredRanges = subtractRanges(masteredRanges, e.revokedRanges ?? []);
    (e.revokedRanges ?? []).forEach((r) => mastered.delete(r.segmentId));
  }
  if (material)
    for (const s of material.segments) {
      if (
        s.text &&
        isCovered(masteredRanges, {
          segmentId: s.id,
          start: 0,
          end: [...s.text].length,
        })
      )
        mastered.add(s.id);
      else mastered.delete(s.id);
    }
  const practices = relevant.filter((e) => e.kind === "practice");
  return {
    position: relevant.at(-1)?.position ?? 0,
    positionOffset: relevant.at(-1)?.positionOffset ?? 0,
    mastered: [...mastered].sort(),
    masteredRanges,
    seconds: practices.reduce((n, e) => n + e.seconds, 0),
    last: practices.at(-1),
    latest: relevant.at(-1),
  };
}
export function reviewTarget(events: PracticeEvent[], material: Material) {
  const p = progressFor(events, "bei", material.id, material.version, material);
  for (const e of mergeEvents(events).reverse()) {
    if (
      e.module !== "bei" ||
      e.materialId !== material.id ||
      e.version !== material.version
    )
      continue;
    const candidates = [
      ...(e.confirmedRanges ?? []),
      ...e.confirmed.flatMap((id) => {
        const s = material.segments.find((s) => s.id === id);
        return s ? [{ segmentId: id, start: 0, end: [...s.text].length }] : [];
      }),
    ];
    for (const r of candidates.reverse()) {
      const segment = material.segments.find((s) => s.id === r.segmentId);
      if (!segment) continue;
      const units =
        [...segment.text].length > 80
          ? shortParts(segment)
          : [
              {
                ...r,
                start: 0,
                end: [...segment.text].length,
                text: segment.text,
              },
            ];
      const unit = units.find(
        (u) =>
          u.start >= r.start &&
          u.end <= r.end &&
          isCovered(p.masteredRanges, u),
      );
      if (unit) return unit;
    }
  }
  return null;
}
export function masteryLabel(
  progress: ReturnType<typeof progressFor>,
  material: Material,
) {
  const partialChars = progress.masteredRanges
    .filter((r) => !progress.mastered.includes(r.segmentId))
    .reduce(
      (n, r) =>
        n +
        [...(material.segments.find((s) => s.id === r.segmentId)?.text ?? "")]
          .slice(r.start, r.end)
          .filter((c) => !/[\p{P}\p{Z}\s]/u.test(c)).length,
      0,
    );
  return (
    [
      progress.mastered.length ? `${progress.mastered.length} 段` : "",
      partialChars ? `${partialChars} 字` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "0 段"
  );
}
export function hints(text: string) {
  return text
    .split(/([，。！？；：、])/u)
    .reduce<string[]>((parts, part) => {
      if (/^[，。！？；：、]$/u.test(part)) {
        if (parts.length)
          parts[parts.length - 1] +=
            part === "，" || part === "：" || part === "、" ? "" : part;
      } else if (part.trim()) parts.push(`${[...part.trim()][0]}…`);
      return parts;
    }, [])
    .join(" ");
}
export function dayKey(
  date = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((t) => parts.find((p) => p.type === t)?.value)
    .join("-");
}
export function clockLabel(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
