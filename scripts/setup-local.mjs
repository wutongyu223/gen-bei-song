import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
if (!existsSync(".dev.vars")) {
  writeFileSync(
    ".dev.vars",
    `WRITE_TOKEN="${randomBytes(32).toString("hex")}"\nREAD_TOKEN="${randomBytes(32).toString("hex")}"\n`,
    { mode: 0o600 },
  );
  console.log("已生成本地开发密钥。密钥只保存在被忽略的 .dev.vars 中。");
} else console.log("保留已有本地开发密钥。");
