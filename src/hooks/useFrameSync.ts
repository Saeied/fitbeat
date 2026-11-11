"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyClockSyncNotificationContent,
  applyFrameSyncNotificationContent,
  configureFrameSync,
  getFrameSyncHudSnapshot,
  onFrameSyncReferenceClockStarted,
  onFrameSyncSessionEnded,
  onFrameSyncSessionStarted,
  resetFrameSync,
  type FrameSyncHudSnapshot,
} from "@/lib/nakama/frameSync";
import {
  isClockSyncNotification,
  isServerAuthoritativeFrameSync,
} from "@/lib/nakama/gameplayParse";
import { parseContentRecord } from "@/lib/nakama/notificationParse";
import type { NotificationPayload } from "@/lib/nakama/types";

export type UseFrameSyncState = {
  hud: FrameSyncHudSnapshot;
};

type UseFrameSyncOptions = {
  sessionActive: boolean;
  clockStarted: boolean;
  startAt: number | null;
  videoId: string | null;
  lastInbound: NotificationPayload[];
  getVideoElement: () => HTMLVideoElement | null;
  playerCount: number;
  socketOk: boolean;
  onTimelineEnd?: () => void;
};

const HUD_POLL_MS = 250;

/**
 * Frame sync during dance: pulse rpc_frameSync_pulse, apply FrameSync (16),
 * slew/seek video to the server reference timeline.
 */
export function useFrameSync({
  sessionActive,
  clockStarted,
  startAt,
  videoId,
  lastInbound,
  getVideoElement,
  playerCount,
  socketOk,
  onTimelineEnd,
}: UseFrameSyncOptions): UseFrameSyncState {
  const [hud, setHud] = useState<FrameSyncHudSnapshot>(() =>
    getFrameSyncHudSnapshot(),
  );

  const getVideoElementRef = useRef(getVideoElement);
  const playerCountRef = useRef(playerCount);
  const socketOkRef = useRef(socketOk);
  const onTimelineEndRef = useRef(onTimelineEnd);
  const sessionWasActiveRef = useRef(false);
  const clockWasStartedRef = useRef(false);
  const lastInboundRef = useRef<NotificationPayload[] | null>(null);

  getVideoElementRef.current = getVideoElement;
  playerCountRef.current = playerCount;
  socketOkRef.current = socketOk;
  onTimelineEndRef.current = onTimelineEnd;

  useEffect(() => {
    configureFrameSync({
      getPlayerVideo: () => getVideoElementRef.current(),
      getPlayerCount: () => playerCountRef.current,
      getSocketOk: () => socketOkRef.current,
      onTimelineEnd: () => onTimelineEndRef.current?.(),
    });
  }, []);

  useEffect(() => {
    if (sessionActive && !sessionWasActiveRef.current) {
      sessionWasActiveRef.current = true;
      onFrameSyncSessionStarted(videoId);
    } else if (!sessionActive && sessionWasActiveRef.current) {
      sessionWasActiveRef.current = false;
      clockWasStartedRef.current = false;
      onFrameSyncSessionEnded();
    }
  }, [sessionActive, videoId]);

  useEffect(() => {
    if (
      clockStarted &&
      sessionActive &&
      !clockWasStartedRef.current &&
      startAt
    ) {
      clockWasStartedRef.current = true;
      onFrameSyncReferenceClockStarted(startAt);
    }
  }, [clockStarted, sessionActive, startAt]);

  useEffect(() => {
    if (lastInbound === lastInboundRef.current) return;
    lastInboundRef.current = lastInbound;
    for (const notification of lastInbound) {
      if (isServerAuthoritativeFrameSync(notification)) {
        applyFrameSyncNotificationContent(
          parseContentRecord(notification.content) ?? notification.content,
        );
        continue;
      }
      if (isClockSyncNotification(notification)) {
        applyClockSyncNotificationContent(
          parseContentRecord(notification.content) ?? notification.content,
        );
      }
    }
  }, [lastInbound]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!sessionActive) {
      setHud(getFrameSyncHudSnapshot());
      return;
    }
    setHud(getFrameSyncHudSnapshot());
    const timer = setInterval(() => {
      setHud(getFrameSyncHudSnapshot());
    }, HUD_POLL_MS);
    return () => clearInterval(timer);
  }, [sessionActive]);

  useEffect(
    () => () => {
      resetFrameSync();
    },
    [],
  );

  return { hud };
}
