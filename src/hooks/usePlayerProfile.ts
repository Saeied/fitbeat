"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nakamaTimeouts } from "@/lib/nakama/config";
import {
  classifyAvatarImageSource,
  resolveAvatarImageUrl,
} from "@/lib/nakama/avatarPublicUrl";
import {
  logProfileAppliedFromSnapshot,
  logProfileAwaitingDelivery,
  logProfileInboxPoll,
  logProfileRenderState,
} from "@/lib/nakama/playerProfileDiagnostics";
import { listNotifications } from "@/lib/nakama/notifications";
import { shouldIgnoreOwnNotification } from "@/lib/nakama/notificationParse";
import {
  profileNotificationDedupeKey,
  selectNewestProfileNotification,
} from "@/lib/nakama/playerProfileNotificationRetain";
import {
  isNewerProfileSnapshot,
  isPlayerProfileUpdatedNotification,
  parsePlayerProfileNotification,
  type TvPlayerProfile,
} from "@/lib/nakama/playerProfileParse";
import type { NotificationPayload } from "@/lib/nakama/types";

export type UsePlayerProfileState = {
  profile: TvPlayerProfile | null;
  avatarImageUrl: string;
  displayName: string;
  clearProfile: () => void;
};

type UsePlayerProfileOptions = {
  lastInbound: NotificationPayload[];
  profileNotification: NotificationPayload | null;
  enabled: boolean;
  pollInboxUntilApplied?: boolean;
  clearRetainedProfileNotification?: () => void;
};

const INBOX_POLL_FAST_MAX = 5;
const INBOX_POLL_SLOW_MS = 30_000;

export function usePlayerProfile({
  lastInbound,
  profileNotification,
  enabled,
  pollInboxUntilApplied = false,
  clearRetainedProfileNotification,
}: UsePlayerProfileOptions): UsePlayerProfileState {
  const [profile, setProfile] = useState<TvPlayerProfile | null>(null);
  const lastInboundRef = useRef<NotificationPayload[] | null>(null);
  const appliedNotificationKeysRef = useRef<Set<string>>(new Set());

  const applyFromNotifications = useCallback(
    (notifications: NotificationPayload[]) => {
      for (const notification of notifications) {
        const dedupeKey = profileNotificationDedupeKey(notification);
        if (appliedNotificationKeysRef.current.has(dedupeKey)) continue;

        const parsed = parsePlayerProfileNotification(notification);
        if (!parsed) continue;

        appliedNotificationKeysRef.current.add(dedupeKey);
        setProfile((current) => {
          if (!isNewerProfileSnapshot(parsed, current)) return current;
          logProfileAppliedFromSnapshot(
            parsed.userId,
            Boolean(parsed.displayName?.trim()),
          );
          return parsed;
        });
      }
    },
    [],
  );

  const clearProfile = useCallback(() => {
    setProfile(null);
    lastInboundRef.current = null;
    appliedNotificationKeysRef.current.clear();
    clearRetainedProfileNotification?.();
  }, [clearRetainedProfileNotification]);

  const awaitingLoggedRef = useRef(false);
  const inboxEmptyStreakRef = useRef(0);

  useEffect(() => {
    if (!pollInboxUntilApplied || profile) return;

    if (!awaitingLoggedRef.current) {
      awaitingLoggedRef.current = true;
      logProfileAwaitingDelivery(true, enabled);
    }

    let cancelled = false;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;

    async function pollInbox() {
      try {
        const notifications = await listNotifications(30);
        if (cancelled) return;
        if (!notifications.length) {
          inboxEmptyStreakRef.current += 1;
          if (inboxEmptyStreakRef.current <= INBOX_POLL_FAST_MAX) {
            logProfileInboxPoll("empty");
          }
          return;
        }
        const inbound = notifications.filter(
          (n) => !shouldIgnoreOwnNotification(n),
        );
        const candidate = selectNewestProfileNotification(inbound);
        if (!candidate) {
          inboxEmptyStreakRef.current += 1;
          if (inboxEmptyStreakRef.current <= INBOX_POLL_FAST_MAX) {
            logProfileInboxPoll("empty");
          }
          return;
        }
        inboxEmptyStreakRef.current = 0;
        logProfileInboxPoll("found");
        applyFromNotifications([candidate]);
      } catch {
        if (!cancelled && inboxEmptyStreakRef.current <= INBOX_POLL_FAST_MAX) {
          logProfileInboxPoll("failed");
        }
      }
    }

    void pollInbox();
    const fastId = setInterval(() => {
      if (inboxEmptyStreakRef.current >= INBOX_POLL_FAST_MAX) return;
      void pollInbox();
    }, nakamaTimeouts.qrPollMs);

    slowTimer = setInterval(() => {
      if (profile) return;
      void pollInbox();
    }, INBOX_POLL_SLOW_MS);

    return () => {
      cancelled = true;
      clearInterval(fastId);
      if (slowTimer) clearInterval(slowTimer);
    };
  }, [applyFromNotifications, enabled, pollInboxUntilApplied, profile]);

  useEffect(() => {
    if (profile) {
      awaitingLoggedRef.current = false;
      inboxEmptyStreakRef.current = 0;
    }
  }, [profile]);

  useEffect(() => {
    if (!enabled) return;

    const retainedKey = profileNotification
      ? profileNotificationDedupeKey(profileNotification)
      : null;
    const toApply: NotificationPayload[] = [];

    if (profileNotification) {
      toApply.push(profileNotification);
    }

    const inboundChanged = lastInbound !== lastInboundRef.current;
    if (inboundChanged) {
      lastInboundRef.current = lastInbound;
      for (const notification of lastInbound) {
        if (!isPlayerProfileUpdatedNotification(notification)) continue;
        const key = profileNotificationDedupeKey(notification);
        if (retainedKey && key === retainedKey) continue;
        toApply.push(notification);
      }
    } else if (!profileNotification) {
      return;
    }

    if (toApply.length === 0) return;
    applyFromNotifications(toApply);
  }, [enabled, lastInbound, profileNotification, applyFromNotifications]);

  const displayName = profile?.displayName?.trim() || "";

  const avatarImageUrl = resolveAvatarImageUrl(profile?.avatarId);
  const renderLoggedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = profile
      ? `${profile.userId}:${profile.serverNowUtcMs}`
      : "none";
    if (renderLoggedRef.current === key) return;
    renderLoggedRef.current = key;
    logProfileRenderState({
      hasProfile: profile != null,
      hasDisplayName: Boolean(profile?.displayName?.trim()),
      avatarSource: classifyAvatarImageSource(profile?.avatarId, avatarImageUrl),
    });
  }, [avatarImageUrl, profile]);

  return {
    profile,
    avatarImageUrl,
    displayName,
    clearProfile,
  };
}
