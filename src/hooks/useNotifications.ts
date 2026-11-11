"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { registerPulseNotificationSink } from "@/lib/nakama/gameplayNotifications";
import { nakamaTimeouts } from "@/lib/nakama/config";
import { listNotifications } from "@/lib/nakama/notifications";
import {
  logProfileInboxPoll,
  logProfileNotificationReceived,
  logProfileRecoveredFromInbox,
  tryValidateProfileNotification,
} from "@/lib/nakama/playerProfileDiagnostics";
import { isPlayerProfileUpdatedNotification } from "@/lib/nakama/playerProfileParse";
import {
  mergeProfileNotificationsFromBatch,
  profileNotificationDedupeKey,
} from "@/lib/nakama/playerProfileNotificationRetain";
import {
  extractNotifications,
  logNotificationRecv,
  shouldIgnoreOwnNotification,
} from "@/lib/nakama/notificationParse";
import type { NotificationPayload } from "@/lib/nakama/types";
import type { NakamaSocketMessage } from "@/lib/nakama/websocket";

export type UseNotificationsState = {
  lastInbound: NotificationPayload[];
  /** Latest code 19 retained independently of `lastInbound` batch replacement. */
  profileNotification: NotificationPayload | null;
  clearRetainedProfileNotification: () => void;
};

type UseNotificationsOptions = {
  /** Poll GET /v2/notification during dance — fallback when WS drops score packets. */
  pollDuringGameplay?: boolean;
  /** Poll while linked but WebSocket is down — keeps pairing/gameplay alive. */
  pollWhenSocketDown?: boolean;
  /** Poll during preload / play-ready / countdown — legacy TV zombie WS fallback. */
  pollDuringPrep?: boolean;
  /**
   * When true, perform a one-time GET /v2/notification to recover code 19
   * after linked session is ready (e.g. post-QR relink).
   */
  recoverProfileInboxWhenReady?: boolean;
};

function filterInbound(notifications: NotificationPayload[]): NotificationPayload[] {
  return notifications.filter((notification) => {
    if (shouldIgnoreOwnNotification(notification)) {
      logNotificationRecv(notification, "ignored (own subject)");
      return false;
    }
    logNotificationRecv(notification, "handling");
    return true;
  });
}

/**
 * Routes inbound Nakama notifications (TV handleNotification).
 * Pairing still uses useLinkLogin; this logs the rest and drops own echoes.
 */
export function useNotifications(
  lastSocketMessage: NakamaSocketMessage | null,
  options?: UseNotificationsOptions,
): UseNotificationsState {
  const [lastInbound, setLastInbound] = useState<NotificationPayload[]>([]);
  const [profileNotification, setProfileNotification] =
    useState<NotificationPayload | null>(null);
  const profileNotificationRef = useRef<NotificationPayload | null>(null);
  const profileInboxRecoveryKeyRef = useRef<string | null>(null);
  const profileRecvLoggedIdsRef = useRef<Set<string>>(new Set());

  const pollDuringGameplay = options?.pollDuringGameplay ?? false;
  const pollWhenSocketDown = options?.pollWhenSocketDown ?? false;
  const pollDuringPrep = options?.pollDuringPrep ?? false;
  const recoverProfileInboxWhenReady =
    options?.recoverProfileInboxWhenReady ?? false;
  const shouldPoll =
    pollDuringGameplay || pollWhenSocketDown || pollDuringPrep;
  const pollIntervalMs = pollWhenSocketDown
    ? nakamaTimeouts.qrPollMs
    : pollDuringPrep
      ? nakamaTimeouts.prepPollMs
      : nakamaTimeouts.frameSyncIntervalMs * 10;

  const applyRetainedProfile = useCallback(
    (
      batch: NotificationPayload[],
      source: "ws" | "poll" | "inbox-recovery",
    ) => {
      for (const notification of batch) {
        if (isPlayerProfileUpdatedNotification(notification)) {
          tryValidateProfileNotification(notification);
        }
      }

      setProfileNotification((current) => {
        const next = mergeProfileNotificationsFromBatch(current, batch);
        if (next !== current && next) {
          profileNotificationRef.current = next;
          const logKey = next.id ?? profileNotificationDedupeKey(next);
          if (!profileRecvLoggedIdsRef.current.has(logKey)) {
            profileRecvLoggedIdsRef.current.add(logKey);
            logProfileNotificationReceived(next, source);
          }
        }
        return next;
      });
    },
    [],
  );

  const clearRetainedProfileNotification = useCallback(() => {
    profileNotificationRef.current = null;
    profileInboxRecoveryKeyRef.current = null;
    profileRecvLoggedIdsRef.current.clear();
    setProfileNotification(null);
  }, []);

  const mergeProfileFromInboxList = useCallback(
    async (source: "inbox-recovery" | "poll"): Promise<boolean> => {
      try {
        const notifications = await listNotifications(30);
        if (!notifications.length) {
          logProfileInboxPoll("empty");
          return false;
        }

        const inbound = filterInbound(notifications);
        let found = false;
        setProfileNotification((current) => {
          const next = mergeProfileNotificationsFromBatch(current, inbound);
          if (next && next !== current) {
            found = true;
            profileNotificationRef.current = next;
            const logKey = next.id ?? profileNotificationDedupeKey(next);
            if (!profileRecvLoggedIdsRef.current.has(logKey)) {
              profileRecvLoggedIdsRef.current.add(logKey);
              if (source === "inbox-recovery") {
                logProfileRecoveredFromInbox(next.id ?? null);
              }
              logProfileNotificationReceived(next, source);
            }
          }
          return next ?? current;
        });
        logProfileInboxPoll(found ? "found" : "empty");
        return found;
      } catch {
        logProfileInboxPoll("failed");
        return false;
      }
    },
    [],
  );

  const publishInbound = useCallback(
    (notifications: NotificationPayload[], source: "ws" | "poll") => {
      const inbound = filterInbound(notifications);
      if (inbound.length === 0) return;
      applyRetainedProfile(inbound, source);
      setLastInbound(inbound);
    },
    [applyRetainedProfile],
  );

  useEffect(() => {
    if (!lastSocketMessage?.json) return;
    publishInbound(extractNotifications(lastSocketMessage.json), "ws");
  }, [lastSocketMessage, publishInbound]);

  useEffect(() => {
    return registerPulseNotificationSink((notifications) => {
      publishInbound(notifications, "poll");
    });
  }, [publishInbound]);

  useEffect(() => {
    if (!shouldPoll) return;

    let cancelled = false;
    async function poll() {
      try {
        const notifications = await listNotifications(30);
        if (cancelled || !notifications.length) return;
        publishInbound(notifications, "poll");
      } catch {
        /* transient */
      }
    }

    void poll();
    const id = setInterval(() => {
      void poll();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollIntervalMs, publishInbound, shouldPoll]);

  useEffect(() => {
    if (!recoverProfileInboxWhenReady) {
      profileInboxRecoveryKeyRef.current = null;
      return;
    }

    const recoveryKey = "linked-ready";
    if (profileInboxRecoveryKeyRef.current === recoveryKey) return;
    profileInboxRecoveryKeyRef.current = recoveryKey;

    let cancelled = false;
    async function recover() {
      if (cancelled) return;
      await mergeProfileFromInboxList("inbox-recovery");
    }

    void recover();

    return () => {
      cancelled = true;
    };
  }, [mergeProfileFromInboxList, recoverProfileInboxWhenReady]);

  return {
    lastInbound,
    profileNotification,
    clearRetainedProfileNotification,
  };
}
