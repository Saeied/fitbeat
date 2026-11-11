import { assetUrl } from "@/lib/assetUrl";
import { nakamaConfig } from "./config";

/** Mirrors Unity AvatarPublicUrlResolver + AvatarContentConstants. */
export const AVATAR_FILE_STEM = "Sticker Avatar Grid Collection_final_";
export const AVATAR_MIN_INDEX = 0;
export const AVATAR_MAX_INDEX = 44;
export const AVATAR_COUNT = 45;

/** Local SVG shipped under `public/svgs/`. */
export const DEFAULT_LINKED_PLAYER_AVATAR = assetUrl("/svgs/dance_pose.svg");

const SERVER_FS_ROOT = "/var/www/html";
const AVATAR_PATH_SEGMENT = "/dance_Content/avatars/";

function inIndexRange(index: number): boolean {
  return index >= AVATAR_MIN_INDEX && index <= AVATAR_MAX_INDEX;
}

export function getAvatarFileName(index: number): string {
  return `${AVATAR_FILE_STEM}${index}.png`;
}

/** Public HTTP URL for a catalog avatar index (uses configured media origin). */
export function getAvatarPublicUrl(index: number): string {
  if (!inIndexRange(index)) return "";
  const fileName = getAvatarFileName(index);
  const base = nakamaConfig.mediaHttpBase.replace(/\/$/, "");
  return `${base}${AVATAR_PATH_SEGMENT}${encodeURIComponent(fileName)}`;
}

export function tryGetIndexFromAddressableKey(key: string): number | null {
  const trimmed = key.trim();
  if (!/^avatar_/i.test(trimmed)) return null;
  const suffix = trimmed.slice(7);
  const index = Number.parseInt(suffix, 10);
  if (!Number.isFinite(index) || !inIndexRange(index)) return null;
  return index;
}

export function tryGetIndexFromFileName(fileName: string): number | null {
  const name = fileName.trim();
  if (!/\.png$/i.test(name)) return null;
  const withoutExt = name.slice(0, -4);
  if (!withoutExt.startsWith(AVATAR_FILE_STEM)) return null;
  const suffix = withoutExt.slice(AVATAR_FILE_STEM.length);
  const index = Number.parseInt(suffix, 10);
  if (!Number.isFinite(index) || !inIndexRange(index)) return null;
  return index;
}

export function tryGetIndexFromPublicUrl(url: string): number | null {
  const trimmed = url.trim();
  if (!trimmed.includes(AVATAR_PATH_SEGMENT)) return null;

  let pathPart: string | null = null;
  try {
    const parsed = new URL(trimmed);
    const idx = parsed.pathname.indexOf(AVATAR_PATH_SEGMENT);
    if (idx >= 0) {
      pathPart = parsed.pathname.slice(idx + AVATAR_PATH_SEGMENT.length);
    }
  } catch {
    const idx = trimmed.indexOf(AVATAR_PATH_SEGMENT);
    if (idx >= 0) {
      pathPart = trimmed.slice(idx + AVATAR_PATH_SEGMENT.length);
    }
  }

  if (!pathPart) return null;
  try {
    return tryGetIndexFromFileName(decodeURIComponent(pathPart));
  } catch {
    return tryGetIndexFromFileName(pathPart);
  }
}

