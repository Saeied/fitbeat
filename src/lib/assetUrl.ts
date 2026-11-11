/** Public asset path with NEXT_PUBLIC_BASE_PATH (e.g. /dc/dancer-qr.png). */
export function assetUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
