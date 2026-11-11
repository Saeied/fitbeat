"use client";

import { useEffect, useState } from "react";
import {
  loadSeasonalLeaderboard,
  SEASONAL_LEADERBOARD_UNAVAILABLE,
  type SeasonalLeaderboard,
} from "@/lib/nakama/leaderboard";
import { NakamaRpcError } from "@/lib/nakama/rpc";
import { NakamaHttpError } from "@/lib/nakama/types";

export type SeasonalLeaderboardStatus = "idle" | "loading" | "ready" | "error";

export type UseSeasonalLeaderboardState = {
  status: SeasonalLeaderboardStatus;
  data: SeasonalLeaderboard | null;
  errorMessage: string | null;
  retry: () => void;
};

function toErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.message === SEASONAL_LEADERBOARD_UNAVAILABLE
  ) {
    return error.message;
  }
  if (error instanceof NakamaRpcError) {
    const inner = error.message.replace(
      /^[^\s]+ failed(?:\s*\([^)]*\))?:\s*/,
      "",
    );
    return inner || "بارگذاری رتبه‌بندی ناموفق بود.";
  }
  if (error instanceof NakamaHttpError) {
    return `خطای سرور (${error.status})`;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "زمان اتصال به سرور تمام شد";
  }
  if (error instanceof TypeError) {
    return "ارتباط با سرور برقرار نشد";
  }
  return "بارگذاری رتبه‌بندی ناموفق بود.";
}

export function useSeasonalLeaderboard(
  open: boolean,
  userId: string | null,
): UseSeasonalLeaderboardState {
  const [status, setStatus] = useState<SeasonalLeaderboardStatus>("idle");
  const [data, setData] = useState<SeasonalLeaderboard | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tracked, setTracked] = useState({ open, userId, attempt });

  if (
    tracked.open !== open ||
    tracked.userId !== userId ||
    tracked.attempt !== attempt
  ) {
    setTracked({ open, userId, attempt });
    setData(null);
    setErrorMessage(null);
    setStatus(open ? "loading" : "idle");
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    loadSeasonalLeaderboard(userId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData(null);
        setErrorMessage(toErrorMessage(error));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open, userId, attempt]);

  return {
    status: open ? status : "idle",
    data: open ? data : null,
    errorMessage: open ? errorMessage : null,
    retry: () => setAttempt((current) => current + 1),
  };
}
