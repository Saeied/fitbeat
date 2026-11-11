"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { CatalogCoverImage } from "@/components/home/CatalogCoverImage";
import type { VideoCatalogEntry } from "@/lib/nakama/mediaCatalog";
import type { TvSearchFocusSource } from "@/lib/tv/searchFocusContext";

type SongBannerProps = {
  videos: VideoCatalogEntry[];
  onDance: (video: VideoCatalogEntry) => void;
  disabled?: boolean;
  danceButtonRef?: Ref<HTMLButtonElement>;
  onDanceButtonKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** ↑ from prev/next banner controls */
  onTvFocusFullscreen?: () => boolean;
  /** → from banner next control */
  onTvFocusSearch?: (source: TvSearchFocusSource) => boolean;
};

export type SongBannerHandle = {
  focusNextNav: () => boolean;
};

export const SongBanner = forwardRef<SongBannerHandle, SongBannerProps>(
  function SongBanner(
    {
      videos,
      onDance,
      disabled,
      danceButtonRef,
      onDanceButtonKeyDown,
      onTvFocusFullscreen,
      onTvFocusSearch,
    },
    ref,
  ) {
  const [index, setIndex] = useState(0);
  const bannerNavForwardRef = useRef<HTMLButtonElement>(null);
  const bannerNavBackRef = useRef<HTMLButtonElement>(null);
  const showNav = videos.length > 1;

  const focusBannerForwardNav = useCallback(() => {
    const forward = bannerNavForwardRef.current;
    if (!forward) return false;
    forward.focus();
    forward.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focusNextNav: focusBannerForwardNav,
    }),
    [focusBannerForwardNav],
  );

  useEffect(() => {
    if (index >= videos.length) setIndex(0);
  }, [index, videos.length]);

  useEffect(() => {
    if (!showNav) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % videos.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [showNav, videos.length]);

  const go = useCallback(
    (delta: number) => {
      if (!videos.length) return;
      setIndex((value) => (value + delta + videos.length) % videos.length);
    },
    [videos.length],
  );

  const focusDanceButton = useCallback(() => {
    const dance =
      typeof danceButtonRef === "function" ? null : danceButtonRef?.current;
    if (dance && !dance.disabled) {
      dance.focus();
      dance.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }
    return false;
  }, [danceButtonRef]);

  const handleDanceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowUp" && showNav) {
        if (focusBannerForwardNav()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      onDanceButtonKeyDown?.(event);
    },
    [focusBannerForwardNav, onDanceButtonKeyDown, showNav],
  );

  const handleBannerNavHorizontal = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;

      const current = event.currentTarget;
      const forward = bannerNavForwardRef.current;
      const back = bannerNavBackRef.current;
      if (!forward || !back) return false;

      const currentX =
        current.getBoundingClientRect().left +
        current.getBoundingClientRect().width / 2;
      const sibling = current === forward ? back : forward;
      const siblingX =
        sibling.getBoundingClientRect().left +
        sibling.getBoundingClientRect().width / 2;
      const wantRight = event.key === "ArrowRight";
      const siblingIsRight = siblingX > currentX + 1;
      const siblingIsLeft = siblingX < currentX - 1;

      if ((wantRight && siblingIsRight) || (!wantRight && siblingIsLeft)) {
        event.preventDefault();
        sibling.focus();
        return true;
      }
      return false;
    },
    [],
  );

  const handleBannerNavKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowUp") {
        if (onTvFocusFullscreen?.()) {
          event.preventDefault();
        }
        return;
      }
      if (
        event.key === "ArrowRight" &&
        event.currentTarget === bannerNavForwardRef.current &&
        onTvFocusSearch?.({ from: "banner-next" })
      ) {
        event.preventDefault();
        return;
      }
      if (handleBannerNavHorizontal(event)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusDanceButton();
      }
    },
    [
      focusDanceButton,
      handleBannerNavHorizontal,
      onTvFocusFullscreen,
      onTvFocusSearch,
    ],
  );

  if (!videos.length) return null;

  const song = videos[Math.min(index, videos.length - 1)];
  if (!song) return null;

  return (
    <section className="relative mb-8 w-full overflow-hidden rounded-xl bg-[var(--sidebar)]">
      <div className="relative aspect-[5/1] min-h-[7rem] w-full">
        <CatalogCoverImage
          key={song.id}
          coverUrl={song.cover}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-black/10 via-transparent to-black/25" />
        <div className="absolute start-0 top-0 max-w-[70%] rounded-ee-xl bg-[var(--brand)] px-5 py-3 text-white">
          <p className="truncate text-lg font-black md:text-2xl">
            {song.title}
          </p>
          <p className="truncate text-xs font-medium text-white/85 md:text-sm">
            {song.description || "فهرست آهنگ‌ها"}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          ref={danceButtonRef}
          onKeyDown={handleDanceKeyDown}
          onClick={() => onDance(song)}
          className="dance-button absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--brand)] px-8 py-2 text-base font-black tracking-wide text-white shadow-[0_10px_24px_rgba(249,115,22,0.4)] disabled:cursor-wait disabled:opacity-70"
        >
          برقص
        </button>
        {showNav ? (
          <>
            <button
              type="button"
              ref={bannerNavForwardRef}
              data-banner-nav="forward"
              onKeyDown={handleBannerNavKeyDown}
              onClick={() => go(1)}
              className="song-banner-nav-btn absolute start-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full"
              aria-label="بنر بعدی"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5 rtl:-scale-x-100"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              ref={bannerNavBackRef}
              data-banner-nav="back"
              onKeyDown={handleBannerNavKeyDown}
              onClick={() => go(-1)}
              className="song-banner-nav-btn absolute end-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full"
              aria-label="بنر قبلی"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5 rtl:-scale-x-100"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        ) : null}
        {showNav && videos.length <= 10 ? (
          <div className="absolute inset-x-0 bottom-12 flex justify-center gap-1.5">
            {videos.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className={`h-1.5 rounded-full ${
                  itemIndex === index
                    ? "w-6 bg-[var(--brand)]"
                    : "w-1.5 bg-white/80"
                }`}
                aria-label={`بنر ${item.title}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
},
);
