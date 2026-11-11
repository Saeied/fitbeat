/**
 * Server-authoritative reference timeline (TV ServerReferenceClock).
 * Gameplay timing reads currentReferenceTimeSeconds — never video.currentTime.
 */

let isActive = false;
let anchorReferenceTimeSeconds = 0;
let anchorServerUtcMs = 0;
let lastReturnedSeconds = 0;
let hasSequence = false;
let lastSequenceId = 0;
let lastSyncPacketServerUtcMs = 0;
let getServerUtcMsFn: (() => number) | null = null;

function nowServerUtcMs(): number {
  if (getServerUtcMsFn) return getServerUtcMsFn();
  return Date.now();
}

export function initServerReferenceClock(options?: {
  getServerUtcMs?: () => number;
}): void {
  getServerUtcMsFn = options?.getServerUtcMs ?? null;
}

export function resetServerReferenceClock(): void {
  isActive = false;
  anchorReferenceTimeSeconds = 0;
  anchorServerUtcMs = 0;
  lastReturnedSeconds = 0;
  hasSequence = false;
  lastSequenceId = 0;
  lastSyncPacketServerUtcMs = 0;
}

export function startFromServerCountdown(startAtServerUtcMs: number): void {
  anchorReferenceTimeSeconds = 0;
  anchorServerUtcMs = Number(startAtServerUtcMs) || 0;
  isActive = anchorServerUtcMs > 0;
  lastReturnedSeconds = 0;
}

export function applyServerSync(
  referenceTimeSeconds: number,
  serverUtcMs: number,
  sequenceId: number,
): boolean {
  const seq = Number(sequenceId) || 0;
  if (hasSequence) {
    if (seq < lastSequenceId) return false;
    if (
      seq === lastSequenceId &&
      Number(referenceTimeSeconds) + 0.001 < anchorReferenceTimeSeconds
    ) {
      return false;
    }
  }
  lastSequenceId = seq;
  hasSequence = true;
  lastSyncPacketServerUtcMs = Number(serverUtcMs) || 0;
  anchorReferenceTimeSeconds = Number(referenceTimeSeconds) || 0;
  anchorServerUtcMs = lastSyncPacketServerUtcMs;
  isActive = true;
  return true;
}

export function currentReferenceTimeSeconds(): number {
  if (!isActive) return 0;
  const elapsedSeconds = (nowServerUtcMs() - anchorServerUtcMs) / 1000;
  let raw = anchorReferenceTimeSeconds + elapsedSeconds;
  if (raw < lastReturnedSeconds) {
    raw = lastReturnedSeconds;
  } else {
    lastReturnedSeconds = raw;
  }
  return raw;
}

export function isReferenceClockActive(): boolean {
  return isActive;
}

export function lastAcceptedSequence(): number {
  return lastSequenceId;
}

export function hasAcceptedClockSync(): boolean {
  return hasSequence;
}

export function getLastSyncPacketServerUtcMs(): number {
  return lastSyncPacketServerUtcMs;
}
