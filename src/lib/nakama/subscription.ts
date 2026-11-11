import { callTvRpc } from "./rpc";

export const RPC_SUBSCRIPTION_GET_MY_STATUS = "rpc_subscription_getMyStatus";
export const RPC_SUBSCRIPTION_CAN_ACCESS = "rpc_subscription_canAccess";

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "برای تماشای این ویدیو اشتراک تهیه کنید.";

export type SubscriptionSnapshot = {
  isActive: boolean;
  plan?: string;
  expireDate?: string;
  platform?: string;
  productId?: string;
  purchaseToken?: string;
  lastUpdated?: string;
} | null;

export type SubscriptionStatus = {
  subscription: SubscriptionSnapshot;
  freeVideoIds: string[];
  hasFullAccess: boolean;
  serverNowUtcMs: number;
};

export type CanAccessResult = {
  allowed: boolean;
  reason: string;
  freeVideoIds: string[];
  hasFullAccess: boolean;
  serverNowUtcMs: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function parseSubscription(raw: unknown): SubscriptionSnapshot {
  const record = asRecord(raw);
  if (!record) return null;
  return {
    isActive: record.isActive === true,
    plan: typeof record.plan === "string" ? record.plan : undefined,
    expireDate:
      typeof record.expireDate === "string" ? record.expireDate : undefined,
    platform: typeof record.platform === "string" ? record.platform : undefined,
    productId:
      typeof record.productId === "string" ? record.productId : undefined,
    purchaseToken:
      typeof record.purchaseToken === "string"
        ? record.purchaseToken
        : undefined,
    lastUpdated:
      typeof record.lastUpdated === "string" ? record.lastUpdated : undefined,
  };
}

export function parseSubscriptionStatus(payload: unknown): SubscriptionStatus {
  const record = asRecord(payload) ?? {};
  const freeVideoIds = asStringArray(record.freeVideoIds);
  const nested = parseSubscription(record.subscription);
  const hasFullAccess =
    record.hasFullAccess === true || nested?.isActive === true;
  return {
    subscription: nested,
    freeVideoIds,
    hasFullAccess,
    serverNowUtcMs: Number(record.serverNowUtcMs) || 0,
  };
}

export function parseCanAccessResult(payload: unknown): CanAccessResult {
  const record = asRecord(payload) ?? {};
  const allowed = record.allowed === true || record.canAccess === true;
  return {
    allowed,
    reason:
      typeof record.reason === "string"
        ? record.reason
        : allowed
          ? "allowed"
          : "subscription_required",
    freeVideoIds: asStringArray(record.freeVideoIds),
    hasFullAccess: record.hasFullAccess === true,
    serverNowUtcMs: Number(record.serverNowUtcMs) || 0,
  };
}

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const payload = await callTvRpc<unknown>(RPC_SUBSCRIPTION_GET_MY_STATUS, {});
  return parseSubscriptionStatus(payload);
}

export async function canAccessVideo(
  songId: string | number,
  featureType = "play",
): Promise<CanAccessResult> {
  const payload = await callTvRpc<unknown>(RPC_SUBSCRIPTION_CAN_ACCESS, {
    songId: String(songId),
    featureType,
  });
  return parseCanAccessResult(payload);
}

/** UX helper only — always re-check with canAccessVideo before play/download. */
export function isVideoAllowedByStatus(
  status: SubscriptionStatus | null,
  videoId: string | number,
): boolean {
  if (!status) return false;
  if (status.hasFullAccess) return true;
  const id = String(videoId);
  return status.freeVideoIds.includes(id);
}
