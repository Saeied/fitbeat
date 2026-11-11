#!/usr/bin/env node
/** Upload out/ to production without rebuild. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
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

function run(cmd) {
  console.log(`> ${cmd}\n`);
  const r = spawnSync(cmd, { cwd: root, stdio: "inherit", shell: true });
  return r.status ?? 1;
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const host = env.DEPLOY_HOST || "85.198.11.216";
const user = env.DEPLOY_USER || "root";
const livePath = env.DEPLOY_PATH || "/var/www/html/dc";
const ssh = `${user}@${host}`;
const tarPath = path.join(root, "deploy", "out-upload.tar.gz");

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  console.error("out/index.html missing");
  process.exit(1);
}

fs.mkdirSync(path.dirname(tarPath), { recursive: true });
if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);

let code = run(`tar -czf "${tarPath}" -C "${outDir}" .`);
if (code) process.exit(code);

code = run(`scp "${tarPath}" ${ssh}:/tmp/out-upload.tar.gz`);
if (code) process.exit(code);

code = run(
  `ssh ${ssh} "mkdir -p ${livePath} && rm -rf ${livePath}/* && tar -xzf /tmp/out-upload.tar.gz -C ${livePath} && rm -f /tmp/out-upload.tar.gz && chown -R www-data:www-data ${livePath} && test -f ${livePath}/index.html"`,
);
process.exit(code);
