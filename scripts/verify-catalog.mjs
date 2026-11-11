#!/usr/bin/env node
/**
 * Local diagnostic: env, Nakama reachability, rpc_media_getVideoCatalog.
 * Run: npm run verify:catalog
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvFile(relPath) {
  const file = path.join(root, relPath);
  if (!fs.existsSync(file)) return {};
  const vars = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return vars;
}

function fail(message) {
  console.error(`\n[FAIL] ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

const envLocal = loadEnvFile(".env.local");
const envTest = loadEnvFile("env/test.env");
const env = { ...envTest, ...envLocal };

const httpUrl = env.NEXT_PUBLIC_NAKAMA_HTTP_URL;
const serverKey = env.NEXT_PUBLIC_NAKAMA_SERVER_KEY;
const mediaUrl = env.NEXT_PUBLIC_NAKAMA_MEDIA_HTTP_URL;

console.log("\n=== JustDance catalog diagnostic ===\n");

if (!fs.existsSync(path.join(root, ".env.local"))) {
  warn(".env.local missing — run: npm run dev:test");
} else {
  ok(".env.local exists");
}

if (!httpUrl) fail("NEXT_PUBLIC_NAKAMA_HTTP_URL not set (run npm run dev:test)");
if (!serverKey) fail("NEXT_PUBLIC_NAKAMA_SERVER_KEY not set");
ok(`Nakama HTTP: ${httpUrl}`);
ok(`Media HTTP: ${mediaUrl || "(derived from Nakama host)"}`);

async function ping(url, label) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    ok(`${label}: HTTP ${res.status}`);
    return true;
  } catch (error) {
    fail(`${label} unreachable — ${error instanceof Error ? error.message : error}`);
  }
}

await ping(httpUrl, "Nakama server");
if (mediaUrl) {
  await ping(`${mediaUrl.replace(/\/+$/, "")}/`, "Media server");
}

const basic = Buffer.from(`${serverKey}:`, "utf8").toString("base64");
const authRes = await fetch(
  `${httpUrl}/v2/account/authenticate/device?create=true`,
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: "tv-guest-link-notify" }),
    signal: AbortSignal.timeout(15_000),
  },
);

if (!authRes.ok) {
  fail(`Device auth failed: HTTP ${authRes.status} ${await authRes.text()}`);
}
ok("Guest device auth succeeded");

const session = await authRes.json();
const token = session.token;
if (!token) fail("No session token in auth response");

const rpcName = "rpc_media_getVideoCatalog";
let rpcRes = await fetch(`${httpUrl}/v2/rpc/${rpcName}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify("{}"),
  signal: AbortSignal.timeout(15_000),
});

if (!rpcRes.ok && (rpcRes.status === 400 || rpcRes.status === 500)) {
  rpcRes = await fetch(`${httpUrl}/v2/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15_000),
  });
}

if (!rpcRes.ok) {
  fail(`${rpcName}: HTTP ${rpcRes.status} ${await rpcRes.text()}`);
}

const rpcJson = await rpcRes.json();
let payload = rpcJson;
if (typeof rpcJson.payload === "string") {
  try {
    payload = JSON.parse(rpcJson.payload);
  } catch {
    payload = rpcJson.payload;
  }
} else if (rpcJson.payload != null) {
  payload = rpcJson.payload;
}

function describePayload(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return `object keys: ${Object.keys(value).join(", ")}`;
  return typeof value;
}

const videos = Array.isArray(payload?.videos)
  ? payload.videos
  : Array.isArray(payload?.result?.videos)
    ? payload.result.videos
    : Array.isArray(payload)
      ? payload
      : null;

if (!videos) {
  console.error(`\nRPC payload shape: ${describePayload(payload)}`);
  if (payload && typeof payload === "object" && payload.error) {
    console.error(`RPC error field: ${JSON.stringify(payload.error)}`);
  }
  fail(
    `${rpcName}: response has no videos array (guest session — catalog may require phone pairing / linked session)`,
  );
}

const valid = videos.filter(
  (v) => v && v.id != null && v.videoUrl && v.imageUrl,
);
ok(`${rpcName}: ${videos.length} raw, ${valid.length} valid entries`);

if (valid.length === 0) {
  warn("Catalog RPC OK but no valid videos — check server media config");
} else {
  const sample = valid[0];
  console.log(`     sample: id=${sample.id} name=${sample.name || sample.folder || "?"}`);
}

console.log("\n=== All checks passed ===\n");
console.log("If browser still shows empty list:");
console.log("  1. Open http://localhost:3000/dc/ (not localhost:3000)");
console.log("  2. Complete phone pairing (QR scan)");
console.log("  3. DevTools → Application → clear dc_video_catalog_v2:*");
console.log("  4. DevTools → Network → filter getVideoCatalog\n");
