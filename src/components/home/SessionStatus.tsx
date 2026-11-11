"use client";

import type { ReactNode } from "react";
import type { UseClockSyncState } from "@/hooks/useClockSync";
import type { UseNakamaSessionState } from "@/hooks/useNakamaSession";
import type { PairRelinkPhase } from "@/hooks/usePairRelink";
import type { SocketStatus } from "@/lib/nakama/websocket";

const SOURCE_LABEL: Record<
  NonNullable<UseNakamaSessionState["source"]>,
  string
> = {
  stored: "نشست ذخیره‌شده",
  refreshed: "توکن تمدید شد",
  authenticated: "ورود دستگاه",
};

const isDev = process.env.NODE_ENV === "development";

type SessionStatusProps = {
  sessionState: UseNakamaSessionState;
  socketStatus: SocketStatus;
  /** When false, brief reconnect blips are hidden (grace period). */
  showSocketOutage?: boolean;
  pairPhase: PairRelinkPhase;
  clockSync?: UseClockSyncState;
};

export function SessionStatus({
  sessionState,
  socketStatus,
  showSocketOutage = false,
  pairPhase,
  clockSync,
}: SessionStatusProps) {
  const {
    status,
    source,
    linkDeviceId,
    authDeviceId,
    session,
    userId,
    serverConfig,
    errorMessage,
    linked,
    retry,
  } = sessionState;

  if (status === "connecting" || status === "idle") {
    return (
      <StatusLine pulse>
        در حال اتصال به سرور…
      </StatusLine>
    );
  }

  if (status === "loadingAccount") {
    return (
      <StatusLine pulse>
        در حال آماده‌سازی اتاق…
      </StatusLine>
    );
  }

  if (status === "relinking") {
    return (
      <StatusLine pulse>
        گوشی تأیید شد — در حال اتصال دوباره…
      </StatusLine>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex items-center gap-2 text-[var(--accent-deep)]">
          <span className="size-2 rounded-full bg-[var(--accent)]" />
          {errorMessage ?? "اتصال به سرور برقرار نشد"}
        </div>
        <button
          type="button"
          onClick={retry}
          className="text-xs font-medium text-[var(--brand)] underline-offset-2 hover:underline"
        >
          تلاش دوباره
        </button>
      </div>
    );
  }

  const socketBusy =
    socketStatus === "connecting" || socketStatus === "reconnecting";
  const socketDown = socketStatus === "closed" || socketStatus === "error";
  const phoneLinked = linked || pairPhase === "linked";

  return (
    <div className="flex flex-col items-end gap-0.5 text-sm">
      {showSocketOutage && socketDown ? (
        <StatusLine tone="danger">
          ارتباط قطع شد — در حال تلاش دوباره…
        </StatusLine>
      ) : showSocketOutage && socketBusy ? (
        <StatusLine pulse>
          {phoneLinked
            ? "در حال اتصال مجدد به گوشی…"
            : "در حال اتصال به سرور…"}
        </StatusLine>
      ) : null}

      {pairPhase === "error" ? (
        <p className="text-xs text-[var(--accent-deep)]">
          اتصال مجدد پس از جفت‌سازی ناموفق بود
        </p>
      ) : null}

      {isDev ? (
        <>
          {source ? (
            <p className="text-xs text-[var(--muted)]">{SOURCE_LABEL[source]}</p>
          ) : null}
          <p className="max-w-[16rem] truncate text-xs text-[var(--muted)]" dir="ltr">
            {userId ? `user: ${userId}` : (session?.username ?? authDeviceId)}
          </p>
          <p className="max-w-[16rem] truncate text-xs text-[var(--muted)]" dir="ltr">
            link: {linkDeviceId ?? "—"}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {serverConfig?.raw
              ? "تنظیمات سرور دریافت شد"
              : "تنظیمات سرور خالی است"}
          </p>
          {clockSync ? <ClockSyncLine clockSync={clockSync} /> : null}
        </>
      ) : null}
    </div>
  );
}

function StatusLine({
  children,
  pulse = false,
  tone = "muted",
}: {
  children: ReactNode;
  pulse?: boolean;
  tone?: "muted" | "ok" | "danger";
}) {
  const color =
    tone === "ok"
      ? "text-[var(--brand)]"
      : tone === "danger"
        ? "text-[var(--accent-deep)]"
        : "text-[var(--muted)]";
  const dot =
    tone === "ok"
      ? "bg-[var(--brand)]"
      : tone === "danger"
        ? "bg-[var(--accent)]"
        : "bg-[var(--brand)]";

  return (
    <div className={`flex items-center gap-2 text-sm ${color}`}>
      <span
        className={`size-2 rounded-full ${dot} ${pulse ? "animate-pulse" : ""}`}
      />
      {children}
    </div>
  );
}

function formatOffsetMs(offsetMs: number): string {
  const rounded = Math.round(offsetMs);
  return `${rounded >= 0 ? "+" : ""}${rounded}ms`;
}

function ClockSyncLine({ clockSync }: { clockSync: UseClockSyncState }) {
  if (clockSync.status === "idle") {
    return (
      <p className="text-xs text-[var(--muted)]" dir="ltr">
        clock: waiting
      </p>
    );
  }

  if (clockSync.status === "syncing" && clockSync.lastSyncedAt == null) {
    return (
      <p className="text-xs text-[var(--muted)]" dir="ltr">
        clock: syncing…
      </p>
    );
  }

  if (clockSync.status === "error") {
    return (
      <p className="max-w-[16rem] truncate text-xs text-[var(--accent-deep)]">
        ساعت: {clockSync.errorMessage ?? "خطا"}
      </p>
    );
  }

  const rtt =
    clockSync.lastRttMs != null ? ` · rtt ${Math.round(clockSync.lastRttMs)}ms` : "";
  const skip =
    clockSync.status === "skipped" && clockSync.skipReason === "rtt_filter"
      ? " · rtt skip"
      : "";

  return (
    <p className="text-xs text-[var(--muted)]" dir="ltr">
      clock: {formatOffsetMs(clockSync.offsetMs)}
      {rtt}
      {skip} · {clockSync.phase}
    </p>
  );
}
