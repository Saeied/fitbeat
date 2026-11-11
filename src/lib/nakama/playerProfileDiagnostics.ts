import { getNotificationCode } from "./notificationParse";
import { notificationCodeName } from "./notificationCodes";
import {
  isPlayerProfileUpdatedNotification,
  parsePlayerProfileNotification,
} from "./playerProfileParse";
import type { NotificationPayload } from "./types";

export function logProfileNotificationReceived(
  notification: NotificationPayload,
  source: "ws" | "poll" | "inbox-recovery",
): void {
  const code = getNotificationCode(notification);
  console.log("[PLAYER-PROFILE] code 19 received", {
    source,
    code,
    codeName: code != null ? notificationCodeName(code) : null,
    notificationId: notification.id ?? null,
  });
}

export function logProfileNotificationRejected(
  notification: NotificationPayload,
  reason: string,
): void {
  if (!isPlayerProfileUpdatedNotification(notification)) return;
  console.log("[PLAYER-PROFILE] code 19 rejected", {
    reason,
    notificationId: notification.id ?? null,
  });
}

export function logProfileAppliedFromSnapshot(userId: string, hasDisplayName: boolean): void {
  console.log("[PLAYER-PROFILE] applied", {
    userId,
    hasDisplayName,
  });
}

export function logProfileRecoveredFromInbox(notificationId: string | null): void {
  console.log("[PLAYER-PROFILE] recovered from notification inbox", {
    notificationId,
  });
}

export function logAvatarImageLoadFailed(): void {
  console.log("[PLAYER-PROFILE] avatar image load failed — using placeholder");
}

export function logProfileAwaitingDelivery(linked: boolean, enabled: boolean): void {
  console.log("[PLAYER-PROFILE] awaiting delivery", {
    linked,
    profileHookEnabled: enabled,
  });
}

export function logProfileInboxPoll(result: "found" | "empty" | "failed"): void {
  console.log("[PLAYER-PROFILE] inbox poll", { result });
}

export function logProfileRenderState(state: {
  hasProfile: boolean;
  hasDisplayName: boolean;
  avatarSource: "none" | "fallback" | "catalog" | "absolute";
}): void {
  console.log("[PLAYER-PROFILE] render state", state);
}

export function tryValidateProfileNotification(
  notification: NotificationPayload,
): ReturnType<typeof parsePlayerProfileNotification> {
  if (!isPlayerProfileUpdatedNotification(notification)) return null;
  const parsed = parsePlayerProfileNotification(notification);
  if (!parsed) {
    logProfileNotificationRejected(notification, "missing or invalid userId");
    return null;
  }
  return parsed;
}
