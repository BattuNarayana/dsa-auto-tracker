// Zips dist/ into dsa-auto-tracker.zip so it's easy to hand off or upload to
// the Chrome Web Store dashboard. "Load unpacked" (the normal dev workflow,
// see README) doesn't need this at all — it points straight at dist/.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");
const zipPath = resolve(root, "dsa-auto-tracker.zip");

if (!existsSync(distDir)) {
  console.error('dist/ not found — run "npm run build" first.');
  process.exit(1);
}

if (existsSync(zipPath)) rmSync(zipPath);

execFileSync("zip", ["-r", zipPath, "."], { cwd: distDir, stdio: "inherit" });
console.log(`\n✓ Wrote ${zipPath}\n`);
