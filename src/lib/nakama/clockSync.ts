import { nakamaTimeouts } from "./config";
import { callTvRpc } from "./rpc";

export const RPC_GET_SERVER_TIME = "rpc_getServerTime";

export type ClockSyncPhase = "idle" | "paired" | "gameplay";

export type ClockSyncOk = {
  skipped: false;
  serverTime: number;
  rtt: number;
  latency: number;
  offset: number;
};

export type ClockSyncSkipped = {
  skipped: true;
  reason: "rtt_filter" | "in_progress";
  rtt?: number;
  latency?: number;
  serverTime?: number;
  offset: number;
};

export type ClockSyncResult = ClockSyncOk | ClockSyncSkipped;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeServerTimeMs(rawValue: unknown): number {
  const n = Number(rawValue);
  if (!n || Number.isNaN(n)) return 0;
  if (n < 1_000_000_000_000) return n * 1000;
  return n;
}

/** callTvRpc may already unwrap `{ result }`; still accept nested envelopes. */
export function extractServerTimeMs(parsed: unknown): number {
  if (parsed == null) return 0;

  if (typeof parsed === "number" || typeof parsed === "string") {
    return normalizeServerTimeMs(parsed);
  }

  const record = asRecord(parsed);
  if (!record) return 0;

  const nested = asRecord(record.result) ?? asRecord(record.data) ?? record;

  if (nested.serverTimeMs != null && Number(nested.serverTimeMs) > 0) {
    const ms = normalizeServerTimeMs(nested.serverTimeMs);
    if (ms > 0) return ms;
  }

  if (nested.serverTime != null && Number(nested.serverTime) > 0) {
    const ms = normalizeServerTimeMs(nested.serverTime);
    if (ms > 0) return ms;
  }

  return 0;
}

export function intervalForClockPhase(phase: ClockSyncPhase): number {
  if (phase === "gameplay") return nakamaTimeouts.clockSyncGameplayMs;
  if (phase === "paired") return nakamaTimeouts.clockSyncPairedMs;
  return nakamaTimeouts.clockSyncIdleMs;
}

let offset = 0;
let lastRttMs = 0;
let syncInProgress = false;

export function getClockOffsetMs(): number {
  return offset;
}

export function getLastClockRttMs(): number {
  return lastRttMs;
}

/** TV CorrectedServerTime() = Date.now() + offset */
export function correctedServerTimeMs(): number {
  return Date.now() + offset;
}

export function setClockOffsetMs(next: number): void {
  offset = next;
}

export function resetClockSync(): void {
  offset = 0;
  lastRttMs = 0;
  syncInProgress = false;
}

/**
 * TV reconcileServerClockForVideoSyncStart.
 * Sync once; if startAt is already past, fall back to the 10s countdown heuristic.
 */
export async function reconcileClockForVideoSyncStart(
  startAt: number,
): Promise<{ remainingMs: number }> {
  const threshold = nakamaTimeouts.syncPlaybackTriggerThresholdMs;

  try {
    const result = await syncServerClockOnce("video-sync-start");
    if (!result.skipped) {
      const remainingMs = startAt - correctedServerTimeMs();
      if (remainingMs >= -threshold) {
        return { remainingMs };
      }
    }
  } catch {
    /* heuristic below */
  }

  setClockOffsetMs(
    startAt - Date.now() - nakamaTimeouts.videoSyncStartCountdownMs,
  );
  let remainingMs = startAt - correctedServerTimeMs();
  if (remainingMs < -threshold) {
    setClockOffsetMs(startAt - Date.now() - threshold);
    remainingMs = startAt - correctedServerTimeMs();
  }
  return { remainingMs };
}

/**
 * One rpc_getServerTime sample.
 * offset = serverTime + rtt/2 − t1. Samples with RTT > 350ms are ignored.
 */
export async function syncServerClockOnce(
  reason = "manual",
): Promise<ClockSyncResult> {
  if (syncInProgress) {
    return { skipped: true, reason: "in_progress", offset };
  }

  syncInProgress = true;
  const t0 = Date.now();
  const previousOffset = offset;

  console.log("[ClockSync] Clock sync request", {
    reason,
    t0,
    previousOffset,
  });

  try {
    const parsed = await callTvRpc<unknown>(RPC_GET_SERVER_TIME, {});
    const t1 = Date.now();
    const serverTime = extractServerTimeMs(parsed);

    if (!serverTime) {
      console.log("[ClockSync] Sync failure", {
        reason,
        error: "could not parse server time",
        payload: parsed,
      });
      throw new Error("ساعت سرور خوانده نشد");
    }

    const rtt = t1 - t0;
    const latency = rtt / 2;
    const newOffset = serverTime + latency - t1;
    lastRttMs = rtt;

    if (rtt > nakamaTimeouts.clockSyncMaxRttMs) {
      console.log("[ClockSync] RTT too high - ignored", {
        rtt,
        latency,
        serverTime,
        previousOffset,
        reason: "rtt_filter",
      });
      return {
        skipped: true,
        reason: "rtt_filter",
        rtt,
        latency,
        serverTime,
        offset,
      };
    }

    offset = newOffset;

    console.log("[ClockSync] Clock sync response", {
      reason,
      serverTime,
      t0,
      t1,
      rtt,
      latency,
      previousOffset,
      newOffset,
      clockDrift: newOffset - previousOffset,
    });

    if (reason === "reconnect" || reason === "websocket-reconnect") {
      console.log("[ClockSync] Reconnect resync", {
        rtt,
        latency,
        offset,
      });
    }

    return {
      skipped: false,
      serverTime,
      rtt,
      latency,
      offset,
    };
  } catch (error) {
    console.log("[ClockSync] Sync failure", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    syncInProgress = false;
  }
}
