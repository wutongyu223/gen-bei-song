import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import worker from "../worker/index";

function setup() {
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const fetch = vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname !== "/audio/selected/1.mp3")
      return new Response(null, { status: 404 });
    // Match the real binding: no Content-Length, Range ignored, full GET body.
    return new Response(request.method === "HEAD" ? null : bytes);
  });
  return {
    fetch,
    env: {
      DB: {} as D1Database,
      WRITE_TOKEN: "write",
      READ_TOKEN: "read",
      ALLOWED_ORIGINS: "https://example.test",
      PRIVATE_AUDIO: { fetch } as unknown as Fetcher,
    },
  };
}

it("production routes every asset request through the authenticated Worker", () => {
  const config = JSON.parse(
    readFileSync("wrangler.jsonc", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,\s*([}\]])/g, "$1"),
  );
  expect(config.env.production.assets).toMatchObject({
    binding: "PRIVATE_AUDIO",
    run_worker_first: true,
    not_found_handling: "none",
  });
});

it("anonymous and direct asset navigations never reach the audio binding", async () => {
  const { env, fetch } = setup();
  for (const path of ["/api/audio/selected/1", "/audio/selected/1.mp3"]) {
    for (const method of ["GET", "HEAD"]) {
      const r = await worker.fetch(
        new Request(`https://test.invalid${path}`, {
          method,
          headers: { "Sec-Fetch-Mode": "navigate" },
        }),
        env,
      );
      expect(r.status).toBe(401);
    }
  }
  const raw = await worker.fetch(
    new Request("https://test.invalid/audio/selected/1.mp3", {
      headers: { Authorization: "Bearer read" },
    }),
    env,
  );
  expect(raw.status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});

it("read-only access can stream a range without forwarding credentials", async () => {
  const { env, fetch } = setup();
  const r = await worker.fetch(
    new Request("https://test.invalid/api/audio/selected/1", {
      headers: {
        Authorization: "Bearer read",
        Origin: "https://example.test",
        Range: "bytes=2-4",
      },
    }),
    env,
  );
  expect(r.status).toBe(206);
  expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([2, 3, 4]);
  expect(r.headers.get("Content-Range")).toBe("bytes 2-4/8");
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(r.headers.get("Vary")).toBe("Origin, Authorization");
  expect(r.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://example.test",
  );
  expect(fetch.mock.calls[0][0].headers.get("Authorization")).toBeNull();
  expect(fetch.mock.calls[0][0].headers.get("Origin")).toBeNull();
});

it("HEAD and invalid ranges retain the asset response semantics", async () => {
  const { env } = setup();
  const head = await worker.fetch(
    new Request("https://test.invalid/api/audio/selected/1", {
      method: "HEAD",
      headers: { Authorization: "Bearer write" },
    }),
    env,
  );
  expect(head.status).toBe(200);
  expect(head.headers.get("Accept-Ranges")).toBe("bytes");
  expect(await head.text()).toBe("");
  const invalid = await worker.fetch(
    new Request("https://test.invalid/api/audio/selected/1", {
      headers: { Authorization: "Bearer read", Range: "bytes=99-" },
    }),
    env,
  );
  expect(invalid.status).toBe(416);
  expect(invalid.headers.get("Content-Range")).toBe("bytes */8");
});

it("prepared playback does not advertise generic audio uploads or bypass permissions", async () => {
  const { env, fetch } = setup();
  const health = await worker.fetch(
    new Request("https://test.invalid/api/health"),
    env,
  );
  expect(await health.json()).toMatchObject({
    audioSync: false,
    preparedAudio: true,
  });
  const unauthorized = await worker.fetch(
    new Request("https://test.invalid/api/audio/selected/1", {
      method: "PUT",
      headers: { Authorization: "Bearer read" },
    }),
    env,
  );
  expect(unauthorized.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
  const overwrite = await worker.fetch(
    new Request("https://test.invalid/api/audio/selected/1", {
      method: "PUT",
      headers: { Authorization: "Bearer write" },
    }),
    env,
  );
  expect(overwrite.status).toBe(409);
  const missing = await worker.fetch(
    new Request("https://test.invalid/api/audio/other/1", {
      headers: { Authorization: "Bearer read" },
    }),
    env,
  );
  expect(missing.status).toBe(503);
});
