"use client";

import { LinkLoginQrImage } from "@/components/home/LinkLoginQrImage";
import { PlayerProfileSlot } from "@/components/home/PlayerProfileSlot";
import type { LinkLoginStatus } from "@/hooks/useLinkLogin";
import { resolveDisplayAge } from "@/lib/nakama/playerProfileAge";
import type { TvPlayerProfile } from "@/lib/nakama/playerProfileParse";
import {
  profileHasFullAccess,
  subscriptionIsActive,
} from "@/lib/nakama/playerProfileSubscription";
import type { SubscriptionStatus } from "@/lib/nakama/subscription";

type SongBannerToolbarProps = {
  /** Linked mobile player display name from code 19 only. */
  displayName?: string;
  avatarImageUrl?: string;
  linkedProfile?: TvPlayerProfile | null;
  subscriptionStatus?: SubscriptionStatus | null;
  linkDeviceId?: string | null;
  loginCode?: string | null;
  linkQrStatus?: LinkLoginStatus;
};

export function SongBannerToolbar({
  displayName = "",
  avatarImageUrl = "",
  linkedProfile = null,
  subscriptionStatus = null,
  linkDeviceId = null,
  loginCode = null,
  linkQrStatus = "idle",
}: SongBannerToolbarProps) {
  const linkQrLoading =
    linkQrStatus === "idle" ||
    linkQrStatus === "generating" ||
    (!loginCode && linkQrStatus !== "error");

  const toolbarName =
    displayName.trim() || linkedProfile?.displayName?.trim() || "";

  const age = resolveDisplayAge(linkedProfile);
  const subscriptionActive =
    subscriptionIsActive(subscriptionStatus) ||
    profileHasFullAccess(linkedProfile);
  const subscriptionDays =
    subscriptionActive &&
    linkedProfile?.remainingWholeDays != null &&
    linkedProfile.remainingWholeDays >= 0
      ? linkedProfile.remainingWholeDays
      : null;
  const showProfileMeta = age != null || subscriptionActive;

  return (
    <div className="song-banner-toolbar flex shrink-0 items-center gap-8">
      <PlayerProfileSlot
        displayName={toolbarName}
        avatarImageUrl={avatarImageUrl}
      />

      <div
        className="song-banner-toolbar__link-login flex shrink-0 items-start"
        dir="ltr"
      >
        <div className="song-banner-toolbar__login-code-block flex flex-col items-center">
          <span className="song-banner-toolbar__login-code-label">
            dance room
          </span>
          <p
            className="song-banner-toolbar__login-code font-mono font-bold text-white"
            dir="ltr"
            aria-label="کد ورود شش رقمی"
          >
            {linkQrLoading ? "------" : (loginCode ?? "------")}
          </p>
          {showProfileMeta ? (
            <div
              className="song-banner-toolbar__profile-meta flex w-full flex-col items-center gap-0.5 text-center text-[0.85rem] leading-snug text-white/85 md:flex-row md:items-center md:gap-0 md:text-start"
              dir="rtl"
            >
              {subscriptionActive ? (
                <span className="order-1 font-semibold text-emerald-300 md:order-3">
                  اشتراک فعال
                  {subscriptionDays != null
                    ? ` · ${subscriptionDays} روز`
                    : null}
                </span>
              ) : null}
              {age != null && subscriptionActive ? (
                <span
                  className="order-2 hidden px-2 opacity-70 md:inline"
                  aria-hidden
                >
                  |
                </span>
              ) : null}
              {age != null ? (
                <span className="order-3 md:order-1">سن: {age}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div
          className="song-banner-toolbar__qr-frame relative flex shrink-0 items-center justify-center rounded-lg bg-white shadow-[0_0_12px_rgba(249,115,22,0.25)]"
          title={loginCode ? `Link code ${loginCode}` : "Link login QR"}
        >
          {linkQrLoading ? (
            <span
              className="song-banner-toolbar__qr-placeholder animate-pulse rounded bg-violet-200/40"
              aria-hidden
            />
          ) : (
            <LinkLoginQrImage
              deviceId={linkDeviceId}
              loginCode={loginCode}
              alt={
                loginCode
                  ? `Link login QR code ${loginCode}`
                  : "Link login QR code"
              }
              className="song-banner-toolbar__qr-img object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
