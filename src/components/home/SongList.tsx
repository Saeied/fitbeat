"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import {
  SongBanner,
  type SongBannerHandle,
} from "@/components/home/SongBanner";
import {
  findFocusNeighbor,
  useArrowFocusNavigation,
} from "@/hooks/useArrowFocusNavigation";
import { getGridColumnCount } from "@/lib/dom/getGridColumnCount";
import { warmSongGrid } from "@/lib/dom/warmSongGrid";
import type { TvSearchFocusSource } from "@/lib/tv/searchFocusContext";
import { SongListCard } from "@/components/home/SongListCard";
import { songListActiveStatus } from "@/components/home/songListActiveStatus";
import type { UseVideoCatalogState } from "@/hooks/useVideoCatalog";
import type { VideoIntentStatus } from "@/hooks/useVideoDownloadIntent";
import type { VideoPreloadStatus } from "@/hooks/useVideoPreload";
import type { VideoCatalogEntry } from "@/lib/nakama/mediaCatalog";
import {
  isVideoAllowedByStatus,
  type SubscriptionStatus,
} from "@/lib/nakama/subscription";

type SongListProps = {
  catalog: UseVideoCatalogState;
  onSelectVideo: (video: VideoCatalogEntry) => void;
  intentVideoId: string | null;
  intentStatus: VideoIntentStatus;
  intentError: string | null;
  preloadVideoId: string | null;
  preloadStatus: VideoPreloadStatus;
  subscriptionStatus?: SubscriptionStatus | null;
  accessBanner?: string | null;
  onTvFocusFullscreen?: () => boolean;
  onTvFocusSearch?: (source: TvSearchFocusSource) => boolean;
};

export type SongListHandle = {
  focusFirstSong: () => boolean;
  focusBannerNextNav: () => boolean;
  focusSongAtIndex: (index: number) => boolean;
};

