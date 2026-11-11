import type { VideoBufferPolicy } from "./deviceProfile";

export function bufferedSeconds(el: HTMLVideoElement): number {
  try {
    if (!el.buffered.length) return 0;
    return el.buffered.end(el.buffered.length - 1);
  } catch {
    return 0;
  }
}

/** Human-readable buffered ranges for debug logs. */
export function describeBufferedRanges(el: HTMLVideoElement): string[] {
  try {
    const ranges: string[] = [];
    for (let i = 0; i < el.buffered.length; i += 1) {
      ranges.push(`${el.buffered.start(i).toFixed(2)}-${el.buffered.end(i).toFixed(2)}s`);
    }
    return ranges;
  } catch {
    return [];
  }
}

export function bufferProgressPercent(el: HTMLVideoElement): number {
  try {
    const duration = el.duration;
    if (!duration || Number.isNaN(duration) || duration <= 0) return 0;
    const end = bufferedSeconds(el);
    return Math.min(100, Math.round((end / duration) * 100));
  } catch {
    return 0;
  }
}

export function requiredBufferSeconds(
  policy: VideoBufferPolicy,
  duration: number,
  legacyMode = false,
): number {
  if (legacyMode) return policy.minSeconds;
  const hasDuration = Number.isFinite(duration) && duration > 0;
  if (!hasDuration) return policy.minSeconds;
  return Math.max(policy.minSeconds, duration * policy.minRatio);
}

/** Loading progress toward tvReady, not download progress for the whole file. */
export function preloadProgressPercent(
  el: HTMLVideoElement,
  policy: VideoBufferPolicy,
  legacyMode = false,
): number {
  const required = requiredBufferSeconds(policy, el.duration, legacyMode);
  if (!Number.isFinite(required) || required <= 0) return 0;
  return Math.min(100, Math.round((bufferedSeconds(el) / required) * 100));
}

/**
 * True when enough playable data exists for tvReady.
 * Legacy TVs: do not wait for canplaythrough / HAVE_ENOUGH_DATA.
 */
export type VideoPreloadReadyOptions = {
  legacyMode?: boolean;
  /** Set when canplay/loadeddata fired — safe moov-at-end exception with buffer gate. */
  browserPlayableHint?: boolean;
};

export function isVideoPreloadReady(
  el: HTMLVideoElement,
  policy: VideoBufferPolicy,
  options?: VideoPreloadReadyOptions,
): boolean {
  if (el.error) return false;

  if (policy.legacyMetadataReady) {
    const duration = el.duration;
    return (
      el.readyState >= HTMLMediaElement.HAVE_METADATA &&
      Number.isFinite(duration) &&
      duration > 0
    );
  }

  const legacyMode = options?.legacyMode ?? false;
  const browserPlayableHint = options?.browserPlayableHint ?? false;
  const duration = el.duration;
  const buffered = bufferedSeconds(el);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const threshold = requiredBufferSeconds(policy, duration);

  if (legacyMode) {
    // Prefer actual playable states; never require full file or canplaythrough.
    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return buffered >= policy.minSeconds;
    }
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return buffered >= policy.minSeconds;
    }
    if (
      browserPlayableHint &&
      el.readyState >= HTMLMediaElement.HAVE_METADATA &&
      buffered >= policy.minSeconds
    ) {
      return true;
    }
    return false;
  }

  if (policy.requireCanPlayThrough && el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
    if (!hasDuration) return true;
    return buffered >= duration * policy.minRatio - 0.5;
  }

  if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
    if (!hasDuration) return true;
    if (buffered >= threshold) return true;
  }

  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    if (!hasDuration) return buffered >= policy.minSeconds;
    return buffered >= threshold;
  }

  if (el.readyState >= HTMLMediaElement.HAVE_METADATA && buffered >= policy.minSeconds) {
    return true;
  }

  return false;
}

/** Alias for preload gate — buffer must meet policy before tvReady. */
export function isBufferSufficientForPlay(
  el: HTMLVideoElement,
  policy: VideoBufferPolicy,
): boolean {
  return isVideoPreloadReady(el, policy);
}

export function assignVideoSource(
  el: HTMLVideoElement,
  url: string,
): boolean {
  if (!url) return false;
  const current = el.currentSrc || el.src;
  if (current === url) return false;
  try {
    if (current && new URL(current).href === new URL(url, current).href) {
      return false;
    }
  } catch {
    /* ignore URL parse errors */
  }
  el.pause();
  el.src = url;
  el.load();
  return true;
}

export function clearVideoSource(el: HTMLVideoElement): void {
  el.pause();
  el.removeAttribute("src");
  el.load();
}

/** Fully stops HTML5 playback — no audio bleed, no stale buffer reuse. */
export function hardStopVideo(el: HTMLVideoElement): void {
  try {
    el.playbackRate = 1;
    el.pause();
    el.muted = true;
    el.volume = 0;
    el.removeAttribute("src");
    el.load();
    el.blur();
  } catch {
    /* ignore TV browser quirks */
  }
}
