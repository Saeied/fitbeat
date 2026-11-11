import { readScorePayloadFields } from "./gameplayParse";
import { extractNotifications } from "./notificationParse";
import { NOTIFICATION_CODES } from "./notificationCodes";
import type { NotificationPayload } from "./types";

type NotificationSink = (notifications: NotificationPayload[]) => void;

let pulseSink: NotificationSink | null = null;

const lastPulseSlotTotals: { 1: number | null; 2: number | null } = {
  1: null,
  2: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readFlatPlayerScore(
  record: Record<string, unknown>,
  slot: 1 | 2,
): number | null {
  const keys =
    slot === 1
      ? ["player1Score", "player1_score", "p1Score", "p1_score"]
      : ["player2Score", "player2_score", "p2Score", "p2_score"];
  for (const key of keys) {
    const value = record[key];
    if (value == null || value === "") continue;
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function scoreNotificationForSlot(
  slot: 1 | 2,
  total: number,
  record: Record<string, unknown> = {},
): NotificationPayload {
  return {
    code: NOTIFICATION_CODES.OnPlayerTotalScoreChanged,
    content: { ...record, playerSlot: slot, newTotalScore: total },
  };
}

function scoreNotificationsFromFlatScores(
  record: Record<string, unknown>,
): NotificationPayload[] {
  const batch: NotificationPayload[] = [];
  for (const slot of [1, 2] as const) {
    const total = readFlatPlayerScore(record, slot);
    if (total == null) continue;
    batch.push(scoreNotificationForSlot(slot, total, record));
  }
  return batch;
}

function scoreNotificationsFromPlayers(
  players: unknown,
): NotificationPayload[] {
  if (!Array.isArray(players)) return [];
  const batch: NotificationPayload[] = [];
  for (const item of players) {
    const record = asRecord(item);
    if (!record) continue;
    const slotRaw = Number(
      record.playerSlot ?? record.player_slot ?? record.slot ?? 0,
    );
    if (slotRaw !== 1 && slotRaw !== 2) continue;
    const slot = slotRaw as 1 | 2;
    const scoreRaw =
      record.score ??
      record.totalScore ??
      record.total_score ??
      record.newTotalScore ??
      record.new_total_score;
    if (scoreRaw == null || scoreRaw === "") continue;
    const total = Number(scoreRaw);
    if (Number.isNaN(total)) continue;
    batch.push(scoreNotificationForSlot(slot, total, record));
  }
  return batch;
}

function dedupeUnchangedPulseTotals(
  notifications: NotificationPayload[],
): NotificationPayload[] {
  const batch: NotificationPayload[] = [];
  for (const notification of notifications) {
    const fields = readScorePayloadFields(notification.content);
    const slot: 1 | 2 = fields.playerSlot === 2 ? 2 : 1;
    const isTotalOnly =
      fields.pointsAdded === 0 && !fields.feedback.trim();
    if (
      isTotalOnly &&
      fields.newTotalScore != null &&
      !Number.isNaN(fields.newTotalScore) &&
      lastPulseSlotTotals[slot] === fields.newTotalScore
    ) {
      continue;
    }
    if (
      isTotalOnly &&
      fields.newTotalScore != null &&
      !Number.isNaN(fields.newTotalScore)
    ) {
      lastPulseSlotTotals[slot] = fields.newTotalScore;
    }
    batch.push(notification);
  }
  return batch;
}

/** useNotifications registers — frameSync pulse may deliver score notifications inline. */
export function registerPulseNotificationSink(
  sink: NotificationSink | null,
): () => void {
  if (sink) {
    lastPulseSlotTotals[1] = null;
    lastPulseSlotTotals[2] = null;
  }
  pulseSink = sink;
  return () => {
    if (pulseSink === sink) pulseSink = null;
  };
}

function inlineScoreNotification(
  record: Record<string, unknown>,
): NotificationPayload | null {
  const fields = readScorePayloadFields(record);
  const hasTotal =
    fields.newTotalScore != null && !Number.isNaN(fields.newTotalScore);
  const hasHit = fields.pointsAdded > 0 || Boolean(fields.feedback.trim());
  if (!hasTotal && !hasHit) return null;
  return {
    code: NOTIFICATION_CODES.OnPlayerTotalScoreChanged,
    content: record,
  };
}

function collectPulseScoreNotifications(
  nested: Record<string, unknown>,
  root: Record<string, unknown>,
): NotificationPayload[] {
  const batch: NotificationPayload[] = [];
  const raw = nested.notifications ?? root.notifications;
  if (raw) batch.push(...extractNotifications(raw));

  const inline =
    inlineScoreNotification(nested) ??
    inlineScoreNotification(
      nested.playerScore && typeof nested.playerScore === "object"
        ? (nested.playerScore as Record<string, unknown>)
        : {},
    ) ??
    inlineScoreNotification(
      nested.scoreData && typeof nested.scoreData === "object"
        ? (nested.scoreData as Record<string, unknown>)
        : {},
    );
  if (inline) batch.push(inline);

  batch.push(...scoreNotificationsFromFlatScores(nested));

  const monitor = asRecord(nested.monitor);
  if (monitor) {
    batch.push(...scoreNotificationsFromFlatScores(monitor));
  }

  const players = nested.players ?? monitor?.players;
  if (players) {
    batch.push(...scoreNotificationsFromPlayers(players));
  }

  return batch;
}

export function deliverPulseNotifications(parsed: unknown): void {
  if (!pulseSink) return;
  const record = asRecord(parsed);
  if (!record) return;
  const nested = asRecord(record.result) ?? record;

  const batch = dedupeUnchangedPulseTotals(
    collectPulseScoreNotifications(nested, record),
  );

  if (batch.length === 0) return;

  if (process.env.NODE_ENV === "development") {
    const scoreCount = batch.filter((notification) => {
      const fields = readScorePayloadFields(notification.content);
      return (
        fields.newTotalScore != null ||
        fields.pointsAdded > 0 ||
        Boolean(fields.feedback.trim())
      );
    }).length;
    if (scoreCount > 0) {
      console.log(`[SCORE][PULSE] delivered ${scoreCount} score packet(s)`);
    }
  }

  pulseSink(batch);
}
