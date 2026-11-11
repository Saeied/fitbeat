"use client";

import {
  DANCE_RESULT_PLAYER_1_STAR_COLORS,
  DANCE_RESULT_PLAYER_2_STAR_COLORS,
  DanceResultStarRating,
} from "@/components/home/DanceResultStarRating";
import { assetUrl } from "@/lib/assetUrl";
import { DANCE_RESULT_MEDAL_URL } from "@/lib/danceResultAssets";
import { useId } from "react";
import { AiFillFire } from "react-icons/ai";

const PLACEHOLDER_AVATAR = assetUrl("/avatar_26.png");

const STAR_COLORS_BY_PLAYER = {
  1: DANCE_RESULT_PLAYER_1_STAR_COLORS,
  2: DANCE_RESULT_PLAYER_2_STAR_COLORS,
} as const;

export type DanceResultPlayerSummaryProps = {
  playerNumber: 1 | 2;
  displayName: string;
  score: number;
  calories: number;
  stars: number;
  avatar?: string;
  /** For screen readers; e.g. بازیکن ۱ */
  playerLabel: string;
  /** Rectangular avatar frame + optional winner medal (dual mode). */
  dualLayout?: boolean;
  showWinnerMedal?: boolean;
};

export function DanceResultPlayerSummary({
  playerNumber,
  displayName,
  score,
  calories,
  stars,
  avatar = PLACEHOLDER_AVATAR,
  playerLabel,
  dualLayout = false,
  showWinnerMedal = false,
}: DanceResultPlayerSummaryProps) {
  const roundedCalories = Math.round(calories);
  const fireGradientId = useId().replace(/:/g, "");

  return (
    <div
      className={`dance-result-player-summary${
        dualLayout ? " dance-result-player-summary--dual" : ""
      }`}
      aria-label={`${playerLabel}: ${displayName}`}
    >
      <div className="dance-result-player-summary__avatar-frame">
        {showWinnerMedal ? (
          /* eslint-disable-next-line @next/next/no-img-element -- medal art with pin anchor */
          <img
            src={DANCE_RESULT_MEDAL_URL}
            alt=""
            className="dance-result-player-summary__winner-medal"
            decoding="async"
          />
        ) : null}
        {dualLayout ? (
          <div className="dance-result-player-summary__avatar-inner">
            <img
              src={avatar}
              alt=""
              className="dance-result-player-summary__avatar"
              decoding="async"
            />
          </div>
        ) : (
          <img
            src={avatar}
            alt=""
            className="dance-result-player-summary__avatar"
            decoding="async"
          />
        )}
      </div>
      <p className="dance-result-player-summary__name">{displayName}</p>
      <div
        className="dance-result-player-summary__stats"
        aria-label={`${score.toLocaleString("en-US")} points, ${roundedCalories} kilocalories`}
      >
        <div className="dance-result-player-summary__score-text">
          <span className="dance-result-player-summary__score-value tabular-nums">
            {score.toLocaleString("en-US")}
          </span>
          <span className="dance-result-player-summary__score-unit">pts</span>
        </div>
        <span
          className="dance-result-player-summary__stat-sep"
          aria-hidden
        >
          |
        </span>
        <div
          className="dance-result-player-summary__calories"
          aria-label={`${roundedCalories} kcal`}
        >
          <div className="dance-result-player-summary__calories-flame">
            <svg
              width={0}
              height={0}
              aria-hidden
              className="absolute overflow-hidden"
            >
              <defs>
                <linearGradient
                  id={fireGradientId}
                  gradientUnits="objectBoundingBox"
                  x1="0.5"
                  y1="1"
                  x2="0.5"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#c2410c" />
                  <stop offset="35%" stopColor="#ea580c" />
                  <stop offset="72%" stopColor="#fb923c" />
                  <stop offset="100%" stopColor="#ffedd5" />
                </linearGradient>
              </defs>
            </svg>
            <AiFillFire
              className="dance-result-player-summary__calories-flame-icon"
              aria-hidden
              style={{ fill: `url(#${fireGradientId})` }}
            />
          </div>
          <div className="dance-result-player-summary__calories-text">
            <span className="dance-result-player-summary__calories-number tabular-nums">
              {roundedCalories.toLocaleString("en-US")}
            </span>
            <span className="dance-result-player-summary__calories-unit">
              kcal
            </span>
          </div>
        </div>
      </div>
      <DanceResultStarRating
        stars={stars}
        colors={STAR_COLORS_BY_PLAYER[playerNumber]}
        className="dance-result-player-summary__stars"
      />
    </div>
  );
}
