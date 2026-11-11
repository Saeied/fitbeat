"use client";

import { useEffect, useRef } from "react";
import { DanceResultPlayerSummary } from "@/components/home/DanceResultPlayerSummary";
import { useArrowFocusNavigation } from "@/hooks/useArrowFocusNavigation";
import { assetUrl } from "@/lib/assetUrl";
import { DANCE_RESULT_BG_URL } from "@/lib/danceResultAssets";
import { DEFAULT_LINKED_PLAYER_AVATAR } from "@/lib/nakama/avatarPublicUrl";
import type { UseDanceResultState } from "@/hooks/useDanceResult";

const SOLO_DISPLAY_NAME_FALLBACK = "بازیکن ۱";

const DUAL_PLAYER_1_DISPLAY_NAME = "بازیکن ۱";
const DUAL_PLAYER_2_DISPLAY_NAME = "بازیکن ۲";

const DANCE_RESULT_MUSIC_SRC = assetUrl(
  encodeURI("/music/Lipstick Check (Remix).mp3"),
);

type DanceResultOverlayProps = {
  danceResult: UseDanceResultState;
  linkedPlayerDisplayName?: string;
  linkedPlayerAvatarUrl?: string;
};

export function DanceResultOverlay({
  danceResult,
  linkedPlayerDisplayName = "",
  linkedPlayerAvatarUrl = "",
}: DanceResultOverlayProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onArrowKeyDown = useArrowFocusNavigation(buttonRefs);

  useEffect(() => {
    if (!danceResult.visible || danceResult.busy) return;
    const id = requestAnimationFrame(() => {
      buttonRefs.current[0]?.focus({
        focusVisible: true,
      } as FocusOptions & { focusVisible: boolean });
    });
    return () => cancelAnimationFrame(id);
  }, [danceResult.visible, danceResult.busy]);

  useEffect(() => {
    if (!danceResult.visible) return;

    const audio = new Audio(DANCE_RESULT_MUSIC_SRC);
    audio.loop = true;
    void audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [danceResult.visible]);

  if (!danceResult.visible) return null;

  const dual = danceResult.playerCount === 2;
  const dualWinner: 1 | 2 | null = dual
    ? danceResult.score1 === danceResult.score2
      ? null
      : danceResult.score1 > danceResult.score2
        ? 1
        : 2
    : null;
  const busyLabel = "لطفاً صبر کنید…";
  const soloDisplayName = linkedPlayerDisplayName.trim() || SOLO_DISPLAY_NAME_FALLBACK;
  const soloAvatarUrl = linkedPlayerAvatarUrl.trim() || DEFAULT_LINKED_PLAYER_AVATAR;

  return (
    <div className="dance-result-overlay absolute inset-0 z-[60] text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed TV backdrop; warmed during video prep */}
      <img
        aria-hidden
        alt=""
        className="dance-result-overlay__bg"
        src={DANCE_RESULT_BG_URL}
        decoding="async"
        fetchPriority="high"
      />
      <div
        className={`dance-result-panel${dual ? " dance-result-panel--dual" : " dance-result-panel--solo"}`}
      >
        {danceResult.cover ? (
          <img
            src={danceResult.cover}
            alt={danceResult.title}
            className="dance-result-panel__cover"
          />
        ) : (
          <div className="dance-result-panel__cover-placeholder">
            {danceResult.title}
          </div>
        )}

        <div className="dance-result-panel__lower">
          <div
            className={`dance-result-panel__players${dual ? "" : " dance-result-panel__players--solo"}`}
            dir="ltr"
          >
            <DanceResultPlayerSummary
              playerNumber={1}
              playerLabel="بازیکن ۱"
              displayName={dual ? DUAL_PLAYER_1_DISPLAY_NAME : soloDisplayName}
              avatar={soloAvatarUrl}
              score={danceResult.score1}
              calories={danceResult.calories1}
              stars={danceResult.stars1}
              dualLayout={dual}
              showWinnerMedal={dualWinner === 1}
            />
            {dual ? (
              <DanceResultPlayerSummary
                playerNumber={2}
                playerLabel="بازیکن ۲"
                displayName={DUAL_PLAYER_2_DISPLAY_NAME}
                score={danceResult.score2}
                calories={danceResult.calories2}
                stars={danceResult.stars2}
                dualLayout
                showWinnerMedal={dualWinner === 2}
              />
            ) : null}
          </div>

          <div className="dance-result-panel__actions">
            <button
              type="button"
              disabled={danceResult.busy}
              ref={(element) => {
                buttonRefs.current[0] = element;
              }}
              onKeyDown={onArrowKeyDown}
              onClick={danceResult.playAgain}
              className="dance-result-btn dance-result-btn--primary"
            >
              {danceResult.busy ? busyLabel : "دوباره برقص"}
            </button>
            <button
              type="button"
              disabled={danceResult.busy}
              ref={(element) => {
                buttonRefs.current[1] = element;
              }}
              onKeyDown={onArrowKeyDown}
              onClick={danceResult.backToSongs}
              className="dance-result-btn dance-result-btn--primary"
            >
              {danceResult.busy ? busyLabel : "بازگشت به فهرست"}
            </button>
          </div>

          {danceResult.errorMessage ? (
            <p className="dance-result-panel__error">{danceResult.errorMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
