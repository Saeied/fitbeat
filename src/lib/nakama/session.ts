import { authenticateDevice, refreshSession } from "./auth";
import { unlinkDevice } from "./linkSession";
import {
  clearStoredSession,
  ensureLinkDeviceId,
  getSessionPhase,
  getStoredSession,
  getStoredUserId,
  GUEST_TV_DEVICE_ID,
  rotateLinkDeviceId,
  setSessionPhase,
  setStoredSession,
  type SessionPhase,
} from "./storage";
import type { NakamaSession } from "./types";
import { NakamaHttpError } from "./types";

export type EnsureSessionResult = {
  session: NakamaSession;
  /** Device id used for authenticate/device (guest before pair, link after). */
  authDeviceId: string;
  /** Persistent link id for RPC + QR (never guest). */
  linkDeviceId: string;
  phase: SessionPhase;
  source: "stored" | "refreshed" | "authenticated";
};

function authDeviceForPhase(phase: SessionPhase): string {
  return phase === "linked" ? ensureLinkDeviceId() : GUEST_TV_DEVICE_ID;
}

async function authenticateAs(
  authDeviceId: string,
  phase: SessionPhase,
  source: EnsureSessionResult["source"] = "authenticated",
): Promise<EnsureSessionResult> {
  const linkDeviceId = ensureLinkDeviceId();
  const session = await authenticateDevice(authDeviceId, true);
  setStoredSession(session);
  setSessionPhase(phase);
  return {
    session,
    authDeviceId,
    linkDeviceId,
    phase,
    source,
  };
}

async function refreshOrAuth(
  authDeviceId: string,
  phase: SessionPhase,
): Promise<EnsureSessionResult> {
  const linkDeviceId = ensureLinkDeviceId();
  const stored = getStoredSession();

  if (stored?.refreshToken) {
    try {
      const refreshed = await refreshSession(stored.refreshToken);
      setStoredSession(refreshed);
      setSessionPhase(phase);
      return {
        session: refreshed,
        authDeviceId,
        linkDeviceId,
        phase,
        source: "refreshed",
      };
    } catch (error) {
      const shouldReauth =
        error instanceof NakamaHttpError &&
        (error.status === 401 || error.status === 403);
      if (!shouldReauth && !(error instanceof NakamaHttpError)) {
        throw error;
      }
      clearStoredSession();
    }
  }

  return authenticateAs(authDeviceId, phase);
}

/**
 * Connect / boot — production ephemeral pairing:
 * always guest session + the persistent link device id for QR/RPC.
 * Never reuse tokens without refresh (stale linked tokens cause 4007).
 */
export async function ensureTvSession(options?: {
  forceRefresh?: boolean;
}): Promise<EnsureSessionResult> {
  ensureLinkDeviceId();

  if (getSessionPhase() !== "guest") {
    clearStoredSession();
  }
  setSessionPhase("guest");

  if (options?.forceRefresh) {
    clearStoredSession();
  }

  return refreshOrAuth(GUEST_TV_DEVICE_ID, "guest");
}

/** Call after a 401 on an authenticated request: refresh once, else re-auth. */
export async function recoverTvSession(): Promise<NakamaSession> {
  const phase = getSessionPhase() ?? "guest";
  const result = await refreshOrAuth(authDeviceForPhase(phase), phase);
  return result.session;
}

/**
 * After QR approval (notification code 4):
 * clear guest session → authenticate as link device id.
 */
export async function authenticateLinkedTvDevice(): Promise<EnsureSessionResult> {
  const linkDeviceId = ensureLinkDeviceId();
  clearStoredSession();
  return authenticateAs(linkDeviceId, "linked");
}

/** Return to guest session so a new login code can be generated. Same link id. */
export async function restartGuestTvSession(): Promise<EnsureSessionResult> {
  clearStoredSession();
  return authenticateAs(GUEST_TV_DEVICE_ID, "guest");
}

/**
 * After QR approval, Fast Refresh / Strict Mode remounts must not unlink.
 * Restore the linked device session so VideoTvReady still reaches Unity.
 */
export async function restoreLinkedTvSession(): Promise<EnsureSessionResult | null> {
  if (getSessionPhase() !== "linked") return null;
  if (!getStoredSession()) return null;
  try {
    const result = await refreshOrAuth(ensureLinkDeviceId(), "linked");
    console.log("[TV-LOGIN] restored linked session", {
      deviceId: result.linkDeviceId,
    });
    return result;
  } catch (error) {
    console.log("[TV-LOGIN] restore linked session failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

let guestPrepareInFlight: Promise<EnsureSessionResult> | null = null;

async function runPrepareGuestPairingSession(
  rotateDeviceId: boolean,
): Promise<EnsureSessionResult> {
  const previousId = ensureLinkDeviceId();
  const previousUserId = getStoredUserId();

  clearStoredSession();
  const guestResult = await authenticateAs(GUEST_TV_DEVICE_ID, "guest");

  // Release any server-side link for the old id without authenticate/device on
  // previousId — that would mint a second Nakama user before pairing.
  try {
    await unlinkDevice({
      reason: "prepare_qr",
      userId: previousUserId,
      linkDeviceId: previousId,
    });
    console.log("[TV-PAIRING] unlink complete", { deviceId: previousId });
  } catch {
    /* device may not be linked yet */
  }

  // Fresh unused id avoids server 4007/4008 when the previous id is still linked.
  const nextId = rotateDeviceId ? rotateLinkDeviceId() : previousId;
  console.log("[TV-PAIRING] device initialized", {
    deviceId: nextId,
    rotated: rotateDeviceId,
  });

  return {
    ...guestResult,
    linkDeviceId: nextId,
  };
}

/**
 * Free the previous TV id before generating a new QR.
 * Rotates to a fresh unused id by default (avoids server 4007 on stale ids).
 * Pass rotateDeviceId: false only when reusing the current id is intentional.
 *
 * Concurrent remounts (React Strict Mode) reuse the same in-flight prepare so
 * we do not unlink the QR Unity is about to scan, then mint a second device.
 */
export async function prepareGuestPairingSession(options?: {
  force?: boolean;
  rotateDeviceId?: boolean;
}): Promise<EnsureSessionResult> {
  if (options?.force) {
    guestPrepareInFlight = null;
  } else if (guestPrepareInFlight) {
    console.log("[TV-LOGIN] prepareGuestPairingSession reused");
    return guestPrepareInFlight;
  }

  guestPrepareInFlight = runPrepareGuestPairingSession(
    options?.rotateDeviceId !== false,
  ).catch((error) => {
    guestPrepareInFlight = null;
    throw error;
  });
  return guestPrepareInFlight;
}

/** @deprecated Prefer authenticateLinkedTvDevice after code 4. */
export async function reauthenticateTvDevice(): Promise<EnsureSessionResult> {
  return authenticateLinkedTvDevice();
}
