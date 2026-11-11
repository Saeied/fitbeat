"use client";

import AppSidebar from "@/components/home/AppSidebar";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { DisconnectOverlay } from "@/components/home/DisconnectOverlay";
import { FullscreenButton } from "@/components/home/FullscreenButton";
import { PairingScreen } from "@/components/home/PairingScreen";
import { SessionStatus } from "@/components/home/SessionStatus";
import { SongBannerToolbar } from "@/components/home/SongBannerToolbar";
import { SongList, type SongListHandle } from "@/components/home/SongList";
import { LeaderboardDialog } from "@/components/home/LeaderboardDialog";
import { SongSearchDialog } from "@/components/home/SongSearchDialog";
import { isTvArrowKey } from "@/lib/tv/arrowKeys";
import {
  searchReturnFromSource,
  type SearchReturnTarget,
  type TvSearchFocusSource,
} from "@/lib/tv/searchFocusContext";
import { VideoPrepOverlay } from "@/components/home/VideoPrepOverlay";
import { useClockSync } from "@/hooks/useClockSync";
import { useDanceResult } from "@/hooks/useDanceResult";
import { useFrameSync } from "@/hooks/useFrameSync";
import { useLinkLogin } from "@/hooks/useLinkLogin";
import { useLiveScore } from "@/hooks/useLiveScore";
import { useNakamaSession } from "@/hooks/useNakamaSession";
import { useNakamaSocket } from "@/hooks/useNakamaSocket";
import { useNotifications } from "@/hooks/useNotifications";
import { useSocketOutageGrace } from "@/hooks/useSocketOutageGrace";
import { usePairRelink } from "@/hooks/usePairRelink";
import {
  PARTNER_DISCONNECT_TOAST_MS,
  usePartnerSession,
} from "@/hooks/usePartnerSession";
import { usePlayReady } from "@/hooks/usePlayReady";
import { useVideoCatalog } from "@/hooks/useVideoCatalog";
import { useVideoDownloadIntent } from "@/hooks/useVideoDownloadIntent";
import { useVideoPreload } from "@/hooks/useVideoPreload";
import { useVideoSyncStart } from "@/hooks/useVideoSyncStart";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import {
  findVideoDownloadIntentNotification,
  getNotificationVideoId,
} from "@/lib/nakama/gameplayParse";
import { teardownLinkedSession } from "@/lib/nakama/linkSession";
import {
  findVideoCatalogEntry,
  type VideoCatalogEntry,
} from "@/lib/nakama/mediaCatalog";
import { onFrameSyncSessionEnded } from "@/lib/nakama/frameSync";
import { resetServerReferenceClock } from "@/lib/nakama/serverReferenceClock";
import { sendReturnToSongList } from "@/lib/nakama/sessionNotifications";
import {
  canAccessVideo,
  SUBSCRIPTION_REQUIRED_MESSAGE,
} from "@/lib/nakama/subscription";
import {
  didGainFullAccess,
  mergeSubscriptionStatus,
  subscriptionStatusFromPlayerProfile,
} from "@/lib/nakama/playerProfileSubscription";
import { assetUrl } from "@/lib/assetUrl";
import { isDevBypassPairing } from "@/lib/devFlags";
import {
  clearPairingQrSnapshot,
  getPairingQrSnapshot,
  setPairingQrSnapshot,
  type PairingQrSnapshot,
} from "@/lib/nakama/storage";

