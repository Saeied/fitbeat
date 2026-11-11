import { nakamaConfig } from "./config";
import { callTvRpc } from "./rpc";
import type { VideoQuality } from "@/lib/video/deviceProfile";
import {
  buildQualityUrlMap,
  buildNestedQualityUrls,
  isDerivedQualityUrl,
} from "@/lib/video/videoQuality";

function nestedVariantsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VIDEO_NESTED_VARIANTS === "1";
}

export const RPC_MEDIA_GET_VIDEO_CATALOG = "rpc_media_getVideoCatalog";
const APACHE_CONTENT_PATH = "/dance_Content";

/** Known media hosts from older builds / test / prod — always rewrite to current env. */
const KNOWN_MEDIA_HOSTS = [
  "37.32.20.240",
  "185.7.212.199",
  "85.198.11.216",
] as const;

export type VideoDifficality = "easy" | "medium" | "hard" | "extreme";

const VIDEO_DIFFICALITY_VALUES: ReadonlySet<VideoDifficality> = new Set([
  "easy",
  "medium",
  "hard",
  "extreme",
]);

export type NakamaVideoCatalogItem = {
  id?: number | string;
  name?: string;
  folder?: string;
  videoUrl?: string;
  imageUrl?: string;
  videoUrl1080?: string;
  videoUrl720?: string;
  videoUrl480?: string;
  qualities?: Partial<Record<string, string>>;
  category?: string;
  singerName?: string;
  difficality?: string;
};

export type VideoCatalogEntry = {
  id: string;
  title: string;
  description: string;
  cover: string;
  url: string;
  urls?: Partial<Record<VideoQuality, string>>;
  category: string;
  singerName: string;
  difficality: VideoDifficality;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function currentMediaOrigin(): string {
  try {
    return new URL(nakamaConfig.mediaHttpBase).origin;
  } catch {
    return nakamaConfig.mediaHttpBase.replace(/\/+$/, "");
  }
}

export function rewriteMediaUrl(url: string): string {
  if (!url) return url;
  const s = String(url);
  if (!/^https?:\/\//i.test(s)) return s;

  try {
    const parsed = new URL(s);
    const targetOrigin = currentMediaOrigin();
    const targetHost = new URL(targetOrigin).hostname;
    if (parsed.hostname === targetHost) return parsed.href;
    return new URL(
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
      targetOrigin,
    ).href;
  } catch {
    for (const host of KNOWN_MEDIA_HOSTS) {
      const escaped = host.replace(/\./g, "\\.");
      const replaced = s.replace(
        new RegExp(`^https?:\\/\\/${escaped}`, "i"),
        nakamaConfig.mediaHttpBase,
      );
      if (replaced !== s) return replaced;
    }
    return s;
  }
}

export function normalizeCatalogEntry(
  entry: VideoCatalogEntry,
  coverCacheNonce: string | number = Date.now(),
): VideoCatalogEntry {
  const primaryUrl = rewriteMediaUrl(entry.url);
  const urls = entry.urls
    ? (Object.fromEntries(
        Object.entries(entry.urls)
          .map(([quality, value]) => [quality, rewriteMediaUrl(value)] as const)
          .filter(([, value]) => !isDerivedQualityUrl(primaryUrl, value)),
      ) as Partial<Record<VideoQuality, string>>)
    : undefined;

  const cleanedUrls = urls && Object.keys(urls).length > 0 ? urls : undefined;

  return {
    ...entry,
    url: primaryUrl,
    // Bust cover cache per catalog load (stable PNG paths are often immutable).
    cover: cacheBustedMediaUrl(rewriteMediaUrl(entry.cover), coverCacheNonce),
    urls: cleanedUrls,
  };
}

export function normalizeCatalog(
  entries: VideoCatalogEntry[],
): VideoCatalogEntry[] {
  const coverCacheNonce = Date.now();
  return entries.map((entry) => normalizeCatalogEntry(entry, coverCacheNonce));
}

const DANCE_CONTENT_FILE_RE =
  /\/dance_Content\/([^/]+)\/([^/]+)\.(png|mp4|webp|jpe?g)$/i;

function videoFolderFromToken(token: string): string | null {
  const match = String(token).match(/^video[_-]?(\d+)$/i);
  if (!match) return null;
  return `video_${match[1].padStart(3, "0")}`;
}

/**
 * Apache on Linux is case-sensitive. Nakama/Unity may send Video_060 while files live under video_060.
 */
export function normalizeDanceContentMediaPath(path: string): string {
  if (!path) return path;

  let s = String(path);
  let query = "";
  const qIndex = s.indexOf("?");
  if (qIndex >= 0) {
    query = s.slice(qIndex);
    s = s.slice(0, qIndex);
  }

  let pathname = s;
  let origin = "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const parsed = new URL(s);
      origin = parsed.origin;
      pathname = parsed.pathname;
    } catch {
      return path;
    }
  }

  const match = pathname.match(DANCE_CONTENT_FILE_RE);
  if (!match) return path;

  const folderNorm =
    videoFolderFromToken(match[1]) ?? videoFolderFromToken(match[2]);
  if (!folderNorm) return path;

  const ext = match[3].toLowerCase();
  const normalizedPath = `${APACHE_CONTENT_PATH}/${folderNorm}/${folderNorm}.${ext}`;
  return origin
    ? `${origin}${normalizedPath}${query}`
    : `${normalizedPath}${query}`;
}

