"use client";

import { memo, useCallback, type KeyboardEvent } from "react";
import { CatalogCoverImage } from "@/components/home/CatalogCoverImage";
import { IoPlayCircleOutline } from "react-icons/io5";
import type {
  VideoCatalogEntry,
  VideoDifficality,
} from "@/lib/nakama/mediaCatalog";
import { SUBSCRIPTION_REQUIRED_MESSAGE } from "@/lib/nakama/subscription";

const DIFFICALITY_LABEL: Record<VideoDifficality, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "سخت",
  extreme: "فوق‌العاده",
};

const DIFFICALITY_FILL: Record<VideoDifficality, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  extreme: 4,
};

function diffBarClass(level: VideoDifficality, index: number): string {
  return index < DIFFICALITY_FILL[level]
    ? "difficality-bars__bar is-filled"
    : "difficality-bars__bar";
}

type SongListCardProps = {
  song: VideoCatalogEntry;
  index: number;
  busy: boolean;
  locked: boolean;
  statusLine: string | null;
  statusTone: "brand" | "brand-deep" | "brand-semibold";
  registerButton: (index: number, element: HTMLButtonElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (song: VideoCatalogEntry) => void;
};

function SongListCardInner({
  song,
  index,
  busy,
  locked,
  statusLine,
  statusTone,
  registerButton,
  onKeyDown,
  onSelect,
}: SongListCardProps) {
  const buttonRef = useCallback(
    (element: HTMLButtonElement | null) => {
      registerButton(index, element);
    },
    [index, registerButton],
  );

  const syncKeyboardFocus = (button: HTMLButtonElement, focused: boolean) => {
    const card = button.closest(".song-card");
    const hadKeyboardFocus = card?.classList.contains("song-card--keyboard") ?? false;
    card?.classList.toggle("song-card--keyboard", focused);
    if (focused || !hadKeyboardFocus) return;
    const item = button.closest(".song-card-list-item");
    if (!(item instanceof HTMLElement)) return;
    item.style.setProperty("content-visibility", "visible");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        item.style.removeProperty("content-visibility");
      });
    });
  };

  const statusClass =
    statusTone === "brand-semibold"
      ? "pt-1 text-xs font-semibold text-[var(--brand)]"
      : statusTone === "brand-deep"
        ? "pt-1 text-xs text-[var(--brand-deep)]"
        : "pt-1 text-xs text-[var(--brand)]";

  return (
    <div
      className={`song-card relative rounded-2xl px-2.5 pt-2.5 pb-1 ${
        locked ? "opacity-80" : ""
      }`}
    >
      <button
        type="button"
        disabled={busy}
        ref={buttonRef}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const button = event.currentTarget;
          const apply = () => {
            if (document.activeElement !== button) return;
            syncKeyboardFocus(button, button.matches(":focus-visible"));
          };
          apply();
          requestAnimationFrame(apply);
        }}
        onBlur={(event) => {
          syncKeyboardFocus(event.currentTarget, false);
        }}
        onClick={() => onSelect(song)}
        className="song-card__button w-full text-start disabled:cursor-wait disabled:opacity-70"
      >
        <div className="relative aspect-[16/9.5] w-full overflow-hidden rounded-lg">
          <CatalogCoverImage
            key={song.cover}
            coverUrl={song.cover}
            className="absolute inset-0 h-full w-full object-fill"
            loading="lazy"
          />
          {locked ? (
            <div className="absolute inset-0 bg-black/55" aria-hidden />
          ) : null}
        </div>
        <div
          className="flex w-full items-center justify-start gap-2 pt-2.5"
          dir="ltr"
        >
          <IoPlayCircleOutline
            className="size-7 shrink-0 text-white"
            aria-hidden
          />
          <h3 className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white">
            {song.title}
          </h3>
        </div>
        <p
          className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-white/65"
          dir="ltr"
        >
          <span className="min-w-0 truncate">
            {song.singerName || "\u00a0"}
          </span>
          <span className="min-w-0 truncate">
            {song.category || "\u00a0"}
          </span>
          <span
            className="difficality-bars song-card__diff"
            data-level={song.difficality}
            role="img"
            aria-label={`درجه سختی: ${DIFFICALITY_LABEL[song.difficality]}`}
          >
            <span className={diffBarClass(song.difficality, 0)} />
            <span className={diffBarClass(song.difficality, 1)} />
            <span className={diffBarClass(song.difficality, 2)} />
            <span className={diffBarClass(song.difficality, 3)} />
          </span>
        </p>
      </button>
      {locked ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 px-3 text-center">
          <span
            className="flex size-12 items-center justify-center rounded-full bg-black/70 text-white"
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <p className="text-sm leading-5 font-semibold text-white">
            {SUBSCRIPTION_REQUIRED_MESSAGE}
          </p>
        </div>
      ) : statusLine ? (
        <p className={statusClass}>{statusLine}</p>
      ) : null}
    </div>
  );
}

export const SongListCard = memo(SongListCardInner);