/** Legacy numeric avatar ids are 1-based catalog numbers (1..45 → index 0..44). */
export function tryGetIndexFromLegacyAvatarId(avatarId: string): number | null {
  const trimmed = avatarId.trim();
  if (!trimmed) return null;

  const fromUrl = tryGetIndexFromPublicUrl(trimmed);
  if (fromUrl != null) return fromUrl;

  if (/^https?:\/\//i.test(trimmed)) return null;

  const fromKey = tryGetIndexFromAddressableKey(trimmed);
  if (fromKey != null) return fromKey;

  if (!/^\d+$/.test(trimmed)) return null;
  const legacy = Number.parseInt(trimmed, 10);
  if (legacy >= 1 && legacy <= AVATAR_COUNT) return legacy - 1;
  if (inIndexRange(legacy)) return legacy;
  return null;
}

/** Map server filesystem paths to the configured public content origin. */
export function resolveServerFilesystemAvatarPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith(SERVER_FS_ROOT)) return null;
  const suffix = trimmed.slice(SERVER_FS_ROOT.length);
  const normalized = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (!normalized.includes(AVATAR_PATH_SEGMENT)) return null;
  const base = nakamaConfig.mediaHttpBase.replace(/\/$/, "");
  return `${base}${normalized}`;
}

/**
 * Normalize absolute avatar URLs for browser fetch.
 * Static export has no Next rewrites — keep the remote content origin for http(s) URLs.
 */
export function normalizeAbsoluteAvatarUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const idx = parsed.pathname.indexOf(AVATAR_PATH_SEGMENT);
    if (idx < 0) return trimmed;

    const filePart = parsed.pathname.slice(idx + AVATAR_PATH_SEGMENT.length);
    let decoded: string;
    try {
      decoded = decodeURIComponent(filePart);
    } catch {
      decoded = filePart;
    }
    const encodedFile = encodeURIComponent(decoded);
    return `${parsed.protocol}//${parsed.host}${AVATAR_PATH_SEGMENT}${encodedFile}`;
  } catch {
    return trimmed;
  }
}

/** Relative `/dance_Content/avatars/...` paths for same-origin dev rewrites only. */
export function rewriteRelativeAvatarPathForDev(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) return trimmed;
  if (!trimmed.includes(AVATAR_PATH_SEGMENT)) return assetUrl(trimmed);
  return assetUrl(trimmed);
}

/**
 * Resolve avatarId from mobile profile to an img src.
 * Absolute URLs are never treated as bare numeric indices.
 */
export function resolveAvatarImageUrl(avatarId: string | null | undefined): string {
  if (!avatarId || !String(avatarId).trim()) {
    return DEFAULT_LINKED_PLAYER_AVATAR;
  }

  const trimmed = String(avatarId).trim();

  const fromFs = resolveServerFilesystemAvatarPath(trimmed);
  if (fromFs) return fromFs;

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeAbsoluteAvatarUrl(trimmed);
  }

  const index = tryGetIndexFromLegacyAvatarId(trimmed);
  if (index != null) {
    const publicUrl = getAvatarPublicUrl(index);
    return publicUrl || DEFAULT_LINKED_PLAYER_AVATAR;
  }

  if (trimmed.includes(AVATAR_PATH_SEGMENT)) {
    if (trimmed.startsWith("/")) {
      return rewriteRelativeAvatarPathForDev(trimmed);
    }
    return normalizeAbsoluteAvatarUrl(
      trimmed.startsWith("http") ? trimmed : `http://${trimmed}`,
    );
  }

  return DEFAULT_LINKED_PLAYER_AVATAR;
}

export type AvatarImageSourceKind = "none" | "fallback" | "catalog" | "absolute";

export function classifyAvatarImageSource(
  avatarId: string | null | undefined,
  resolvedUrl: string,
): AvatarImageSourceKind {
  if (!avatarId || !String(avatarId).trim()) return "none";
  const trimmed = String(avatarId).trim();
  if (resolvedUrl === DEFAULT_LINKED_PLAYER_AVATAR) return "fallback";
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith(SERVER_FS_ROOT) ||
    trimmed.includes(AVATAR_PATH_SEGMENT)
  ) {
    return "absolute";
  }
  return "catalog";
}

/** @deprecated Use getAvatarPublicUrl — kept for tests referencing legacy export name. */
export const AVATAR_PUBLIC_BASE_URL = `${nakamaConfig.mediaHttpBase.replace(/\/$/, "")}${AVATAR_PATH_SEGMENT}`;
