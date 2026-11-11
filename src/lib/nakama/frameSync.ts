/**
 * TV Live Frame Sync — FrameSyncEngine port.
 * Pulses rpc_frameSync_pulse (clientRole=tv), applies FrameSync (16) packets,
 * and slews/seeks video to the server reference timeline.
 */

import {
  correctedServerTimeMs,
  getClockOffsetMs,
  getLastClockRttMs,
} from "./clockSync";
import { nakamaTimeouts } from "./config";
import { callTvRpc } from "./rpc";
import { deliverPulseNotifications } from "./gameplayNotifications";
import { getVideoDeviceProfile } from "@/lib/video/deviceProfile";
import {
  applyServerSync,
  currentReferenceTimeSeconds,
  initServerReferenceClock,
  isReferenceClockActive,
  resetServerReferenceClock,
  startFromServerCountdown,
} from "./serverReferenceClock";

export const RPC_FRAME_SYNC_PULSE = "rpc_frameSync_pulse";

const FRAME_SYNC_PULSE_STABLE_MS = 250;
const FRAME_SYNC_PULSE_NORMAL_MS = 150;
const FRAME_SYNC_PULSE_CRITICAL_MS = nakamaTimeouts.frameSyncIntervalMs;
const FRAME_SYNC_STALE_PACKET_MS = 800;
const SEEK_EPSILON_SECONDS = 0.05;

function driftPolicy() {
  return getVideoDeviceProfile().frameSync;
}

function minimumPulseIntervalMs(): number {
  return getVideoDeviceProfile().tier === "desktop"
    ? FRAME_SYNC_PULSE_CRITICAL_MS
    : 250;
}

type FrameSyncFields = {
  referenceTime: unknown;
  frameIndex: unknown;
  frameTimestamp: unknown;
  sequence: unknown;
  serverUtc: unknown;
  syncSessionId: unknown;
  totalFrames: unknown;
  timelineVersion: unknown;
  isTimelineEnd: unknown;
  scoreLocked: unknown;
};

type FrameSyncEngineState = {
  sessionActive: boolean;
  clockStarted: boolean;
  hasServerPacket: boolean;
  serverFrameIndex: number;
  displayFrameIndex: number;
  serverFrameTimestamp: number;
  lastSequence: number;
  lastPacketReferenceTime: number;
  lastPacketServerUtc: number;
  lastPacketReceivedAt: number;
  syncSessionId: string;
  pulseTimer: ReturnType<typeof setTimeout> | null;
  renderRaf: number | null;
  playbackRate: number;
  frameIndexMatch: boolean;
  totalFrames: number;
  expectedTimelineVersion: number;
  timelineEndReached: boolean;
  scoreLocked: boolean;
  lastDriftCorrectionAt: number;
  lastAppliedPlaybackRate: number | null;
  lastSeekTargetSeconds: number | null;
  lastPulseIntervalMs: number;
  pulseInFlight: boolean;
};

export type FrameSyncHudSnapshot = {
  sessionActive: boolean;
  clockStarted: boolean;
  hasServerPacket: boolean;
  referenceTimeSeconds: number;
  videoTimeSeconds: number;
  videoDriftMs: number;
  playbackRate: number;
  lastSequence: number;
  displayFrameIndex: number;
  packetAgeMs: number;
  pulseIntervalMs: number;
  timelineEndReached: boolean;
  scoreLocked: boolean;
};

type FrameSyncDeps = {
  getPlayerVideo: () => HTMLVideoElement | null;
  getPlayerCount: () => number;
  getSocketOk: () => boolean;
  onTimelineEnd?: () => void;
};

