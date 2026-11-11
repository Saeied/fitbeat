import { nakamaTimeouts } from "./config";
import { callTvRpc } from "./rpc";
import {
  RPC_SEND_NOTIFICATION_TO_SESSIONS,
  assertTvOutboundNotificationAllowed,
  getNotificationSubject,
  notificationCodeName,
  NOTIFICATION_CODES,
} from "./notificationCodes";

export function normalizeVideoIdNumber(
  videoId: string | number | null | undefined,
): number | null {
  const n = Number(videoId);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Sends SendNotificationBaseReqModel via rpc_multiSession_sendNotificationToSessions:
 * { subject: client UUID, code: SendNotificationCodeType, content: payload }.
 */
export async function sendDataToMySessions(
  code: number,
  content: Record<string, unknown> = {},
): Promise<unknown> {
  assertTvOutboundNotificationAllowed(code);
  const subject = getNotificationSubject();
  const payload = {
    subject,
    content,
    code,
  };

  console.log("[NOTIF][SEND]", {
    subject,
    code,
    codeName: notificationCodeName(code),
    content,
  });

  try {
    const result = await callTvRpc<unknown>(
      RPC_SEND_NOTIFICATION_TO_SESSIONS,
      payload,
    );
    console.log("[NOTIF][SEND] RPC ok", {
      code,
      codeName: notificationCodeName(code),
      result,
    });
    return result;
  } catch (error) {
    console.error("[NOTIF][SEND] RPC failed", {
      code,
      codeName: notificationCodeName(code),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** code 9 — first step after picking a song (TV openVideoByIndex). */
export async function sendVideoDownloadIntent(
  videoId: string | number,
): Promise<void> {
  const videoIdNum = normalizeVideoIdNumber(videoId);
  if (videoIdNum === null) {
    throw new Error("شناسه ویدیو نامعتبر است");
  }
  console.log("[VIDEO_SYNC][VideoDownloadIntent] send", { videoId: videoIdNum });
  await sendDataToMySessions(NOTIFICATION_CODES.VideoDownloadIntent, {
    videoId: videoIdNum,
  });
  console.log("[VIDEO_SYNC][VideoDownloadIntent] send success", {
    videoId: videoIdNum,
  });
}

/** code 6 — player count to mobile (TV sendPlayerCountToMobile). */
export async function sendWaitingForVideoPlayReady(
  playerCount: number,
): Promise<void> {
  const count = playerCount === 2 ? 2 : 1;
  console.log("[VIDEO_SYNC][WaitingForVideoPlayReady] send", {
    playerCount: count,
  });
  await sendDataToMySessions(NOTIFICATION_CODES.WaitingForVideoPlayReady, {
    playerCount: count,
  });
  console.log("[VIDEO_SYNC][WaitingForVideoPlayReady] send success", {
    playerCount: count,
  });
}

/** code 10 — TV buffered and ready (TV sendVideoReady). */
export async function sendVideoTvReady(
  videoId: string | number,
): Promise<void> {
  const videoIdNum = normalizeVideoIdNumber(videoId);
  if (videoIdNum === null) {
    throw new Error("شناسه ویدیو نامعتبر است");
  }
  console.log("[VIDEO_SYNC][VideoTvReady] send", { videoId: videoIdNum });
  await sendDataToMySessions(NOTIFICATION_CODES.VideoTvReady, {
    videoId: videoIdNum,
  });
  console.log("[VIDEO_SYNC][VideoTvReady] send success", { videoId: videoIdNum });
}

/** TV sendVideoReadyWithRetry — 3 attempts, 1s apart. */
export async function sendVideoTvReadyWithRetry(
  videoId: string | number,
  isCurrent?: () => boolean,
): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < nakamaTimeouts.syncRetryMax; attempt += 1) {
    if (isCurrent && !isCurrent()) {
      console.log("[VIDEO_SYNC] TV READY retry aborted — flow epoch changed", {
        videoId,
        attempt: attempt + 1,
      });
      return;
    }
    try {
      await sendVideoTvReady(videoId);
      return;
    } catch (error) {
      lastError = error;
      console.log("[VIDEO_SYNC] TV READY retry", {
        attempt: attempt + 1,
        max: nakamaTimeouts.syncRetryMax,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt + 1 >= nakamaTimeouts.syncRetryMax) break;
      await new Promise((resolve) =>
        setTimeout(resolve, nakamaTimeouts.syncRetryDelayMs),
      );
    }
  }
  if (isCurrent && !isCurrent()) return;
  throw lastError instanceof Error
    ? lastError
    : new Error("اعلام آمادگی به گوشی ناموفق بود");
}

/** code 13 — TV sendAuthoritativePlaybackCompleted when the video ends. */
export async function sendOnDanceVideoFinished(
  videoId: string | number,
): Promise<void> {
  const videoIdNum = normalizeVideoIdNumber(videoId);
  if (videoIdNum === null) {
    throw new Error("شناسه ویدیو نامعتبر است");
  }
  console.log("[VIDEO_SYNC][OnDanceVideoFinished] send authoritative", {
    videoId: videoIdNum,
  });
  await sendDataToMySessions(NOTIFICATION_CODES.OnDanceVideoFinished, {
    videoId: videoIdNum,
  });
  console.log("[VIDEO_SYNC][OnDanceVideoFinished] send authoritative success", {
    videoId: videoIdNum,
  });
}

/** code 14 — TV sendReturnToSongListToMobile. */
export async function sendReturnToSongList(): Promise<void> {
  console.log("[VIDEO_SYNC][ReturnToSongList] send");
  await sendDataToMySessions(NOTIFICATION_CODES.ReturnToSongList, {});
  console.log("[VIDEO_SYNC][ReturnToSongList] send success");
}

/** code 2 — TV sendPartnerHeartbeatPing. */
export async function sendPartnerHeartbeatPing(): Promise<void> {
  await sendDataToMySessions(NOTIFICATION_CODES.Ping, {
    reason: "heartbeat",
    timestamp: Date.now(),
    source: "tv",
  });
}

/** code 3 — reply to inbound Ping (TV handlePingNotification). */
export async function sendPongReply(
  content: Record<string, unknown> = {},
): Promise<void> {
  await sendDataToMySessions(NOTIFICATION_CODES.Pong, {
    timestamp: content.timestamp ?? Date.now(),
    sequence: content.sequence,
  });
}

let sessionEndedSent = false;

/** True if this page already sent code 17. */
export function wasSessionEndedSent(): boolean {
  return sessionEndedSent;
}

/** Marks code 17 as sent. Returns false when a duplicate would go out. */
export function markSessionEndedSent(): boolean {
  if (sessionEndedSent) return false;
  sessionEndedSent = true;
  return true;
}

/** New pairing may send SessionEnded again later. */
export function resetSessionEndedSent(): void {
  sessionEndedSent = false;
}

/** code 17 — TV sendSessionEndedNotification. */
export async function sendSessionEnded(reason: string): Promise<void> {
  if (!markSessionEndedSent()) {
    console.log("[LINK_SESSION][SessionEnded] skipped (already sent)", {
      reason,
    });
    return;
  }
  console.log("[LINK_SESSION][SessionEnded] send", { reason });
  try {
    await sendDataToMySessions(NOTIFICATION_CODES.SessionEnded, {
      reason,
      timestamp: Date.now(),
      source: "tv",
    });
  } catch (error) {
    sessionEndedSent = false;
    throw error;
  }
  console.log("[LINK_SESSION][SessionEnded] send success", { reason });
}
