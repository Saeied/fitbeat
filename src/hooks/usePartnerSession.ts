"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nakamaTimeouts } from "@/lib/nakama/config";
import {
  isPartnerDisconnectedNotification,
  isPingNotification,
  isPongNotification,
  isSessionEndedNotification,
} from "@/lib/nakama/gameplayParse";
import {
  bindUnloadEvents,
  resetUnloadTeardownGuard,
} from "@/lib/nakama/linkSession";
import { parseContentRecord } from "@/lib/nakama/notificationParse";
import {
  resetSessionEndedSent,
  sendPartnerHeartbeatPing,
  sendPongReply,
} from "@/lib/nakama/sessionNotifications";
import type { NotificationPayload } from "@/lib/nakama/types";

export const PARTNER_DISCONNECT_MESSAGE = "ارتباط قطع شد";
export const PARTNER_RECOVERY_MESSAGE = "در حال بازیابی اتصال…";
export const PARTNER_DISCONNECT_TOAST_MS = 9000;
export const PARTNER_SOFT_RECOVERY_MS = 10_000;

export type UsePartnerSessionState = {
  disconnectNotice: string | null;
  clearDisconnectNotice: () => void;
};

type UsePartnerSessionOptions = {
  linked: boolean;
  sessionReady: boolean;
  /**
   * After guest→link re-auth the socket drops and reconnects. Treat 17/18
   * as a real partner leave only once that swap has settled.
   */
  watchPartnerDisconnect: boolean;
  /** Pause heartbeat while FrameSync session is active (countdown / play). */
  frameSyncActive: boolean;
  /** Defer 17/18 handling during video prep / BACK — wait for socket recovery. */
  softRecoveryActive?: boolean;
  socketOpen?: boolean;
  softRecoveryGraceMs?: number;
  userId: string | null;
  linkDeviceId: string | null;
  lastInbound: NotificationPayload[];
  closeSocket?: () => void;
  onPartnerDisconnect: (source: string) => void;
};

/**
 * Partner heartbeat Ping/Pong (2/3) and SessionEnded (17) / PartnerDisconnected (18).
 */
