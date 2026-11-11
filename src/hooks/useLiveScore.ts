"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isScoreNotification,
  parseScoreNotification,
} from "@/lib/nakama/gameplayParse";
import { notificationLooksLikeScore } from "@/lib/nakama/notificationParse";
import type { NotificationPayload } from "@/lib/nakama/types";

export type LiveScoreSlot = {
  total: number;
  pointsAdded: number;
  feedback: string;
  hitNonce: number;
  maxScore: number;
  calories: number;
};

export type UseLiveScoreState = {
  playerCount: 1 | 2;
  slots: { 1: LiveScoreSlot; 2: LiveScoreSlot };
  visible: boolean;
  sessionComplete: boolean;
  reset: () => void;
};

type UseLiveScoreOptions = {
  playerCount: 1 | 2;
  playing: boolean;
  lastInbound: NotificationPayload[];
};

const EMPTY_SLOT: LiveScoreSlot = {
  total: 0,
  pointsAdded: 0,
  feedback: "",
  hitNonce: 0,
  maxScore: 0,
  calories: 0,
};

function emptySlots(): { 1: LiveScoreSlot; 2: LiveScoreSlot } {
  return { 1: { ...EMPTY_SLOT }, 2: { ...EMPTY_SLOT } };
}

function resolveSlotTotal(
  prevTotal: number,
  fields: {
    newTotalScore: number | null;
    pointsAdded: number;
  },
): number {
  const hasExplicitTotal =
    fields.newTotalScore != null && !Number.isNaN(fields.newTotalScore);
  const explicitTotal = hasExplicitTotal ? fields.newTotalScore! : null;

  if (fields.pointsAdded > 0) {
    if (hasExplicitTotal && explicitTotal! >= prevTotal) {
      return explicitTotal!;
    }
    return prevTotal + fields.pointsAdded;
  }

  if (hasExplicitTotal && explicitTotal! > 0) {
    return explicitTotal!;
  }

  if (hasExplicitTotal && explicitTotal === 0 && prevTotal === 0) {
    return 0;
  }

  return prevTotal;
}

/**
 * Live score overlay from OnPlayerTotalScoreChanged (8).
 * Own-subject filter must not drop these packets.
 */
export function useLiveScore({
  playerCount,
  playing,
  lastInbound,
}: UseLiveScoreOptions): UseLiveScoreState {
  const [slots, setSlots] = useState(emptySlots);
  const [sessionComplete, setSessionComplete] = useState(false);

  const playerCountRef = useRef(playerCount);
  const lastInboundRef = useRef<NotificationPayload[] | null>(null);
  playerCountRef.current = playerCount;

  const reset = useCallback(() => {
    setSlots(emptySlots());
    setSessionComplete(false);
  }, []);

  useEffect(() => {
    reset();
  }, [playerCount, reset]);

  useEffect(() => {
    if (lastInbound === lastInboundRef.current) return;
    lastInboundRef.current = lastInbound;

    for (const notification of lastInbound) {
      if (
        !isScoreNotification(notification) &&
        !notificationLooksLikeScore(notification)
      ) {
        continue;
      }
      const fields = parseScoreNotification(notification);
      if (!fields) {
        console.warn("[SCORE] invalid payload — no total or hit data");
        continue;
      }

      let slot = fields.playerSlot;
      if (playerCountRef.current === 2) {
        if (slot !== 1 && slot !== 2) {
          console.log("[SCORE] dual mode fallback playerSlot -> 1", {
            playerSlot: fields.playerSlot,
          });
          slot = 1;
        }
      } else {
        slot = 1;
      }

      const targetSlot: 1 | 2 = slot === 2 ? 2 : 1;
      let resolvedTotal = 0;
      let resolvedMaxScore = 0;
      setSlots((prev) => {
        const prevSlot = prev[targetSlot];
        const total = resolveSlotTotal(prevSlot.total, fields);
        const maxScore =
          fields.maxScore != null && fields.maxScore > 0
            ? fields.maxScore
            : prevSlot.maxScore;
        const calories =
          fields.calories != null && !Number.isNaN(fields.calories)
            ? fields.calories
            : prevSlot.calories;
        resolvedTotal = total;
        resolvedMaxScore = maxScore;
        return {
          ...prev,
          [targetSlot]: {
            total,
            pointsAdded: fields.pointsAdded,
            feedback: fields.feedback,
            hitNonce: prevSlot.hitNonce + 1,
            maxScore,
            calories,
          },
        };
      });

      console.log("[SCORE] updated", {
        playerSlot: targetSlot,
        mode: playerCountRef.current === 2 ? "dual" : "single",
        total: resolvedTotal,
        maxScore: resolvedMaxScore,
        points: fields.pointsAdded,
        feedback: fields.feedback,
        calories: fields.calories,
        isSessionComplete: fields.isSessionComplete,
      });

      if (fields.isSessionComplete) {
        setSessionComplete(true);
      }
    }
  }, [lastInbound]);

  return {
    playerCount,
    slots,
    visible: playing,
    sessionComplete,
    reset,
  };
}
