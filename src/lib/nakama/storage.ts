import type { NakamaSession } from "./types";

const KEYS = {
  token: "nakama.token",
  refreshToken: "nakama.refreshToken",
  deviceId: "nakama.deviceId",
  username: "nakama.username",
  expiresAt: "nakama.expiresAt",
  userId: "nakama.userId",
  sessionPhase: "nakama.sessionPhase",
} as const;

/**
 * Shared guest device id — used for pre-pair auth + WebSocket.
 * Login codes are generated under this session; the RPC body uses a
 * separate link device id (see ensureLinkDeviceId).
 */
export const GUEST_TV_DEVICE_ID = "tv-guest-link-notify";

export type SessionPhase = "guest" | "linked";

function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined";
}

/** Linked TV format: `tv-` + random + `-` + timestamp */
export function createTvDeviceId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 10);
  return `tv-${random}-${Date.now()}`;
}

export function isGuestTvDeviceId(deviceId: string | null | undefined): boolean {
  return deviceId === GUEST_TV_DEVICE_ID;
}

export function getStoredDeviceId(): string | null {
  if (!canUseBrowserStorage()) return null;
  return localStorage.getItem(KEYS.deviceId);
}

export function setStoredDeviceId(deviceId: string): void {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(KEYS.deviceId, deviceId);
}

/**
 * Persistent link device id for RPC generateLinkLoginCode + QR payload.
 * Never the guest id — that is only for pre-pair authenticate/device.
 */
export function ensureLinkDeviceId(): string {
  const existing = getStoredDeviceId();
  if (existing && !isGuestTvDeviceId(existing)) {
    return existing;
  }

  const next = createTvDeviceId();
  setStoredDeviceId(next);
  return next;
}

/**
 * New unused TV id for a pairing attempt.
 * Reusing an id that already called authenticate/device makes Unity verify
 * fail with 4008 (device already belongs to an account).
 */
export function rotateLinkDeviceId(): string {
  const next = createTvDeviceId();
  setStoredDeviceId(next);
  return next;
}

/** @deprecated Use ensureLinkDeviceId — same behavior. */
export function ensureTvDeviceId(): string {
  return ensureLinkDeviceId();
}

export function getSessionPhase(): SessionPhase | null {
  if (!canUseBrowserStorage()) return null;
  const value = sessionStorage.getItem(KEYS.sessionPhase);
  if (value === "guest" || value === "linked") return value;
  return null;
}

export function setSessionPhase(phase: SessionPhase): void {
  if (!canUseBrowserStorage()) return;
  sessionStorage.setItem(KEYS.sessionPhase, phase);
}

export function getStoredSession(): NakamaSession | null {
  if (!canUseBrowserStorage()) return null;

  const token = sessionStorage.getItem(KEYS.token);
  const refreshToken = sessionStorage.getItem(KEYS.refreshToken);
  if (!token || !refreshToken) return null;

  const username = sessionStorage.getItem(KEYS.username) ?? undefined;
  const rawExpiresAt = sessionStorage.getItem(KEYS.expiresAt);
  const parsedExpiresAt = rawExpiresAt ? Number(rawExpiresAt) : undefined;
  const expiresAt =
    parsedExpiresAt != null && Number.isFinite(parsedExpiresAt)
      ? parsedExpiresAt
      : undefined;
  return { token, refreshToken, username, expiresAt };
}

export function setStoredSession(session: NakamaSession): void {
  if (!canUseBrowserStorage()) return;

  sessionStorage.setItem(KEYS.token, session.token);
  sessionStorage.setItem(KEYS.refreshToken, session.refreshToken);
  if (session.username) {
    sessionStorage.setItem(KEYS.username, session.username);
  } else {
    sessionStorage.removeItem(KEYS.username);
  }
  if (session.expiresAt != null && Number.isFinite(session.expiresAt)) {
    sessionStorage.setItem(KEYS.expiresAt, String(session.expiresAt));
  } else {
    sessionStorage.removeItem(KEYS.expiresAt);
  }
}

export function clearStoredSession(): void {
  if (!canUseBrowserStorage()) return;
  sessionStorage.removeItem(KEYS.token);
  sessionStorage.removeItem(KEYS.refreshToken);
  sessionStorage.removeItem(KEYS.username);
  sessionStorage.removeItem(KEYS.expiresAt);
  sessionStorage.removeItem(KEYS.userId);
  sessionStorage.removeItem(KEYS.sessionPhase);
}

export function getStoredUserId(): string | null {
  if (!canUseBrowserStorage()) return null;
  return sessionStorage.getItem(KEYS.userId);
}

export function setStoredUserId(userId: string): void {
  if (!canUseBrowserStorage()) return;
  sessionStorage.setItem(KEYS.userId, userId);
}

const REQUIRE_CONNECT_KEY = "nakama.requireConnect";
const PAIRING_QR_SNAPSHOT_KEY = "nakama.pairingQrSnapshot";

export type PairingQrSnapshot = {
  linkDeviceId: string;
  loginCode: string;
  expiresAt: number | null;
};

/** QR used for the successful pair — sidebar only; cleared on TV hard reload. */
export function setPairingQrSnapshot(snapshot: PairingQrSnapshot): void {
  if (!canUseBrowserStorage()) return;
  try {
    sessionStorage.setItem(PAIRING_QR_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function getPairingQrSnapshot(): PairingQrSnapshot | null {
  if (!canUseBrowserStorage()) return null;
  try {
    const raw = sessionStorage.getItem(PAIRING_QR_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PairingQrSnapshot;
    if (
      typeof parsed.linkDeviceId !== "string" ||
      typeof parsed.loginCode !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPairingQrSnapshot(): void {
  if (!canUseBrowserStorage()) return;
  try {
    sessionStorage.removeItem(PAIRING_QR_SNAPSHOT_KEY);
  } catch {
    /* private mode */
  }
}

/** Next page load should land on Connect, not auto-QR (TV refresh / close). */
export function markRequireConnectOnNextLoad(): void {
  if (!canUseBrowserStorage()) return;
  try {
    sessionStorage.setItem(REQUIRE_CONNECT_KEY, "1");
  } catch {
    /* private mode / quota */
  }
}

/** True if the previous page asked for Connect-only boot. Does not clear. */
export function peekRequireConnect(): boolean {
  if (!canUseBrowserStorage()) return false;
  try {
    return sessionStorage.getItem(REQUIRE_CONNECT_KEY) === "1";
  } catch {
    return false;
  }
}

/** True once if the previous page asked for Connect-only boot. */
export function consumeRequireConnect(): boolean {
  if (!canUseBrowserStorage()) return false;
  try {
    const value = sessionStorage.getItem(REQUIRE_CONNECT_KEY);
    if (value) {
      sessionStorage.removeItem(REQUIRE_CONNECT_KEY);
      clearPairingQrSnapshot();
      return true;
    }
  } catch {
    /* private mode */
  }
  return false;
}
