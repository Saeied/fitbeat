import type { TvPlayerProfile } from "./playerProfileParse";
import type { SubscriptionStatus } from "./subscription";

export function profileHasFullAccess(profile: TvPlayerProfile | null): boolean {
  if (!profile) return false;
  if (profile.hasFullAccess === true) return true;
  return profile.subscriptionStatus.trim().toLowerCase() === "active";
}

export function subscriptionStatusFromPlayerProfile(
  profile: TvPlayerProfile,
): SubscriptionStatus {
  const active = profileHasFullAccess(profile);
  return {
    subscription: active
      ? {
          isActive: true,
          plan: profile.plan || undefined,
          expireDate: profile.expireDate || undefined,
          lastUpdated: profile.purchasedAt || undefined,
        }
      : null,
    freeVideoIds: [...profile.freeVideoIds],
    hasFullAccess: active,
    serverNowUtcMs: profile.serverNowUtcMs,
  };
}

export function isVideoUnlockedByProfile(
  profile: TvPlayerProfile | null,
  videoId: string | number,
): boolean {
  if (!profile) return false;
  if (profileHasFullAccess(profile)) return true;
  const id = String(videoId);
  return profile.freeVideoIds.includes(id);
}

export function mergeSubscriptionStatus(
  current: SubscriptionStatus | null,
  incoming: SubscriptionStatus,
): SubscriptionStatus {
  if (!current) return incoming;
  if (incoming.serverNowUtcMs > 0 || current.serverNowUtcMs > 0) {
    if (incoming.serverNowUtcMs < current.serverNowUtcMs) {
      return current;
    }
  }
  return incoming;
}

export function subscriptionIsActive(status: SubscriptionStatus | null): boolean {
  if (!status) return false;
  return status.hasFullAccess === true || status.subscription?.isActive === true;
}

export function didGainFullAccess(
  previous: SubscriptionStatus | null,
  next: SubscriptionStatus,
): boolean {
  if (!subscriptionIsActive(next)) return false;
  return !subscriptionIsActive(previous);
}
