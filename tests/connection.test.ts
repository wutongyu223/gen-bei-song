import { afterEach, expect, it, vi } from "vitest";
import { readState, defaults } from "../src/storage";
const prepare = (hash: string, raw?: object) => {
  const memory = new Map<string, string>();
  if (raw) memory.set("gbs-v1", JSON.stringify(raw));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
  });
  vi.stubGlobal("location", { hash, pathname: "/gen-bei-song/", search: "" });
  const clear = vi.fn();
  vi.stubGlobal("history", { replaceState: clear });
  return { memory, clear };
};
afterEach(() => vi.unstubAllGlobals());
it("a personal link connects only to the configured endpoint and clears the credential URL", () => {
  const token = "a".repeat(64);
  const { memory, clear } = prepare(`#connect=${token}`);
  const s = readState();
  expect(s.settings.apiUrl).toBe(defaults.apiUrl);
  expect(s.settings.token).toBe(token);
  expect(JSON.parse(memory.get("gbs-v1")!).settings.token).toBe(token);
  expect(clear).toHaveBeenCalledWith(null, "", "/gen-bei-song/");
});
it("a connection preserves local materials and preferences", () => {
  prepare(`#connect=${"b".repeat(64)}`, {
    settings: { fontSize: 30 },
    selected: { bei: "sunzi-jipian@1" },
  });
  const s = readState();
  expect(s.settings.fontSize).toBe(30);
  expect(s.selected.bei).toBe("sunzi-jipian@1");
});
it("a malformed connection leaves existing credentials unchanged", () => {
  const { clear } = prepare("#connect=invalid", {
    settings: { token: "existing" },
  });
  expect(readState().settings.token).toBe("existing");
  expect(clear).not.toHaveBeenCalled();
});
