"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { CatalogCoverImage } from "@/components/home/CatalogCoverImage";
import type { UseVideoCatalogState } from "@/hooks/useVideoCatalog";
import type { VideoCatalogEntry } from "@/lib/nakama/mediaCatalog";
import {
  isVideoAllowedByStatus,
  type SubscriptionStatus,
} from "@/lib/nakama/subscription";

type SongSearchDialogProps = {
  open: boolean;
  onClose: () => void;
  catalog: UseVideoCatalogState;
  onSelectVideo: (video: VideoCatalogEntry) => void;
  subscriptionStatus?: SubscriptionStatus | null;
  busy?: boolean;
};

function filterVideos(
  videos: VideoCatalogEntry[],
  query: string,
): VideoCatalogEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return videos;
  return videos.filter((video) => {
    const haystack = [
      video.title,
      video.singerName,
      video.description,
      video.category,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function SongSearchDialog({
  open,
  onClose,
  catalog,
  onSelectVideo,
  subscriptionStatus = null,
  busy = false,
}: SongSearchDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const videos = catalog.status === "ready" ? catalog.videos : [];
    return filterVideos(videos, query);
  }, [catalog.status, catalog.videos, query]);

  const dismiss = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  const handleSelect = useCallback(
    (video: VideoCatalogEntry) => {
      onSelectVideo(video);
      dismiss();
    },
    [dismiss, onSelectVideo],
  );

  if (!open) return null;

  return (
    <div
      className="song-search-dialog__backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-search-dialog-title"
        className="song-search-dialog flex max-h-[min(85vh,42rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] bg-[#0b1b3a] text-white shadow-2xl ring-1 ring-white/15"
        onClick={(event) => event.stopPropagation()}
      >
        <SongSearchHeader
          query={query}
          onQueryChange={setQuery}
          onClose={dismiss}
          inputRef={inputRef}
        />
        <div className="song-search-dialog__body min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {catalog.status === "loading" || catalog.status === "idle" ? (
            <p className="py-8 text-center text-sm text-white/70">
              در حال بارگذاری فهرست…
            </p>
          ) : catalog.status === "error" ? (
            <p className="py-8 text-center text-sm text-[var(--brand-deep)]">
              {catalog.errorMessage ?? "بارگذاری فهرست ناموفق بود"}
            </p>
          ) : catalog.status === "empty" ? (
            <p className="py-8 text-center text-sm text-white/70">
              آهنگی برای جستجو موجود نیست.
            </p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/70">
              آهنگی با این نام پیدا نشد.
            </p>
          ) : (
            <ul
              className="flex flex-col gap-2"
              aria-label="نتایج جستجو"
            >
              {results.map((song) => {
                const locked =
                  !!subscriptionStatus &&
                  !isVideoAllowedByStatus(subscriptionStatus, song.id);
                return (
                  <li key={song.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSelect(song)}
                      className="song-search-dialog__result flex w-full items-center gap-3 rounded-xl bg-white/5 p-2 text-start transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-wait disabled:opacity-60"
                    >
                      <SongSearchThumb
                        cover={song.cover}
                        locked={locked}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-sm font-semibold text-white"
                          dir="ltr"
                        >
                          {song.title}
                        </span>
                        {song.singerName ? (
                          <span className="mt-0.5 block truncate text-xs text-white/65">
                            {song.singerName}
                          </span>
                        ) : null}
                      </span>
                      {locked ? (
                        <span
                          className="shrink-0 text-[10px] font-medium text-white/55"
                          aria-hidden
                        >
                          قفل
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SongSearchHeader({
  query,
  onQueryChange,
  onClose,
  inputRef,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="song-search-dialog__header shrink-0 border-b border-white/10 px-4 pt-4 pb-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          id="song-search-dialog-title"
          className="text-base font-bold text-white"
        >
          جستجوی آهنگ
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
          aria-label="بستن"
        >
          <IoClose
            className="size-6"
            aria-hidden
          />
        </button>
      </div>
      <label className="relative block">
        <span className="sr-only">نام آهنگ</span>
        <FaSearch
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-white/50"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="نام آهنگ را بنویسید…"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-xl border border-white/15 bg-white/10 py-3 ps-10 pe-4 text-sm text-white placeholder:text-white/45 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/40 focus:outline-none"
        />
      </label>
    </div>
  );
}

function SongSearchThumb({
  cover,
  locked,
}: {
  cover: string;
  locked: boolean;
}) {
  return (
    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-white/10">
      <CatalogCoverImage
        coverUrl={cover}
        className="absolute inset-0 h-full w-full object-fill"
        loading="lazy"
      />
      {locked ? (
        <div
          className="absolute inset-0 bg-black/50"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
