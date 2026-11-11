/** SendNotificationCodeType — numeric code on send/receive. */
export const NOTIFICATION_CODES = {
  None: 1,
  Ping: 2,
  Pong: 3,
  ReceiveAcceptedLinkLoginCode: 4,
  RequestPlayVideo: 5,
  WaitingForVideoPlayReady: 6,
  OnLoginWithDeviceId: 7,
  OnPlayerTotalScoreChanged: 8,
  VideoDownloadIntent: 9,
  VideoTvReady: 10,
  VideoUnityReady: 11,
  VideoSyncStart: 12,
  OnDanceVideoFinished: 13,
  ReturnToSongList: 14,
  ClockSync: 15,
  FrameSync: 16,
  SessionEnded: 17,
  PartnerDisconnected: 18,
  /** Mobile → TV: linked player profile snapshot (TvPlayerProfileContent). */
  PlayerProfileUpdated: 19,
} as const;

export type NotificationCodeName = keyof typeof NOTIFICATION_CODES;
export type NotificationCode =
  (typeof NOTIFICATION_CODES)[NotificationCodeName];

/** code 4 = ReceiveAcceptedLinkLoginCode (QR / login approved) */
export const NOTIFICATION_CODE_LINK_ACCEPTED =
  NOTIFICATION_CODES.ReceiveAcceptedLinkLoginCode;

/** Server rpc_generateSyncStartAt sets subject to this literal — not a client UUID. */
export const SERVER_VIDEO_SYNC_START_SUBJECT = "VideoSyncStart";
export const SERVER_FRAME_SYNC_SUBJECT = "FrameSync";

/** TV may only send session/game codes. VideoSyncStart must never be outbound. */
export const TV_OUTBOUND_NOTIFICATION_WHITELIST: Record<
  string,
  true
> = {
  Ping: true,
  Pong: true,
  WaitingForVideoPlayReady: true,
  VideoDownloadIntent: true,
  VideoTvReady: true,
  OnDanceVideoFinished: true,
  ReturnToSongList: true,
  SessionEnded: true,
};

export const RPC_SEND_NOTIFICATION_TO_SESSIONS =
  "rpc_multiSession_sendNotificationToSessions";

export const RPC_UNLINK_DEVICE = "rpc_multiSession_unlinkDevice";

const SUBJECT_STORAGE_KEY = "nakama.notificationSubject";

function createNotificationSubject(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      s += "-";
    } else if (i === 14) {
      s += "4";
    } else if (i === 19) {
      s += hex[(Math.random() * 4) | 8];
    } else {
      s += hex[(Math.random() * 16) | 0];
    }
  }
  return s;
}

/** Per-client UUID (SendNotificationBaseReqModel.subject). Ignore recv when it matches. */
export function getNotificationSubject(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = sessionStorage.getItem(SUBJECT_STORAGE_KEY);
    if (stored) return stored;
    const next = createNotificationSubject();
    sessionStorage.setItem(SUBJECT_STORAGE_KEY, next);
    return next;
  } catch {
    return createNotificationSubject();
  }
}

export function notificationCodeName(
  code: number | string | null | undefined,
): string {
  const n = Number(code);
  if (!Number.isFinite(n)) return `Unknown(${String(code)})`;
  for (const [name, value] of Object.entries(NOTIFICATION_CODES)) {
    if (value === n) return name;
  }
  return `Unknown(${String(code)})`;
}

export function assertTvOutboundNotificationAllowed(
  code: number,
): void {
  const codeName = notificationCodeName(code);
  if (
    code === NOTIFICATION_CODES.VideoSyncStart ||
    codeName === "VideoSyncStart"
  ) {
    throw new Error(
      "[TV_SYNC_POLICY] TV MUST NOT send VideoSyncStart (code 12). " +
        "Synchronization authority belongs to Nakama rpc_generateSyncStartAt only.",
    );
  }
  if (!TV_OUTBOUND_NOTIFICATION_WHITELIST[codeName]) {
    throw new Error(
      `[TV_SYNC_POLICY] TV outbound notification blocked: code=${code} (${codeName}). ` +
        "Allowed: Ping, Pong, WaitingForVideoPlayReady, VideoDownloadIntent, VideoTvReady, OnDanceVideoFinished, ReturnToSongList, SessionEnded.",
    );
  }
}
