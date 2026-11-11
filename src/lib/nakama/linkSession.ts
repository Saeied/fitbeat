import { nakamaConfig } from "./config";
import {
  getNotificationSubject,
  NOTIFICATION_CODES,
  RPC_SEND_NOTIFICATION_TO_SESSIONS,
  RPC_UNLINK_DEVICE,
} from "./notificationCodes";
import { callTvRpc } from "./rpc";
import {
  markSessionEndedSent,
  sendSessionEnded,
} from "./sessionNotifications";
import {
  clearStoredSession,
  getStoredSession,
  markRequireConnectOnNextLoad,
} from "./storage";

export type TeardownLinkedSessionOptions = {
  reason: string;
  userId: string | null;
  linkDeviceId: string | null;
  /** Send SessionEnded (17). Default true. */
  notifyPartner?: boolean;
  /** Call rpc_multiSession_unlinkDevice. Default true. */
  unlink?: boolean;
};

export async function unlinkDevice(options: {
  reason: string;
  userId: string | null;
  linkDeviceId: string | null;
}): Promise<void> {
  await callTvRpc(RPC_UNLINK_DEVICE, {
    deviceId: options.linkDeviceId ? String(options.linkDeviceId) : "",
    userId: options.userId ? String(options.userId) : "",
    reason: options.reason ? String(options.reason) : "unknown",
  });
  console.log("[LINK_SESSION] unlinkDevice ok", { reason: options.reason });
}

/**
 * TV resetPairingState: optionally notify partner, optionally unlink, then
 * the caller restarts the guest session.
 */
export async function teardownLinkedSession(
  options: TeardownLinkedSessionOptions,
): Promise<void> {
  const notifyPartner = options.notifyPartner !== false;
  const unlink = options.unlink !== false;

  if (notifyPartner) {
    try {
      await sendSessionEnded(options.reason);
    } catch (error) {
      console.log("[LINK_SESSION] SessionEnded send failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (unlink) {
    try {
      await unlinkDevice({
        reason: options.reason,
        userId: options.userId,
        linkDeviceId: options.linkDeviceId,
      });
    } catch (error) {
      console.log("[LINK_SESSION] unlinkDevice failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function keepaliveRpc(rpcName: string, payload: Record<string, unknown>): void {
  const session = getStoredSession();
  if (!session?.token) return;
  const url = `${nakamaConfig.httpUrl}/v2/rpc/${encodeURIComponent(rpcName)}`;
  try {
    void fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(JSON.stringify(payload)),
      keepalive: true,
    });
  } catch {
    /* page is unloading */
  }
}

let unloadTeardownDone = false;

export function resetUnloadTeardownGuard(): void {
  unloadTeardownDone = false;
}

export function cancelPagehideTeardown(): void {
  /* pagehide teardown removed — kept for API compatibility */
}

function sendSessionEndedOnPageLeave(): void {
  if (!markSessionEndedSent()) return;
  keepaliveRpc(RPC_SEND_NOTIFICATION_TO_SESSIONS, {
    subject: getNotificationSubject(),
    content: {
      reason: "beforeunload",
      timestamp: Date.now(),
      source: "tv",
    },
    code: NOTIFICATION_CODES.SessionEnded,
  });
}

function unlinkDeviceOnPageLeave(options: {
  userId: string | null;
  linkDeviceId: string | null;
}): void {
  keepaliveRpc(RPC_UNLINK_DEVICE, {
    deviceId: options.linkDeviceId ? String(options.linkDeviceId) : "",
    userId: options.userId ? String(options.userId) : "",
    reason: "unload",
  });
}

/**
 * Full session teardown — explicit logout only (not page hide / beforeunload).
 */
export function teardownOnPageUnload(options: {
  linked: boolean;
  userId: string | null;
  linkDeviceId: string | null;
  closeSocket?: () => void;
}): void {
  if (unloadTeardownDone) return;
  if (!options.linked) return;
  unloadTeardownDone = true;

  sendSessionEndedOnPageLeave();
  unlinkDeviceOnPageLeave({
    userId: options.userId,
    linkDeviceId: options.linkDeviceId,
  });
  try {
    options.closeSocket?.();
  } catch {
    /* page is unloading */
  }
  markRequireConnectOnNextLoad();
  clearStoredSession();
}

type UnloadBindingOptions = {
  getLinked: () => boolean;
  getUserId: () => string | null;
  getLinkDeviceId: () => string | null;
  closeSocket?: () => void;
};

/**
 * Notify mobile when the TV tab is closed or hard-refreshed (keepalive SessionEnded only).
 * Full unlink/session clear stays on explicit logout via teardownOnPageUnload.
 */
export function bindUnloadEvents(options: UnloadBindingOptions): () => void {
  const onPageLeave = () => {
    if (!options.getLinked()) return;
    sendSessionEndedOnPageLeave();
    markRequireConnectOnNextLoad();
  };

  window.addEventListener("pagehide", onPageLeave);
  window.addEventListener("beforeunload", onPageLeave);

  return () => {
    window.removeEventListener("pagehide", onPageLeave);
    window.removeEventListener("beforeunload", onPageLeave);
  };
}
