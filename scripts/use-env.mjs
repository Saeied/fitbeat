#!/usr/bin/env node
/** کپی env/{test|production}.env → .env.local برای dev */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const key = process.argv[2];
const map = { test: "test.env", production: "production.env", prod: "production.env" };
const file = map[key];
if (!file) {
  console.error("Usage: node scripts/use-env.mjs <test|production>");
  process.exit(1);
}

const src = path.join(root, "env", file);
if (!fs.existsSync(src)) {
  console.error(`Not found: ${src}`);
  process.exit(1);
}

const content = fs
  .readFileSync(src, "utf8")
  .split(/\r?\n/)
  .filter((line) => {
    const t = line.trim();
    return t && !t.startsWith("#") && !t.startsWith("DEPLOY_");
  })
  .join("\n");

fs.writeFileSync(path.join(root, ".env.local"), `${content}\n`, "utf8");
console.log(`→ .env.local ← env/${file}`);
