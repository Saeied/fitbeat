"use client";

import { assetUrl } from "@/lib/assetUrl";
import { useEffect, useState } from "react";
import { NoteField } from "@/components/home/NoteField";
import { linkLoginQrDataUrl } from "@/components/home/linkLoginQr";
import type { UseLinkLoginState } from "@/hooks/useLinkLogin";
import type { PairRelinkPhase } from "@/hooks/usePairRelink";

const QR_CARD =
  "pairing-qr-card mx-auto mt-8 shadow-[0_0_36px_rgba(56,189,248,0.4)] ring-2 ring-[#7dd3fc]";

type PairingScreenProps = {
  linkLogin: UseLinkLoginState;
  deviceId: string | null;
  socketReady: boolean;
  pairPhase: PairRelinkPhase;
  pairError: string | null;
};

export function PairingScreen({
  linkLogin,
  deviceId,
  socketReady,
  pairPhase,
  pairError,
}: PairingScreenProps) {
  const { status, loginCode, errorMessage, regenerate } = linkLogin;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const waiting = status === "waiting";
  const generating = status === "generating";
  const paired = status === "paired";
  const errored = status === "error";
  const idle = status === "idle";
  const relinking = pairPhase === "relinking";
  const pairFailed = pairPhase === "error";
  const phoneApproved = paired || relinking;

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      if (phoneApproved || !deviceId || !loginCode) {
        setQrDataUrl(null);
        return;
      }

      try {
        const url = await linkLoginQrDataUrl(deviceId, loginCode);
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    }

    void renderQr();
    return () => {
      cancelled = true;
    };
  }, [phoneApproved, deviceId, loginCode]);

  let statusText =
    "لطفا برای ورود QR CODE را در نرم‌افزار کنترلر گوشی همراه خود اسکن یا کد شش رقمی را وارد کنید";
  if (relinking || paired) {
    statusText = "گوشی تأیید شد — در حال اتصال دوباره…";
  } else if (pairFailed) {
    statusText = pairError ?? "اتصال مجدد ناموفق بود. دوباره تلاش کنید.";
  } else if (waiting) {
    statusText = socketReady
      ? "لطفا برای ورود QR CODE را در نرم‌افزار کنترلر گوشی همراه خود اسکن یا کد شش رقمی را وارد کنید"
      : "کد آماده است — در حال اتصال به سرور…";
  } else if (generating) {
    statusText = "در حال ساخت کد ورود…";
  } else if (errored) {
    statusText = "ساخت کد ناموفق بود. دوباره تلاش کنید.";
  }

  return (
    <section className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-visible px-5 py-6">
      <NoteField />
      <div className="pairing-panel pairing-cluster relative z-10 flex w-full max-w-lg flex-col items-center justify-center in-[.is-fullscreen]:mb-0 [@media(min-width:1280px)_and_(max-height:1080px)]:mb-[calc(4*var(--pairing-unit))]">
        <div
          className="relative mx-auto w-full"
          aria-label="کد QR ورود"
        >
          {relinking || paired ? (
            <div className={QR_CARD}>
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <span className="size-10 animate-pulse rounded-full bg-[var(--brand)]/40" />
                <p className="text-sm font-semibold text-[var(--brand)]">
                  در حال اتصال دوباره…
                </p>
              </div>
            </div>
          ) : pairFailed ? (
            <div className={QR_CARD}>
              <div className="flex flex-col items-center gap-2 px-3 text-center">
                <p className="text-sm font-semibold text-[var(--brand-deep)]">
                  اتصال مجدد ناموفق بود
                </p>
                <p className="max-h-28 overflow-auto text-xs leading-5 break-words text-[var(--muted)]">
                  {pairError ?? "خطای ناشناخته"}
                </p>
              </div>
            </div>
          ) : errored ? (
            <div className={QR_CARD}>
              <div className="flex flex-col items-center gap-2 px-3 text-center">
                <p className="text-sm font-semibold text-[var(--brand-deep)]">
                  ساخت کد ناموفق بود
                </p>
                <p className="max-h-28 overflow-auto text-xs leading-5 break-words text-[var(--muted)]">
                  {errorMessage ?? "خطای ناشناخته"}
                </p>
              </div>
            </div>
          ) : generating || idle ? (
            <div className={QR_CARD}>
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <span className="size-10 animate-pulse rounded-full bg-[var(--brand)]/40" />
                <p className="text-sm font-semibold text-[var(--muted)]">
                  {generating
                    ? "در حال ساخت کد…"
                    : "در حال آماده‌سازی کد ورود…"}
                </p>
              </div>
            </div>
          ) : qrDataUrl ? (
            <div className="pairing-art">
              <div className="pairing-dancer">
                <div className="pairing-notes" aria-hidden="true">
                  <span className="pairing-note pairing-note--1">♪</span>
                  <span className="pairing-note pairing-note--2">♫</span>
                  <span className="pairing-note pairing-note--3">♪</span>
                  <span className="pairing-note pairing-note--4">♫</span>
                  <span className="pairing-note pairing-note--5">♪</span>
                  <span className="pairing-note pairing-note--6">♩</span>
                  <span className="pairing-note pairing-note--7">♬</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl("/dancer-qr.png")}
                  alt=""
                  width={1536}
                  height={1024}
                  decoding="async"
                  className="h-auto w-full select-none"
                />
              </div>
              <div className="pairing-qr-card shadow-[0_0_36px_rgba(56,189,248,0.4)] ring-2 ring-[#7dd3fc]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`کد QR ${loginCode ?? ""}`}
                  width={400}
                  height={400}
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          ) : (
            <p className="px-4 text-center text-xs text-[var(--muted)]">
              کد QR هنوز آماده نیست
            </p>
          )}
        </div>

        {phoneApproved ? (
          <p className="pairing-status mt-6 text-center font-bold text-gray-200">
            {statusText}
          </p>
        ) : (
          <div className="pairing-login mt-6 shrink-0 text-center">
            <p
              className="pairing-login-code inline-block border-b-2 border-white pb-2 font-mono font-bold tracking-[0.35em] text-white"
              dir="ltr"
              aria-label="کد ورود شش رقمی"
            >
              {loginCode ?? "------"}
            </p>
            <p className="pairing-login-hint mx-auto max-w-lg font-bold text-gray-200">
              {statusText}
            </p>
            {(errored || pairFailed) && (
              <button
                type="button"
                onClick={regenerate}
                className="mt-4 text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              >
                تلاش دوباره
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
