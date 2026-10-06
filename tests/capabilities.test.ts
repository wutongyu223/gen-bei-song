import { expect, it } from "vitest";
import worker from "../worker/index";
const env = {
  DB: {} as D1Database,
  WRITE_TOKEN: "write",
  READ_TOKEN: "read",
  ALLOWED_ORIGINS: "https://example.test",
};
it("progress-only deployments expose their audio capability", async () => {
  const r = await worker.fetch(
    new Request("https://test.invalid/api/health"),
    env,
  );
  expect(r.status).toBe(200);
  expect(((await r.json()) as { audioSync: boolean }).audioSync).toBe(false);
});
it("missing cloud audio gives a useful response rather than crashing", async () => {
  const r = await worker.fetch(
    new Request("https://test.invalid/api/audio/test/1", {
      headers: { Authorization: "Bearer write" },
    }),
    env,
  );
  expect(r.status).toBe(503);
  expect(((await r.json()) as { error: string }).error).toContain("尚未开通");
});