export function usePartnerSession({
  linked,
  sessionReady,
  watchPartnerDisconnect,
  frameSyncActive,
  softRecoveryActive = false,
  socketOpen = false,
  softRecoveryGraceMs = PARTNER_SOFT_RECOVERY_MS,
  userId,
  linkDeviceId,
  lastInbound,
  closeSocket,
  onPartnerDisconnect,
}: UsePartnerSessionOptions): UsePartnerSessionState {
  const [disconnectNotice, setDisconnectNotice] = useState<string | null>(null);

  const lastInboundRef = useRef<NotificationPayload[] | null>(null);
  const pendingDisconnectRef = useRef<NotificationPayload | null>(null);
  const disconnectHandledRef = useRef(false);
  const wasLinkedRef = useRef(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSourceRef = useRef<string | null>(null);
  const onDisconnectRef = useRef(onPartnerDisconnect);
  onDisconnectRef.current = onPartnerDisconnect;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const linkDeviceIdRef = useRef(linkDeviceId);
  linkDeviceIdRef.current = linkDeviceId;
  const linkedRef = useRef(linked);
  linkedRef.current = linked;
  const closeSocketRef = useRef(closeSocket);
  closeSocketRef.current = closeSocket;
  const softRecoveryRef = useRef(softRecoveryActive);
  softRecoveryRef.current = softRecoveryActive;
  const graceMsRef = useRef(softRecoveryGraceMs);
  graceMsRef.current = softRecoveryGraceMs;

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current != null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    pendingSourceRef.current = null;
  }, []);

  const clearDisconnectNotice = useCallback(() => {
    setDisconnectNotice(null);
  }, []);

  const finalizeDisconnect = useCallback(
    (source: string) => {
      if (disconnectHandledRef.current) return;
      clearGraceTimer();
      disconnectHandledRef.current = true;
      console.log("[PARTNER-DISCONNECT]", source);
      setDisconnectNotice(PARTNER_DISCONNECT_MESSAGE);
      onDisconnectRef.current(source);
    },
    [clearGraceTimer],
  );

  const beginDisconnectHandling = useCallback(
    (source: string) => {
      if (disconnectHandledRef.current) return;

      if (softRecoveryRef.current) {
        clearGraceTimer();
        pendingSourceRef.current = source;
        setDisconnectNotice(PARTNER_RECOVERY_MESSAGE);
        console.log("[PARTNER-DISCONNECT] soft recovery started", { source });
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null;
          const pending = pendingSourceRef.current;
          pendingSourceRef.current = null;
          if (!pending || disconnectHandledRef.current) return;
          finalizeDisconnect(pending);
        }, graceMsRef.current);
        return;
      }

      finalizeDisconnect(source);
    },
    [clearGraceTimer, finalizeDisconnect],
  );

  const heartbeatEnabled =
    linked && sessionReady && !frameSyncActive && !disconnectHandledRef.current;

  useEffect(() => {
    if (!heartbeatEnabled) return;

    void sendPartnerHeartbeatPing().catch(() => {
      /* best-effort */
    });
    const timer = setInterval(() => {
      void sendPartnerHeartbeatPing().catch(() => {
        /* best-effort */
      });
    }, nakamaTimeouts.partnerHeartbeatIntervalMs);

    return () => clearInterval(timer);
  }, [heartbeatEnabled]);

  /** Immediate ping when the linked session socket opens (post-QR relink). */
  useEffect(() => {
    if (!linked || !sessionReady || !socketOpen || disconnectHandledRef.current) {
      return;
    }
    void sendPartnerHeartbeatPing().catch(() => {
      /* best-effort */
    });
  }, [linked, sessionReady, socketOpen]);

  useEffect(() => {
    if (!softRecoveryActive || !socketOpen || !graceTimerRef.current) return;
    console.log("[PARTNER-DISCONNECT] soft recovery succeeded — socket open");
    clearGraceTimer();
    setDisconnectNotice(null);
  }, [softRecoveryActive, socketOpen, clearGraceTimer]);

  useEffect(() => {
    const isNewInbound = lastInbound !== lastInboundRef.current;
    if (isNewInbound) {
      lastInboundRef.current = lastInbound;
    }

    for (const notification of lastInbound) {
      if (isNewInbound && isPingNotification(notification)) {
        if (!linked || disconnectHandledRef.current) continue;
        const content = parseContentRecord(notification.content) ?? {};
        void sendPongReply(content).catch(() => {
          /* best-effort */
        });
        continue;
      }

      if (isNewInbound && isPongNotification(notification)) {
        console.log("[PONG] received from partner");
        continue;
      }

      if (
        !isSessionEndedNotification(notification) &&
        !isPartnerDisconnectedNotification(notification)
      ) {
        continue;
      }

      if (!linked || disconnectHandledRef.current) continue;

      if (!watchPartnerDisconnect) {
        pendingDisconnectRef.current = notification;
        continue;
      }

      pendingDisconnectRef.current = null;
      const source = isSessionEndedNotification(notification)
        ? "unity-SessionEnded"
        : "unity-PartnerDisconnected";
      beginDisconnectHandling(source);
    }

    if (
      watchPartnerDisconnect &&
      linked &&
      !disconnectHandledRef.current &&
      pendingDisconnectRef.current
    ) {
      const notification = pendingDisconnectRef.current;
      pendingDisconnectRef.current = null;
      const source = isSessionEndedNotification(notification)
        ? "unity-SessionEnded"
        : "unity-PartnerDisconnected";
      beginDisconnectHandling(source);
    }
  }, [lastInbound, linked, watchPartnerDisconnect, beginDisconnectHandling]);

  useEffect(() => {
    if (linked && !wasLinkedRef.current) {
      clearGraceTimer();
      disconnectHandledRef.current = false;
      pendingDisconnectRef.current = null;
      setDisconnectNotice(null);
      lastInboundRef.current = lastInbound;
      resetSessionEndedSent();
      resetUnloadTeardownGuard();
    }
    wasLinkedRef.current = linked;
  }, [lastInbound, linked, clearGraceTimer]);

  useEffect(() => {
    if (!linked) return;
    return bindUnloadEvents({
      getLinked: () => linkedRef.current,
      getUserId: () => userIdRef.current,
      getLinkDeviceId: () => linkDeviceIdRef.current,
      closeSocket: () => closeSocketRef.current?.(),
    });
  }, [linked]);

  useEffect(() => () => clearGraceTimer(), [clearGraceTimer]);

  return { disconnectNotice, clearDisconnectNotice };
}
