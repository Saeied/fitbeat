"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  correctedServerTimeMs,
  reconcileClockForVideoSyncStart,
} from "@/lib/nakama/clockSync";
import { nakamaTimeouts } from "@/lib/nakama/config";
import {
  findServerVideoSyncStartNotification,
  parseVideoSyncStartContent,
} from "@/lib/nakama/gameplayParse";
import type { NotificationPayload } from "@/lib/nakama/types";
import { hardStopVideo } from "@/lib/video/videoPlayback";

export type VideoSyncPhase =
  | "idle"
  | "pending"
  | "reconciling"
  | "countdown"
  | "playing"
  | "aborted";

export type UseVideoSyncStartState = {
  phase: VideoSyncPhase;
  startAt: number | null;
  remainingMs: number;
  remainingSeconds: number;
  isPlaybackAllowed: () => boolean;
  errorMessage: string | null;
  reset: () => void;
};

type UseVideoSyncStartOptions = {
  tvReady: boolean;
  videoId: string | null;
  lastInbound: NotificationPayload[];
  getVideoElement: () => HTMLVideoElement | null;
};

type PendingStart = {
  startAt: number;
  payloadVideoId: string;
  key: string;
};

function inboundKey(notification: NotificationPayload): string {
  return `${notification.id ?? ""}:12:${notification.create_time ?? ""}`;
}

async function playVideoWithRetry(el: HTMLVideoElement): Promise<void> {
  try {
    await el.play();
  } catch {
    el.muted = true;
    await el.play();
  }
}

/**
 * Server VideoSyncStart (12) → countdown on corrected clock → play at startAt.
 * TV applyServerVideoSyncStartCountdown + startPlaybackAtServerTime.
 * Does not send VideoSyncStart. FrameSync starts from countdown via useFrameSync.
 */
