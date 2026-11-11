import { isVideoDebugEnabled } from "./deviceProfile";
import { bufferProgressPercent, bufferedSeconds } from "./videoPlayback";

export type VideoDiagnosticsSnapshot = {
  videoId: string | null;
  quality: string | null;
  url: string | null;
  startedAt: number;
  metadataAt: number | null;
  canPlayAt: number | null;
  readyAt: number | null;
  firstFrameAt: number | null;
  stallCount: number;
  errorCode: number | null;
  readyState: number;
  bufferPercent: number;
  bufferedSeconds: number;
  durationSeconds: number;
};

export type TvVideoDiagSnapshot = {
  phase: string;
  element: string;
  url: string | null;
  videoId: string | null;
  quality: string | null;
  profile: ReturnType<
    typeof import("./deviceProfile").getVideoDeviceProfile
  > | null;
  readyState: number | null;
  duration: number | null;
  bufferedSeconds: number | null;
  bufferPercent: number | null;
  lastError: number | null;
  errorMessage: string | null;
};

type VideoDiagnosticsOptions = {
  videoId: string | null;
  quality: string | null;
  url: string | null;
  onStall?: () => void;
};

let tvDiagProvider: (() => TvVideoDiagSnapshot) | null = null;

declare global {
  interface Window {
    TV_VIDEO_DIAG?: () => TvVideoDiagSnapshot;
  }
}

export function registerTvVideoDiag(
  provider: () => TvVideoDiagSnapshot,
): () => void {
  tvDiagProvider = provider;
  if (typeof window !== "undefined") {
    window.TV_VIDEO_DIAG = () =>
      tvDiagProvider?.() ?? {
        phase: "idle",
        element: "none",
        url: null,
        videoId: null,
        quality: null,
        profile: null,
        readyState: null,
        duration: null,
        bufferedSeconds: null,
        bufferPercent: null,
        lastError: null,
        errorMessage: null,
      };
  }
  return () => {
    tvDiagProvider = null;
    if (typeof window !== "undefined") {
      delete window.TV_VIDEO_DIAG;
    }
  };
}

export class VideoDiagnostics {
  private readonly debug = isVideoDebugEnabled();
  private readonly startedAt = performance.now();
  private metadataAt: number | null = null;
  private canPlayAt: number | null = null;
  private readyAt: number | null = null;
  private firstFrameAt: number | null = null;
  private stallCount = 0;
  private errorCode: number | null = null;
  private disposed = false;
  private handlers: Array<{ type: string; fn: EventListener }> = [];

  constructor(
    private readonly el: HTMLVideoElement,
    private readonly options: VideoDiagnosticsOptions,
  ) {}

  attach(): void {
    const add = (type: string, fn: EventListener) => {
      this.el.addEventListener(type, fn);
      this.handlers.push({ type, fn });
    };

    add("loadedmetadata", () => {
      if (this.metadataAt == null) this.metadataAt = performance.now();
    });
    add("canplay", () => {
      if (this.canPlayAt == null) this.canPlayAt = performance.now();
    });
    add("canplaythrough", () => {
      if (this.readyAt == null) this.readyAt = performance.now();
    });
    add("playing", () => {
      if (this.firstFrameAt == null) this.firstFrameAt = performance.now();
    });
    add("waiting", () => {
      this.stallCount += 1;
      this.options.onStall?.();
    });
    add("stalled", () => {
      this.stallCount += 1;
    });
    add("error", () => {
      this.errorCode = this.el.error?.code ?? -1;
    });
  }

  snapshot(): VideoDiagnosticsSnapshot {
    const duration = Number.isFinite(this.el.duration) ? this.el.duration : 0;
    return {
      videoId: this.options.videoId,
      quality: this.options.quality,
      url: this.options.url,
      startedAt: this.startedAt,
      metadataAt: this.metadataAt,
      canPlayAt: this.canPlayAt,
      readyAt: this.readyAt,
      firstFrameAt: this.firstFrameAt,
      stallCount: this.stallCount,
      errorCode: this.errorCode,
      readyState: this.el.readyState,
      bufferPercent: bufferProgressPercent(this.el),
      bufferedSeconds: bufferedSeconds(this.el),
      durationSeconds: duration,
    };
  }

  logReady(label: string): void {
    if (!this.debug) return;
    const snap = this.snapshot();
    console.log(`[VIDEO_DIAG] ${label}`, {
      videoId: snap.videoId,
      quality: snap.quality,
      metadataMs: snap.metadataAt != null ? Math.round(snap.metadataAt - snap.startedAt) : null,
      canPlayMs: snap.canPlayAt != null ? Math.round(snap.canPlayAt - snap.startedAt) : null,
      readyMs: snap.readyAt != null ? Math.round(snap.readyAt - snap.startedAt) : null,
      bufferPercent: snap.bufferPercent,
      bufferedSeconds: Number(snap.bufferedSeconds.toFixed(2)),
      stalls: snap.stallCount,
    });
  }

  logError(label: string, extra?: Record<string, unknown>): void {
    if (!this.debug) return;
    const snap = this.snapshot();
    console.log(`[VIDEO_DIAG] ${label}`, {
      videoId: snap.videoId,
      quality: snap.quality,
      errorCode: snap.errorCode,
      readyState: snap.readyState,
      ...extra,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { type, fn } of this.handlers) {
      this.el.removeEventListener(type, fn);
    }
    this.handlers = [];
  }
}
