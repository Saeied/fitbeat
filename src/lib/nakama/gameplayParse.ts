import {
  NOTIFICATION_CODES,
  SERVER_FRAME_SYNC_SUBJECT,
  SERVER_VIDEO_SYNC_START_SUBJECT,
} from "./notificationCodes";
import {
  notificationCodeMatches,
  parseContentRecord,
} from "./notificationParse";
import { normalizeVideoIdNumber } from "./sessionNotifications";
import type { NotificationPayload } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** TV normalizeVideoSyncPayload — unwrap data/result envelopes. */
export function normalizeVideoSyncPayload(
  payload: unknown,
): Record<string, unknown> {
  const record = asRecord(payload);
  if (!record) return {};
  const nested = asRecord(record.data) ?? asRecord(record.result);
  return nested ?? record;
}

export function getSyncPayloadVideoId(
  payload: unknown,
): string {
  const record = normalizeVideoSyncPayload(payload);
  if (record.videoId != null) return String(record.videoId);
  if (record.video_id != null) return String(record.video_id);
  return "";
}

export function getNotificationVideoId(
  notification: NotificationPayload,
): number | null {
  const content = parseContentRecord(notification.content);
  const id = getSyncPayloadVideoId(content);
  return normalizeVideoIdNumber(id || null);
}

export function findVideoDownloadIntentNotification(
  notifications: NotificationPayload[],
): NotificationPayload | null {
  return (
    notifications.find((item) =>
      notificationCodeMatches(
        item,
        NOTIFICATION_CODES.VideoDownloadIntent,
      ),
    ) ?? null
  );
}

export function getNotificationPlayerCount(
  notification: NotificationPayload,
): number | null {
  const content = normalizeVideoSyncPayload(
    parseContentRecord(notification.content),
  );
  const raw = content.playerCount ?? content.player_count;
  const count = Number(raw);
  if (count === 1 || count === 2) return count;
  return null;
}

export function findWaitingForVideoPlayReadyNotification(
  notifications: NotificationPayload[],
): NotificationPayload | null {
  return (
    notifications.find((item) =>
      notificationCodeMatches(
        item,
        NOTIFICATION_CODES.WaitingForVideoPlayReady,
      ),
    ) ?? null
  );
}

export function findVideoUnityReadyNotification(
  notifications: NotificationPayload[],
): NotificationPayload | null {
  return (
    notifications.find((item) =>
      notificationCodeMatches(item, NOTIFICATION_CODES.VideoUnityReady),
    ) ?? null
  );
}

/** Server-only VideoSyncStart — subject must be the literal "VideoSyncStart". */
export function isServerAuthoritativeVideoSyncStart(
  notification: NotificationPayload,
): boolean {
  if (!notificationCodeMatches(notification, NOTIFICATION_CODES.VideoSyncStart)) {
    return false;
  }
  return String(notification.subject ?? "") === SERVER_VIDEO_SYNC_START_SUBJECT;
}

export function parseSyncStartAt(payload: unknown): number {
  const record = normalizeVideoSyncPayload(payload);
  const raw = record.startAt ?? record.start_at ?? 0;
  let n = Number(raw);
  if (!n || Number.isNaN(n)) return 0;
  if (n < 1_000_000_000_000) n *= 1000;
  return n;
}

export function parseVideoSyncStartContent(
  notification: NotificationPayload,
): { startAt: number; videoId: string } | null {
  const content = parseContentRecord(notification.content);
  const startAt = parseSyncStartAt(content);
  if (!startAt) return null;
  return {
    startAt,
    videoId: getSyncPayloadVideoId(content),
  };
}

export function findServerVideoSyncStartNotification(
  notifications: NotificationPayload[],
): NotificationPayload | null {
  return (
    notifications.find((item) => isServerAuthoritativeVideoSyncStart(item)) ??
    null
  );
}

/** Server FrameSync — subject must be the literal "FrameSync". */
export function isServerAuthoritativeFrameSync(
  notification: NotificationPayload,
): boolean {
  if (!notificationCodeMatches(notification, NOTIFICATION_CODES.FrameSync)) {
    return false;
  }
  return String(notification.subject ?? "") === SERVER_FRAME_SYNC_SUBJECT;
}

export function isClockSyncNotification(
  notification: NotificationPayload,
): boolean {
  return notificationCodeMatches(notification, NOTIFICATION_CODES.ClockSync);
}

export function isScoreNotification(
  notification: NotificationPayload,
): boolean {
  return notificationCodeMatches(
    notification,
    NOTIFICATION_CODES.OnPlayerTotalScoreChanged,
  );
}

function pickScoreField(
  payload: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (payload[key] != null && payload[key] !== "") return payload[key];
  }
  return undefined;
}

/**
 * Reference 3c5c876 unwrapScorePayloadObject — tolerate nested Unity envelopes
 * (scoreData / playerScore / content / results[0]) without changing code 8.
 */
