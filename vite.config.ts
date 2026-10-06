import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "node:fs";
// Only the local development proxy supplies this secret; it is never bundled.
const localSecrets = existsSync(".dev.vars")
  ? readFileSync(".dev.vars", "utf8")
  : "";
const localToken = localSecrets.match(/^WRITE_TOKEN="?([^"\n]+)"?$/m)?.[1];
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "./",
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.dev.vars",
        "**/.wrangler/**",
        "**/work/**",
        "**/test-results/**",
      ],
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.GBS_DEV_API_PORT || "8787"}`,
        headers: localToken ? { Authorization: `Bearer ${localToken}` } : {},
      },
    },
  },
  test: { include: ["tests/*.test.ts"] },
});
