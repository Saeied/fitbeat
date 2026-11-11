"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoCatalogEntry } from "@/lib/nakama/mediaCatalog";
import {
  getVideoDeviceProfile,
  isVideoDebugEnabled,
  type VideoQuality,
} from "@/lib/video/deviceProfile";
import {
  registerTvVideoDiag,
  VideoDiagnostics,
} from "@/lib/video/videoDiagnostics";
import {
  assignVideoSource,
  bufferedSeconds,
  bufferProgressPercent,
  clearVideoSource,
  describeBufferedRanges,
  isVideoPreloadReady,
  preloadProgressPercent,
  requiredBufferSeconds,
} from "@/lib/video/videoPlayback";
import {
  resolveQualityCandidates,
  stablePlayUrl,
} from "@/lib/video/videoQuality";

export type VideoPreloadStatus = "idle" | "loading" | "ready" | "error";

export type UseVideoPreloadState = {
  status: VideoPreloadStatus;
  video: VideoCatalogEntry | null;
  playUrl: string | null;
  selectedQuality: VideoQuality | null;
  progress: number;
  bufferedSeconds: number;
  requiredBufferSeconds: number;
  errorMessage: string | null;
  tvReady: boolean;
  preloadMode: "none" | "metadata" | "auto";
  setVideoNode: (node: HTMLVideoElement | null) => void;
  getVideoElement: () => HTMLVideoElement | null;
  start: (entry: VideoCatalogEntry, options?: { bustCache?: boolean }) => void;
  reset: () => void;
};

type StartOptions = {
  bustCache?: boolean;
};

const PROGRESS_THROTTLE_MS = 400;
const PRELOAD_POLL_MS = 1000;
const BACKGROUND_BUFFER_UNTIL_PLAY_MS = PRELOAD_POLL_MS;
/** Legacy TV: nudge decode/buffer if progress stalls before minSeconds. */
const LEGACY_BUFFER_NUDGE_MS = 4000;

function videoLog(message: string, data?: Record<string, unknown>): void {
  if (!isVideoDebugEnabled()) return;
  if (data) console.log(message, data);
  else console.log(message);
}

function preloadSnapshot(el: HTMLVideoElement) {
  const duration = Number.isFinite(el.duration) ? el.duration : null;
  return {
    readyState: el.readyState,
    networkState: el.networkState,
    duration,
    bufferedSeconds: bufferedSeconds(el),
    bufferedRanges: describeBufferedRanges(el),
    bufferPercent: bufferProgressPercent(el),
  };
}

/**
 * TV prepareVideoForSync — single overlay video for preload + playback (buffer preserved).
 */