export function useVideoSyncStart({
  tvReady,
  videoId,
  lastInbound,
  getVideoElement,
}: UseVideoSyncStartOptions): UseVideoSyncStartState {
  const [phase, setPhase] = useState<VideoSyncPhase>("idle");
  const [startAt, setStartAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  const videoIdRef = useRef(videoId);
  const tvReadyRef = useRef(tvReady);
  const startAtRef = useRef<number | null>(null);
  const videoStartedRef = useRef(false);
  const allowPlayRef = useRef(false);
  const pendingRef = useRef<PendingStart | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRef = useRef(false);

  phaseRef.current = phase;
  videoIdRef.current = videoId;
  tvReadyRef.current = tvReady;

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  const clearTimers = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    applyingRef.current = false;
    videoStartedRef.current = false;
    allowPlayRef.current = false;
    pendingRef.current = null;
    startAtRef.current = null;
    handledRef.current = new Set();
    const el = getVideoElement();
    if (el) hardStopVideo(el);
    setStartAt(null);
    setRemainingMs(0);
    setErrorMessage(null);
    setPhase("idle");
  }, [clearTimers, getVideoElement]);

  const tryStartPlayback = useCallback(async () => {
    if (videoStartedRef.current) return;
    const at = startAtRef.current;
    if (!at) return;
    const remaining = at - correctedServerTimeMs();
    if (remaining > nakamaTimeouts.syncPlaybackTriggerThresholdMs) return;

    const el = getVideoElement();
    if (!el) {
      console.log("[VIDEO_SYNC] playback blocked — player not ready");
      return;
    }

    videoStartedRef.current = true;
    allowPlayRef.current = true;
    clearTimers();
    const driftMs = correctedServerTimeMs() - at;
    console.log("[VIDEO_SYNC][PLAYBACK] drift", {
      driftMs,
      startAt: at,
      serverTime: correctedServerTimeMs(),
    });
    setRemainingMs(0);

    try {
      el.muted = false;
      el.volume = 1;
      await playVideoWithRetry(el);
      setPhase("playing");
      console.log("[VIDEO_SYNC][PLAYBACK] start", {
        videoId: videoIdRef.current,
        startAt: at,
        driftMs: correctedServerTimeMs() - at,
      });
    } catch (error) {
      videoStartedRef.current = false;
      allowPlayRef.current = false;
      setErrorMessage("پخش ویدیو شروع نشد");
      setPhase("aborted");
      console.log("[VIDEO_SYNC] playback play() failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [clearTimers, getVideoElement]);

  const beginCountdown = useCallback(
    (at: number) => {
      if (phaseRef.current === "countdown" || videoStartedRef.current) {
        console.log("[VIDEO_SYNC] START ignored — countdown already running", {
          videoId: videoIdRef.current,
        });
        return;
      }
      startAtRef.current = at;
      setStartAt(at);
      setErrorMessage(null);
      setPhase("countdown");
      setRemainingMs(at - correctedServerTimeMs());
      console.log("[VIDEO_SYNC][COUNTDOWN] start", {
        videoId: videoIdRef.current,
        startAt: at,
        remainingMs: at - correctedServerTimeMs(),
      });

      clearTimers();
      pollRef.current = setInterval(() => {
        const current = startAtRef.current;
        if (!current || videoStartedRef.current) return;
        const remaining = current - correctedServerTimeMs();
        setRemainingMs(remaining);
        if (remaining <= nakamaTimeouts.syncPlaybackTriggerThresholdMs) {
          void tryStartPlayback();
        }
      }, nakamaTimeouts.syncPlaybackCheckIntervalMs);

      watchdogRef.current = setTimeout(() => {
        if (videoStartedRef.current) return;
        console.log("[VIDEO_SYNC] countdown watchdog timeout", {
          ms: nakamaTimeouts.syncWatchdogTimeoutMs,
        });
        setErrorMessage(
          "شروع هم‌زمان دریافت نشد. به فهرست برگردید و دوباره انتخاب کنید.",
        );
        setPhase("aborted");
        clearTimers();
      }, nakamaTimeouts.syncWatchdogTimeoutMs);

      void tryStartPlayback();
    },
    [clearTimers, tryStartPlayback],
  );

  const applyStart = useCallback(
    async (at: number, payloadVideoId: string): Promise<boolean> => {
      if (!videoIdRef.current) {
        console.log("[VIDEO_SYNC] START ignored — no active video");
        return false;
      }
      if (applyingRef.current || videoStartedRef.current) return false;
      if (phaseRef.current === "countdown" || phaseRef.current === "playing") {
        return true;
      }
      if (
        payloadVideoId &&
        videoIdRef.current &&
        String(videoIdRef.current) !== String(payloadVideoId)
      ) {
        console.log("[VIDEO_SYNC] START ignored — videoId mismatch", {
          expected: videoIdRef.current,
          received: payloadVideoId,
        });
        return false;
      }
      if (!tvReadyRef.current) {
        pendingRef.current = {
          startAt: at,
          payloadVideoId,
          key: String(at),
        };
        setStartAt(at);
        setPhase("pending");
        console.log("[VIDEO_SYNC] START deferred — waiting for video playable", {
          videoId: videoIdRef.current,
        });
        return true;
      }

      applyingRef.current = true;

      console.log(
        "[VideoSync] VideoSyncStart received from server: videoId=" +
          String(payloadVideoId || videoIdRef.current || "") +
          " startAt=" +
          String(at) +
          " serverTimeNow=" +
          String(correctedServerTimeMs()) +
          " remainingMs=" +
          String(at - correctedServerTimeMs()),
      );
      beginCountdown(at);

      void (async () => {
        try {
          const { remainingMs: remaining } =
            await reconcileClockForVideoSyncStart(at);
          if (remaining < -nakamaTimeouts.syncStartCatchupMaxStaleMs) {
            if (
              videoStartedRef.current ||
              phaseRef.current === "countdown" ||
              phaseRef.current === "playing"
            ) {
              if (startAtRef.current === at) {
                setRemainingMs(at - correctedServerTimeMs());
              }
              return;
            }
            console.log("[VIDEO_SYNC] START aborted — startAt too far in the past", {
              startAt: at,
              remainingMs: remaining,
            });
            setErrorMessage(
              "شروع هم‌زمان دریافت نشد. به فهرست برگردید و دوباره انتخاب کنید.",
            );
            setPhase("aborted");
            clearTimers();
            return;
          }
          if (!videoStartedRef.current && startAtRef.current === at) {
            setRemainingMs(at - correctedServerTimeMs());
          }
        } catch (error) {
          console.log("[VIDEO_SYNC] background clock reconcile failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          applyingRef.current = false;
        }
      })();

      return true;
    },
    [beginCountdown, clearTimers],
  );

  useEffect(() => {
    const notification = findServerVideoSyncStartNotification(lastInbound);
    if (!notification) return;
    const key = inboundKey(notification);
    if (handledRef.current.has(key)) return;

    const parsed = parseVideoSyncStartContent(notification);
    if (!parsed) {
      console.log("[VIDEO_SYNC] VideoSyncStart rejected — missing startAt");
      return;
    }
    void applyStart(parsed.startAt, parsed.videoId).then((accepted) => {
      if (accepted) handledRef.current.add(key);
    });
  }, [lastInbound, applyStart]);

  useEffect(() => {
    if (!tvReady) return;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    console.log("[VIDEO_SYNC] START resuming — video playable", {
      videoId,
    });
    void applyStart(pending.startAt, pending.payloadVideoId);
  }, [tvReady, videoId, applyStart]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    phase,
    startAt,
    remainingMs,
    remainingSeconds,
    isPlaybackAllowed: () => allowPlayRef.current,
    errorMessage,
    reset,
  };
}
