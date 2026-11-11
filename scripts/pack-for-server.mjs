#!/usr/bin/env node
/** Build production + fill manual-deploy/ for manual server copy. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packDir = path.join(root, "manual-deploy");
const dcDir = path.join(packDir, "dc");
const envPath = path.join(root, "env", "production.env");

function parseEnv(content) {
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return vars;
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function run(cmd, env = {}) {
  const r = spawnSync(cmd, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env, NODE_ENV: "production" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const envVars = parseEnv(fs.readFileSync(envPath, "utf8"));
const publicVars = Object.fromEntries(
  Object.entries(envVars).filter(([k]) => k.startsWith("NEXT_PUBLIC_")),
);

fs.writeFileSync(
  path.join(root, ".env.production.local"),
  `${Object.entries(publicVars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")}\n`,
);

console.log("-> npm run build\n");
run("npm run build");

const outDir = path.join(root, "out");
if (!fs.existsSync(path.join(outDir, "index.html"))) {
  console.error("Build failed: out/index.html missing");
  process.exit(1);
}

console.log("\n-> packing manual-deploy/\n");
rmDir(dcDir);
fs.mkdirSync(packDir, { recursive: true });
copyDir(outDir, dcDir);

for (const file of ["apache-dc.conf", "setup-server.sh"]) {
  fs.copyFileSync(
    path.join(root, "deploy", file),
    path.join(packDir, file),
  );
}

const versionFile = path.join(root, "deploy", "prod-version.txt");
const version = fs.existsSync(versionFile)
  ? fs.readFileSync(versionFile, "utf8").trim()
  : "?";

const instructions = `============================================================
  Dance TV — Manual deploy to server 85.198.11.216
  Build pack v${version}
============================================================

COPY THIS FOLDER TO SERVER:

  manual-deploy/dc/*  -->  /var/www/html/dc/

Required on server after copy:
  /var/www/html/dc/index.html

Open in browser:
  http://85.198.11.216/dc/

Apache one-time setup on server:
  copy apache-dc.conf and setup-server.sh to /tmp/
  bash /tmp/setup-server.sh

Regenerate on PC:
  Pack-For-Server.bat
============================================================
`;

fs.writeFileSync(path.join(packDir, "INSTRUCTIONS.txt"), instructions);

console.log(`OK: ${packDir}`);
console.log(`    ${dcDir}`);
console.log("\nCopy manual-deploy/dc/* to server: /var/www/html/dc/");
