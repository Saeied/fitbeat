"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nakamaTimeouts } from "@/lib/nakama/config";
import {
  findServerVideoSyncStartNotification,
  findVideoUnityReadyNotification,
  findWaitingForVideoPlayReadyNotification,
  getNotificationPlayerCount,
  getNotificationVideoId,
} from "@/lib/nakama/gameplayParse";
import {
  sendVideoTvReadyWithRetry,
  sendWaitingForVideoPlayReady,
} from "@/lib/nakama/sessionNotifications";
import type { NotificationPayload } from "@/lib/nakama/types";

export type PlayReadyPhase =
  | "idle"
  | "announcing"
  | "picking"
  | "confirming"
  | "waiting"
  | "unityReady"
  | "syncStartReceived"
  | "aborted";

export type UsePlayReadyState = {
  phase: PlayReadyPhase;
  playerCount: 1 | 2 | null;
  errorMessage: string | null;
  confirm: (count: 1 | 2) => void;
  reset: () => void;
};

type UsePlayReadyOptions = {
  tvReady: boolean;
  videoId: string | null;
  lastInbound: NotificationPayload[];
};

function inboundKey(notification: NotificationPayload, extra: string): string {
  return `${notification.id ?? ""}:${extra}:${notification.create_time ?? ""}`;
}

/**
 * After buffer: send VideoTvReady (10), show 1/2 picker, then wait for Unity.
 * Does not start playback. Code 11 only sets unityReady. Code 12 only cancels the watchdog.
 */