export function HomeShell() {
  const sessionState = useNakamaSession();
  const sessionReady = sessionState.status === "ready";
  const socketState = useNakamaSocket(
    sessionState.session?.token ?? null,
    sessionReady,
    sessionState.recoverSocketToken,
  );
  const socketOpen = socketState.status === "open";
  const [preparingPair, setPreparingPair] = useState(false);

  const canPair = sessionReady && !sessionState.linked && !preparingPair;

  const linkLogin = useLinkLogin({
    linkDeviceId: sessionState.linkDeviceId,
    enabled: canPair,
    listenForPairing: canPair,
    socketOpen,
    lastSocketMessage: socketState.lastMessage,
    recoverFromUnauthorizedDevice: sessionState.prepareForPairing,
    sessionLinked: sessionState.linked,
  });

  const [frozenPairingQr, setFrozenPairingQr] =
    useState<PairingQrSnapshot | null>(() => getPairingQrSnapshot());

  const pairRelink = usePairRelink({
    paired: linkLogin.status === "paired" && !preparingPair,
    relinkAfterPair: sessionState.relinkAfterPair,
  });

  const linked = sessionState.linked || pairRelink.phase === "linked";
  const profileSessionActive =
    sessionState.linked ||
    linkLogin.status === "paired" ||
    pairRelink.phase === "relinking" ||
    pairRelink.phase === "linked";
  const devBypassPairing = isDevBypassPairing();
  const showMainApp = linked || devBypassPairing;

  const [partnerWatchEnabled, setPartnerWatchEnabled] = useState(false);
  const [gameplayPoll, setGameplayPoll] = useState(false);
  const handledIntentKeyRef = useRef<string | null>(null);
  /** Last song picked from the grid/banner; restored when leaving video prep. */
  const returnSongFocusRef = useRef<{ index: number; videoId: string } | null>(
    null,
  );
  const mainTvFocusAnchorRef = useRef<HTMLDivElement>(null);
  const songListRef = useRef<SongListHandle>(null);
  const flowEpochRef = useRef(0);
  const relinkAutoRecoveryCountRef = useRef(0);
  const backInProgressRef = useRef(false);
  const [backInProgress, setBackInProgress] = useState(false);
  const preload = useVideoPreload();
  const prepPollActive = linked && preload.status !== "idle";
  const profileHookEnabled = linked && sessionReady;
  const notifications = useNotifications(socketState.lastMessage, {
    pollDuringGameplay: gameplayPoll,
    pollWhenSocketDown: linked && !socketOpen,
    pollDuringPrep: prepPollActive,
    recoverProfileInboxWhenReady: profileHookEnabled,
  });
  const catalog = useVideoCatalog(showMainApp && sessionReady);
  const subscription = useSubscriptionAccess(showMainApp && sessionReady);
  const playerProfile = usePlayerProfile({
    lastInbound: notifications.lastInbound,
    profileNotification: notifications.profileNotification,
    enabled: profileHookEnabled,
    pollInboxUntilApplied: profileHookEnabled,
    clearRetainedProfileNotification:
      notifications.clearRetainedProfileNotification,
  });
  const subscriptionStatusRef = useRef(subscription.status);
  subscriptionStatusRef.current = subscription.status;
  const videoIntent = useVideoDownloadIntent();
  const [accessBanner, setAccessBanner] = useState<string | null>(null);
  const accessBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearAccessBanner = useCallback(() => {
    if (accessBannerTimeoutRef.current != null) {
      clearTimeout(accessBannerTimeoutRef.current);
      accessBannerTimeoutRef.current = null;
    }
    setAccessBanner(null);
  }, []);

  const showAccessBanner = useCallback((message: string) => {
    setAccessBanner(message);
    if (accessBannerTimeoutRef.current != null) {
      clearTimeout(accessBannerTimeoutRef.current);
    }
    accessBannerTimeoutRef.current = setTimeout(() => {
      setAccessBanner(null);
      accessBannerTimeoutRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (accessBannerTimeoutRef.current != null) {
        clearTimeout(accessBannerTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const profile = playerProfile.profile;
    if (!profile) return;

    const incoming = subscriptionStatusFromPlayerProfile(profile);
    const previous = subscriptionStatusRef.current;
    if (didGainFullAccess(previous, incoming)) {
      showAccessBanner("اشتراک فعال شد!");
    }
    subscription.applyFromProfile(incoming);
    subscriptionStatusRef.current = mergeSubscriptionStatus(previous, incoming);
  }, [playerProfile.profile, showAccessBanner, subscription.applyFromProfile]);

  useEffect(() => {
    if (profileSessionActive) return;
    playerProfile.clearProfile();
    subscription.resetSubscription();
  }, [
    profileSessionActive,
    playerProfile.clearProfile,
    subscription.resetSubscription,
  ]);

  const playReady = usePlayReady({
    tvReady: preload.tvReady,
    videoId: preload.video?.id ?? null,
    lastInbound: notifications.lastInbound,
  });
  const videoSync = useVideoSyncStart({
    tvReady: preload.tvReady,
    videoId: preload.video?.id ?? null,
    lastInbound: notifications.lastInbound,
    getVideoElement: preload.getVideoElement,
  });
  const stopRoundPlayback = useCallback(() => {
    videoSync.reset();
    onFrameSyncSessionEnded();
    resetServerReferenceClock();
  }, [videoSync.reset]);
  const liveScore = useLiveScore({
    playerCount: playReady.playerCount ?? 1,
    playing: videoSync.phase === "playing",
    lastInbound: notifications.lastInbound,
  });
  const [timelineEndReached, setTimelineEndReached] = useState(false);
  const catalogStatus = catalog.status;
  const catalogVideos = catalog.videos;

  const rememberReturnSongFocus = useCallback(
    (video: VideoCatalogEntry) => {
      if (catalogStatus !== "ready") return;
      const index = catalogVideos.findIndex((item) => item.id === video.id);
      if (index < 0) return;
      returnSongFocusRef.current = { index, videoId: video.id };
    },
    [catalogStatus, catalogVideos],
  );

  const focusReturnSong = useCallback((): boolean => {
    const saved = returnSongFocusRef.current;
    if (!saved || catalogStatus !== "ready") return false;
    let index = saved.index;
    if (catalogVideos[index]?.id !== saved.videoId) {
      index = catalogVideos.findIndex((item) => item.id === saved.videoId);
      if (index < 0) return false;
      returnSongFocusRef.current = { index, videoId: saved.videoId };
    }
    return songListRef.current?.focusSongAtIndex(index) ?? false;
  }, [catalogStatus, catalogVideos]);

  const focusReturnSongOrAnchor = useCallback(() => {
    if (focusReturnSong()) return;
    mainTvFocusAnchorRef.current?.focus({ preventScroll: true });
  }, [focusReturnSong]);

  const focusReturnSongOrAnchorRef = useRef(focusReturnSongOrAnchor);
  focusReturnSongOrAnchorRef.current = focusReturnSongOrAnchor;

  const handleReplay = (entry: VideoCatalogEntry) => {
    rememberReturnSongFocus(entry);
    setTimelineEndReached(false);
    flowEpochRef.current += 1;
    videoSync.reset();
    playReady.reset();
    liveScore.reset();
    preload.start(entry, { bustCache: true });
    void videoIntent.send(entry.id).catch(() => {
      /* intent error shown on song card if overlay closed */
    });
  };
  const handleBackToSongs = useCallback(() => {
    setTimelineEndReached(false);
    handledIntentKeyRef.current = null;
    flowEpochRef.current += 1;
    videoSync.reset();
    playReady.reset();
    liveScore.reset();
    preload.reset();
    videoIntent.reset();
  }, [
    videoSync.reset,
    playReady.reset,
    liveScore.reset,
    preload.reset,
    videoIntent.reset,
  ]);
  const danceResult = useDanceResult({
    lastInbound: notifications.lastInbound,
    playing: videoSync.phase === "playing",
    video: preload.video,
    overlayScores: {
      playerCount: liveScore.playerCount,
      score1: liveScore.slots[1].total,
      score2: liveScore.slots[2].total,
      calories1: liveScore.slots[1].calories,
      calories2: liveScore.slots[2].calories,
      maxScore1: liveScore.slots[1].maxScore,
      maxScore2: liveScore.slots[2].maxScore,
    },
    sessionComplete: liveScore.sessionComplete,
    timelineEndReached,
    getVideoElement: preload.getVideoElement,
    onReplay: handleReplay,
    onBackToSongs: handleBackToSongs,
    onStopPlayback: stopRoundPlayback,
  });
  const frameSync = useFrameSync({
    sessionActive:
      (videoSync.phase === "countdown" || videoSync.phase === "playing") &&
      !danceResult.visible,
    clockStarted: videoSync.phase === "playing" && !danceResult.visible,
    startAt: videoSync.startAt,
    videoId: preload.video?.id ?? null,
    lastInbound: notifications.lastInbound,
    getVideoElement: preload.getVideoElement,
    playerCount: playReady.playerCount ?? 1,
    socketOk: socketOpen,
    onTimelineEnd: () => setTimelineEndReached(true),
  });
  const clockSync = useClockSync({
    enabled: sessionReady,
    linked,
    socketStatus: socketState.status,
    gameplay:
      (videoSync.phase === "countdown" || videoSync.phase === "playing") &&
      !danceResult.visible,
    paused: preload.status === "loading",
  });

  useEffect(() => {
    setGameplayPoll(videoSync.phase === "playing" && !danceResult.visible);
  }, [videoSync.phase, danceResult.visible]);

  const abortGameplay = useCallback(() => {
    setTimelineEndReached(false);
    handledIntentKeyRef.current = null;
    flowEpochRef.current += 1;
    danceResult.reset();
    videoSync.reset();
    playReady.reset();
    liveScore.reset();
    preload.reset();
    videoIntent.reset();
  }, [
    danceResult.reset,
    videoSync.reset,
    playReady.reset,
    liveScore.reset,
    preload.reset,
    videoIntent.reset,
  ]);

  const abortToSongList = useCallback(() => {
    if (backInProgressRef.current) {
      console.log(
        "[VIDEO_SYNC][ReturnToSongList] ignored — already in progress",
      );
      return;
    }
    backInProgressRef.current = true;
    setBackInProgress(true);
    console.log("[VIDEO_SYNC] abortToSongList — navigation epoch bump");
    danceResult.reset();
    abortGameplay();
    void sendReturnToSongList().catch((error) => {
      console.log("[VIDEO_SYNC][ReturnToSongList] send failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    window.setTimeout(() => {
      backInProgressRef.current = false;
      setBackInProgress(false);
    }, 400);
  }, [abortGameplay, danceResult.reset]);

  const clearFrozenQr = useCallback(() => {
    clearPairingQrSnapshot();
    setFrozenPairingQr(null);
  }, []);

  const beginAutoQrPairing = useCallback(() => {
    clearFrozenQr();
    setPreparingPair(true);
    void sessionState
      .prepareForPairing()
      .catch(() => {
        /* session error surfaces on SessionStatus */
      })
      .finally(() => {
        setPreparingPair(false);
      });
  }, [clearFrozenQr, sessionState.prepareForPairing]);

  useEffect(() => {
    if (
      linkLogin.status !== "paired" ||
      !linkLogin.loginCode ||
      !sessionState.linkDeviceId
    ) {
      return;
    }
    const snapshot: PairingQrSnapshot = {
      linkDeviceId: sessionState.linkDeviceId,
      loginCode: linkLogin.loginCode,
      expiresAt: linkLogin.expiresAt,
    };
    setPairingQrSnapshot(snapshot);
    setFrozenPairingQr(snapshot);
  }, [
    linkLogin.status,
    linkLogin.loginCode,
    linkLogin.expiresAt,
    sessionState.linkDeviceId,
  ]);

  const reloadPairingHandledRef = useRef(false);
  useEffect(() => {
    if (reloadPairingHandledRef.current) return;
    const nav = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    if (nav?.type !== "reload") return;

    reloadPairingHandledRef.current = true;
    console.log("[TV-PAIRING] hard reload — in-memory pairing reset");
    abortGameplay();
    clearFrozenQr();
    linkLogin.reset();
    pairRelink.reset();
  }, [abortGameplay, clearFrozenQr, linkLogin.reset, pairRelink.reset]);

  useEffect(() => {
    if (pairRelink.phase === "linked") {
      relinkAutoRecoveryCountRef.current = 0;
      return;
    }
    if (
      pairRelink.phase !== "error" ||
      preparingPair ||
      relinkAutoRecoveryCountRef.current >= 1
    ) {
      return;
    }

    relinkAutoRecoveryCountRef.current += 1;
    linkLogin.reset();
    pairRelink.reset();
    beginAutoQrPairing();
  }, [
    beginAutoQrPairing,
    linkLogin.reset,
    pairRelink.phase,
    pairRelink.reset,
    preparingPair,
  ]);

  const handlePartnerDisconnect = useCallback(
    (source: string) => {
      playerProfile.clearProfile();
      subscription.resetSubscription();
      abortGameplay();
      linkLogin.reset();
      pairRelink.reset();
      beginAutoQrPairing();
      console.log("[GAMEPLAY-ABORT]", source);
    },
    [
      abortGameplay,
      beginAutoQrPairing,
      linkLogin.reset,
      pairRelink.reset,
      playerProfile.clearProfile,
      subscription.resetSubscription,
    ],
  );

  const videoPrepVisible =
    preload.status !== "idle" && Boolean(preload.video && preload.playUrl);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const leaderboardButtonRef = useRef<HTMLButtonElement>(null);

  const searchReturnTargetRef = useRef<SearchReturnTarget | null>(null);
  const [songSearchOpen, setSongSearchOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  const focusSearchButton = useCallback(() => {
    const button = searchButtonRef.current;
    if (!button) return false;
    button.focus();
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }, []);

  const handleTvFocusSearch = useCallback(
    (source: TvSearchFocusSource) => {
      searchReturnTargetRef.current = searchReturnFromSource(source);
      return focusSearchButton();
    },
    [focusSearchButton],
  );

  const focusLeaderboardButton = useCallback(() => {
    const button = leaderboardButtonRef.current;
    if (!button) return;
    button.focus();
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  const openSongSearch = useCallback(() => {
    setLeaderboardOpen(false);
    setSongSearchOpen(true);
  }, []);

  const closeSongSearch = useCallback(() => {
    setSongSearchOpen(false);
    focusSearchButton();
  }, [focusSearchButton]);

  const openLeaderboard = useCallback(() => {
    setSongSearchOpen(false);
    setLeaderboardOpen(true);
  }, []);

  const closeLeaderboard = useCallback(() => {
    setLeaderboardOpen(false);
    focusLeaderboardButton();
  }, [focusLeaderboardButton]);

  const restoreSearchReturnFocus = useCallback(() => {
    const target = searchReturnTargetRef.current;
    if (!target) return false;
    if (target.kind === "banner-next") {
      return songListRef.current?.focusBannerNextNav() ?? false;
    }
    return songListRef.current?.focusSongAtIndex(target.index) ?? false;
  }, []);

  const handleSidebarReturnKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft") return;
      if (restoreSearchReturnFocus()) {
        event.preventDefault();
      }
    },
    [restoreSearchReturnFocus],
  );

  const focusFullscreenButton = useCallback(() => {
    const button = fullscreenButtonRef.current;
    if (!button) return false;
    button.focus();
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }, []);

  const handleFullscreenKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowDown") return;
      if (songListRef.current?.focusBannerNextNav()) {
        event.preventDefault();
      }
    },
    [],
  );

  /** Restore TV focus only when entering the song list — not on unrelated re-renders. */
  useEffect(() => {
    if (videoPrepVisible || !showMainApp) return;

    const id = requestAnimationFrame(() => {
      focusReturnSongOrAnchorRef.current();
    });
    return () => cancelAnimationFrame(id);
  }, [videoPrepVisible, showMainApp]);

  const handleMainTvFocusAnchorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isTvArrowKey(event.key) || videoPrepVisible) return;
      event.preventDefault();
      if (!focusReturnSong()) {
        songListRef.current?.focusFirstSong();
      }
    },
    [videoPrepVisible, focusReturnSong],
  );

  useEffect(() => {
    if (
      !linked ||
      !sessionReady ||
      !socketOpen ||
      pairRelink.phase === "relinking"
    ) {
      setPartnerWatchEnabled(false);
      return;
    }

    const delayMs = videoPrepVisible ? 5_000 : 2_500;
    const timer = window.setTimeout(() => {
      setPartnerWatchEnabled(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [linked, sessionReady, socketOpen, pairRelink.phase, videoPrepVisible]);

  const partnerSession = usePartnerSession({
    linked,
    sessionReady,
    watchPartnerDisconnect: partnerWatchEnabled,
    frameSyncActive:
      (videoSync.phase === "countdown" || videoSync.phase === "playing") &&
      !danceResult.visible,
    softRecoveryActive: videoPrepVisible || backInProgress,
    socketOpen,
    userId: sessionState.userId,
    linkDeviceId: sessionState.linkDeviceId,
    lastInbound: notifications.lastInbound,
    closeSocket: socketState.disconnect,
    onPartnerDisconnect: handlePartnerDisconnect,
  });

  useEffect(() => {
    if (!partnerSession.disconnectNotice) return;
    const timer = window.setTimeout(() => {
      partnerSession.clearDisconnectNotice();
    }, PARTNER_DISCONNECT_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [partnerSession.disconnectNotice, partnerSession.clearDisconnectNotice]);

  useEffect(() => {
    const inbound = findVideoDownloadIntentNotification(
      notifications.lastInbound,
    );
    if (!inbound) return;

    const videoId = getNotificationVideoId(inbound);
    if (videoId == null) {
      console.log(
        "[VIDEO_SYNC] VideoDownloadIntent from mobile ignored — invalid videoId",
      );
      return;
    }

    const key = `${inbound.id ?? ""}:${videoId}:${inbound.create_time ?? ""}`;
    if (handledIntentKeyRef.current === key) return;

    const entry = findVideoCatalogEntry(catalog.videos, videoId);
    if (!entry) {
      console.log(
        "[VIDEO_SYNC] VideoDownloadIntent from mobile — url missing",
        { videoId },
      );
      return;
    }

    handledIntentKeyRef.current = key;
    const epoch = flowEpochRef.current;
    console.log("[VIDEO_SYNC] VideoDownloadIntent from mobile", { videoId });

    void (async () => {
      try {
        const access = await canAccessVideo(videoId, "play");
        if (epoch !== flowEpochRef.current) {
          console.log(
            "[VIDEO_SYNC] inbound intent ignored — flow epoch changed",
            { videoId },
          );
          return;
        }
        if (!access.allowed) {
          console.log("[VIDEO_SYNC] inbound intent denied by server", {
            videoId,
            reason: access.reason,
          });
          showAccessBanner(SUBSCRIPTION_REQUIRED_MESSAGE);
          return;
        }
        clearAccessBanner();
        setTimelineEndReached(false);
        flowEpochRef.current += 1;
        danceResult.reset();
        videoSync.reset();
        playReady.reset();
        liveScore.reset();
        preload.reset();
        preload.start(entry, { bustCache: true });
      } catch (error) {
        if (epoch !== flowEpochRef.current) return;
        console.log("[VIDEO_SYNC] inbound intent access check failed", error);
        showAccessBanner(SUBSCRIPTION_REQUIRED_MESSAGE);
      }
    })();
  }, [
    notifications.lastInbound,
    catalog.videos,
    preload.start,
    danceResult.reset,
    videoSync.reset,
    playReady.reset,
    liveScore.reset,
    showAccessBanner,
    clearAccessBanner,
  ]);

  const sidebarLoginCode = frozenPairingQr?.loginCode ?? linkLogin.loginCode;
  const sidebarLinkDeviceId =
    frozenPairingQr?.linkDeviceId ?? sessionState.linkDeviceId;
  const sidebarQrStatus = linked ? "paired" : linkLogin.status;

  const handleLogout = () => {
    partnerSession.clearDisconnectNotice();
    playerProfile.clearProfile();
    subscription.resetSubscription();
    clearFrozenQr();
    linkLogin.reset();
    pairRelink.reset();
    abortGameplay();
    setPreparingPair(true);
    void (async () => {
      if (linked) {
        try {
          await teardownLinkedSession({
            reason: "tv_reset",
            userId: sessionState.userId,
            linkDeviceId: sessionState.linkDeviceId,
            notifyPartner: true,
            unlink: true,
          });
        } catch {
          /* continue to guest pairing */
        }
      }
      try {
        await sessionState.prepareForPairing({ rotateDeviceId: true });
      } catch {
        /* session error surfaces on SessionStatus */
      } finally {
        setPreparingPair(false);
      }
    })();
  };

  const handleRegenerate = () => {
    partnerSession.clearDisconnectNotice();
    clearFrozenQr();
    linkLogin.reset();
    pairRelink.reset();
    abortGameplay();
    void (async () => {
      try {
        await sessionState.prepareForPairing({ rotateDeviceId: true });
      } catch {
        return;
      }
      linkLogin.regenerate();
    })();
  };

  const isDev = process.env.NODE_ENV === "development";
  const socketOutageVisible = useSocketOutageGrace(socketState.status);
  const showSocketBanner = sessionReady && socketOutageVisible;

  const handleSelectVideo = useCallback(
    (video: VideoCatalogEntry) => {
      setSongSearchOpen(false);
      void (async () => {
        try {
          const access = await canAccessVideo(video.id, "play");
          if (!access.allowed) {
            showAccessBanner(SUBSCRIPTION_REQUIRED_MESSAGE);
            void subscription.refresh();
            return;
          }
          clearAccessBanner();
          setTimelineEndReached(false);
          handledIntentKeyRef.current = null;
          flowEpochRef.current += 1;
          danceResult.reset();
          videoSync.reset();
          playReady.reset();
          liveScore.reset();
          preload.reset();
          rememberReturnSongFocus(video);
          preload.start(video);
          void videoIntent.send(video.id).catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            if (/subscription_required/i.test(message)) {
              showAccessBanner(SUBSCRIPTION_REQUIRED_MESSAGE);
            }
          });
        } catch {
          showAccessBanner(SUBSCRIPTION_REQUIRED_MESSAGE);
        }
      })();
    },
    [
      showAccessBanner,
      clearAccessBanner,
      subscription.refresh,
      rememberReturnSongFocus,
      danceResult.reset,
      videoSync.reset,
      playReady.reset,
      liveScore.reset,
      preload.reset,
      preload.start,
      videoIntent.send,
    ],
  );

  const showPairing = !showMainApp;

  return (
    <div className="app-frame relative flex flex-col overflow-hidden bg-[#40147E]">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed decorative wallpaper; next/image is unoptimized in this export build */}
      <img
        aria-hidden
        alt=""
        className="app-frame-background"
        src={assetUrl("/aurora_bg.jpg")}
        fetchPriority="low"
        decoding="async"
      />
      {showPairing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 py-5 md:px-6">
          <div className="pointer-events-auto">
            <FullscreenButton />
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-1">
            {isDev ? (
              <p className="hidden text-xs text-[var(--muted)] sm:block">
                جفت‌سازی — مهمان ← لینک دستگاه
              </p>
            ) : null}
            <SessionStatus
              sessionState={sessionState}
              socketStatus={socketState.status}
              showSocketOutage={socketOutageVisible}
              pairPhase={pairRelink.phase}
              clockSync={clockSync}
            />
          </div>
        </div>
      ) : null}

      {showSocketBanner ? (
        <div className="bg-[var(--brand)]/10 px-5 py-2 text-center text-sm font-medium text-[var(--brand-deep)]">
          {socketState.status === "reconnecting"
            ? "ارتباط لحظه‌ای قطع شد — در حال اتصال دوباره…"
            : "ارتباط با سرور قطع شد — در حال تلاش دوباره…"}
        </div>
      ) : null}

      {showPairing ? (
        <PairingScreen
          linkLogin={{ ...linkLogin, regenerate: handleRegenerate }}
          deviceId={sessionState.linkDeviceId}
          socketReady={socketOpen}
          pairPhase={pairRelink.phase}
          pairError={pairRelink.errorMessage}
        />
      ) : (
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4">
          <header
            className="song-list-topbar mb-4.5 flex shrink-0 items-center justify-between gap-4 px-4"
            dir="ltr"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="flex items-start gap-5 md:gap-10 xl:gap-20">
              <FullscreenButton
                ref={fullscreenButtonRef}
                onKeyDown={handleFullscreenKeyDown}
              />
              <div
                ref={mainTvFocusAnchorRef}
                tabIndex={-1}
                className="tv-focus-anchor min-w-0 outline-none"
                aria-label="فهرست آهنگ‌ها"
                onKeyDown={handleMainTvFocusAnchorKeyDown}
              >
                <p className="home-tagline [font-family:var(--font-anton),sans-serif] font-normal tracking-[-1px] text-white">
                  <span className="bg-[linear-gradient(to_bottom,#F3D99A_0%,#F3D99A_48%,#D9AC64_72%,#B67A3F_100%)] bg-clip-text text-transparent">
                    UNLEASH YOUR
                  </span>{" "}
                  INNER DANCER!
                </p>
              </div>
            </div>
            <SongBannerToolbar
              displayName={playerProfile.displayName}
              avatarImageUrl={playerProfile.avatarImageUrl}
              linkedProfile={playerProfile.profile}
              subscriptionStatus={subscription.status}
              linkDeviceId={sidebarLinkDeviceId}
              loginCode={sidebarLoginCode}
              linkQrStatus={sidebarQrStatus}
            />
          </header>
          <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
            <AppSidebar
              onLogout={handleLogout}
              faded={videoPrepVisible}
              onSearch={openSongSearch}
              onLeaderboard={openLeaderboard}
              searchButtonRef={searchButtonRef}
              leaderboardButtonRef={leaderboardButtonRef}
              onSidebarReturnKeyDown={handleSidebarReturnKeyDown}
            />
            <div
              inert={videoPrepVisible ? true : undefined}
              className={`home-main-scroll min-h-0 min-w-0 flex-1 overflow-y-auto transition-opacity duration-500 ${
                videoPrepVisible
                  ? "pointer-events-none opacity-0"
                  : "opacity-100"
              }`}
              aria-hidden={videoPrepVisible}
            >
              <SongList
                ref={songListRef}
                onTvFocusFullscreen={focusFullscreenButton}
                onTvFocusSearch={handleTvFocusSearch}
                catalog={catalog}
                onSelectVideo={handleSelectVideo}
                intentVideoId={videoIntent.videoId}
                intentStatus={videoIntent.status}
                intentError={videoIntent.errorMessage ?? accessBanner}
                preloadVideoId={preload.video?.id ?? null}
                preloadStatus={preload.status}
                subscriptionStatus={subscription.status}
                accessBanner={accessBanner}
              />
            </div>
          </div>
        </div>
      )}
      {showMainApp ? (
        <SongSearchDialog
          open={songSearchOpen && !videoPrepVisible}
          onClose={closeSongSearch}
          catalog={catalog}
          onSelectVideo={handleSelectVideo}
          subscriptionStatus={subscription.status}
          busy={
            videoIntent.status === "sending" || preload.status === "loading"
          }
        />
      ) : null}
      {showMainApp ? (
        <LeaderboardDialog
          open={leaderboardOpen && !videoPrepVisible}
          userId={sessionState.userId}
          onClose={closeLeaderboard}
        />
      ) : null}
      {partnerSession.disconnectNotice ? (
        <DisconnectOverlay message={partnerSession.disconnectNotice} />
      ) : null}
      <VideoPrepOverlay
        preload={preload}
        playReady={playReady}
        videoSync={videoSync}
        frameSync={frameSync}
        liveScore={liveScore}
        danceResult={danceResult}
        linkedPlayerDisplayName={playerProfile.displayName}
        linkedPlayerAvatarUrl={playerProfile.avatarImageUrl}
        onBackToSongs={abortToSongList}
      />
    </div>
  );
}
