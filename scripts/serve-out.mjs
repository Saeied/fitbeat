#!/usr/bin/env node
/**
 * Serve static export the same way Apache does at /dc/.
 * `npx serve out` breaks because assets live at out/_next but HTML
 * references /dc/_next — this script mirrors /var/www/html/dc/ locally.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "out");
const previewDir = path.join(root, ".preview");
const dcDir = path.join(previewDir, "dc");
const port = process.argv[2] || "3000";

function fail(message) {
  console.error(`\n[ERROR] ${message}\n`);
  process.exit(1);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

if (!fs.existsSync(outDir)) {
  fail(
    'Build output not found. Run one of:\n  npm run preview:test\n  npm run build:tv:test -- --no-deploy\n  build-apache.bat',
  );
}

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  fail("out/index.html is missing. Run a production build first.");
}

console.log("\n→ Preparing local preview (Apache-style /dc/ path)...\n");

if (fs.existsSync(previewDir)) {
  fs.rmSync(previewDir, { recursive: true, force: true });
}

fs.mkdirSync(dcDir, { recursive: true });
copyDir(outDir, dcDir);

fs.writeFileSync(
  path.join(previewDir, "index.html"),
  `<!DOCTYPE html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=/dc/" />
    <title>JustDance</title>
    <script>location.replace("/dc/");</script>
  </head>
  <body>
    <p><a href="/dc/">Open JustDance</a></p>
  </body>
</html>
`,
  "utf8",
);

console.log(`✓ Preview folder ready: .preview/dc/`);
console.log(`\n→ Starting static server on port ${port}...\n`);
console.log(`   Open: http://localhost:${port}/dc/\n`);
console.log("   Press Ctrl+C to stop.\n");

const result = spawnSync(
  "npx",
  ["--yes", "serve@latest", ".preview", "-l", port],
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
  },
);

process.exit(result.status ?? 1);
