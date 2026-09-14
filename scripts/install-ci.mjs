import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const manager = process.env.npm_execpath;
if (!manager || !manager.toLowerCase().includes("pnpm")) throw new Error("Run pnpm install --frozen-lockfile (or pnpm run install:ci).");
const result = spawnSync(process.execPath, [manager, "install", "--frozen-lockfile"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
