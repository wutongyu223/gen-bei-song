import { eventSchema, materialSchema, type Material } from "./schema";
import { mergeEvents, type PracticeEvent } from "./domain";
const KEY = "gbs-v1";
export type Settings = {
  theme: "system" | "light" | "dark";
  fontSize: number;
  lineHeight: number;
  font: "serif" | "sans";
  reviewSeconds: number;
  speed: number;
  apiUrl: string;
  token: string;
};
export type State = {
  events: PracticeEvent[];
  pending: string[];
  materials: Material[];
  selected: Record<string, string>;
  lastSync: string | null;
  waitingMaterials: string[];
  settings: Settings;
};
export const defaults: Settings = {
  theme: "system",
  fontSize: 24,
  lineHeight: 2,
  font: "serif",
  reviewSeconds: 60,
  speed: 1,
  apiUrl: import.meta.env.DEV
    ? "/api"
    : import.meta.env.VITE_SYNC_API_URL || "",
  token: "",
};
function connect(s: State): State {
  const token = new URLSearchParams(location.hash.slice(1)).get("connect");
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !defaults.apiUrl) return s;
  const next = {
    ...s,
    settings: { ...s.settings, apiUrl: defaults.apiUrl, token },
  };
  // The personal credential exists only in this device; the URL is cleared before sync.
  saveState(next);
  history.replaceState(null, "", location.pathname + location.search);
  return next;
}
export function readState(): State {
  const empty: State = {
    events: [],
    pending: [],
    materials: [],
    selected: {},
    lastSync: null,
    waitingMaterials: [],
    settings: defaults,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw) return connect(empty);
    return connect({
      ...empty,
      events: (raw.events ?? []).flatMap((e: unknown) => {
        const p = eventSchema.safeParse(e);
        return p.success ? [p.data] : [];
      }),
      materials: (raw.materials ?? []).flatMap((m: unknown) => {
        const p = materialSchema.safeParse(m);
        return p.success ? [p.data] : [];
      }),
      pending: Array.isArray(raw.pending) ? raw.pending : [],
      selected: raw.selected ?? {},
      lastSync: raw.lastSync ?? null,
      waitingMaterials: Array.isArray(raw.waitingMaterials)
        ? raw.waitingMaterials
        : [],
      settings: { ...defaults, ...raw.settings },
    });
  } catch {
    return empty;
  }
}
export function saveState(s: State) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
export function addEvent(s: State, e: PracticeEvent): State {
  return {
    ...s,
    events: mergeEvents(s.events, [e]),
    pending: [...new Set([...s.pending, e.id])],
  };
}
export function mergeMaterials(...sets: Material[][]) {
  const map = new Map<string, Material>();
  for (const m of sets.flat()) {
    const key = `${m.id}@${m.version}`;
    map.set(key, m);
  }
  return [...map.values()];
}
function audioDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("gbs-audio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("audio");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storeAudio(key: string, blob: Blob) {
  const db = await audioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("audio", "readwrite");
    tx.objectStore("audio").put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}
export async function loadAudio(key: string): Promise<Blob | undefined> {
  const db = await audioDb();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("audio").objectStore("audio").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export const materialKey = (m: Material) => `${m.id}@${m.version}`;
