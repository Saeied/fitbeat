const warmedUrls = new Set<string>();

/** Fire-and-forget decode into the browser image cache (deduped per URL). */
export function preloadImage(url: string): void {
  if (!url || typeof Image === "undefined" || warmedUrls.has(url)) return;
  warmedUrls.add(url);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
}
