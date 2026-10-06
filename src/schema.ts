import { z } from "zod";
export const moduleSchema = z.enum(["gen", "bei", "song"]);
const stableId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const segmentSchema = z
  .object({
    id: stableId,
    text: z.string().max(12000),
    translation: z.string().max(12000).optional(),
    note: z.string().max(6000).optional(),
    start: z.number().nonnegative().optional(),
    end: z.number().nonnegative().optional(),
    uncertain: z.boolean().default(false),
  })
  .refine(
    (s) => s.end === undefined || s.start === undefined || s.end > s.start,
    { message: "结束时间必须晚于开始时间" },
  );
export const materialSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: stableId,
    version: z.number().int().min(1),
    title: z.string().min(1).max(200),
    author: z.string().max(200),
    source: z.string().min(1).max(2000),
    modules: z.array(moduleSchema).min(1).max(3),
    visibility: z.enum(["private", "shareable"]).default("private"),
    segments: z.array(segmentSchema).min(1).max(2000),
    audioFile: z.string().max(200).optional(),
  })
  .refine(
    (m) => new Set(m.segments.map((s) => s.id)).size === m.segments.length,
    { message: "段落 ID 不可重复" },
  );
// Offsets use Unicode code points, so a supplementary character is never cut in half.
export const textRangeSchema = z
  .object({
    segmentId: stableId,
    start: z.number().int().min(0).max(12000),
    end: z.number().int().min(1).max(12000),
  })
  .refine((r) => r.end > r.start, { message: "背准范围不能为空" });
export type TextRange = z.infer<typeof textRangeSchema>;
export const eventSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["practice", "correction"]),
    module: moduleSchema,
    materialId: stableId,
    version: z.number().int().min(1),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    seconds: z.number().int().min(0).max(86400),
    position: z.number().nonnegative().max(1e7),
    positionOffset: z.number().int().min(0).max(12000).optional(),
    confirmed: z.array(stableId).max(2000),
    revoked: z.array(stableId).max(2000),
    confirmedRanges: z.array(textRangeSchema).max(2000).optional(),
    revokedRanges: z.array(textRangeSchema).max(2000).optional(),
    completed: z.boolean(),
  })
  .refine((e) => Date.parse(e.endedAt) >= Date.parse(e.startedAt), {
    message: "练习结束时间错误",
  })
  .refine((e) => !e.confirmed.some((id) => e.revoked.includes(id)), {
    message: "同一段不能同时确认和撤销",
  })
  .refine(
    (e) =>
      !(e.confirmedRanges ?? []).some(
        (a) =>
          e.revoked.includes(a.segmentId) ||
          (e.revokedRanges ?? []).some(
            (b) =>
              a.segmentId === b.segmentId && a.start < b.end && b.start < a.end,
          ),
      ) &&
      !(e.revokedRanges ?? []).some((r) => e.confirmed.includes(r.segmentId)),
    {
      message: "同一文字范围不能同时确认和撤销",
    },
  );
export type Material = z.infer<typeof materialSchema>;