export function useVideoPreload(): UseVideoPreloadState {
  const profile = useMemo(() => getVideoDeviceProfile(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const generationRef = useRef(0);
  const diagnosticsRef = useRef<VideoDiagnostics | null>(null);
  const lastProgressAtRef = useRef(0);
  const statusRef = useRef<VideoPreloadStatus>("idle");
  const videoRefState = useRef<VideoCatalogEntry | null>(null);
  const playUrlRef = useRef<string | null>(null);
  const selectedQualityRef = useRef<VideoQuality | null>(null);
  const errorMessageRef = useRef<string | null>(null);
  const [elementReady, setElementReady] = useState(false);

  const [status, setStatus] = useState<VideoPreloadStatus>("idle");
  const [video, setVideo] = useState<VideoCatalogEntry | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(
    null,
  );
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [requiredBuffer, setRequiredBuffer] = useState(
    profile.buffer.minSeconds,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
    videoRefState.current = video;
    playUrlRef.current = playUrl;
    selectedQualityRef.current = selectedQuality;
    errorMessageRef.current = errorMessage;
  }, [status, video, playUrl, selectedQuality, errorMessage]);

  useEffect(() => {
    return registerTvVideoDiag(() => {
      const el = videoRef.current;
      const duration = el && Number.isFinite(el.duration) ? el.duration : null;
      return {
        phase: statusRef.current,
        element: "single",
        url: playUrlRef.current,
        videoId: videoRefState.current?.id ?? null,
        quality: selectedQualityRef.current,
        profile: getVideoDeviceProfile(),
        readyState: el?.readyState ?? null,
        duration,
        bufferedSeconds: el ? bufferedSeconds(el) : null,
        bufferPercent: el ? bufferProgressPercent(el) : null,
        lastError: el?.error?.code ?? null,
        errorMessage: errorMessageRef.current,
      };
    });
  }, []);

  const setVideoNode = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setElementReady(Boolean(node));
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    diagnosticsRef.current?.dispose();
    diagnosticsRef.current = null;
    const el = videoRef.current;
    if (el) clearVideoSource(el);
    setVideo(null);
    setPlayUrl(null);
    setSelectedQuality(null);
    setProgress(0);
    setBuffered(0);
    setRequiredBuffer(profile.buffer.minSeconds);
    setErrorMessage(null);
    setStatus("idle");
  }, [profile.buffer.minSeconds]);

  const start = useCallback((entry: VideoCatalogEntry, options?: StartOptions) => {
    generationRef.current += 1;
    const el = videoRef.current;
    if (el) clearVideoSource(el);
    const candidates = resolveQualityCandidates(entry, profile);
    const picked = candidates[0];
    if (!picked) {
      setStatus("error");
      setErrorMessage("آدرس ویدیو موجود نیست");
      return;
    }

    const nextUrl = stablePlayUrl(picked.url, {
      bustCache: options?.bustCache,
      videoId: entry.id,
    });

    setVideo(entry);
    setPlayUrl(nextUrl);
    setSelectedQuality(picked.quality);
    setProgress(0);
    setBuffered(0);
    setRequiredBuffer(profile.buffer.minSeconds);
    setErrorMessage(null);
    setStatus("loading");

    videoLog("[VIDEO_PRELOAD] start", {
      videoId: entry.id,
      quality: picked.quality,
      tier: profile.tier,
      legacyMode: profile.legacyMode,
      url: nextUrl,
    });
  }, [profile]);

  useEffect(() => {
    if (status !== "loading" || !video || !playUrl || !selectedQuality) return;
    const el = videoRef.current;
    if (!el || !elementReady) return;

    const generation = generationRef.current;
    const candidates = resolveQualityCandidates(video, profile);
    let candidateIndex = candidates.findIndex(
      (item) =>
        item.quality === selectedQuality &&
        stablePlayUrl(item.url) === stablePlayUrl(playUrl),
    );
    if (candidateIndex < 0) {
      candidateIndex = candidates.findIndex(
        (item) => item.quality === selectedQuality,
      );
    }
    if (candidateIndex < 0) candidateIndex = 0;

    el.preload = "auto";
    el.muted = true;
    assignVideoSource(el, playUrl);

    let browserPlayableHint = false;
    const readyOptions = () => ({
      legacyMode: profile.legacyMode,
      browserPlayableHint,
    });
    const pollMs = profile.legacyMode ? 500 : PRELOAD_POLL_MS;
    let lastBuffered = bufferedSeconds(el);
    let lastBufferedChangeAt = performance.now();
    let stallProceeded = false;
    let stallQualityFallbackAttempted = false;
    let bufferNudgeAttempted = false;
    const preloadStartedAt = performance.now();

    diagnosticsRef.current?.dispose();
    diagnosticsRef.current = new VideoDiagnostics(el, {
      videoId: video.id,
      quality: selectedQuality,
      url: playUrl,
    });
    diagnosticsRef.current.attach();

    const finishReady = (reason: string) => {
      if (generation !== generationRef.current) return;
      if (!isVideoPreloadReady(el, profile.buffer, readyOptions())) return;
      setProgress(bufferProgressPercent(el));
      setStatus("ready");
      diagnosticsRef.current?.logReady("preload-ready");
      videoLog("[VIDEO_PRELOAD] READY", {
        videoId: video.id,
        quality: selectedQuality,
        url: playUrl,
        reason,
        ...preloadSnapshot(el),
      });
    };

    const finishReadyStalled = (reason: string) => {
      if (generation !== generationRef.current || stallProceeded) return;
      const buf = bufferedSeconds(el);
      const minBuf = profile.preloadStallMinBufferSeconds;
      const playable =
        el.readyState >= HTMLMediaElement.HAVE_METADATA &&
        el.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE;
      if (!playable || buf < minBuf) return;
      stallProceeded = true;
      setProgress(bufferProgressPercent(el));
      setStatus("ready");
      diagnosticsRef.current?.logReady("preload-stall-proceed");
      videoLog("[VIDEO_PRELOAD] READY (stall fallback)", {
        videoId: video.id,
        quality: selectedQuality,
        reason,
        stallState: {
          stalledMs: Math.round(performance.now() - lastBufferedChangeAt),
          minBufferSeconds: minBuf,
        },
        ...preloadSnapshot(el),
      });
    };

    const syncBufferedProgress = () => {
      if (generation !== generationRef.current) return;
      const buf = bufferedSeconds(el);
      const required = requiredBufferSeconds(
        profile.buffer,
        el.duration,
        profile.legacyMode,
      );
      const now = performance.now();
      if (buf > lastBuffered + 0.05) {
        lastBuffered = buf;
        lastBufferedChangeAt = now;
      }
      setBuffered(buf);
      setRequiredBuffer(required);
      setProgress(preloadProgressPercent(el, profile.buffer, profile.legacyMode));
      if (statusRef.current !== "loading") return;

      if (isVideoPreloadReady(el, profile.buffer, readyOptions())) {
        finishReady("buffer-threshold");
        return;
      }

      const stalledMs = now - lastBufferedChangeAt;
      if (
        profile.tier !== "desktop" &&
        !stallQualityFallbackAttempted &&
        buf < 0.5 &&
        stalledMs >= profile.preloadStallProceedMs
      ) {
        stallQualityFallbackAttempted = true;
        if (tryNextQuality()) return;
      }

      if (
        profile.legacyMode &&
        !bufferNudgeAttempted &&
        buf < profile.buffer.minSeconds &&
        now - preloadStartedAt >= LEGACY_BUFFER_NUDGE_MS &&
        stalledMs >= LEGACY_BUFFER_NUDGE_MS
      ) {
        bufferNudgeAttempted = true;
        el.muted = true;
        void el
          .play()
          .then(() => {
            if (generation !== generationRef.current) return;
            el.pause();
            try {
              if (el.currentTime > 0.05) el.currentTime = 0;
            } catch {
              /* metadata not ready */
            }
            syncBufferedProgress();
          })
          .catch(() => {
            /* autoplay policy or decode not ready yet */
          });
      }

      if (
        profile.legacyMode &&
        !stallProceeded &&
        stalledMs >= profile.preloadStallProceedMs
      ) {
        finishReadyStalled("stall-timeout");
      }
    };

    const updateProgress = () => {
      if (generation !== generationRef.current) return;
      const now = performance.now();
      if (now - lastProgressAtRef.current < PROGRESS_THROTTLE_MS) return;
      lastProgressAtRef.current = now;
      syncBufferedProgress();
    };

    const tryNextQuality = () => {
      if (generation !== generationRef.current) return false;
      const nextIndex = candidateIndex + 1;
      if (nextIndex >= candidates.length) return false;
      const next = candidates[nextIndex];
      candidateIndex = nextIndex;
      diagnosticsRef.current?.logError("quality-fallback", {
        nextQuality: next.quality,
        nextUrl: next.url,
      });
      setSelectedQuality(next.quality);
      setPlayUrl(stablePlayUrl(next.url));
      setProgress(0);
      setBuffered(0);
      setRequiredBuffer(profile.buffer.minSeconds);
      setErrorMessage(null);
      videoLog("[VIDEO_PRELOAD] quality fallback", {
        videoId: video.id,
        quality: next.quality,
        url: next.url,
      });
      return true;
    };

    const onError = () => {
      if (generation !== generationRef.current) return;
      diagnosticsRef.current?.logError("preload-error");
      if (tryNextQuality()) return;
      setStatus("error");
      setErrorMessage("بارگذاری ویدیو ناموفق بود");
      videoLog("[VIDEO_PRELOAD] error", {
        videoId: video.id,
        quality: selectedQuality,
        url: playUrl,
        mediaError: el.error?.code ?? null,
        ...preloadSnapshot(el),
      });
    };

    const onProgress = () => updateProgress();
    const onLoadedMeta = () => {
      videoLog("[VIDEO_PRELOAD] loadedmetadata", {
        videoId: video.id,
        ...preloadSnapshot(el),
      });
      syncBufferedProgress();
    };
    const markBrowserPlayable = () => {
      browserPlayableHint = true;
    };

    const onBufferEvent = (event: Event) => {
      if (event.type === "canplay" || event.type === "loadeddata") {
        markBrowserPlayable();
      }
      if (isVideoDebugEnabled() && event.type !== "progress") {
        videoLog(`[VIDEO_PRELOAD] ${event.type}`, {
          videoId: video.id,
          ...preloadSnapshot(el),
        });
      }
      syncBufferedProgress();
    };
    const onTimeUpdate = () => updateProgress();
    const onWaiting = () => syncBufferedProgress();

    el.addEventListener("canplay", onBufferEvent);
    el.addEventListener("canplaythrough", onBufferEvent);
    el.addEventListener("progress", onProgress);
    el.addEventListener("loadeddata", onBufferEvent);
    el.addEventListener("loadedmetadata", onLoadedMeta);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("error", onError);
    el.addEventListener("stalled", onBufferEvent);

    try {
      el.pause();
      if (el.currentTime > 0.05) {
        el.currentTime = 0;
      }
    } catch {
      /* metadata not ready */
    }

    if (isVideoPreloadReady(el, profile.buffer, readyOptions())) {
      finishReady("initial");
    }

    const poll = setInterval(() => syncBufferedProgress(), pollMs);

    const timeoutMs = profile.videoPreloadTimeoutMs;
    const timer = setTimeout(() => {
      if (generation !== generationRef.current) return;
      if (isVideoPreloadReady(el, profile.buffer, readyOptions())) {
        finishReady("timeout-threshold");
        return;
      }
      if (profile.tier !== "desktop") {
        finishReadyStalled("timeout-fallback");
        if (statusRef.current === "ready") return;
      }
      if (tryNextQuality()) return;
      setStatus("error");
      setErrorMessage("زمان بارگذاری ویدیو تمام شد");
      diagnosticsRef.current?.logError("preload-timeout", {
        readyState: el.readyState,
        bufferPercent: bufferProgressPercent(el),
      });
      videoLog("[VIDEO_PRELOAD] timeout", {
        videoId: video.id,
        quality: selectedQuality,
        timeoutMs,
        ...preloadSnapshot(el),
      });
    }, timeoutMs);

    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      el.removeEventListener("canplay", onBufferEvent);
      el.removeEventListener("canplaythrough", onBufferEvent);
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("loadeddata", onBufferEvent);
      el.removeEventListener("loadedmetadata", onLoadedMeta);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("error", onError);
      el.removeEventListener("stalled", onBufferEvent);
      diagnosticsRef.current?.dispose();
      diagnosticsRef.current = null;
    };
  }, [status, video, playUrl, selectedQuality, elementReady, profile]);

  /** Keep buffering after tvReady while waiting for Unity/countdown. */
  useEffect(() => {
    if (status !== "ready") return;
    const el = videoRef.current;
    if (!el) return;
    el.preload = "auto";
    el.muted = true;
    const tick = () => {
      if (!el.paused && !el.ended) return;
      const pct = bufferProgressPercent(el);
      if (pct > 0) setProgress(pct);
    };
    tick();
    const poll = setInterval(tick, BACKGROUND_BUFFER_UNTIL_PLAY_MS);
    return () => clearInterval(poll);
  }, [status, elementReady, profile.preload]);

  return {
    status,
    video,
    playUrl,
    selectedQuality,
    progress,
    bufferedSeconds: buffered,
    requiredBufferSeconds: requiredBuffer,
    errorMessage,
    tvReady: status === "ready",
    preloadMode: status === "idle" ? profile.preload : "auto",
    setVideoNode,
    getVideoElement: () => videoRef.current,
    start,
    reset,
  };
}
