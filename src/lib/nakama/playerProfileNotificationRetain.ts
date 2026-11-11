import {
  isPlayerProfileUpdatedNotification,
  parsePlayerProfileNotification,
} from "./playerProfileParse";
import type { NotificationPayload } from "./types";

function parseCreateTimeMs(createTime: string | undefined): number {
  if (!createTime) return 0;
  const ms = Date.parse(createTime);
  return Number.isFinite(ms) ? ms : 0;
}

/** Stable key for deduplicating the same notification across WS and REST. */
export function profileNotificationDedupeKey(
  notification: NotificationPayload,
): string {
  if (notification.id) return `id:${notification.id}`;
  const code = notification.code ?? "";
  const time = notification.create_time ?? "";
  const subject = notification.subject ?? "";
  return `anon:${code}:${time}:${subject}`;
}

function profileNotificationSortKey(notification: NotificationPayload): number {
  const parsed = parsePlayerProfileNotification(notification);
  if (parsed?.serverNowUtcMs && parsed.serverNowUtcMs > 0) {
    return parsed.serverNowUtcMs;
  }
  return parseCreateTimeMs(notification.create_time);
}

/** Pick the newest valid code 19 from a batch (does not mutate). */
export function selectNewestProfileNotification(
  notifications: NotificationPayload[],
): NotificationPayload | null {
  let best: NotificationPayload | null = null;
  let bestKey = -1;

  for (const notification of notifications) {
    if (!isPlayerProfileUpdatedNotification(notification)) continue;
    const parsed = parsePlayerProfileNotification(notification);
    if (!parsed) continue;

    const key = profileNotificationSortKey(notification);
    if (best == null || key >= bestKey) {
      best = notification;
      bestKey = key;
    }
  }

  return best;
}

/**
 * Merge an incoming profile notification into the retained snapshot.
 * Returns null when incoming is invalid or older than current.
 */
export function mergeRetainedProfileNotification(
  current: NotificationPayload | null,
  incoming: NotificationPayload | null,
): NotificationPayload | null {
  if (!incoming) return current;
  if (!isPlayerProfileUpdatedNotification(incoming)) return current;

  const incomingParsed = parsePlayerProfileNotification(incoming);
  if (!incomingParsed) return current;

  if (!current) return incoming;

  if (
    current.id &&
    incoming.id &&
    current.id === incoming.id
  ) {
    return current;
  }

  const currentKey = profileNotificationSortKey(current);
  const incomingKey = profileNotificationSortKey(incoming);
  return incomingKey >= currentKey ? incoming : current;
}

/** Scan a batch and merge any code 19 into retained state. */
export function mergeProfileNotificationsFromBatch(
  current: NotificationPayload | null,
  batch: NotificationPayload[],
): NotificationPayload | null {
  const candidate = selectNewestProfileNotification(batch);
  if (!candidate) return current;
  return mergeRetainedProfileNotification(current, candidate);
}
