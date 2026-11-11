"use client";

import { useEffect, useRef } from "react";
import { IoClose } from "react-icons/io5";
import { FaTrophy } from "react-icons/fa6";
import { useSeasonalLeaderboard } from "@/hooks/useSeasonalLeaderboard";
import type { LeaderboardRecord } from "@/lib/nakama/leaderboard";

type LeaderboardDialogProps = {
  open: boolean;
  userId: string | null;
  onClose: () => void;
};

const EMPTY_USERNAME = "—";
const LEADERBOARD_COLUMNS = "grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-3";

const CUP_METAL = {
  1: { color: "#f6c445", number: "#5c3b00" },
  2: { color: "#d5dde6", number: "#2c3440" },
  3: { color: "#d09248", number: "#4a2a0a" },
} as const;

function formatScore(score: number): string {
  return score.toLocaleString("en-US");
}

function displayUsername(username: string): string {
  return username.trim() ? username : EMPTY_USERNAME;
}

export function LeaderboardDialog({
  open,
  userId,
  onClose,
}: LeaderboardDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const leaderboard = useSeasonalLeaderboard(open, userId);

  useEffect(() => {
    if (!open || leaderboard.status === "error") return;
    const frame = requestAnimationFrame(() => {
      closeRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, leaderboard.status]);

  useEffect(() => {
    if (!open || leaderboard.status !== "error") return;
    retryRef.current?.focus();
  }, [open, leaderboard.status]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const data = leaderboard.status === "ready" ? leaderboard.data : null;
  const topOwnerIds = new Set((data?.records ?? []).map((record) => record.ownerId));
  const showMyRank =
    !!data?.myRecord && !topOwnerIds.has(data.myRecord.ownerId);

  return (
    <div
      className="leaderboard-dialog__backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-dialog-title"
        aria-busy={leaderboard.status === "loading"}
        className="leaderboard-dialog flex max-h-[min(85vh,42rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.75rem] bg-[#0b1b3a] text-white shadow-2xl ring-1 ring-white/15"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
          <div className="min-w-0">
            <h2
              id="leaderboard-dialog-title"
              className="flex items-center gap-2 text-base font-bold text-white"
            >
              <FaTrophy
                className="size-4 text-[#f6c445]"
                aria-hidden
              />
              رتبه‌بندی
            </h2>
            {data?.seasonLabel ? (
              <p
                dir="ltr"
                className="mt-1 text-end text-sm text-white/70"
              >
                {data.seasonLabel}
              </p>
            ) : null}
          </div>
          <button
            ref={closeRef}
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
        </header>

        <div className="min-h-40 flex-1 overflow-y-auto px-4 py-4">
          {leaderboard.status === "loading" || leaderboard.status === "idle" ? (
            <div
              className="flex flex-col items-center gap-3 py-10 text-sm text-white/70"
              role="status"
            >
              <span
                className="inline-block size-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--brand)]"
                aria-hidden
              />
              در حال بارگذاری رتبه‌بندی…
            </div>
          ) : leaderboard.status === "error" ? (
            <div
              className="flex flex-col items-center gap-4 py-8 text-center"
              role="alert"
            >
              <p className="text-sm text-white/80">
                {leaderboard.errorMessage ?? "بارگذاری رتبه‌بندی ناموفق بود."}
              </p>
              <button
                ref={retryRef}
                type="button"
                onClick={leaderboard.retry}
                className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                تلاش دوباره
              </button>
            </div>
          ) : data && data.records.length === 0 ? (
            <p
              className="py-8 text-center text-sm text-white/70"
              role="status"
            >
              هنوز امتیازی ثبت نشده.
            </p>
          ) : data ? (
            <LeaderboardTable
              records={data.records}
              userId={userId}
            />
          ) : null}
        </div>

        {showMyRank && data?.myRecord ? (
          <section
            className="shrink-0 border-t border-white/10 px-4 py-3"
            aria-label="رتبه من"
          >
            <p className="mb-2 text-xs font-bold text-white/55">رتبه من</p>
            <LeaderboardRow
              record={data.myRecord}
              isCurrentUser
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function LeaderboardTable({
  records,
  userId,
}: {
  records: LeaderboardRecord[];
  userId: string | null;
}) {
  return (
    <div>
      <div className={`${LEADERBOARD_COLUMNS} mb-3 px-3 text-base font-semibold text-white/70`}>
        <span className="text-center">رتبه</span>
        <span className="text-center">بازیکن</span>
        <span className="text-center">امتیاز</span>
      </div>
      <ol
        className="flex flex-col gap-2"
        aria-label="برترین بازیکنان"
      >
        {records.map((record) => (
          <li key={`${record.ownerId}-${record.rank}`}>
            <LeaderboardRow
              record={record}
              isCurrentUser={!!userId && record.ownerId === userId}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function LeaderboardRow({
  record,
  isCurrentUser,
}: {
  record: LeaderboardRecord;
  isCurrentUser: boolean;
}) {
  const username = displayUsername(record.username);
  const score = formatScore(record.score);
  const rankLabel = record.rank > 0 ? String(record.rank) : EMPTY_USERNAME;

  return (
    <div
      className={`${LEADERBOARD_COLUMNS} rounded-xl px-3 py-2 ${
        isCurrentUser
          ? "bg-[var(--brand)]/20 ring-1 ring-[var(--brand)]"
          : "bg-white/5"
      }`}
      aria-label={`رتبه ${rankLabel}، ${username}، ${score}${isCurrentUser ? "، شما" : ""}`}
    >
      <span className="flex justify-center">
        <RankBadge rank={record.rank} />
      </span>
      <span className="flex min-w-0 items-center justify-center gap-2">
        <span
          dir="auto"
          className="truncate text-center text-sm font-medium"
        >
          {username}
        </span>
        {isCurrentUser ? (
          <span className="shrink-0 text-sm font-bold text-[var(--brand)]">شما</span>
        ) : null}
      </span>
      <span className="text-center text-sm font-bold tabular-nums">{score}</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1 || rank === 2 || rank === 3) {
    return <RankCup place={rank} />;
  }
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/80 tabular-nums"
      aria-hidden
    >
      {rank > 0 ? rank : EMPTY_USERNAME}
    </span>
  );
}

function RankCup({ place }: { place: 1 | 2 | 3 }) {
  const metal = CUP_METAL[place];

  return (
    <span
      className="relative inline-flex size-9 shrink-0 items-center justify-center"
      aria-hidden
    >
      <FaTrophy
        className="size-9"
        style={{ color: metal.color }}
        aria-hidden
      />
      <span
        className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs leading-none font-extrabold"
        style={{ color: metal.number }}
      >
        {place}
      </span>
    </span>
  );
}