export function usePlayReady({
  tvReady,
  videoId,
  lastInbound,
}: UsePlayReadyOptions): UsePlayReadyState {
  const [phase, setPhase] = useState<PlayReadyPhase>("idle");
  const [playerCount, setPlayerCount] = useState<1 | 2 | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  const videoIdRef = useRef(videoId);
  const pendingCountRef = useRef<1 | 2 | null>(null);
  const unityReadyRef = useRef(false);
  const syncStartRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const begunVideoIdRef = useRef<string | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const generationRef = useRef(0);

  phaseRef.current = phase;
  videoIdRef.current = videoId;

  const isCurrentGeneration = useCallback((generation: number) => {
    return generation === generationRef.current;
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const startWatchdog = useCallback(() => {
    clearWatchdog();
    if (unityReadyRef.current || syncStartRef.current) return;
    const generation = generationRef.current;
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      if (!isCurrentGeneration(generation)) return;
      if (unityReadyRef.current || syncStartRef.current) return;
      if (phaseRef.current === "aborted" || phaseRef.current === "idle") return;
      console.log("[VIDEO_SYNC] unity ready watchdog timeout", {
        ms: nakamaTimeouts.unityReadyTimeoutMs,
      });
      setErrorMessage(
        "گوشی پاسخ نداد. به فهرست برگردید و دوباره تلاش کنید.",
      );
      setPhase("aborted");
    }, nakamaTimeouts.unityReadyTimeoutMs);
  }, [clearWatchdog, isCurrentGeneration]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    clearWatchdog();
    pendingCountRef.current = null;
    unityReadyRef.current = false;
    syncStartRef.current = false;
    begunVideoIdRef.current = null;
    handledRef.current = new Set();
    setPlayerCount(null);
    setErrorMessage(null);
    setPhase("idle");
  }, [clearWatchdog]);

  useEffect(() => {
    if (!tvReady || !videoId) {
      if (!videoId) reset();
      return;
    }
    if (begunVideoIdRef.current === videoId) return;
    begunVideoIdRef.current = videoId;

    const generation = generationRef.current;
    unityReadyRef.current = false;
    syncStartRef.current = false;
    setErrorMessage(null);
    setPhase("announcing");
    console.log("[VIDEO_SYNC] waiting for Unity", { videoId });

    void (async () => {
      try {
        await sendVideoTvReadyWithRetry(videoId, () =>
          isCurrentGeneration(generation),
        );
        if (!isCurrentGeneration(generation)) return;
        startWatchdog();
        const pending = pendingCountRef.current;
        if (pending === 1 || pending === 2) {
          setPlayerCount(pending);
          setPhase("waiting");
          return;
        }
        setPhase("picking");
      } catch (error) {
        if (!isCurrentGeneration(generation)) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "اعلام آمادگی به گوشی ناموفق بود",
        );
        setPhase("aborted");
      }
    })();

    return () => {
      if (begunVideoIdRef.current === videoId) {
        begunVideoIdRef.current = null;
      }
      clearWatchdog();
    };
  }, [tvReady, videoId, reset, startWatchdog, clearWatchdog, isCurrentGeneration]);

  useEffect(() => {
    if (!lastInbound.length) return;

    const inboundCount = findWaitingForVideoPlayReadyNotification(lastInbound);
    if (inboundCount) {
      const key = inboundKey(inboundCount, "6");
      if (!handledRef.current.has(key)) {
        handledRef.current.add(key);
        const count = getNotificationPlayerCount(inboundCount);
        console.log("[VIDEO_SYNC][WaitingForVideoPlayReady] receive", {
          playerCount: count,
        });
        if (count === 1 || count === 2) {
          pendingCountRef.current = count;
          setPlayerCount(count);
          if (
            phaseRef.current === "picking" ||
            phaseRef.current === "announcing" ||
            phaseRef.current === "waiting"
          ) {
            setPhase("waiting");
          }
        }
      }
    }

    const unity = findVideoUnityReadyNotification(lastInbound);
    if (unity) {
      const key = inboundKey(unity, "11");
      if (!handledRef.current.has(key)) {
        handledRef.current.add(key);
        const inboundVideoId = getNotificationVideoId(unity);
        console.log(
          "[VideoSync] VideoUnityReady received — TV does nothing here. Waiting for server-authoritative VideoSyncStart. videoId=" +
            String(inboundVideoId ?? videoIdRef.current ?? ""),
        );
        unityReadyRef.current = true;
        clearWatchdog();
        if (
          phaseRef.current !== "aborted" &&
          phaseRef.current !== "syncStartReceived"
        ) {
          setPhase("unityReady");
        }
      }
    }

    const syncStart = findServerVideoSyncStartNotification(lastInbound);
    if (syncStart) {
      const key = inboundKey(syncStart, "12");
      if (!handledRef.current.has(key)) {
        handledRef.current.add(key);
        syncStartRef.current = true;
        clearWatchdog();
        console.log(
          "[VIDEO_SYNC] VideoSyncStart received — countdown not started this slice",
          { videoId: getNotificationVideoId(syncStart) },
        );
        if (phaseRef.current !== "aborted") {
          setPhase("syncStartReceived");
        }
      }
    }
  }, [lastInbound, clearWatchdog]);

  const confirm = useCallback(
    (count: 1 | 2) => {
      const id = videoIdRef.current;
      if (!id) return;
      if (phaseRef.current !== "picking") return;

      const generation = generationRef.current;
      setPhase("confirming");
      setPlayerCount(count);
      pendingCountRef.current = count;
      setErrorMessage(null);

      void (async () => {
        try {
          await sendWaitingForVideoPlayReady(count);
          if (!isCurrentGeneration(generation)) return;
          await sendVideoTvReadyWithRetry(id, () =>
            isCurrentGeneration(generation),
          );
          if (!isCurrentGeneration(generation)) return;
          if (unityReadyRef.current) {
            setPhase("unityReady");
            return;
          }
          if (syncStartRef.current) {
            setPhase("syncStartReceived");
            return;
          }
          startWatchdog();
          setPhase("waiting");
        } catch (error) {
          if (!isCurrentGeneration(generation)) return;
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "ارسال تعداد بازیکن به گوشی ناموفق بود",
          );
          setPhase("picking");
        }
      })();
    },
    [startWatchdog, isCurrentGeneration],
  );

  useEffect(() => () => clearWatchdog(), [clearWatchdog]);

  return {
    phase,
    playerCount,
    errorMessage,
    confirm,
    reset,
  };
}