const state: FrameSyncEngineState = {
  sessionActive: false,
  clockStarted: false,
  hasServerPacket: false,
  serverFrameIndex: -1,
  displayFrameIndex: -1,
  serverFrameTimestamp: 0,
  lastSequence: 0,
  lastPacketReferenceTime: 0,
  lastPacketServerUtc: 0,
  lastPacketReceivedAt: 0,
  syncSessionId: "",
  pulseTimer: null,
  renderRaf: null,
  playbackRate: 1,
  frameIndexMatch: false,
  totalFrames: -1,
  expectedTimelineVersion: 0,
  timelineEndReached: false,
  scoreLocked: false,
  lastDriftCorrectionAt: 0,
  lastAppliedPlaybackRate: null,
  lastSeekTargetSeconds: null,
  lastPulseIntervalMs: FRAME_SYNC_PULSE_CRITICAL_MS,
  pulseInFlight: false,
};

let deps: FrameSyncDeps = {
  getPlayerVideo: () => null,
  getPlayerCount: () => 1,
  getSocketOk: () => false,
  onTimelineEnd: undefined,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function nowLocalMs(): number {
  return Date.now();
}

function readPacketField(
  packet: Record<string, unknown> | null,
  camelKey: string,
  snakeKey: string | null,
  altKey: string | null,
): unknown {
  if (!packet) return null;
  let value: unknown = packet[camelKey];
  if (value == null && snakeKey) value = packet[snakeKey];
  if (value == null && altKey) value = packet[altKey];
  return value;
}

function normalizePacket(raw: unknown): Record<string, unknown> {
  let payload: unknown = raw ?? {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  const record = asRecord(payload);
  if (!record) return {};
  const nestedObj = asRecord(record.content);
  if (nestedObj) return nestedObj;
  if (typeof record.content === "string") {
    try {
      const parsed = asRecord(JSON.parse(record.content));
      if (parsed) return parsed;
    } catch {
      /* keep */
    }
  }
  return record;
}

function extractFrameSyncFields(packet: Record<string, unknown>): FrameSyncFields {
  return {
    referenceTime: readPacketField(packet, "referenceTime", "reference_time", null),
    frameIndex: readPacketField(
      packet,
      "frameIndex",
      "frame_index",
      "currentJsonFrame",
    ),
    frameTimestamp: readPacketField(
      packet,
      "frameTimestamp",
      "frame_timestamp",
      "currentTimestamp",
    ),
    sequence: readPacketField(packet, "sequence", "sequence", "currentSequence"),
    serverUtc: readPacketField(packet, "serverUtc", "server_utc", null),
    syncSessionId: readPacketField(
      packet,
      "syncSessionId",
      "sync_session_id",
      null,
    ),
    totalFrames: readPacketField(packet, "totalFrames", "total_frames", null),
    timelineVersion: readPacketField(
      packet,
      "timelineVersion",
      "timeline_version",
      null,
    ),
    isTimelineEnd: readPacketField(
      packet,
      "isTimelineEnd",
      "is_timeline_end",
      null,
    ),
    scoreLocked: readPacketField(packet, "scoreLocked", "score_locked", null),
  };
}

function packetFromMonitorSnapshot(
  monitor: unknown,
): Record<string, unknown> | null {
  const record = asRecord(monitor);
  if (!record) return null;
  const frameIndex = readPacketField(
    record,
    "frameIndex",
    "frame_index",
    "currentJsonFrame",
  );
  if (frameIndex == null && record.referenceTime == null) return null;
  return {
    referenceTime: readPacketField(
      record,
      "referenceTime",
      "reference_time",
      null,
    ),
    frameIndex,
    frameTimestamp: readPacketField(
      record,
      "frameTimestamp",
      "frame_timestamp",
      "currentTimestamp",
    ),
    sequence: readPacketField(record, "sequence", "sequence", "currentSequence"),
    serverUtc: readPacketField(record, "serverUtc", "server_utc", null),
  };
}

function getPlayerVideo(): HTMLVideoElement | null {
  return deps.getPlayerVideo();
}

function getReferenceTimeSeconds(): number {
  if (isReferenceClockActive()) {
    return currentReferenceTimeSeconds();
  }
  if (state.hasServerPacket && state.lastPacketReferenceTime > 0) {
    return state.lastPacketReferenceTime + getPacketAgeMs() / 1000;
  }
  return 0;
}

function getVideoTimeSeconds(): number {
  const video = getPlayerVideo();
  if (!video) return 0;
  return Number(video.currentTime || 0);
}

function getPacketAgeMs(): number {
  if (!state.lastPacketReceivedAt) return -1;
  return Math.max(0, nowLocalMs() - state.lastPacketReceivedAt);
}

function isServerPacketFresh(): boolean {
  if (!state.hasServerPacket || state.lastSequence <= 0) return false;
  const age = getPacketAgeMs();
  return age >= 0 && age <= FRAME_SYNC_STALE_PACKET_MS;
}

function getVideoDriftSeconds(): number {
  return getVideoTimeSeconds() - getReferenceTimeSeconds();
}

function getVideoDriftMs(): number {
  return Math.abs(getVideoDriftSeconds()) * 1000;
}

function getAdaptivePulseIntervalMs(): number {
  const clampForDevice = (value: number) =>
    Math.max(value, minimumPulseIntervalMs());
  if (!state.hasServerPacket || state.lastSequence <= 0) {
    return clampForDevice(FRAME_SYNC_PULSE_CRITICAL_MS);
  }
  if (!isServerPacketFresh()) return clampForDevice(FRAME_SYNC_PULSE_CRITICAL_MS);
  const driftMs = getVideoDriftMs();
  const policy = driftPolicy();
  if (driftMs >= policy.largeDriftThresholdMs) {
    return clampForDevice(FRAME_SYNC_PULSE_CRITICAL_MS);
  }
  if (driftMs >= policy.smallDriftThresholdMs) {
    return clampForDevice(FRAME_SYNC_PULSE_NORMAL_MS);
  }
  return clampForDevice(FRAME_SYNC_PULSE_STABLE_MS);
}

function updateFrameIndexMatch(): void {
  const displayed = state.displayFrameIndex;
  const serverFrame = state.serverFrameIndex;
  state.frameIndexMatch =
    state.hasServerPacket &&
    isServerPacketFresh() &&
    displayed >= 0 &&
    serverFrame >= 0 &&
    displayed === serverFrame;
}

function pauseVideoAtReferenceTime(): void {
  const video = getPlayerVideo();
  if (!video) return;
  const refTime = Math.max(0, getReferenceTimeSeconds());
  try {
    video.playbackRate = 1;
    video.currentTime = refTime;
    video.pause();
  } catch {
    /* ignore */
  }
}

function handleTimelineEndFromPacket(fields: FrameSyncFields): void {
  if (state.timelineEndReached) return;
  const isEnd =
    fields.isTimelineEnd === true || fields.isTimelineEnd === "true";
  const locked =
    fields.scoreLocked === true || fields.scoreLocked === "true";
  if (!isEnd && !locked) return;
  state.timelineEndReached = true;
  state.scoreLocked = locked || isEnd;
  pauseVideoAtReferenceTime();
  console.log("[FRAME_SYNC] timeline-end", {
    frameIndex: state.serverFrameIndex,
    referenceTime: state.lastPacketReferenceTime,
    scoreLocked: state.scoreLocked,
  });
  deps.onTimelineEnd?.();
}

function shouldAcceptFrameSyncFields(fields: FrameSyncFields): boolean {
  const seq = fields.sequence != null ? Number(fields.sequence) : 0;
  if (seq > 0 && state.lastSequence > 0 && seq < state.lastSequence) {
    return false;
  }
  if (fields.timelineVersion != null) {
    const timelineVersionNum = Number(fields.timelineVersion);
    if (Number.isFinite(timelineVersionNum) && timelineVersionNum > 0) {
      if (state.expectedTimelineVersion <= 0) {
        state.expectedTimelineVersion = timelineVersionNum;
      } else if (timelineVersionNum !== state.expectedTimelineVersion) {
        return false;
      }
    }
  }
  if (fields.frameIndex != null) {
    const frameIndexNum = Number(fields.frameIndex);
    if (
      Number.isFinite(frameIndexNum) &&
      state.serverFrameIndex >= 0 &&
      frameIndexNum < state.serverFrameIndex
    ) {
      return false;
    }
  }
  if (fields.referenceTime != null && state.hasServerPacket) {
    if (Number(fields.referenceTime) + 0.001 < state.lastPacketReferenceTime) {
      return false;
    }
  }
  return true;
}

function applyFrameSyncPacket(raw: unknown, sourceTag: string): void {
  void sourceTag;
  const packet = normalizePacket(raw);
  const fields = extractFrameSyncFields(packet);
  if (
    fields.frameIndex == null &&
    fields.referenceTime == null &&
    fields.sequence == null
  ) {
    return;
  }
  if (!shouldAcceptFrameSyncFields(fields)) {
    return;
  }
  if (fields.frameIndex != null) {
    const frameIndexNum = Number(fields.frameIndex);
    if (!Number.isFinite(frameIndexNum) || frameIndexNum < 0) return;
    state.hasServerPacket = true;
    state.serverFrameIndex = frameIndexNum;
    state.displayFrameIndex = frameIndexNum;
  }
  if (fields.referenceTime != null) {
    applyServerSync(
      Number(fields.referenceTime || 0),
      Number(
        fields.serverUtc != null ? fields.serverUtc : correctedServerTimeMs(),
      ),
      Number(fields.sequence != null ? fields.sequence : 0),
    );
  }
  if (fields.sequence != null) {
    state.lastSequence = Math.max(state.lastSequence, Number(fields.sequence));
  }
  if (fields.frameTimestamp != null) {
    state.serverFrameTimestamp = Number(fields.frameTimestamp);
  }
  if (fields.referenceTime != null) {
    state.lastPacketReferenceTime = Number(fields.referenceTime);
  }
  if (fields.serverUtc != null) {
    state.lastPacketServerUtc = Number(fields.serverUtc);
  }
  state.lastPacketReceivedAt = nowLocalMs();
  if (fields.syncSessionId) {
    state.syncSessionId = String(fields.syncSessionId);
  }
  if (fields.totalFrames != null) {
    const totalFramesNum = Number(fields.totalFrames);
    if (Number.isFinite(totalFramesNum) && totalFramesNum > 0) {
      state.totalFrames = totalFramesNum;
    }
  }
  handleTimelineEndFromPacket(fields);
  updateFrameIndexMatch();
}

function applyClockSyncPacket(raw: unknown): void {
  const packet = normalizePacket(raw);
  applyServerSync(
    Number(packet.referenceTime != null ? packet.referenceTime : 0),
    Number(
      packet.serverUtc != null ? packet.serverUtc : correctedServerTimeMs(),
    ),
    Number(packet.sequence != null ? packet.sequence : 0),
  );
}

function setVideoPlaybackRateIfNeeded(
  video: HTMLVideoElement,
  rate: number,
): void {
  if (!Number.isFinite(rate)) return;
  if (state.lastAppliedPlaybackRate === rate && video.playbackRate === rate) {
    return;
  }
  try {
    video.playbackRate = rate;
    state.lastAppliedPlaybackRate = rate;
    state.playbackRate = rate;
  } catch {
    /* ignore */
  }
}

function seekVideoIfNeeded(
  video: HTMLVideoElement,
  targetSeconds: number,
): void {
  if (!Number.isFinite(targetSeconds)) return;
  const target = Math.max(0, targetSeconds);
  if (
    state.lastSeekTargetSeconds != null &&
    Math.abs(state.lastSeekTargetSeconds - target) < SEEK_EPSILON_SECONDS
  ) {
    return;
  }
  const current = Number(video.currentTime || 0);
  if (Math.abs(current - target) <= SEEK_EPSILON_SECONDS) {
    state.lastSeekTargetSeconds = target;
    return;
  }
  try {
    video.currentTime = target;
    state.lastSeekTargetSeconds = target;
    state.lastAppliedPlaybackRate = 1;
    state.playbackRate = 1;
  } catch {
    /* ignore */
  }
}

function correctVideoDrift(): void {
  if (!state.sessionActive || !state.clockStarted) return;
  const policy = driftPolicy();
  const now = nowLocalMs();
  if (now - state.lastDriftCorrectionAt < policy.driftCorrectionIntervalMs) return;
  state.lastDriftCorrectionAt = now;
  if (!isReferenceClockActive()) return;
  const video = getPlayerVideo();
  if (!video || video.paused || video.ended) return;

  const referenceTimeSeconds = Math.max(0, getReferenceTimeSeconds());
  const driftSeconds = getVideoTimeSeconds() - referenceTimeSeconds;
  const absDriftMs = Math.abs(driftSeconds) * 1000;

  if (absDriftMs < policy.smallDriftThresholdMs) {
    setVideoPlaybackRateIfNeeded(video, 1);
    return;
  }
  if (absDriftMs <= policy.largeDriftThresholdMs) {
    const slewRate =
      driftSeconds > 0 ? policy.slowPlaybackSpeed : policy.fastPlaybackSpeed;
    setVideoPlaybackRateIfNeeded(video, slewRate);
    return;
  }
  setVideoPlaybackRateIfNeeded(video, 1);
  if (policy.allowSeekOnLargeDrift) {
    seekVideoIfNeeded(video, referenceTimeSeconds);
  }
}

function renderTick(): void {
  if (!state.sessionActive) return;
  correctVideoDrift();
  if (state.hasServerPacket && state.serverFrameIndex >= 0) {
    state.displayFrameIndex = state.serverFrameIndex;
  }
  updateFrameIndexMatch();
}

function scheduleRenderLoop(): void {
  if (state.renderRaf != null) return;
  const tick = () => {
    if (!state.sessionActive) {
      state.renderRaf = null;
      return;
    }
    renderTick();
    state.renderRaf = requestAnimationFrame(tick);
  };
  tick();
}

function stopRenderLoop(): void {
  if (state.renderRaf == null) return;
  cancelAnimationFrame(state.renderRaf);
  state.renderRaf = null;
}

function applyPulseRpcResponse(parsed: unknown): void {
  if (!parsed) return;
  const record = asRecord(parsed);
  if (!record) return;
  const nested = asRecord(record.result) ?? record;
  const packet = nested.frameSync ?? record.frameSync;
  if (packet) {
    applyFrameSyncPacket(packet, "pulse-rpc");
    return;
  }
  const monitorPacket =
    packetFromMonitorSnapshot(nested.monitor) ??
    packetFromMonitorSnapshot(record.monitor);
  if (monitorPacket) {
    applyFrameSyncPacket(monitorPacket, "pulse-monitor");
  }
}

function scheduleNextPulse(intervalMs: number): void {
  if (!state.sessionActive) return;
  let delay = Number(intervalMs);
  const minimum = minimumPulseIntervalMs();
  if (!delay || delay < minimum) {
    delay = minimum;
  }
  state.lastPulseIntervalMs = delay;
  if (state.pulseTimer) clearTimeout(state.pulseTimer);
  state.pulseTimer = setTimeout(() => {
    state.pulseTimer = null;
    void sendPulse();
  }, delay);
}

async function sendPulse(): Promise<void> {
  if (!state.sessionActive) return;
  if (state.pulseInFlight) {
    scheduleNextPulse(FRAME_SYNC_PULSE_CRITICAL_MS);
    return;
  }
  state.pulseInFlight = true;
  const playerCount = Number(deps.getPlayerCount()) || 1;
  try {
    const parsed = await callTvRpc<unknown>(RPC_FRAME_SYNC_PULSE, {
      clientRole: "tv",
      clientRttMs: getLastClockRttMs() || 0,
      clientOffsetMs: getClockOffsetMs() || 0,
      playerCount,
      lastReceivedSequence: state.lastSequence,
    });
    applyPulseRpcResponse(parsed);
    deliverPulseNotifications(parsed);
    scheduleNextPulse(getAdaptivePulseIntervalMs());
  } catch (error) {
    console.log("[FRAME_SYNC] pulse failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    scheduleNextPulse(FRAME_SYNC_PULSE_CRITICAL_MS);
  } finally {
    state.pulseInFlight = false;
  }
}

function startPulseLoop(): void {
  stopPulseLoop();
  void sendPulse();
}

function stopPulseLoop(): void {
  if (state.pulseTimer) {
    clearTimeout(state.pulseTimer);
    state.pulseTimer = null;
  }
}

function clearServerPacketState(): void {
  state.hasServerPacket = false;
  state.serverFrameIndex = -1;
  state.displayFrameIndex = -1;
  state.serverFrameTimestamp = 0;
  state.lastSequence = 0;
  state.lastPacketReferenceTime = 0;
  state.lastPacketServerUtc = 0;
  state.lastPacketReceivedAt = 0;
  state.syncSessionId = "";
  state.frameIndexMatch = false;
  state.totalFrames = -1;
  state.expectedTimelineVersion = 0;
  state.timelineEndReached = false;
  state.scoreLocked = false;
}

export function configureFrameSync(next: FrameSyncDeps): void {
  deps = next;
  initServerReferenceClock({
    getServerUtcMs: correctedServerTimeMs,
  });
}

export function onFrameSyncSessionEnded(): void {
  state.sessionActive = false;
  state.clockStarted = false;
  clearServerPacketState();
  state.playbackRate = 1;
  state.lastDriftCorrectionAt = 0;
  state.lastAppliedPlaybackRate = null;
  state.lastSeekTargetSeconds = null;
  state.pulseInFlight = false;
  stopPulseLoop();
  stopRenderLoop();
  const video = getPlayerVideo();
  if (video) {
    try {
      video.playbackRate = 1;
      video.pause();
      video.muted = true;
      video.volume = 0;
    } catch {
      /* ignore */
    }
  }
}

/** Unity GameplayFrameSyncService.BeginSession(videoId) on VideoSyncStart. */
export function onFrameSyncSessionStarted(videoId: string | null): void {
  onFrameSyncSessionEnded();
  state.sessionActive = true;
  state.clockStarted = false;
  clearServerPacketState();
  console.log("[FRAME_SYNC] session started", { videoId });
}

/** Unity ServerReferenceClock.StartFromServerCountdown on TriggerSyncedPlayback. */
export function onFrameSyncReferenceClockStarted(
  startAtServerUtcMs: number,
): void {
  state.clockStarted = true;
  startFromServerCountdown(startAtServerUtcMs);
  startPulseLoop();
  const video = getPlayerVideo();
  if (video) {
    const ref = Math.max(0, currentReferenceTimeSeconds());
    if (ref > SEEK_EPSILON_SECONDS) {
      seekVideoIfNeeded(video, ref);
    }
  }
  scheduleRenderLoop();
  console.log("[FRAME_SYNC] reference clock started", {
    startAt: startAtServerUtcMs,
  });
}

export function resetFrameSync(): void {
  onFrameSyncSessionEnded();
  resetServerReferenceClock();
}

export function applyFrameSyncNotificationContent(content: unknown): void {
  applyFrameSyncPacket(content, "notification");
}

export function applyClockSyncNotificationContent(content: unknown): void {
  applyClockSyncPacket(content);
}

export function isFrameSyncTimelineEndReached(): boolean {
  return state.timelineEndReached;
}

export function isFrameSyncScoreLocked(): boolean {
  return state.scoreLocked;
}

export function getFrameSyncHudSnapshot(): FrameSyncHudSnapshot {
  const packetAge = getPacketAgeMs();
  return {
    sessionActive: state.sessionActive,
    clockStarted: state.clockStarted,
    hasServerPacket: state.hasServerPacket,
    referenceTimeSeconds: getReferenceTimeSeconds(),
    videoTimeSeconds: getVideoTimeSeconds(),
    videoDriftMs: getVideoDriftSeconds() * 1000,
    playbackRate: state.playbackRate,
    lastSequence: state.lastSequence,
    displayFrameIndex: state.displayFrameIndex,
    packetAgeMs: packetAge,
    pulseIntervalMs: state.lastPulseIntervalMs,
    timelineEndReached: state.timelineEndReached,
    scoreLocked: state.scoreLocked,
  };
}
