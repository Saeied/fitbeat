import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, "env/production.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const httpUrl = env.NEXT_PUBLIC_NAKAMA_HTTP_URL;
const key = env.NEXT_PUBLIC_NAKAMA_SERVER_KEY;

const basic = Buffer.from(`${key}:`, "utf8").toString("base64");
const auth = await fetch(`${httpUrl}/v2/account/authenticate/device?create=true`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ id: `diag-${Date.now()}`, create: true }),
});
const session = await auth.json();
const rpc = await fetch(`${httpUrl}/v2/rpc/rpc_media_getVideoCatalog`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json",
  },
  body: "{}",
});
const text = await rpc.text();
console.log("RPC status", rpc.status);
let parsed = JSON.parse(text);
let payload = parsed.payload ? JSON.parse(parsed.payload) : parsed;
if (typeof payload === "string") payload = JSON.parse(payload);
const videos = payload.videos || payload.result?.videos;
if (!Array.isArray(videos)) {
  console.log("Unexpected shape", payload);
  process.exit(1);
}
const item = videos.find(
  (x) =>
    String(x.id) === "60" ||
    String(x.folder || "").includes("060") ||
    String(x.name || "").includes("060"),
);
console.log("Total videos", videos.length);
console.log("Item 60", JSON.stringify(item, null, 2));
const coverUrl = item?.imageUrl
  ? `http://85.198.11.216${item.imageUrl.startsWith("/") ? "" : "/"}${item.imageUrl}`
  : null;
if (coverUrl) {
  const head = await fetch(coverUrl, { method: "HEAD" });
  console.log("Cover HEAD", coverUrl, head.status);
}
