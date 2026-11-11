#!/usr/bin/env node
/**
 * Build + deploy PRODUCTION with version tag.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const versionFile = path.join(root, "deploy", "prod-version.txt");
const historyFile = path.join(root, "deploy", "prod-history.log");

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

function runShell(command, options = {}) {
  console.log(`\n> ${command}\n`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    ...options,
  });
  return result.status ?? 1;
}

function runOrExit(command, options = {}) {
  const code = runShell(command, options);
  if (code !== 0) process.exit(code);
}

function readVersion() {
  if (!fs.existsSync(versionFile)) {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
    fs.writeFileSync(versionFile, "1\n", "utf8");
  }
  const n = parseInt(fs.readFileSync(versionFile, "utf8").trim(), 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid version in ${versionFile}`);
  }
  return n;
}

function writeVersion(next) {
  fs.writeFileSync(versionFile, `${next}\n`, "utf8");
}

function appendHistory(version, host) {
  fs.appendFileSync(
    historyFile,
    `${new Date().toISOString()}\tv${version}\t${host}\n`,
    "utf8",
  );
}

function writeVersionManifest(outDir, version) {
  const manifest = {
    version,
    label: `v${version}`,
    server: "production",
    deployedAt: new Date().toISOString(),
    url: "http://85.198.11.216/dc/",
  };
  fs.writeFileSync(
    path.join(outDir, "version.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outDir, "version.txt"),
    `v${version}\n${manifest.deployedAt}\nproduction\n`,
    "utf8",
  );
}

function printManualHelp(user, host, livePath, outDir) {
  const out = outDir.replace(/\\/g, "/");
  console.log(`
============================================================
  UPLOAD FAILED - manual steps
============================================================

1) SSH key (recommended, one time):
   ssh-copy-id ${user}@${host}

2) Upload manually (after npm run build):
   scp deploy/out-upload.tar.gz ${user}@${host}:/tmp/
   ssh ${user}@${host} "mkdir -p ${livePath} && rm -rf ${livePath}/* && tar -xzf /tmp/out-upload.tar.gz -C ${livePath}"

3) Or tar pipe:
   tar -cf - -C "${out}" . | ssh ${user}@${host} "mkdir -p ${livePath} && tar -xf - -C ${livePath}"

4) Apache setup on server (one time):
   scp deploy/apache-dc.conf ${user}@${host}:/tmp/apache-dc.conf
   scp deploy/setup-server.sh ${user}@${host}:/tmp/setup-server.sh
   ssh ${user}@${host} "bash /tmp/setup-server.sh"

4) Open: http://${host}/dc/
============================================================
`);
}

function deployToServer(envVars, version) {
  const host = envVars.DEPLOY_HOST;
  const user = envVars.DEPLOY_USER || "root";
  const livePath = envVars.DEPLOY_PATH || "/var/www/html/dc";
  const releasesPath =
    envVars.DEPLOY_RELEASES_PATH || "/var/www/html/deploy-tv/releases";
  const releaseDir = `${releasesPath}/v${version}`;
  const outDir = path.join(root, "out");
  const sshTarget = `${user}@${host}`;
  const outQuoted = JSON.stringify(outDir);
  const tarPath = path.join(root, "deploy", "out-upload.tar.gz");

  if (!host) {
    console.error("DEPLOY_HOST missing in env/production.env");
    process.exit(1);
  }

  console.log(`\n=> Deploy v${version} to ${sshTarget}`);
  console.log(`   live:    ${livePath}`);
  console.log(`   archive: ${releaseDir}\n`);

  runOrExit(`ssh -o ConnectTimeout=20 ${sshTarget} "mkdir -p ${livePath} ${releaseDir}"`);

  fs.mkdirSync(path.dirname(tarPath), { recursive: true });
  if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);

  runOrExit(`tar -czf "${tarPath}" -C ${outQuoted} .`);

  let uploadCode = runShell(
    `scp -o ConnectTimeout=120 "${tarPath}" ${sshTarget}:/tmp/out-upload.tar.gz`,
  );
  if (uploadCode === 0) {
    uploadCode = runShell(
      `ssh -o ConnectTimeout=120 ${sshTarget} "rm -rf ${livePath}/* && tar -xzf /tmp/out-upload.tar.gz -C ${livePath} && rm -f /tmp/out-upload.tar.gz"`,
    );
  }

  if (uploadCode !== 0) {
    console.error("\n[ERROR] Upload to server failed.\n");
    printManualHelp(user, host, livePath, outDir);
    process.exit(uploadCode);
  }

  runOrExit(`ssh ${sshTarget} "test -f ${livePath}/index.html"`);

  runOrExit(
    `ssh ${sshTarget} "${[
      `cp -a ${livePath}/. ${releaseDir}/`,
      `echo v${version} > ${releasesPath}/LATEST`,
      `echo v${version} $(date -Iseconds) > ${livePath}/version.txt`,
      `chown -R www-data:www-data ${livePath} ${releaseDir}`,
    ].join(" && ")}"`,
  );

  console.log(`\nOK v${version} deployed`);
  console.log(`  Live: http://${host}/dc/\n`);
}

function main() {
  const envPath = path.join(root, "env", "production.env");
  if (!fs.existsSync(envPath)) {
    console.error(`Missing ${envPath}`);
    process.exit(1);
  }

  const envVars = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  const version = readVersion();

  console.log(`\n=== Deploy TV PRODUCTION v${version} ===`);
  console.log(`=== ${envVars.DEPLOY_HOST || "85.198.11.216"} ===\n`);

  const publicVars = Object.fromEntries(
    Object.entries(envVars).filter(([key]) => key.startsWith("NEXT_PUBLIC_")),
  );
  publicVars.NEXT_PUBLIC_APP_VERSION = String(version);

  fs.writeFileSync(
    path.join(root, ".env.production.local"),
    `${Object.entries(publicVars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
    "utf8",
  );

  runOrExit("npm run build", {
    env: { ...process.env, ...envVars, ...publicVars, NODE_ENV: "production" },
  });

  const outDir = path.join(root, "out");
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    console.error("Build failed: out/index.html missing");
    process.exit(1);
  }

  writeVersionManifest(outDir, version);
  deployToServer(envVars, version);

  writeVersion(version + 1);
  appendHistory(version, envVars.DEPLOY_HOST);
  console.log(`Next deploy version: v${version + 1}`);
}

main();