function unwrapScorePayloadObject(payload: unknown): Record<string, unknown> {
  let next: unknown = payload;
  if (typeof next === "string") {
    try {
      next = JSON.parse(next);
    } catch {
      /* keep */
    }
  }
  next = normalizeVideoSyncPayload(next);
  let record = asRecord(next);
  if (!record) return {};

  const scoreData = asRecord(record.scoreData);
  if (scoreData) record = normalizeVideoSyncPayload(scoreData);

  const playerScore = asRecord(record.playerScore);
  if (playerScore) record = normalizeVideoSyncPayload(playerScore);

  const content = asRecord(record.content);
  const missingTotals =
    record.newTotalScore == null &&
    record.new_total_score == null &&
    record.score == null;
  if (content && (record.type === "player_score" || missingTotals)) {
    const nested = unwrapScorePayloadObject(content);
    if (nested.newTotalScore != null || nested.score != null) return nested;
    record = { ...record, ...content };
  }

  return record;
}

function normalizeScorePayload(payload: unknown): Record<string, unknown> {
  return unwrapScorePayloadObject(payload);
}

export type ScorePayloadFields = {
  newTotalScore: number | null;
  pointsAdded: number;
  feedback: string;
  playerSlot: number;
  isSessionComplete: boolean;
  maxScore: number | null;
  calories: number | null;
};

/** TV readScorePayloadFields — aligned with reference 3c5c876. */
export function readScorePayloadFields(payload: unknown): ScorePayloadFields {
  const record = normalizeScorePayload(payload);
  const results = Array.isArray(record.results) ? record.results : [];
  const firstResult = asRecord(results[0]) ?? {};

  const playerSlotRaw = pickScoreField(record, [
    "playerSlot",
    "player_slot",
    "slot",
    "playerIndex",
    "player_index",
  ]);
  const totalRaw =
    pickScoreField(record, [
      "newTotalScore",
      "new_total_score",
      "totalScore",
      "total_score",
      "currentScore",
      "current_score",
      "playerScore",
      "player_score",
      "score",
    ]) ??
    pickScoreField(firstResult, [
      "newTotalScore",
      "new_total_score",
      "totalScore",
      "total_score",
      "currentScore",
      "current_score",
      "playerScore",
      "player_score",
      "score",
    ]);
  const pointsRaw =
    pickScoreField(record, [
      "pointsAdded",
      "points_added",
      "delta",
      "points",
      "scoreDelta",
      "score_delta",
      "addedPoints",
      "added_points",
    ]) ??
    pickScoreField(firstResult, [
      "pointsAdded",
      "points_added",
      "delta",
      "points",
      "scoreDelta",
      "score_delta",
      "addedPoints",
      "added_points",
    ]) ??
    0;
  const feedback =
    pickScoreField(record, [
      "feedback",
      "rating",
      "hitFeedback",
      "hit_feedback",
      "moveFeedback",
      "move_feedback",
    ]) ??
    pickScoreField(firstResult, [
      "feedback",
      "rating",
      "hitFeedback",
      "hit_feedback",
    ]) ??
    "";
  const slotFromResult = pickScoreField(firstResult, [
    "playerSlot",
    "player_slot",
    "slot",
  ]);
  const maxScoreRaw =
    pickScoreField(record, ["maxScore", "max_score"]) ??
    pickScoreField(firstResult, ["maxScore", "max_score"]);
  const maxScoreNum =
    maxScoreRaw == null || maxScoreRaw === "" ? null : Number(maxScoreRaw);
  const caloriesRaw =
    pickScoreField(record, ["calories"]) ??
    pickScoreField(firstResult, ["calories"]);
  const caloriesNum =
    caloriesRaw == null || caloriesRaw === "" ? null : Number(caloriesRaw);

  return {
    newTotalScore: totalRaw == null || totalRaw === "" ? null : Number(totalRaw),
    pointsAdded: Number(pointsRaw) || 0,
    feedback: String(feedback),
    playerSlot: Number(playerSlotRaw ?? slotFromResult) || 0,
    isSessionComplete:
      record.isSessionComplete === true ||
      record.is_session_complete === true ||
      record.sessionComplete === true ||
      record.session_complete === true,
    maxScore:
      maxScoreNum != null && !Number.isNaN(maxScoreNum) ? maxScoreNum : null,
    calories:
      caloriesNum != null && !Number.isNaN(caloriesNum) ? caloriesNum : null,
  };
}

export function parseScoreNotification(
  notification: NotificationPayload,
): ScorePayloadFields | null {
  const fields = readScorePayloadFields(
    parseContentRecord(notification.content) ?? notification.content,
  );
  const hasTotal =
    fields.newTotalScore != null && !Number.isNaN(fields.newTotalScore);
  const hasHit = fields.pointsAdded > 0 || Boolean(fields.feedback.trim());
  if (!hasTotal && !hasHit) {
    return null;
  }
  return fields;
}

