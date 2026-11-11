"use client";

import { useId } from "react";
import { LIVE_SCORE_STAR_COUNT } from "@/lib/liveScoreStars";

export type StarColors = {
  outline: string;
  glow: string;
  glowStroke: string;
  empty: string;
};

export const DANCE_RESULT_PLAYER_1_STAR_COLORS: StarColors = {
  outline: "#008FE1",
  glow: "#8BDFFF",
  glowStroke: "#78D9FF",
  empty: "#075393",
};

export const DANCE_RESULT_PLAYER_2_STAR_COLORS: StarColors = {
  outline: "#E00092",
  glow: "#FF9BD7",
  glowStroke: "#FF73C5",
  empty: "#922075",
};

const STAR_SIZE_CLASS = "dance-result-star";

type StarProps = {
  filled: boolean;
  size: number;
  colors: StarColors;
  className?: string;
};

export function DanceResultStar({
  filled,
  size,
  colors,
  className = STAR_SIZE_CLASS,
}: StarProps) {
  const id = useId().replace(/:/g, "");
  const gradientId = `gold-${id}`;
  const glowId = `glow-${id}`;

  const starPath =
    "M32 3 L40.5 21.5 L61 24.5 L46 39 L49.5 60 L32 50 L14.5 60 L18 39 L3 24.5 L23.5 21.5 Z";

  const responsive = Boolean(className);

  return (
    <svg
      width={responsive ? undefined : size}
      height={responsive ? undefined : size}
      viewBox="-5 -5 74 74"
      fill="none"
      className={`shrink-0 overflow-visible ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#FFFBC0" />
          <stop offset="25%" stopColor="#FFE96A" />
          <stop offset="55%" stopColor="#FFC52B" />
          <stop offset="80%" stopColor="#FF9D08" />
          <stop offset="100%" stopColor="#FF7900" />
        </linearGradient>

        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {filled ? (
        <>
          <path
            d={starPath}
            fill={colors.glow}
            stroke={colors.glowStroke}
            strokeWidth="5"
            opacity="0.85"
            filter={`url(#${glowId})`}
          />
          <path
            d={starPath}
            fill={`url(#${gradientId})`}
            stroke={colors.outline}
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          <path
            d="M32 10 L39 26 L53 28 L42 39 L44 50 L32 43 L20 50 L22 39 L11 28 L25 26 Z"
            fill="#FFF7A4"
            opacity="0.35"
          />
          <path
            d="M32 10 L39 26 L53 28 L42 31 L32 27 L22 31 L11 28 L25 26 Z"
            fill="#FFFFFF"
            opacity="0.32"
          />
        </>
      ) : (
        <path d={starPath} fill={colors.empty} />
      )}
    </svg>
  );
}

type DanceResultStarRatingProps = {
  stars: number;
  colors: StarColors;
  maxStars?: number;
  size?: number;
  className?: string;
};

export function DanceResultStarRating({
  stars,
  colors,
  maxStars = LIVE_SCORE_STAR_COUNT,
  size = 56,
  className = "",
}: DanceResultStarRatingProps) {
  const clamped = Math.min(maxStars, Math.max(0, stars));

  return (
    <div
      className={className.trim()}
      aria-hidden
    >
      {Array.from({ length: maxStars }, (_, index) => (
        <DanceResultStar
          key={index}
          filled={index < clamped}
          size={size}
          colors={colors}
        />
      ))}
    </div>
  );
}