function canonicalDanceMediaPaths(id: number | string): {
  videoUrl: string;
  imageUrl: string;
} {
  const folder = `video_${String(id).padStart(3, "0")}`;
  return {
    videoUrl: `${APACHE_CONTENT_PATH}/${folder}/${folder}.mp4`,
    imageUrl: `${APACHE_CONTENT_PATH}/${folder}/${folder}.webp`,
  };
}

export function absoluteMediaUrl(path: string): string {
  if (!path) return "";
  let s = normalizeDanceContentMediaPath(String(path));
  if (/^https?:\/\//i.test(s)) {
    return rewriteMediaUrl(s);
  }
  if (s.charAt(0) !== "/") {
    s = `/${s}`;
  }
  return `${nakamaConfig.mediaHttpBase}${s}`;
}

/**
 * Optional cache-bust for replay flows only.
 * Normal playback should use the stable catalog URL so browser HTTP cache works.
 */
export function cacheBustedMediaUrl(
  url: string,
  nonce: string | number = Date.now(),
): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("t", String(nonce));
    return parsed.href;
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${encodeURIComponent(String(nonce))}`;
  }
}

function readExplicitQualityUrls(
  item: NakamaVideoCatalogItem,
): Partial<Record<VideoQuality, string>> | undefined {
  const explicit: Partial<Record<VideoQuality, string>> = {};
  if (item.videoUrl1080)
    explicit["1080"] = absoluteMediaUrl(String(item.videoUrl1080));
  if (item.videoUrl720)
    explicit["720"] = absoluteMediaUrl(String(item.videoUrl720));
  if (item.videoUrl480)
    explicit["480"] = absoluteMediaUrl(String(item.videoUrl480));
  if (item.qualities && typeof item.qualities === "object") {
    for (const [key, value] of Object.entries(item.qualities)) {
      if (!value) continue;
      if (key === "1080" || key === "720" || key === "480") {
        explicit[key] = absoluteMediaUrl(String(value));
      }
    }
  }
  return Object.keys(explicit).length ? explicit : undefined;
}

function readCatalogString(value: unknown): string {
  if (value == null) return "";
  const text = String(value).trim();
  return text;
}

function parseVideoDifficality(value: unknown): VideoDifficality {
  const normalized = value != null ? String(value).trim().toLowerCase() : "";
  if (VIDEO_DIFFICALITY_VALUES.has(normalized as VideoDifficality)) {
    return normalized as VideoDifficality;
  }
  return "easy";
}

function mapVideoToCatalogEntry(
  item: NakamaVideoCatalogItem,
): VideoCatalogEntry | null {
  const name = item.name != null ? String(item.name) : "";
  const folder = item.folder != null ? String(item.folder) : name;
  const videoUrl = item.videoUrl != null ? String(item.videoUrl) : "";
  const imageUrl = item.imageUrl != null ? String(item.imageUrl) : "";
  const idVal = item.id;

  if (idVal == null || idVal === "" || !videoUrl || !imageUrl) {
    return null;
  }

  const idNum = Number(idVal);
  let resolvedVideoUrl = normalizeDanceContentMediaPath(videoUrl);
  let resolvedImageUrl = normalizeDanceContentMediaPath(imageUrl);
  if (Number.isFinite(idNum) && idNum > 0) {
    const canonical = canonicalDanceMediaPaths(idNum);
    resolvedVideoUrl = canonical.videoUrl;
    resolvedImageUrl = canonical.imageUrl;
  }

  const url = absoluteMediaUrl(resolvedVideoUrl);
  const explicit = readExplicitQualityUrls(item);
  const nested = nestedVariantsEnabled() ? buildNestedQualityUrls(url) : {};

  return {
    id: String(idVal),
    title: name || folder || "Video",
    description: "",
    cover: absoluteMediaUrl(resolvedImageUrl),
    url,
    urls: buildQualityUrlMap(
      url,
      { ...nested, ...explicit },
      { allowDerived: false },
    ),
    category: readCatalogString(item.category),
    singerName: readCatalogString(item.singerName),
    difficality: parseVideoDifficality(item.difficality),
  };
}

function unwrapCatalogPayload(parsed: unknown): unknown {
  if (typeof parsed !== "string") return parsed;
  const trimmed = parsed.trim();
  if (!trimmed) return parsed;
  try {
    return unwrapCatalogPayload(JSON.parse(trimmed) as unknown);
  } catch {
    return parsed;
  }
}

function extractVideosFromRpcPayload(
  parsed: unknown,
): NakamaVideoCatalogItem[] | null {
  const value = unwrapCatalogPayload(parsed);
  if (Array.isArray(value)) {
    return value as NakamaVideoCatalogItem[];
  }

  const record = asRecord(value);
  if (!record) return null;

  if (record.error != null && record.error !== false) {
    return null;
  }

  const result = asRecord(record.result) ?? record;
  const videos = result.videos;
  if (Array.isArray(videos)) {
    return videos as NakamaVideoCatalogItem[];
  }
  return null;
}

function parseApacheIndexNames(html: string): string[] {
  const names: string[] = [];
  const hrefRe = /href="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html))) {
    const raw = match[1];
    if (
      !raw ||
      raw.startsWith("?") ||
      raw.startsWith("#") ||
      raw.startsWith("/") ||
      /^https?:/i.test(raw)
    ) {
      continue;
    }
    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    name = name.replace(/\/+$/, "");
    if (name && name !== "..") names.push(name);
  }
  return names;
}

function foldersToRawList(folders: string[]): NakamaVideoCatalogItem[] {
  return folders.map((folder) => {
    const numericId = Number(folder.replace(/^video_/i, ""));
    return {
      id: Number.isFinite(numericId) ? numericId : folder,
      name: folder,
      folder,
      videoUrl: `${APACHE_CONTENT_PATH}/${folder}/${folder}.mp4`,
      imageUrl: `${APACHE_CONTENT_PATH}/${folder}/${folder}.webp`,
    };
  });
}

function apacheListingCandidates(): string[] {
  const absolute = `${nakamaConfig.mediaHttpBase.replace(/\/+$/, "")}${APACHE_CONTENT_PATH}/`;
  return [`${APACHE_CONTENT_PATH}/`, absolute];
}

async function fetchApacheIndex(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/html" },
  });
  if (!response.ok) {
    throw new Error(`Apache catalog HTTP ${response.status}`);
  }
  return response.text();
}

function probeCoverExists(url: string): Promise<boolean> {
  if (typeof Image === "undefined") {
    return fetch(url, { method: "HEAD" })
      .then((response) => response.ok)
      .catch(() => false);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

async function fetchApacheVideoCatalogByProbe(): Promise<VideoCatalogEntry[]> {
  const rawList: NakamaVideoCatalogItem[] = [];
  let consecutiveMisses = 0;

  for (let id = 1; id <= 120; id++) {
    const folder = `video_${String(id).padStart(3, "0")}`;
    const exists = await probeCoverExists(
      absoluteMediaUrl(`${APACHE_CONTENT_PATH}/${folder}/${folder}.webp`),
    );
    if (!exists) {
      consecutiveMisses += 1;
      if (consecutiveMisses >= 3) break;
      continue;
    }
    consecutiveMisses = 0;
    rawList.push({
      id,
      name: folder,
      folder,
      videoUrl: `${APACHE_CONTENT_PATH}/${folder}/${folder}.mp4`,
      imageUrl: `${APACHE_CONTENT_PATH}/${folder}/${folder}.webp`,
    });
  }

  if (!rawList.length) {
    throw new Error("فایل ویدیو روی سرور رسانه پیدا نشد");
  }
  return normalizeCatalog(finalizeCatalog(rawList));
}

async function fetchApacheVideoCatalog(): Promise<VideoCatalogEntry[]> {
  console.log("[VIDEO_CATALOG] Loading catalog from Apache dance_Content...");
  for (const url of apacheListingCandidates()) {
    try {
      const folders = parseApacheIndexNames(await fetchApacheIndex(url)).filter(
        (name) => /^video_\d+$/i.test(name),
      );
      if (folders.length) {
        return normalizeCatalog(finalizeCatalog(foldersToRawList(folders)));
      }
    } catch (error) {
      console.warn("[VIDEO_CATALOG] Apache listing missed:", url, error);
    }
  }

  console.log(
    "[VIDEO_CATALOG] Listing blocked, probing media files on Apache...",
  );
  return fetchApacheVideoCatalogByProbe();
}

function finalizeCatalog(
  rawList: NakamaVideoCatalogItem[],
): VideoCatalogEntry[] {
  const list: VideoCatalogEntry[] = [];
  const seenIds = new Set<string>();

  for (const item of rawList) {
    if (
      !item ||
      typeof item !== "object" ||
      item.id == null ||
      item.id === "" ||
      !item.videoUrl ||
      !item.imageUrl
    ) {
      console.log(
        "[VIDEO_CATALOG] Invalid entry skipped:",
        item?.folder || item?.name || item?.id || "unknown",
      );
      continue;
    }
    const idKey = String(item.id);
    if (seenIds.has(idKey)) continue;
    const mapped = mapVideoToCatalogEntry(item);
    if (!mapped) {
      console.log(
        "[VIDEO_CATALOG] Invalid entry skipped:",
        item.folder || item.name || item.id || "unknown",
      );
      continue;
    }
    seenIds.add(idKey);
    list.push(mapped);
  }

  list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  console.log(`[VIDEO_CATALOG] Loaded ${list.length} videos`);
  return list;
}

export async function fetchVideoCatalog(): Promise<VideoCatalogEntry[]> {
  console.log(
    `[VIDEO_CATALOG] Loading catalog via ${RPC_MEDIA_GET_VIDEO_CATALOG}...`,
  );
  try {
    const parsed = unwrapCatalogPayload(
      await callTvRpc<unknown>(RPC_MEDIA_GET_VIDEO_CATALOG, {}),
    );
    const rawList = extractVideosFromRpcPayload(parsed);
    if (rawList) {
      return normalizeCatalog(finalizeCatalog(rawList));
    }
    if (process.env.NODE_ENV === "development") {
      const shape =
        parsed && typeof parsed === "object"
          ? Object.keys(parsed as object).join(", ")
          : typeof parsed;
      console.warn(
        "[VIDEO_CATALOG] Nakama catalog unavailable, using Apache listing:",
        shape,
        parsed,
      );
    } else {
      console.warn(
        "[VIDEO_CATALOG] Nakama catalog unavailable, using Apache listing",
      );
    }
  } catch (error) {
    console.warn(
      "[VIDEO_CATALOG] Nakama RPC failed, using Apache listing",
      error,
    );
  }

  return fetchApacheVideoCatalog();
}

export function findVideoCatalogEntry(
  videos: VideoCatalogEntry[],
  videoId: string | number | null | undefined,
): VideoCatalogEntry | null {
  if (videoId == null || !videos.length) return null;
  const idStr = String(videoId);
  return videos.find((item) => item.id === idStr) ?? null;
}
