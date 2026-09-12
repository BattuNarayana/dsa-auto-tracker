// Chrome loads Manifest V3 content scripts (and, unless declared "type":
// "module", the background service worker) as CLASSIC scripts, not ES
// modules. Vite/Rollup's default multi-entry output shares code between
// entries via `import` statements, which is invalid outside a module context
// and would throw "Cannot use import statement outside a module" at runtime
// on both LeetCode and the Striver sheet.
//
// Fix: build the popup (a real module, loaded via <script type="module">) as
// one Vite build, and build the service worker + each content script as
// separate, single-entry IIFE bundles with no code-splitting, so every file
// Chrome loads directly is fully self-contained.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const watchMode = process.argv.includes("--watch");

function popupConfig(emptyOutDir) {
  return {
    root,
    configFile: false,
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          { src: "manifest.json", dest: "." },
          { src: "public/icons", dest: "." },
        ],
      }),
    ],
    build: {
      outDir: "dist",
      emptyOutDir,
      watch: watchMode ? {} : null,
      rollupOptions: {
        input: { popup: resolve(root, "popup.html") },
      },
    },
  };
}

function iifeConfig(name, entry) {
  return {
    root,
    configFile: false,
    build: {
      outDir: "dist",
      emptyOutDir: false, // popup build already seeded dist/
      watch: watchMode ? {} : null,
      rollupOptions: {
        input: { [name]: resolve(root, entry) },
        output: {
          format: "iife",
          entryFileNames: "[name].js",
          // No manualChunks / shared chunks possible for a single entry
          // IIFE build, so this is guaranteed self-contained.
        },
      },
    },
  };
}

const targets = [
  ["service-worker", "src/background/service-worker.ts"],
  ["content-leetcode", "src/content/leetcode/index.ts"],
  ["content-striver", "src/content/striver/index.ts"],
];

async function main() {
  if (!watchMode) {
    // One-shot production build: run in order so the popup build's
    // emptyOutDir doesn't wipe out files the other builds already wrote.
    await build(popupConfig(true));
    for (const [name, entry] of targets) {
      await build(iifeConfig(name, entry));
    }
    console.log("\n✓ All targets built to dist/\n");
    return;
  }

  // Watch mode: seed dist/ once (non-watch, so it's guaranteed complete and
  // safe to emptyOutDir), then start all four watchers concurrently.
  await build(popupConfig(true));
  await Promise.all([
    build(popupConfig(false)),
    ...targets.map(([name, entry]) => build(iifeConfig(name, entry))),
  ]);
  console.log("\n✓ Watching for changes... (Ctrl+C to stop)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
