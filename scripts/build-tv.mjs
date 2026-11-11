#!/usr/bin/env node
/**
 * بیلد TV با انتخاب سرور test یا production.
 * env/test.env و env/production.env را کپی می‌کند، next build می‌گیرد،
 * و در صورت تأیید با scp به سرور deploy می‌کند.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TARGETS = {
  1: { key: "test", label: "تست", file: "test.env", host: "185.7.212.199" },
  2: {
    key: "production",
    label: "پروداکشن",
    file: "production.env",
    host: "85.198.11.216",
  },
};

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function loadTargetEnv(target) {
  const envPath = path.join(root, "env", target.file);
  if (!fs.existsSync(envPath)) {
    console.error(`فایل env پیدا نشد: ${envPath}`);
    process.exit(1);
  }
  return parseEnvFile(fs.readFileSync(envPath, "utf8"));
}

async function askTarget() {
  const arg = process.argv[2]?.toLowerCase();
  if (arg === "test" || arg === "1") return TARGETS[1];
  if (arg === "production" || arg === "prod" || arg === "2") return TARGETS[2];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\nانتخاب سرور Nakama برای بیلد:\n");
  console.log("  1) تست        — 185.7.212.199");
  console.log("  2) پروداکشن   — 85.198.11.216\n");

  const answer = (await rl.question("شماره (1 یا 2): ")).trim();
  rl.close();

  const target = TARGETS[answer];
  if (!target) {
    console.error("انتخاب نامعتبر. از 1 یا 2 استفاده کنید.");
    process.exit(1);
  }
  return target;
}

async function askDeploy() {
  const skip = process.argv.includes("--no-deploy");
  if (skip) return false;

  const force = process.argv.includes("--deploy");
  if (force) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = (await rl.question("\nآیا خروجی را به سرور آپلود کنم؟ (y/N): "))
    .trim()
    .toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes" || answer === "بله";
}

function runBuild(envVars) {
  const env = { ...process.env, ...envVars, NODE_ENV: "production" };
  console.log("\n→ npm run build ...\n");
  const result = spawnSync("npm", ["run", "build"], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function deployWithScp(envVars) {
  const host = envVars.DEPLOY_HOST;
  const user = envVars.DEPLOY_USER || "root";
  const remotePath = envVars.DEPLOY_PATH || "/var/www/html/deploy-tv/dc";
  const outDir = path.join(root, "out");

  if (!host) {
    console.error("DEPLOY_HOST در فایل env تنظیم نشده.");
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) {
    console.error("پوشه out وجود ندارد. اول بیلد باید موفق باشد.");
    process.exit(1);
  }

  const remote = `${user}@${host}:${remotePath}/`;
  console.log(`\n→ آپلود out/ به ${remote}\n`);

  const mkdir = spawnSync(
    "ssh",
    [ `${user}@${host}`, `mkdir -p ${remotePath}` ],
    { stdio: "inherit", shell: true },
  );
  if (mkdir.status !== 0) {
    console.error("ssh mkdir ناموفق بود.");
    process.exit(mkdir.status ?? 1);
  }

  const scp = spawnSync(
    "scp",
    ["-r", path.join(outDir, "*"), remote],
    { stdio: "inherit", shell: true },
  );
  if (scp.status !== 0) {
    console.error("scp ناموفق بود.");
    process.exit(scp.status ?? 1);
  }

  console.log(`\n✓ deploy شد: http://${host}/dc/\n`);
}

async function main() {
  const target = await askTarget();
  const envVars = loadTargetEnv(target);

  console.log(`\n=== بیلد برای سرور ${target.label} (${target.host}) ===\n`);

  const publicVars = Object.fromEntries(
    Object.entries(envVars).filter(([key]) => key.startsWith("NEXT_PUBLIC_")),
  );
  fs.writeFileSync(
    path.join(root, ".env.production.local"),
    `${Object.entries(publicVars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
    "utf8",
  );
  console.log("→ .env.production.local به‌روز شد");

  runBuild(envVars);

  console.log(`\n✓ بیلد آماده است: out/  (basePath=${envVars.NEXT_PUBLIC_BASE_PATH || "/"})`);

  if (await askDeploy()) {
    deployWithScp(envVars);
  } else {
    console.log(
      `\nبرای deploy دستی:\n  scp -r out/* ${envVars.DEPLOY_USER || "root"}@${envVars.DEPLOY_HOST}:${envVars.DEPLOY_PATH || "/var/www/html/deploy-tv/dc"}/\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
