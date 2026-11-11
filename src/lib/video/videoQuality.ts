import type { VideoCatalogEntry } from "@/lib/nakama/mediaCatalog";
import type { VideoDeviceProfile, VideoQuality } from "./deviceProfile";

const QUALITY_ORDER: VideoQuality[] = ["1080", "720", "480"];

function insertBeforeExtension(url: string, suffix: string): string {
  const queryIndex = url.indexOf("?");
  const path = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  const query = queryIndex >= 0 ? url.slice(queryIndex) : "";
  const dot = path.lastIndexOf(".");
  if (dot <= path.lastIndexOf("/")) {
    return `${path}${suffix}${query}`;
  }
  return `${path.slice(0, dot)}${suffix}${path.slice(dot)}${query}`;
}

function subfolderVariant(url: string, quality: VideoQuality): string {
  try {
    const parsed = new URL(url, "http://local");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return url;
    const file = parts.pop()!;
    parts.push(quality, file);
    parsed.pathname = `/${parts.join("/")}`;
    if (/^https?:\/\//i.test(url)) {
      return parsed.href;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function deriveQualityUrl(baseUrl: string, quality: VideoQuality): string {
  if (!baseUrl) return baseUrl;
  if (quality === "1080") return baseUrl;
  const tagged = insertBeforeExtension(baseUrl, `_${quality}p`);
  if (tagged !== baseUrl) return tagged;
  return subfolderVariant(baseUrl, quality);
}

/** TV-safe variants: nested folder only (no flat _720p suffix that 404s on many servers). */
export function buildNestedQualityUrls(
  primaryUrl: string,
): Partial<Record<VideoQuality, string>> {
  const map: Partial<Record<VideoQuality, string>> = {};
  if (!primaryUrl) return map;
  for (const quality of ["720", "480"] as VideoQuality[]) {
    const nested = subfolderVariant(primaryUrl, quality);
    if (nested && nested !== primaryUrl) {
      map[quality] = nested;
    }
  }
  return map;
}

export function buildQualityUrlMap(
  primaryUrl: string,
  explicit?: Partial<Record<VideoQuality, string>>,
  options?: { allowDerived?: boolean },
): Partial<Record<VideoQuality, string>> {
  const map: Partial<Record<VideoQuality, string>> = { ...explicit };
  if (primaryUrl && !map["1080"]) {
    map["1080"] = primaryUrl;
  }
  if (options?.allowDerived === true) {
    for (const quality of QUALITY_ORDER) {
      if (!map[quality] && primaryUrl) {
        map[quality] = deriveQualityUrl(primaryUrl, quality);
      }
    }
  }
  return map;
}

export function isDerivedQualityUrl(
  baseUrl: string,
  candidateUrl: string,
): boolean {
  if (!baseUrl || !candidateUrl || candidateUrl === baseUrl) return false;
  return /_(720|480|1080)p\.(mp4|m4v|webm)(\?|$)/i.test(candidateUrl);
}

export function isCatalogQualityUrl(
  entry: VideoCatalogEntry,
  quality: VideoQuality,
  candidateUrl: string,
): boolean {
  if (quality === "1080" && candidateUrl === entry.url) return true;
  return entry.urls?.[quality] === candidateUrl;
}

export function resolveQualityCandidates(
  entry: VideoCatalogEntry,
  profile: VideoDeviceProfile,
): { quality: VideoQuality; url: string }[] {
  const map: Partial<Record<VideoQuality, string>> = {
    "1080": entry.url,
    ...entry.urls,
  };

  if (!profile.allowDerivedQualityFallback) {
    const seen = new Set<string>();
    const candidates: { quality: VideoQuality; url: string }[] = [];

    const add = (quality: VideoQuality, url: string | undefined) => {
      if (!url || seen.has(url)) return;
      if (
        quality !== "1080" &&
        isDerivedQualityUrl(entry.url, url) &&
        !isCatalogQualityUrl(entry, quality, url)
      ) {
        return;
      }
      seen.add(url);
      candidates.push({ quality, url });
    };

    const order = [
      profile.preferredQuality,
      ...profile.fallbackQualities,
      ...QUALITY_ORDER,
    ];
    for (const quality of order) {
      add(quality, map[quality]);
    }

    return candidates.length
      ? candidates
      : [{ quality: "1080", url: entry.url }];
  }

  const derivedMap = buildQualityUrlMap(entry.url, entry.urls, {
    allowDerived: true,
  });
  const ordered = [profile.preferredQuality, ...profile.fallbackQualities];
  const seen = new Set<string>();
  const candidates: { quality: VideoQuality; url: string }[] = [];

  for (const quality of ordered) {
    const url = derivedMap[quality];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    candidates.push({ quality, url });
  }

  for (const quality of QUALITY_ORDER) {
    const url = derivedMap[quality];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    candidates.push({ quality, url });
  }

  return candidates;
}

export function stablePlayUrl(
  url: string,
  options?: { bustCache?: boolean; videoId?: string },
): string {
  if (!url) return url;
  if (!options?.bustCache && !options?.videoId) return url;
  try {
    const parsed = new URL(url);
    if (options?.videoId) {
      parsed.searchParams.set("v", String(options.videoId));
    }
    if (options?.bustCache) {
      parsed.searchParams.set("t", String(Date.now()));
    }
    return parsed.href;
  } catch {
    const params = new URLSearchParams();
    if (options?.videoId) params.set("v", String(options.videoId));
    if (options?.bustCache) params.set("t", String(Date.now()));
    const query = params.toString();
    if (!query) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${query}`;
  }
}
