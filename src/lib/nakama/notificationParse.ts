import {
  getNotificationSubject,
  NOTIFICATION_CODE_LINK_ACCEPTED,
  NOTIFICATION_CODES,
  notificationCodeName,
} from "./notificationCodes";
import type { NotificationPayload } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function coerceNotification(value: unknown): NotificationPayload | null {
  const record = asRecord(value);
  if (!record) return null;

  const code =
    typeof record.code === "number"
      ? record.code
      : typeof record.code === "string"
        ? Number(record.code)
        : undefined;

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    subject: typeof record.subject === "string" ? record.subject : undefined,
    content:
      typeof record.content === "string" || asRecord(record.content)
        ? (record.content as NotificationPayload["content"])
        : undefined,
    code: Number.isFinite(code) ? code : undefined,
    sender_id:
      typeof record.sender_id === "string" ? record.sender_id : undefined,
    create_time:
      typeof record.create_time === "string" ? record.create_time : undefined,
    persistent:
      typeof record.persistent === "boolean" ? record.persistent : undefined,
  };
}

/** Collect notification objects from REST list or WS message shapes. */
export function extractNotifications(input: unknown): NotificationPayload[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .map(coerceNotification)
      .filter((item): item is NotificationPayload => item != null);
  }

  const root = asRecord(input);
  if (!root) return [];

  if (Array.isArray(root.notifications)) {
    return extractNotifications(root.notifications);
  }

  const nested = asRecord(root.notifications);
  if (nested && Array.isArray(nested.notifications)) {
    return extractNotifications(nested.notifications);
  }

  // Single notification object
  if ("code" in root || "subject" in root) {
    const single = coerceNotification(root);
    return single ? [single] : [];
  }

  return [];
}

export function parseContentRecord(
  content: NotificationPayload["content"],
): Record<string, unknown> | null {
  if (!content) return null;
  if (typeof content === "string") {
    try {
      return asRecord(JSON.parse(content));
    } catch {
      return null;
    }
  }
  return asRecord(content);
}

/** loginCode from notification content (string or number). */
export function getNotificationLoginCode(
  notification: NotificationPayload,
): string | null {
  const record = parseContentRecord(notification.content);
  if (!record) return null;

  const value = record.loginCode ?? record.login_code ?? record.code;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return null;
}

export function findLinkAcceptedNotification(
  notifications: NotificationPayload[],
  expectedLoginCode?: string | null,
): NotificationPayload | null {
  return (
    notifications.find((item) => {
      if (item.code !== NOTIFICATION_CODE_LINK_ACCEPTED) return false;
      if (expectedLoginCode == null || expectedLoginCode === "") return true;
      const code = getNotificationLoginCode(item);
      if (code == null) return false;
      return code === String(expectedLoginCode);
    }) ?? null
  );
}

export function messageHasLinkAccepted(
  json: unknown,
  expectedLoginCode?: string | null,
): boolean {
  return (
    findLinkAcceptedNotification(
      extractNotifications(json),
      expectedLoginCode,
    ) != null
  );
}

/** TV getNotificationCode — prefer envelope code, then content.code. */
export function getNotificationCode(
  notification: NotificationPayload | null | undefined,
): number | null {
  if (!notification) return null;

  if (notification.code != null) {
    const fromEnvelope = Number(notification.code);
    if (!Number.isNaN(fromEnvelope) && fromEnvelope > 1) {
      return fromEnvelope;
    }
  }

  const parsed = parseContentRecord(notification.content);
  if (parsed && parsed.code != null && parsed.code !== "") {
    const fromContent = Number(parsed.code);
    if (!Number.isNaN(fromContent) && fromContent > 1) {
      return fromContent;
    }
  }

  if (notification.code != null) {
    const fallback = Number(notification.code);
    return Number.isNaN(fallback) ? null : fallback;
  }
  return null;
}

export function notificationCodeMatches(
  notification: NotificationPayload | null | undefined,
  code: number,
): boolean {
  const nCode = getNotificationCode(notification);
  if (nCode == null || Number.isNaN(nCode)) return false;
  return String(nCode) === String(code);
}

export function isOwnNotification(
  notification: NotificationPayload | null | undefined,
): boolean {
  if (!notification?.subject) return false;
  const subject = getNotificationSubject();
  if (!subject) return false;
  return String(notification.subject) === subject;
}

function recordHasScoreTotal(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const nested =
    asRecord(record.data) ??
    asRecord(record.result) ??
    asRecord(record.content) ??
    record;
  return (
    nested.newTotalScore != null ||
    nested.new_total_score != null ||
    nested.totalScore != null ||
    nested.total_score != null ||
    nested.score != null ||
    nested.pointsAdded != null ||
    nested.points_added != null ||
    nested.delta != null
  );
}

/** TV notificationLooksLikeScore — code 8 or a payload with a total score. */
export function notificationLooksLikeScore(
  notification: NotificationPayload | null | undefined,
): boolean {
  if (!notification) return false;
  if (
    notificationCodeMatches(
      notification,
      NOTIFICATION_CODES.OnPlayerTotalScoreChanged,
    )
  ) {
    return true;
  }
  return recordHasScoreTotal(
    parseContentRecord(notification.content) ?? notification.content,
  );
}

/** Ignore echoes of our own sends. Score packets must still be applied. */
export function shouldIgnoreOwnNotification(
  notification: NotificationPayload,
): boolean {
  if (!isOwnNotification(notification)) return false;
  if (notificationLooksLikeScore(notification)) return false;
  return true;
}

export function logNotificationRecv(
  notification: NotificationPayload,
  note?: string,
): void {
  const code = getNotificationCode(notification);
  console.log(`[NOTIF][RECV]${note ? ` ${note}` : ""}`, {
    id: notification.id ?? null,
    code,
    codeName: code != null ? notificationCodeName(code) : null,
    subject: notification.subject ?? null,
  });
}
