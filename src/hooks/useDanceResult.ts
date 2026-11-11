"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isDanceVideoFinishedNotification,
  isReturnToSongListNotification,
  parseDanceFinishedNotification,
  type DanceFinishedPayload,
} from "@/lib/nakama/gameplayParse";
import type { VideoCatalogEntry } from "@/lib/nakama/mediaCatalog";
import {
  currentReferenceTimeSeconds,
  isReferenceClockActive,
} from "@/lib/nakama/serverReferenceClock";
import {
  sendOnDanceVideoFinished,
  sendReturnToSongList,
} from "@/lib/nakama/sessionNotifications";
import type { NotificationPayload } from "@/lib/nakama/types";
import { filledLiveScoreStars } from "@/lib/liveScoreStars";
import { hardStopVideo } from "@/lib/video/videoPlayback";

export type DanceResultView = {
  visible: boolean;
  videoId: string | null;
  title: string;
  cover: string;
  playerCount: 1 | 2;
  score1: number;
  score2: number;
  calories1: number;
  calories2: number;
  stars1: number;
  stars2: number;
  busy: boolean;
  errorMessage: string | null;
};

export type UseDanceResultState = DanceResultView & {
  onVideoEnded: () => void;
  playAgain: () => void;
  backToSongs: () => void;
  reset: () => void;
};

type OverlayScores = {
  playerCount: 1 | 2;
  score1: number;
  score2: number;
  calories1: number;
  calories2: number;
  maxScore1: number;
  maxScore2: number;
};

type UseDanceResultOptions = {
  lastInbound: NotificationPayload[];
  playing: boolean;
  video: VideoCatalogEntry | null;
  overlayScores: OverlayScores;
  sessionComplete: boolean;
  timelineEndReached: boolean;
  getVideoElement: () => HTMLVideoElement | null;
  onReplay: (video: VideoCatalogEntry) => void;
  onBackToSongs: () => void;
  onStopPlayback: () => void;
};

const HIDDEN: DanceResultView = {
  visible: false,
  videoId: null,
  title: "",
  cover: "",
  playerCount: 1,
  score1: 0,
  score2: 0,
  calories1: 0,
  calories2: 0,
  stars1: 0,
  stars2: 0,
  busy: false,
  errorMessage: null,
};

function findPlayerScore(
  players: DanceFinishedPayload["players"],
  slot: number,
): number {
  const found = players.find((item) => Number(item.playerSlot) === slot);
  return found ? Number(found.score || 0) : 0;
}

type ResolvedScores = {
  playerCount: 1 | 2;
  score1: number;
  score2: number;
};

function resolveScores(
  payload: DanceFinishedPayload,
  overlay: OverlayScores,
): ResolvedScores {
  const playerCount: 1 | 2 =
    payload.playerCount === 2
      ? 2
      : payload.playerCount === 1
        ? 1
        : overlay.playerCount;

  let score1 = overlay.score1;
  let score2 = overlay.score2;
  if (payload.hasFlatPlayerScores) {
    score1 = payload.player1Score ?? 0;
    score2 = payload.player2Score ?? 0;
  } else if (payload.players.length) {
    score1 = findPlayerScore(payload.players, 1);
    score2 = findPlayerScore(payload.players, 2);
  } else if (playerCount === 1 && payload.finalScore) {
    score1 = payload.finalScore;
  }
  if (playerCount === 1) score2 = 0;

  return { playerCount, score1, score2 };
}

/** Stars frozen from live progress-bar sidebar (Code 8 slot totals + maxScore). */
function snapshotOverlayStars(overlay: OverlayScores): {
  stars1: number;
  stars2: number;
} {
  return {
    stars1: filledLiveScoreStars(overlay.score1, overlay.maxScore1),
    stars2: filledLiveScoreStars(overlay.score2, overlay.maxScore2),
  };
}

function stopPlaybackForDanceFinished(
  getVideoElement: () => HTMLVideoElement | null,
  onStopPlayback: () => void,
): void {
  const video = getVideoElement();
  if (video) {
    try {
      if (isReferenceClockActive()) {
        video.currentTime = Math.max(0, currentReferenceTimeSeconds());
      }
    } catch {
      /* ignore seek errors on legacy TVs */
    }
    hardStopVideo(video);
  }
  onStopPlayback();
}

/**
 * Dance results: OnDanceVideoFinished (13), ReturnToSongList (14),
 * replay via VideoDownloadIntent (9).
 */
