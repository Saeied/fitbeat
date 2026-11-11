/**
 * Nakama client config from env (swagger.yaml servers + server key).
 * Step 1: config only — auth/WS come in later steps.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const httpUrl = required(
  "NEXT_PUBLIC_NAKAMA_HTTP_URL",
  process.env.NEXT_PUBLIC_NAKAMA_HTTP_URL,
);
const wsUrl = required(
  "NEXT_PUBLIC_NAKAMA_WS_URL",
  process.env.NEXT_PUBLIC_NAKAMA_WS_URL,
);
const serverKey = required(
  "NEXT_PUBLIC_NAKAMA_SERVER_KEY",
  process.env.NEXT_PUBLIC_NAKAMA_SERVER_KEY,
);

function toBasicAuth(key: string): string {
  if (typeof btoa === "function") {
    return btoa(`${key}:`);
  }
  return Buffer.from(`${key}:`, "utf8").toString("base64");
}

function mediaHttpBaseFromNakamaHttpUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}`;
}

export const nakamaConfig = {
  httpUrl,
  wsUrl,
  serverKey,
  /** Basic auth for authenticate/device: base64(serverKey + ":") */
  serverKeyBasic: toBasicAuth(serverKey),
  /** Media files are on the Nakama host without the API port (TV getMediaHttpBase). */
  mediaHttpBase:
    process.env.NEXT_PUBLIC_NAKAMA_MEDIA_HTTP_URL ||
    mediaHttpBaseFromNakamaHttpUrl(httpUrl),
} as const;

export const nakamaTimeouts = {
  restMs: 15_000,
  socketMs: 10_000,
  qrPollMs: 3_000,
  /** REST fallback while preload / play-ready / countdown — zombie WS on legacy TV. */
  prepPollMs: 1_500,
  serverTimeIntervalMs: 30_000,
  partnerHeartbeatIntervalMs: 30_000,
  clockSyncIdleMs: 120_000,
  clockSyncPairedMs: 60_000,
  clockSyncGameplayMs: 120_000,
  clockSyncMaxRttMs: 350,
  frameSyncIntervalMs: 100,
  /** Default cap; per-tier timeout lives on VideoDeviceProfile.videoPreloadTimeoutMs */
  videoPreloadMs: 120_000,
  /** Legacy TV uses device-aware thresholds in useVideoPreload (see deviceProfile). */
  videoBufferMinRatio: 0.3,
  syncRetryMax: 3,
  syncRetryDelayMs: 400,
  unityReadyTimeoutMs: 30_000,
  syncWatchdogTimeoutMs: 45_000,
  syncPlaybackCheckIntervalMs: 25,
  syncPlaybackTriggerThresholdMs: 50,
  syncStartCatchupMaxStaleMs: 120_000,
  videoSyncStartCountdownMs: 10_000,
  loginCodeTtlMs: 5 * 60 * 1000,
} as const;