export function isDanceVideoFinishedNotification(
  notification: NotificationPayload,
): boolean {
  return notificationCodeMatches(
    notification,
    NOTIFICATION_CODES.OnDanceVideoFinished,
  );
}

export function isReturnToSongListNotification(
  notification: NotificationPayload,
): boolean {
  return notificationCodeMatches(
    notification,
    NOTIFICATION_CODES.ReturnToSongList,
  );
}

export type DanceFinishedPlayer = {
  playerSlot: number;
  score: number;
};

export type DanceFinishedPayload = {
  videoId: string | null;
  videoTitle: string;
  playerCount: number;
  finalScore: number;
  player1Score: number | null;
  player2Score: number | null;
  player1StarRating: number | null;
  player2StarRating: number | null;
  maxScore: number;
  hasFlatPlayerScores: boolean;
  isSessionComplete: boolean;
  players: DanceFinishedPlayer[];
  videoDurationSeconds: number;
};

function normalizeDanceFinishedRecord(
  payload: unknown,
): Record<string, unknown> {
  let next: unknown = normalizeVideoSyncPayload(payload);
  if (typeof next === "string") {
    try {
      next = JSON.parse(next);
    } catch {
      next = {};
    }
  }
  const record = asRecord(next);
  if (!record) return {};
  const nested = asRecord(record.content);
  if (nested) return normalizeVideoSyncPayload(nested);
  return record;
}

/** TV normalizeDanceFinishedPayload. */
export function parseDanceFinishedPayload(
  payload: unknown,
): DanceFinishedPayload {
  const record = normalizeDanceFinishedRecord(payload);
  const players: DanceFinishedPlayer[] = [];
  if (Array.isArray(record.players)) {
    record.players.forEach((entry, index) => {
      const item = asRecord(entry);
      if (!item) return;
      players.push({
        playerSlot: Number(
          item.playerSlot ?? item.player_slot ?? index + 1,
        ),
        score: Number(item.score ?? item.totalScore ?? 0),
      });
    });
  }

  const videoIdRaw = record.videoId ?? record.video_id ?? null;
  return {
    videoId: videoIdRaw == null || videoIdRaw === "" ? null : String(videoIdRaw),
    videoTitle: String(record.videoTitle || record.video_title || ""),
    playerCount: Number(record.playerCount ?? record.player_count ?? 0),
    finalScore: Number(record.finalScore ?? record.final_score ?? 0),
    player1Score:
      record.player1Score != null
        ? Number(record.player1Score)
        : record.player1_score != null
          ? Number(record.player1_score)
          : null,
    player2Score:
      record.player2Score != null
        ? Number(record.player2Score)
        : record.player2_score != null
          ? Number(record.player2_score)
          : null,
    player1StarRating:
      record.player1StarRating != null
        ? Number(record.player1StarRating)
        : record.player1_star_rating != null
          ? Number(record.player1_star_rating)
          : record.starRating != null
            ? Number(record.starRating)
            : record.star_rating != null
              ? Number(record.star_rating)
              : null,
    player2StarRating:
      record.player2StarRating != null
        ? Number(record.player2StarRating)
        : record.player2_star_rating != null
          ? Number(record.player2_star_rating)
          : null,
    maxScore: Number(record.maxScore ?? record.max_score ?? 0),
    hasFlatPlayerScores:
      record.player1Score != null ||
      record.player1_score != null ||
      record.player2Score != null ||
      record.player2_score != null,
    isSessionComplete:
      record.isSessionComplete != null
        ? Boolean(record.isSessionComplete)
        : record.is_session_complete != null
          ? Boolean(record.is_session_complete)
          : true,
    players,
    videoDurationSeconds: Number(
      record.videoDurationSeconds ?? record.video_duration_seconds ?? 0,
    ),
  };
}

export function parseDanceFinishedNotification(
  notification: NotificationPayload,
): DanceFinishedPayload {
  return parseDanceFinishedPayload(
    parseContentRecord(notification.content) ?? notification.content,
  );
}

export function isPingNotification(notification: NotificationPayload): boolean {
  return notificationCodeMatches(notification, NOTIFICATION_CODES.Ping);
}

export function isPongNotification(notification: NotificationPayload): boolean {
  return notificationCodeMatches(notification, NOTIFICATION_CODES.Pong);
}

export function isSessionEndedNotification(
  notification: NotificationPayload,
): boolean {
  return notificationCodeMatches(notification, NOTIFICATION_CODES.SessionEnded);
}

export function isPartnerDisconnectedNotification(
  notification: NotificationPayload,
): boolean {
  return notificationCodeMatches(
    notification,
    NOTIFICATION_CODES.PartnerDisconnected,
  );
}
