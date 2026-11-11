import { NOTIFICATION_CODES } from "./notificationCodes";
import {
  notificationCodeMatches,
  parseContentRecord,
} from "./notificationParse";
import type { NotificationPayload } from "./types";

export type TvPlayerProfile = {
  userId: string;
  displayName: string;
  phoneNumber: string;
  avatarId: string;
  dateOfBirth: string;
  subscriptionStatus: string;
  hasFullAccess: boolean;
  freeVideoIds: string[];
  plan: string;
  expireDate: string;
  remainingWholeDays: number | null;
  serverNowUtcMs: number;
  purchasedAt: string;
  /** Optional forward-compatible age from payload. */
  age: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value.trim();
  }
  return "";
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item == null ? "" : String(item).trim()))
    .filter(Boolean);
}

function readOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function readAge(record: Record<string, unknown>): number | null {
  const direct = readOptionalInt(record.age);
  if (direct != null && direct >= 0 && direct <= 150) return direct;
  return null;
}

function unwrapProfileContentRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  if (readString(record, "userId", "user_id")) return record;

  const nestedObject = asRecord(record.content);
  if (nestedObject && readString(nestedObject, "userId", "user_id")) {
    return nestedObject;
  }

  if (typeof record.content === "string") {
    const parsed = parseContentRecord(record.content);
    if (parsed && readString(parsed, "userId", "user_id")) return parsed;
  }

  return record;
}

/** Parse TvPlayerProfileContent from notification content (object or JSON string). */
export function parseTvPlayerProfileContent(
  content: NotificationPayload["content"],
): TvPlayerProfile | null {
  let record = parseContentRecord(content);
  if (!record) return null;

  record = unwrapProfileContentRecord(record);

  const userId = readString(record, "userId", "user_id");
  if (!userId) return null;

  return {
    userId,
    displayName: readString(record, "displayName", "display_name"),
    phoneNumber: readString(record, "phoneNumber", "phone_number"),
    avatarId: readString(record, "avatarId", "avatar_id"),
    dateOfBirth: readString(record, "dateOfBirth", "date_of_birth"),
    subscriptionStatus: readString(
      record,
      "subscriptionStatus",
      "subscription_status",
    ),
    hasFullAccess: record.hasFullAccess === true,
    freeVideoIds: readStringArray(record, "freeVideoIds").length
      ? readStringArray(record, "freeVideoIds")
      : readStringArray(record, "free_video_ids"),
    plan: readString(record, "plan"),
    expireDate: readString(record, "expireDate", "expire_date"),
    remainingWholeDays: readOptionalInt(
      record.remainingWholeDays ?? record.remaining_whole_days,
    ),
    serverNowUtcMs: Number(record.serverNowUtcMs ?? record.server_now_utc_ms) || 0,
    purchasedAt: readString(record, "purchasedAt", "purchased_at"),
    age: readAge(record),
  };
}

export function isPlayerProfileUpdatedNotification(
  notification: NotificationPayload,
): boolean {
  return notificationCodeMatches(
    notification,
    NOTIFICATION_CODES.PlayerProfileUpdated,
  );
}

export function parsePlayerProfileNotification(
  notification: NotificationPayload,
): TvPlayerProfile | null {
  if (!isPlayerProfileUpdatedNotification(notification)) return null;
  return parseTvPlayerProfileContent(notification.content);
}

/** Prefer newer snapshots by serverNowUtcMs, then notification create_time. */
export function isNewerProfileSnapshot(
  incoming: TvPlayerProfile,
  current: TvPlayerProfile | null,
): boolean {
  if (!current) return true;
  if (incoming.serverNowUtcMs > 0 || current.serverNowUtcMs > 0) {
    if (incoming.serverNowUtcMs !== current.serverNowUtcMs) {
      return incoming.serverNowUtcMs >= current.serverNowUtcMs;
    }
  }
  if (incoming.userId !== current.userId) return true;
  return (
    JSON.stringify(incoming) !== JSON.stringify(current)
  );
}