export function useDanceResult({
  lastInbound,
  playing,
  video,
  overlayScores,
  sessionComplete,
  timelineEndReached,
  getVideoElement,
  onReplay,
  onBackToSongs,
  onStopPlayback,
}: UseDanceResultOptions): UseDanceResultState {
  const [view, setView] = useState<DanceResultView>(HIDDEN);

  const viewRef = useRef(view);
  const videoRef = useRef(video);
  const overlayRef = useRef(overlayScores);
  const pendingPayloadRef = useRef<DanceFinishedPayload | null>(null);
  const sessionCompletePendingRef = useRef(false);
  const finishedSentRef = useRef(false);
  const lastInboundRef = useRef<NotificationPayload[] | null>(null);
  const onReplayRef = useRef(onReplay);
  const onBackRef = useRef(onBackToSongs);
  const onStopPlaybackRef = useRef(onStopPlayback);
  const getVideoRef = useRef(getVideoElement);

  viewRef.current = view;
  videoRef.current = video;
  overlayRef.current = overlayScores;
  onReplayRef.current = onReplay;
  onBackRef.current = onBackToSongs;
  onStopPlaybackRef.current = onStopPlayback;
  getVideoRef.current = getVideoElement;

  const reset = useCallback(() => {
    pendingPayloadRef.current = null;
    sessionCompletePendingRef.current = false;
    finishedSentRef.current = false;
    setView(HIDDEN);
  }, []);

  const present = useCallback(
    (payload: DanceFinishedPayload, source: string) => {
      const currentVideo = videoRef.current;
      const scores = resolveScores(payload, overlayRef.current);
      const overlay = overlayRef.current;
      const prev = viewRef.current;
      const snapshot = snapshotOverlayStars(overlay);
      const stars1 = prev.visible ? prev.stars1 : snapshot.stars1;
      const stars2 = prev.visible ? prev.stars2 : snapshot.stars2;
      const videoId = payload.videoId || currentVideo?.id || null;
      const title =
        (payload.videoTitle && payload.videoTitle !== String(videoId)
          ? payload.videoTitle
          : null) ||
        currentVideo?.title ||
        "آهنگ";
      stopPlaybackForDanceFinished(
        getVideoRef.current,
        onStopPlaybackRef.current,
      );
      setView({
        visible: true,
        videoId,
        title,
        cover: currentVideo?.cover ?? "",
        playerCount: scores.playerCount,
        score1: scores.score1,
        score2: scores.score2,
        calories1: overlay.calories1,
        calories2: overlay.calories2,
        stars1,
        stars2,
        busy: false,
        errorMessage: null,
      });
      console.log("[DANCE_RESULT] presented", {
        source,
        videoId,
        playerCount: scores.playerCount,
        score1: scores.score1,
        score2: scores.score2,
        calories1: overlay.calories1,
        calories2: overlay.calories2,
        stars1,
        stars2,
      });
    },
    [],
  );

  const tryPresent = useCallback(
    (source: string) => {
      if (viewRef.current.visible) return;
      const payload =
        pendingPayloadRef.current ??
        (sessionCompletePendingRef.current
          ? {
              videoId: videoRef.current?.id ?? null,
              videoTitle: videoRef.current?.title ?? "",
              playerCount: overlayRef.current.playerCount,
              finalScore: overlayRef.current.score1,
              player1Score: overlayRef.current.score1,
              player2Score: overlayRef.current.score2,
              player1StarRating: null,
              player2StarRating: null,
              maxScore: Math.max(
                overlayRef.current.maxScore1,
                overlayRef.current.maxScore2,
              ),
              hasFlatPlayerScores: true,
              isSessionComplete: true,
              players: [],
              videoDurationSeconds: 0,
            }
          : null);
      if (!payload) {
        console.log(
          "[DANCE_RESULT] deferred — waiting for OnDanceVideoFinished payload",
          { source },
        );
        return;
      }
      present(payload, source);
      pendingPayloadRef.current = null;
      sessionCompletePendingRef.current = false;
    },
    [present],
  );

  const onVideoEnded = useCallback(() => {
    if (!playing || viewRef.current.visible || finishedSentRef.current) return;
    const videoId = videoRef.current?.id;
    if (!videoId) return;
    finishedSentRef.current = true;
    sessionCompletePendingRef.current = true;
    stopPlaybackForDanceFinished(
      getVideoRef.current,
      onStopPlaybackRef.current,
    );
    console.log("[VIDEO_SYNC][PLAYBACK] ended", { videoId });
    void sendOnDanceVideoFinished(videoId).catch((error) => {
      console.log("[VIDEO_SYNC] authoritative playback complete RPC failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    tryPresent("video-ended-local");
  }, [playing, tryPresent]);

  useEffect(() => {
    if (sessionComplete || timelineEndReached) {
      sessionCompletePendingRef.current = true;
      tryPresent(
        sessionComplete ? "code8-session-complete" : "frame-sync-timeline-end",
      );
    }
  }, [sessionComplete, timelineEndReached, tryPresent]);

  useEffect(() => {
    if (lastInbound === lastInboundRef.current) return;
    lastInboundRef.current = lastInbound;

    for (const notification of lastInbound) {
      if (isReturnToSongListNotification(notification)) {
        console.log("[VIDEO_SYNC] ReturnToSongList received from mobile");
        reset();
        onBackRef.current();
        return;
      }
      if (!isDanceVideoFinishedNotification(notification)) continue;
      const payload = parseDanceFinishedNotification(notification);
      if (payload.isSessionComplete === false) {
        console.log(
          "[DANCE_RESULT] OnDanceVideoFinished ignored — isSessionComplete=false",
        );
        continue;
      }
      console.log("[DANCE_RESULT] OnDanceVideoFinished received", {
        videoId: payload.videoId,
        playerCount: payload.playerCount,
        player1Score: payload.player1Score,
        player2Score: payload.player2Score,
        finalScore: payload.finalScore,
      });
      pendingPayloadRef.current = payload;
      if (viewRef.current.visible) {
        present(payload, "code13-update");
        pendingPayloadRef.current = null;
        sessionCompletePendingRef.current = false;
        continue;
      }
      present(payload, "code13");
      pendingPayloadRef.current = null;
      sessionCompletePendingRef.current = false;
    }
  }, [lastInbound, present, reset]);

  const playAgain = useCallback(() => {
    const current = videoRef.current;
    if (!current || viewRef.current.busy) return;
    setView((prev) => ({ ...prev, busy: true, errorMessage: null }));
    reset();
    onReplayRef.current(current);
  }, [reset]);

  const backToSongs = useCallback(() => {
    if (viewRef.current.busy) return;
    setView((prev) => ({ ...prev, busy: true }));
    void sendReturnToSongList()
      .catch((error) => {
        console.log("[VIDEO_SYNC] ReturnToSongList send failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        reset();
        onBackRef.current();
      });
  }, [reset]);

  return {
    ...view,
    onVideoEnded,
    playAgain,
    backToSongs,
    reset,
  };
}
