import { eventSchema, type Material } from "./schema";
import type { Module, PracticeEvent } from "./domain";

export const draftKey = (module: Module, material: Material) =>
  `gbs-practice:${module}:${material.id}@${material.version}`;

export function readPracticeDraft(
  key: string,
  module: Module,
  material: Material,
  saved: PracticeEvent[],
): PracticeEvent | null {
  try {
    const parsed = eventSchema.safeParse(
      JSON.parse(localStorage.getItem(key) || "null"),
    );
    if (!parsed.success) return null;
    const e = parsed.data;
    if (saved.some((s) => s.id === e.id)) {
      localStorage.removeItem(key);
      return null;
    }
    if (
      e.module !== module ||
      e.materialId !== material.id ||
      e.version !== material.version
    )
      return null;
    if (
      module !== "gen" &&
      (e.position >= material.segments.length || !Number.isInteger(e.position))
    )
      return null;
    if (
      module !== "gen" &&
      (e.positionOffset ?? 0) > [...material.segments[e.position].text].length
    )
      return null;
    if (
      [...e.confirmed, ...e.revoked].some(
        (id) => !material.segments.some((s) => s.id === id),
      )
    )
      return null;
    const ranges = [...(e.confirmedRanges ?? []), ...(e.revokedRanges ?? [])];
    if (
      ranges.some((r) => {
        const segment = material.segments.find((s) => s.id === r.segmentId);
        return !segment || r.end > [...segment.text].length;
      })
    )
      return null;
    return e;
  } catch {
    return null;
  }
}