export const SongList = forwardRef<SongListHandle, SongListProps>(
  function SongList(
    {
      catalog,
      onSelectVideo,
      intentVideoId,
      intentStatus,
      intentError,
      preloadVideoId,
      preloadStatus,
      subscriptionStatus = null,
      accessBanner = null,
      onTvFocusFullscreen,
      onTvFocusSearch,
    },
    ref,
  ) {
    const busy = intentStatus === "sending" || preloadStatus === "loading";
    const readyVideos = catalog.status === "ready" ? catalog.videos : [];
    const songButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const danceButtonRef = useRef<HTMLButtonElement>(null);
    const songBannerRef = useRef<SongBannerHandle>(null);
    const songGridRef = useRef<HTMLUListElement>(null);
    const onSongArrowKeyDown = useArrowFocusNavigation(songButtonRefs);

    const navigableSongButtons = useCallback(() => {
      return songButtonRefs.current.filter(
        (item): item is HTMLButtonElement => item != null && !item.disabled,
      );
    }, []);

    const handleSongKeyDown = useCallback(
      (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "ArrowRight") {
          const current = event.currentTarget;
          const songIndex = songButtonRefs.current.indexOf(current);
          const grid = current.closest("ul");
          if (
            songIndex >= 0 &&
            grid instanceof HTMLElement &&
            songIndex % getGridColumnCount(grid) === 0 &&
            onTvFocusSearch?.({ from: "song", index: songIndex })
          ) {
            event.preventDefault();
            return;
          }
        }
        if (event.key === "ArrowUp") {
          const items = navigableSongButtons();
          const current = event.currentTarget;
          if (items.includes(current)) {
            const next = findFocusNeighbor(items, current, "ArrowUp");
            if (!next) {
              const dance = danceButtonRef.current;
              if (dance && !dance.disabled) {
                event.preventDefault();
                dance.focus();
                dance.scrollIntoView({ block: "nearest", inline: "nearest" });
                return;
              }
            }
          }
        }
        onSongArrowKeyDown(event);
      },
      [navigableSongButtons, onSongArrowKeyDown, onTvFocusSearch],
    );

    const handleDanceButtonKeyDown = useCallback(
      (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowDown") return;
        const items = navigableSongButtons();
        if (items.length === 0) return;
        const next = findFocusNeighbor(items, event.currentTarget, "ArrowDown");
        if (!next) return;
        event.preventDefault();
        next.focus();
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
      },
      [navigableSongButtons],
    );

    useEffect(() => {
      songButtonRefs.current.length = readyVideos.length;
    }, [readyVideos.length]);

    useLayoutEffect(() => {
      if (catalog.status !== "ready") return;
      const list = songGridRef.current;
      if (!list) return;

      let controller = new AbortController();
      let lastWidth = -1;
      let disposed = false;

      const start = () => {
        if (disposed) return;
        const width = Math.round(list.clientWidth);
        if (width === lastWidth) return;
        lastWidth = width;
        controller.abort();
        controller = new AbortController();
        for (const child of list.children) {
          if (child instanceof HTMLElement) {
            child.style.removeProperty("content-visibility");
          }
        }
        void warmSongGrid(list, controller.signal);
      };

      start();
      const observer = new ResizeObserver(start);
      observer.observe(list);
      // Card height follows the font metrics. Remeasure once they swap in.
      void document.fonts?.ready.then(() => {
        if (disposed || !list.isConnected) return;
        lastWidth = -1;
        start();
      });

      return () => {
        disposed = true;
        controller.abort();
        observer.disconnect();
        for (const child of list.children) {
          if (child instanceof HTMLElement) {
            child.style.removeProperty("content-visibility");
          }
        }
      };
    }, [catalog.status, catalog.videos]);

    const focusSongButtonAtIndex = useCallback((index: number) => {
      const button = songButtonRefs.current[index];
      if (!button || button.disabled) return false;
      button.focus({
        focusVisible: true,
      } as FocusOptions & { focusVisible: boolean });
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }, []);

    useImperativeHandle(ref, () => ({
      focusFirstSong: () => focusSongButtonAtIndex(0),
      focusBannerNextNav: () => songBannerRef.current?.focusNextNav() ?? false,
      focusSongAtIndex: focusSongButtonAtIndex,
    }));

    const handleSelect = useCallback(
      (song: VideoCatalogEntry) => {
        onSelectVideo(song);
      },
      [onSelectVideo],
    );

    const registerSongButton = useCallback(
      (index: number, element: HTMLButtonElement | null) => {
        songButtonRefs.current[index] = element;
      },
      [],
    );

    return (
      <section
        data-focus-section="songs"
        className="min-w-0 flex-1 px-3 pb-5"
      >
        {catalog.status === "loading" || catalog.status === "idle" ? (
          <>
            <div className="mb-14 h-28 w-full animate-pulse rounded-xl bg-[var(--sidebar)]" />
            <ul
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              aria-busy="true"
              aria-label="در حال بارگذاری فهرست"
            >
              {Array.from({ length: 10 }, (_, index) => (
                <li key={index}>
                  <div className="song-card rounded-2xl p-2.5">
                    <div className="aspect-[16/9] animate-pulse rounded-lg bg-white/10" />
                    <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-white/15" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : catalog.status === "error" ? (
          <div className="rounded-[2rem] bg-[var(--sidebar)] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--brand-deep)]">
              بارگذاری فهرست ناموفق بود
            </p>
            <p className="mt-2 text-xs leading-5 break-words text-[var(--muted)]">
              {catalog.errorMessage}
            </p>
            <button
              type="button"
              onClick={catalog.retry}
              className="mt-4 text-sm font-bold text-[var(--brand)] underline-offset-2 hover:underline"
            >
              تلاش دوباره
            </button>
          </div>
        ) : catalog.status === "empty" ? (
          <div className="rounded-[2rem] bg-[var(--sidebar)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--muted)]">
              آهنگی برای این اتاق پیدا نشد.
            </p>
            <button
              type="button"
              onClick={catalog.retry}
              className="mt-4 text-sm font-bold text-[var(--brand)] underline-offset-2 hover:underline"
            >
              تلاش دوباره
            </button>
          </div>
        ) : (
          <>
            {accessBanner ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--brand)]/15 px-4 py-3 text-sm text-[var(--brand-deep)]">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{accessBanner}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    اشتراک را از اپ موبایل تهیه کنید.
                  </p>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  className="size-7 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
            ) : null}
            <SongBanner
              ref={songBannerRef}
              videos={readyVideos}
              onDance={handleSelect}
              disabled={busy}
              danceButtonRef={danceButtonRef}
              onDanceButtonKeyDown={handleDanceButtonKeyDown}
              onTvFocusFullscreen={onTvFocusFullscreen}
              onTvFocusSearch={onTvFocusSearch}
            />
            <ul
              ref={songGridRef}
              className="grid grid-cols-1 gap-x-7 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {readyVideos.map((song, index) => {
                const active =
                  intentVideoId === song.id || preloadVideoId === song.id;
                const locked =
                  !!subscriptionStatus &&
                  !isVideoAllowedByStatus(subscriptionStatus, song.id);
                const { line: statusLine, tone: statusTone } =
                  songListActiveStatus(
                    active,
                    locked,
                    intentStatus,
                    preloadStatus,
                    intentError,
                  );
                return (
                  <li
                    key={song.id}
                    className="song-card-list-item"
                  >
                    <SongListCard
                      song={song}
                      index={index}
                      busy={busy}
                      locked={locked}
                      statusLine={statusLine}
                      statusTone={statusTone}
                      registerButton={registerSongButton}
                      onKeyDown={handleSongKeyDown}
                      onSelect={handleSelect}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    );
  },
);
