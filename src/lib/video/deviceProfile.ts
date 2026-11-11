export type VideoDeviceTier = "desktop" | "modernTv" | "legacyTv";

export type VideoQuality = "1080" | "720" | "480";

export type VideoBufferPolicy = {
  minRatio: number;
  minSeconds: number;
  requireCanPlayThrough: boolean;
  /** @deprecated Do not use — TV needs real buffer before tvReady */
  legacyMetadataReady?: boolean;
};

export type FrameSyncDriftPolicy = {
  smallDriftThresholdMs: number;
  largeDriftThresholdMs: number;
  driftCorrectionIntervalMs: number;
  slowPlaybackSpeed: number;
  fastPlaybackSpeed: number;
  allowSeekOnLargeDrift: boolean;
};

export type VideoDeviceProfile = {
  tier: VideoDeviceTier;
  preferredQuality: VideoQuality;
  fallbackQualities: VideoQuality[];
  preload: "none" | "metadata" | "auto";
  buffer: VideoBufferPolicy;
  frameSync: FrameSyncDriftPolicy;
  legacyMode: boolean;
  allowDerivedQualityFallback: boolean;
  videoPreloadTimeoutMs: number;
  /** Legacy stall proceed — wait then accept partial buffer (ms). */
  preloadStallProceedMs: number;
  preloadStallMinBufferSeconds: number;
};

const DESKTOP_FRAME_SYNC: FrameSyncDriftPolicy = {
  smallDriftThresholdMs: 40,
  largeDriftThresholdMs: 200,
  driftCorrectionIntervalMs: 250,
  slowPlaybackSpeed: 0.995,
  fastPlaybackSpeed: 1.005,
  allowSeekOnLargeDrift: true,
};

const TV_FRAME_SYNC: FrameSyncDriftPolicy = {
  smallDriftThresholdMs: 120,
  largeDriftThresholdMs: 600,
  driftCorrectionIntervalMs: 500,
  slowPlaybackSpeed: 0.998,
  fastPlaybackSpeed: 1.002,
  allowSeekOnLargeDrift: false,
};

function readEnvTier(): VideoDeviceTier | null {
  const raw = process.env.NEXT_PUBLIC_VIDEO_DEVICE_TIER?.toLowerCase();
  if (raw === "legacy" || raw === "legacytv") return "legacyTv";
  if (raw === "modern" || raw === "moderntv" || raw === "tv") return "modernTv";
  if (raw === "desktop") return "desktop";
  return null;
}

function readEnvQuality(): VideoQuality | null {
  const raw = process.env.NEXT_PUBLIC_VIDEO_QUALITY?.trim();
  if (raw === "1080" || raw === "720" || raw === "480") return raw;
  return null;
}

