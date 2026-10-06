// Agent-facing helper: uses only READ_TOKEN, never a user's write credential.
import { readFileSync } from "node:fs";
const config = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : {};
const endpoint = process.env.GBS_API_URL || config.apiUrl,
  token = process.env.GBS_READ_TOKEN || config.readToken;
if (!endpoint || !token) {
  console.error("请设置 GBS_API_URL 与 GBS_READ_TOKEN。");
  process.exit(1);
}
const response = await fetch(endpoint.replace(/\/$/, "") + "/progress", {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) {
  console.error(`读取失败（${response.status}）`);
  process.exit(1);
}
console.log(JSON.stringify(await response.json(), null, 2));
