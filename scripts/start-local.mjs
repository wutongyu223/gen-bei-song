import { spawn, spawnSync } from "node:child_process";
const run = (args) => {
  const result = spawnSync("npm", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(["run", "setup:local"]);
run(["run", "db:local"]);
const children = [
  spawn("npm", ["run", "dev:api"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev"], { stdio: "inherit" }),
];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
};
process.on("SIGINT", () => {
  stop();
  process.exit();
});
process.on("SIGTERM", () => {
  stop();
  process.exit();
});
for (const child of children)
  child.on("exit", (code) => {
    stop();
    process.exit(code ?? 0);
  });