/** Optional env override for preload buffer gate (does not change video URLs or sync). */
function readEnvBufferMinSeconds(fallback: number): number {
  const raw = process.env.NEXT_PUBLIC_VIDEO_BUFFER_MIN_SECONDS?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readEnvBufferMinRatio(fallback: number): number {
  const raw = process.env.NEXT_PUBLIC_VIDEO_BUFFER_MIN_RATIO?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
}

function readEnvPreloadStallMs(fallback: number): number {
  const raw = process.env.NEXT_PUBLIC_VIDEO_PRELOAD_STALL_MS?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1000 ? n : fallback;
}

function readEnvPreloadStallMinSeconds(fallback: number): number {
  const raw = process.env.NEXT_PUBLIC_VIDEO_PRELOAD_STALL_MIN_SECONDS?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function tvBufferPolicy(defaultSeconds: number, defaultRatio: number): VideoBufferPolicy {
  return {
    minSeconds: readEnvBufferMinSeconds(defaultSeconds),
    minRatio: readEnvBufferMinRatio(defaultRatio),
    requireCanPlayThrough: false,
  };
}

function uaHint(): VideoDeviceTier | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  if (
    /smart-tv|smarttv|tizen|webos|web0s|netcast|viera|bravia|philips|hisense|roku|crkey|googletv|android tv|aft[a-z0-9]|shield/i.test(
      ua,
    )
  ) {
    if (
      /tizen [1-4]\.|web0s\/[1-4]|netcast|viera|bravia.*chrome\/[1-5][0-9]/i.test(
        navigator.userAgent,
      )
    ) {
      return "legacyTv";
    }
    return "modernTv";
  }
  if (/android.*(tv|settop|box)|google tv/i.test(ua)) {
    return "modernTv";
  }
  return null;
}

function canPlayH264Baseline(): boolean {
  if (typeof document === "undefined") return true;
  const video = document.createElement("video");
  const avc =
    video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') ||
    video.canPlayType('video/mp4; codecs="avc1.4D401E, mp4a.40.2"');
  return avc === "probably" || avc === "maybe";
}

function hasMediaSource(): boolean {
  return typeof window !== "undefined" && "MediaSource" in window;
}

function hardwareScore(): number {
  if (typeof navigator === "undefined") return 2;
  let score = 0;
  const cores = navigator.hardwareConcurrency ?? 0;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (cores >= 4) score += 1;
  if (cores >= 8) score += 1;
  if (memory != null && memory >= 2) score += 1;
  if (memory != null && memory >= 4) score += 1;
  if (hasMediaSource()) score += 1;
  if (canPlayH264Baseline()) score += 1;
  return score;
}

function detectTier(): VideoDeviceTier {
  const forced = readEnvTier();
  if (forced) return forced;

  const hinted = uaHint();
  const score = hardwareScore();

  if (hinted === "legacyTv" || score <= 2) return "legacyTv";
  if (hinted === "modernTv" || score <= 4) return "modernTv";
  return "desktop";
}

function profileForTier(tier: VideoDeviceTier): VideoDeviceProfile {
  const forcedQuality = readEnvQuality();

  if (tier === "legacyTv") {
    const preferred = forcedQuality ?? "1080";
    return {
      tier,
      preferredQuality: preferred,
      fallbackQualities: ["720", "480"] as VideoQuality[],
      preload: "auto",
      frameSync: TV_FRAME_SYNC,
      legacyMode: true,
      allowDerivedQualityFallback: false,
      videoPreloadTimeoutMs: 90_000,
      preloadStallProceedMs: readEnvPreloadStallMs(12_000),
      preloadStallMinBufferSeconds: readEnvPreloadStallMinSeconds(5),
      buffer: tvBufferPolicy(5, 0.05),
    };
  }

  if (tier === "modernTv") {
    const preferred = forcedQuality ?? "1080";
    return {
      tier,
      preferredQuality: preferred,
      fallbackQualities: ["720", "480"] as VideoQuality[],
      preload: "metadata",
      frameSync: TV_FRAME_SYNC,
      legacyMode: false,
      allowDerivedQualityFallback: false,
      videoPreloadTimeoutMs: 90_000,
      preloadStallProceedMs: readEnvPreloadStallMs(20_000),
      preloadStallMinBufferSeconds: readEnvPreloadStallMinSeconds(5),
      buffer: tvBufferPolicy(10, 0.12),
    };
  }

  const preferred = forcedQuality ?? "1080";
  return {
    tier,
    preferredQuality: preferred,
    fallbackQualities: ["1080", "720", "480"].filter(
      (q) => q !== preferred,
    ) as VideoQuality[],
    preload: "metadata",
    frameSync: DESKTOP_FRAME_SYNC,
    legacyMode: false,
    allowDerivedQualityFallback: true,
    videoPreloadTimeoutMs: 120_000,
    preloadStallProceedMs: readEnvPreloadStallMs(20_000),
    preloadStallMinBufferSeconds: readEnvPreloadStallMinSeconds(5),
    buffer: {
      minRatio: readEnvBufferMinRatio(0.3),
      minSeconds: readEnvBufferMinSeconds(8),
      requireCanPlayThrough: false,
    },
  };
}

let cachedProfile: VideoDeviceProfile | null = null;

export function getVideoDeviceProfile(): VideoDeviceProfile {
  if (!cachedProfile) {
    cachedProfile = profileForTier(detectTier());
  }
  return cachedProfile;
}

export function isVideoDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_VIDEO_DEBUG === "1"
  );
}

export type NakamaSocketTiming = {
  connectTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
};

const DESKTOP_SOCKET_TIMING: NakamaSocketTiming = {
  connectTimeoutMs: 10_000,
  heartbeatIntervalMs: 10_000,
  heartbeatTimeoutMs: 10_000,
};

const TV_SOCKET_TIMING: NakamaSocketTiming = {
  connectTimeoutMs: 30_000,
  heartbeatIntervalMs: 15_000,
  // Low-end TV main threads can pause for tens of seconds while the decoder starts.
  heartbeatTimeoutMs: 60_000,
};

/** Nakama WebSocket connect + app-level ping/pong — TV browsers need longer timeouts. */
export function getNakamaSocketTiming(): NakamaSocketTiming {
  if (typeof window === "undefined") {
    return DESKTOP_SOCKET_TIMING;
  }

  const tier = getVideoDeviceProfile().tier;
  if (tier === "legacyTv" || tier === "modernTv") {
    return TV_SOCKET_TIMING;
  }

  return DESKTOP_SOCKET_TIMING;
}
