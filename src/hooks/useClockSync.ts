"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  intervalForClockPhase,
  resetClockSync,
  syncServerClockOnce,
  type ClockSyncPhase,
} from "@/lib/nakama/clockSync";
import type { SocketStatus } from "@/lib/nakama/websocket";

export type ClockSyncStatus = "idle" | "syncing" | "ready" | "skipped" | "error";

export type UseClockSyncState = {
  phase: ClockSyncPhase;
  status: ClockSyncStatus;
  offsetMs: number;
  lastRttMs: number | null;
  lastSyncedAt: number | null;
  skipReason: "rtt_filter" | "in_progress" | null;
  errorMessage: string | null;
  intervalMs: number;
};

type UseClockSyncOptions = {
  /** Session token is available — rpc_getServerTime can run. */
  enabled: boolean;
  linked: boolean;
  socketStatus: SocketStatus;
  /** Frame-sync session later; keep idle/paired for this slice. */
  gameplay?: boolean;
  /** Pause non-critical clock RPCs while a low-end TV is preloading media. */
  paused?: boolean;
};

function phaseFromFlags(linked: boolean, gameplay: boolean): ClockSyncPhase {
  if (gameplay) return "gameplay";
  if (linked) return "paired";
  return "idle";
}

/**
 * TV ClockSynchronizer: sync once on login / socket connect, then periodic
 * by phase (idle 120s, paired 60s, gameplay 120s).
 */
export function useClockSync({
  enabled,
  linked,
  socketStatus,
  gameplay = false,
  paused = false,
}: UseClockSyncOptions): UseClockSyncState {
  const phase = phaseFromFlags(linked, gameplay);
  const intervalMs = intervalForClockPhase(phase);

  const [status, setStatus] = useState<ClockSyncStatus>("idle");
  const [offsetMs, setOffsetMs] = useState(0);
  const [lastRttMs, setLastRttMs] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [skipReason, setSkipReason] = useState<"rtt_filter" | "in_progress" | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runSync = useCallback(async (reason: string) => {
    setStatus((prev) => (prev === "ready" || prev === "skipped" ? prev : "syncing"));
    setErrorMessage(null);
    try {
      const result = await syncServerClockOnce(reason);
      if (result.skipped) {
        if (result.reason === "in_progress") return;
        setSkipReason(result.reason);
        setOffsetMs(result.offset);
        if (result.rtt != null) setLastRttMs(result.rtt);
        setStatus("skipped");
        return;
      }
      setSkipReason(null);
      setOffsetMs(result.offset);
      setLastRttMs(result.rtt);
      setLastSyncedAt(Date.now());
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "همگام‌سازی ساعت ناموفق بود",
      );
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetClockSync();
      setStatus("idle");
      setOffsetMs(0);
      setLastRttMs(null);
      setLastSyncedAt(null);
      setSkipReason(null);
      setErrorMessage(null);
      return;
    }

    if (!paused) void runSync("login");
  }, [enabled, paused, runSync]);

  const prevSocketRef = useRef<SocketStatus>(socketStatus);
  useEffect(() => {
    const prev = prevSocketRef.current;
    prevSocketRef.current = socketStatus;
    if (!enabled || paused || socketStatus !== "open") return;

    if (prev === "reconnecting") {
      void runSync("reconnect");
      return;
    }
    if (prev === "connecting" || prev === "closed" || prev === "error") {
      void runSync("websocket-connect");
    }
  }, [enabled, paused, socketStatus, runSync]);

  useEffect(() => {
    if (!enabled || paused) return;

    const id = setInterval(() => {
      void runSync("periodic");
    }, intervalMs);

    return () => clearInterval(id);
  }, [enabled, intervalMs, paused, runSync]);

  return {
    phase,
    status,
    offsetMs,
    lastRttMs,
    lastSyncedAt,
    skipReason,
    errorMessage,
    intervalMs,
  };
}
