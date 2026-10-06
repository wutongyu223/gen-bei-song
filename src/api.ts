import { z } from "zod";
import { eventSchema, materialSchema, type Material } from "./schema";
import { mergeEvents, type PracticeEvent } from "./domain";
import type { Settings, State } from "./storage";
import { mergeMaterials } from "./storage";
import { seeds, localAudio } from "./seeds";
export async function audioBlob(
  response: Response,
  onProgress: (text: string) => void,
) {
  if (!response.body) return response.blob();
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const total = Number(response.headers.get("Content-Length"));
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new Uint8Array(value));
    received += value.byteLength;
    onProgress(
      total
        ? `${Math.min(100, Math.round((received / total) * 100))}%`
        : `${(received / 1024 / 1024).toFixed(1)} MB`,
    );
  }
  return new Blob(chunks, {
    type: response.headers.get("Content-Type") || "audio/mpeg",
  });
}
export async function api(
  settings: Settings,
  path: string,
  init: RequestInit = {},
) {
  if (!settings.apiUrl)
    throw new Error("尚未连接同步服务，记录已保存在此设备。");
  const headers = new Headers(init.headers);
  if (settings.token) headers.set("Authorization", `Bearer ${settings.token}`);
  const response = await fetch(settings.apiUrl.replace(/\/$/, "") + path, {
    ...init,
    headers,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("连接密钥无效或权限不足，请检查同步设置。");
    let message = "同步暂时不可用，记录已留在此设备。";
    try {
      message =
        z.object({ error: z.string().optional() }).parse(await response.json())
          .error || message;
    } catch {}
    throw new Error(message);
  }
  return response;
}
export async function synchronize(state: State): Promise<State> {
  const materials = z
    .object({ materials: z.array(materialSchema) })
    .parse(await (await api(state.settings, "/materials")).json()).materials;
  const available = new Set(
    [...seeds, localAudio, ...materials].map((m) => `${m.id}@${m.version}`),
  );
  const queued = state.events.filter((e) => state.pending.includes(e.id));
  // Local-only materials remain private without blocking independently valid records.
  const pending = queued.filter((e) =>
    available.has(`${e.materialId}@${e.version}`),
  );
  const waitingMaterials = [
    ...new Set(
      queued
        .filter((e) => !available.has(`${e.materialId}@${e.version}`))
        .map((e) => `${e.materialId}@${e.version}`),
    ),
  ];
  const acknowledged: string[] = [];
  for (let i = 0; i < pending.length; i += 100) {
    const r = await api(state.settings, "/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: pending.slice(i, i + 100) }),
    });
    acknowledged.push(
      ...z.object({ accepted: z.array(z.string()) }).parse(await r.json())
        .accepted,
    );
  }
  const remote: PracticeEvent[] = [];
  let cursor = 0;
  for (;;) {
    const r = await api(state.settings, `/events?after=${cursor}`);
    const data = z
      .object({
        events: z.array(eventSchema),
        hasMore: z.boolean(),
        cursor: z.number(),
      })
      .parse(await r.json());
    remote.push(...data.events);
    if (!data.hasMore) break;
    cursor = data.cursor;
  }
  return {
    ...state,
    events: mergeEvents(state.events, remote),
    pending: state.pending.filter((id) => !acknowledged.includes(id)),
    materials: mergeMaterials(state.materials, materials),
    lastSync: new Date().toISOString(),
    waitingMaterials,
  };
}
export async function publishMaterial(
  settings: Settings,
  m: Material,
  audio?: Blob,
) {
  await api(settings, "/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(m),
  });
  if (audio) {
    const capabilities = z
      .object({ audioSync: z.boolean().optional() })
      .parse(await (await api(settings, "/health")).json());
    if (capabilities.audioSync === false) return { audioPending: true };
    await api(settings, `/audio/${m.id}/${m.version}`, {
      method: "PUT",
      headers: { "Content-Type": audio.type || "audio/mpeg" },
      body: audio,
    });
  }
  return { audioPending: false };
}
