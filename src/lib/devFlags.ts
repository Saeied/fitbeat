/** Local dev: show song list without mobile pairing (test.env only). */
export function isDevBypassPairing(): boolean {
  return process.env.NEXT_PUBLIC_DEV_BYPASS_PAIRING === "1";
}
