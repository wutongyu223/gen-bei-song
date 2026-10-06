import { z } from "zod";
import { eventSchema, materialSchema, type Material } from "../src/schema";
import { mergeEvents, progressFor, type PracticeEvent } from "../src/domain";
import { seeds, localAudio } from "../src/seeds";
import { parseRange } from "./range";
interface Env {
  DB: D1Database;
  AUDIO?: R2Bucket;
  PRIVATE_AUDIO?: Fetcher;
  WRITE_TOKEN: string;
  READ_TOKEN: string;
  ALLOWED_ORIGINS: string;
}
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function matches(a: string, b: string | undefined) {
  if (!b || !a) return false;
  const [x, y] = await Promise.all(
    [a, b].map((t) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)),
    ),
  );
  let diff = 0;
  const left = new Uint8Array(x),
    right = new Uint8Array(y);
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 2_000_000)
    throw new ApiError(413, "材料或记录过大。");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 2_000_000)
    throw new ApiError(413, "材料或记录过大。");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "JSON 格式错误。");
  }
}
async function listMaterials(env: Env): Promise<Material[]> {
  const rows = await env.DB.prepare(
    "SELECT payload FROM materials ORDER BY material_id, version",
  ).all<{ payload: string }>();
  return rows.results.map((r) => materialSchema.parse(JSON.parse(r.payload)));
}
async function fetchAllEvents(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT payload FROM events ORDER BY seq",
  ).all<{ payload: string }>();
  return rows.results.map((r) => eventSchema.parse(JSON.parse(r.payload)));
}
async function handle(request: Request, env: Env) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/api/health" && method === "GET")
    return json({
      ok: true,
      service: "跟背诵",
      audioSync: Boolean(env.AUDIO),
      preparedAudio: Boolean(env.PRIVATE_AUDIO),
    });
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  const write = await matches(token, env.WRITE_TOKEN),
    read = write || (await matches(token, env.READ_TOKEN));
  if (!env.WRITE_TOKEN || !env.READ_TOKEN || env.WRITE_TOKEN === env.READ_TOKEN)
    throw new ApiError(503, "同步服务需要配置两枚不同的密钥。");
  if (!read) throw new ApiError(401, "需要有效的连接密钥。");
  if (!["GET", "HEAD"].includes(method) && !write)
    throw new ApiError(403, "Agent 密钥只有读取权限。");
  if (path === "/api/events" && method === "GET") {
    const after = Number(url.searchParams.get("after") || 0);
    if (!Number.isSafeInteger(after) || after < 0)
      throw new ApiError(400, "分页位置错误。");
    const rows = await env.DB.prepare(
      "SELECT seq,payload FROM events WHERE seq > ? ORDER BY seq LIMIT 501",
    )
      .bind(after)
      .all<{ seq: number; payload: string }>();
    const page = rows.results.slice(0, 500);
    return json({
      events: page.map((r) => JSON.parse(r.payload)),
      cursor: page.at(-1)?.seq ?? after,
      hasMore: rows.results.length > 500,
      serverTime: new Date().toISOString(),
    });
  }
  if (path === "/api/events" && method === "POST") {
    const { events } = z
      .object({ events: z.array(eventSchema).max(100) })
      .parse(await body(request));
    const materials = [...seeds, localAudio, ...(await listMaterials(env))];
    // Validate the entire batch before any writes; same event ID with different data is a conflict.
    for (const e of events) {
      const m = materials.find(
        (m) =>
          m.id === e.materialId &&
          m.version === e.version &&
          m.modules.includes(e.module),
      );
      if (!m) throw new ApiError(400, "记录对应的材料版本尚未上传。");
      const ids = new Set(m.segments.map((s) => s.id));
      if ([...e.confirmed, ...e.revoked].some((id) => !ids.has(id)))
        throw new ApiError(400, "背准范围包含不存在的段落。");
      for (const r of [
        ...(e.confirmedRanges ?? []),
        ...(e.revokedRanges ?? []),
      ]) {
        const s = m.segments.find((s) => s.id === r.segmentId);
        if (!s || r.end > [...s.text].length)
          throw new ApiError(400, "背准文字范围超出原文。");
      }
      if (
        e.module !== "gen" &&
        (e.position !== Math.floor(e.position) ||
          e.position >= m.segments.length ||
          (e.positionOffset ?? 0) > [...m.segments[e.position].text].length)
      )
        throw new ApiError(400, "续练位置超出原文。");
      const old = await env.DB.prepare(
        "SELECT payload FROM events WHERE event_id=?",
      )
        .bind(e.id)
        .first<{ payload: string }>();
      if (old && old.payload !== JSON.stringify(e))
        throw new ApiError(409, "练习记录 ID 冲突，请保留本地备份。");
    }
    if (events.length)
      await env.DB.batch(
        events.map((e) =>
          env.DB.prepare(
            "INSERT OR IGNORE INTO events (event_id,payload) VALUES (?,?)",
          ).bind(e.id, JSON.stringify(e)),
        ),
      );
    // Check concurrent retries as well; do not acknowledge an ID containing another payload.
    for (const e of events) {
      const stored = await env.DB.prepare(
        "SELECT payload FROM events WHERE event_id=?",
      )
        .bind(e.id)
        .first<{ payload: string }>();
      if (stored?.payload !== JSON.stringify(e))
        throw new ApiError(409, "练习记录 ID 冲突。");
    }
    return json({
      accepted: events.map((e) => e.id),
      serverTime: new Date().toISOString(),
    });
  }
  if (path === "/api/materials" && method === "GET")
    return json({ materials: await listMaterials(env) });
  if (path === "/api/materials" && method === "POST") {
    const m = materialSchema.parse(await body(request));
    const payload = JSON.stringify(m);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO materials (material_id,version,payload) VALUES (?,?,?)",
    )
      .bind(m.id, m.version, payload)
      .run();
    const row = await env.DB.prepare(
      "SELECT payload FROM materials WHERE material_id=? AND version=?",
    )
      .bind(m.id, m.version)
      .first<{ payload: string }>();
    if (row?.payload !== payload)
      throw new ApiError(409, "该版本已有不同内容，请增加材料版本号。");
    return json({ ok: true });
  }
  if (path === "/api/progress" && method === "GET") {
    const events = mergeEvents(await fetchAllEvents(env));
    const materials = [...seeds, localAudio, ...(await listMaterials(env))];
    const keys = new Map<
      string,
      { module: PracticeEvent["module"]; id: string; version: number }
    >();
    for (const e of events)
      keys.set(`${e.module}:${e.materialId}:${e.version}`, {
        module: e.module,
        id: e.materialId,
        version: e.version,
      });
    return json({
      generatedAt: new Date().toISOString(),
      lastPracticeAt:
        events.filter((e) => e.kind === "practice").at(-1)?.endedAt ?? null,
      eventCount: events.length,
      progress: [...keys.values()].map((k) => ({
        module: k.module,
        materialId: k.id,
        version: k.version,
        title:
          materials.find((m) => m.id === k.id && m.version === k.version)
            ?.title ?? k.id,
        ...progressFor(
          events,
          k.module,
          k.id,
          k.version,
          materials.find((m) => m.id === k.id && m.version === k.version),
        ),
      })),
      daily: events
        .filter((e) => e.kind === "practice")
        .reduce<Record<string, number>>((acc, e) => {
          acc[e.day] = (acc[e.day] ?? 0) + e.seconds;
          return acc;
        }, {}),
    });
  }
  const audio = /^\/api\/audio\/([a-zA-Z0-9_-]{1,100})\/(\d+)$/.exec(path);
  if (audio) {
    const [, id, v] = audio;
    // Only this authenticated API route can reach the prepared assets binding.
    // Never forward the original request or expose the raw /audio/ asset paths.
    if (env.PRIVATE_AUDIO && ["GET", "HEAD", "PUT"].includes(method)) {
      const range = request.headers.get("Range");
      const prepared = await env.PRIVATE_AUDIO.fetch(
        new Request(`https://private-audio.invalid/audio/${id}/${v}.mp3`, {
          method: method === "PUT" ? "HEAD" : "GET",
        }),
      );
      if (prepared.status !== 404) {
        if (method === "PUT")
          throw new ApiError(409, "此版本是已准备的音频，更换请增加版本号。");
        const responseHeaders = new Headers(prepared.headers);
        responseHeaders.set("Cache-Control", "private, no-store");
        responseHeaders.set("Content-Type", "audio/mpeg");
        if (prepared.status === 200) {
          responseHeaders.set("Accept-Ranges", "bytes");
          // Static assets ignore Range, so implement it for these bounded clips.
          if (range) {
            // The binding also omits Content-Length; use the actual bytes.
            const bytes = await prepared.arrayBuffer();
            const size = bytes.byteLength;
            const selected = parseRange(range, size);
            if (!selected) {
              return new Response(null, {
                status: 416,
                headers: {
                  "Content-Range": `bytes */${size}`,
                  "Cache-Control": "private, no-store",
                },
              });
            }
            responseHeaders.set("Content-Length", String(selected.length));
            responseHeaders.set(
              "Content-Range",
              `bytes ${selected.offset}-${selected.offset + selected.length - 1}/${size}`,
            );
            return new Response(
              method === "HEAD"
                ? null
                : bytes.slice(
                    selected.offset,
                    selected.offset + selected.length,
                  ),
              { status: 206, headers: responseHeaders },
            );
          }
        }
        if (method === "HEAD") await prepared.body?.cancel();
        return new Response(method === "HEAD" ? null : prepared.body, {
          status: prepared.status,
          headers: responseHeaders,
        });
      }
    }
    if (!env.AUDIO)
      throw new ApiError(
        503,
        "当前已开通进度和文字同步。音频请先在设备上导入，云端音频存储尚未开通。",
      );
    const key = `${id}/${v}`;
    if (method === "PUT") {
      const m = await env.DB.prepare(
        "SELECT payload FROM materials WHERE material_id=? AND version=?",
      )
        .bind(id, Number(v))
        .first();
      if (!m) throw new ApiError(400, "请先上传材料包。");
      const mime = request.headers.get("Content-Type") || "";
      if (!mime.startsWith("audio/") && !mime.startsWith("video/"))
        throw new ApiError(415, "请选择音频文件。");
      const declared = Number(request.headers.get("Content-Length"));
      if (declared > 50 * 1024 * 1024)
        throw new ApiError(413, "音频请先裁成练习片段（上限 50 MB）。");
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 50 * 1024 * 1024)
        throw new ApiError(413, "音频上限 50 MB。");
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const existing = await env.AUDIO.head(key);
      if (existing) {
        if (existing.customMetadata?.sha256 === hash) return json({ ok: true });
        throw new ApiError(
          409,
          "此版本音频已有不同内容，更换音频请增加版本号。",
        );
      }
      const saved = await env.AUDIO.put(key, bytes, {
        httpMetadata: { contentType: mime },
        customMetadata: { sha256: hash },
        onlyIf: { etagDoesNotMatch: "*" },
      });
      if (!saved) {
        const concurrent = await env.AUDIO.head(key);
        if (concurrent?.customMetadata?.sha256 !== hash)
          throw new ApiError(409, "此版本音频已有不同内容。");
      }
      return json({ ok: true });
    }
    if (method === "GET" || method === "HEAD") {
      const meta = await env.AUDIO.head(key);
      if (!meta) throw new ApiError(404, "这份材料的音频还没有上传。");
      const rangeHeader = request.headers.get("Range");
      const range = rangeHeader
        ? parseRange(rangeHeader, meta.size)
        : undefined;
      if (rangeHeader && !range)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${meta.size}` },
        });
      const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Content-Type": meta.httpMetadata?.contentType || "audio/mpeg",
        "Content-Length": String(range?.length ?? meta.size),
      });
      if (range)
        headers.set(
          "Content-Range",
          `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`,
        );
      const obj =
        method === "HEAD"
          ? null
          : await env.AUDIO.get(key, range ? { range } : undefined);
      return new Response(obj && "body" in obj ? obj.body : null, {
        status: range ? 206 : 200,
        headers,
      });
    }
  }
  throw new ApiError(404, "没有找到这个接口。");
}
export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    if (origin && !allowed.includes(origin))
      return json({ error: "此页面来源未获允许。" }, 403);
    let response: Response;
    if (request.method === "OPTIONS")
      response = new Response(null, { status: 204 });
    else
      try {
        response = await handle(request, env);
      } catch (e) {
        response =
          e instanceof ApiError
            ? json({ error: e.message }, e.status)
            : e instanceof z.ZodError
              ? json(
                  {
                    error: "材料或记录格式不符合要求。",
                    details: e.issues.map(
                      (i) => i.path.join(".") + ": " + i.message,
                    ),
                  },
                  400,
                )
              : json({ error: "服务暂时不可用，请稍后重试。" }, 500);
      }
    const headers = new Headers(response.headers);
    headers.set("Vary", "Origin, Authorization");
    headers.set("X-Content-Type-Options", "nosniff");
    if (origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set(
        "Access-Control-Allow-Methods",
        "GET, HEAD, POST, PUT, OPTIONS",
      );
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Range",
      );
      headers.set(
        "Access-Control-Expose-Headers",
        "Content-Range, Accept-Ranges, Content-Length",
      );
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
