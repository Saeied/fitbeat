/** Raster cover extensions served under /dance_Content (Apache static). */
const RASTER_EXT = /\.(png|jpe?g)$/i;

/**
 * Prefer sibling `.webp` on the media host (smaller than JPG/PNG for catalog covers).
 * Returns the original URL when it is already WebP or not a dance raster path.
 */
export function preferWebpCoverUrl(coverUrl: string): string {
  if (!coverUrl || /\.webp(\?|#|$)/i.test(coverUrl)) {
    return coverUrl;
  }
  try {
    const parsed = new URL(coverUrl);
    const nextPath = parsed.pathname.replace(RASTER_EXT, ".webp");
    if (nextPath === parsed.pathname) return coverUrl;
    parsed.pathname = nextPath;
    return parsed.href;
  } catch {
    const match = coverUrl.match(/^([^?#]+)(.*)$/);
    if (!match) return coverUrl;
    const nextPath = match[1].replace(RASTER_EXT, ".webp");
    if (nextPath === match[1]) return coverUrl;
    return `${nextPath}${match[2]}`;
  }
}

const WEBP_EXT = /\.webp(\?|#|$)/i;

/** Legacy raster fallback when `.webp` is missing on the media host. */
export function legacyRasterCoverFallback(coverUrl: string): string | null {
  if (!coverUrl || !WEBP_EXT.test(coverUrl)) return null;
  for (const ext of [".jpg", ".jpeg", ".png"]) {
    const candidate = coverUrl.replace(WEBP_EXT, `${ext}$1`);
    if (candidate !== coverUrl) return candidate;
  }
  return null;
}
