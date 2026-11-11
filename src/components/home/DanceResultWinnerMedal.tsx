"use client";

import { useId } from "react";

/** tailwind amber-600 — medal rims / rings */
const MEDAL_DETAIL_AMBER = "#d97706";
/** tailwind amber-700 — orbit stars */
const MEDAL_STAR_AMBER = "#b45309";

type DanceResultWinnerMedalProps = {
  winner: 1 | 2 | null;
};

export function DanceResultWinnerMedal({ winner }: DanceResultWinnerMedalProps) {
  const tie = winner == null;
  const playerLine = tie
    ? "مساوی"
    : winner === 1
      ? "بازیکن ۱"
      : "بازیکن ۲";

  return (
    <div
      className={`dance-result-winner-medal pointer-events-none${
        tie ? " dance-result-winner-medal--tie" : ""
      }`}
      role="status"
    >
      <div className="dance-result-winner-medal__ribbon" aria-hidden />
      <div className="dance-result-winner-medal__bail" aria-hidden />
      <div className="dance-result-winner-medal__disc">
        <MedalFace tie={tie} />
        <div className="dance-result-winner-medal__caption">
          <span
            className={`dance-result-winner-medal__caption-title${
              tie ? "" : " text-amber-800"
            }`}
          >
            {playerLine}
          </span>
        </div>
      </div>
    </div>
  );
}

function MedalFace({ tie }: { tie: boolean }) {
  const uid = useId().replace(/:/g, "");
  const faceId = `medal-face-${uid}`;
  const rimId = `medal-rim-${uid}`;

  const orbitStarFill = tie ? "#64748b" : MEDAL_STAR_AMBER;
  const orbitStars = buildOrbitStars({
    cx: 50,
    cy: 50,
    innerRingR: 35,
    outerFaceR: 47,
    count: 12,
    outerR: 5.55,
    innerR: 2.55,
    fill: orbitStarFill,
  });

  const faceStops = tie ? (
    <>
      <stop offset="0%" stopColor="#f1f5f9" />
      <stop offset="42%" stopColor="#94a3b8" />
      <stop offset="100%" stopColor="#475569" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#fffbeb" />
      <stop offset="35%" stopColor="#fde68a" />
      <stop offset="68%" stopColor="#fcd34d" />
      <stop offset="100%" stopColor="#fbbf24" />
    </>
  );

  return (
    <svg
      className="dance-result-winner-medal__svg"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <defs>
        <radialGradient id={faceId} cx="32%" cy="28%" r="68%">
          {faceStops}
        </radialGradient>
        <linearGradient id={rimId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={tie ? "#cbd5e1" : "#fde68a"} />
          <stop offset="100%" stopColor={tie ? "#475569" : MEDAL_DETAIL_AMBER} />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="49"
        fill={tie ? "#334155" : MEDAL_DETAIL_AMBER}
      />
      <circle cx="50" cy="50" r="47" fill={`url(#${faceId})`} />
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke={`url(#${rimId})`}
        strokeWidth="2"
      />
      <circle
        cx="50"
        cy="50"
        r="35"
        fill="none"
        stroke={tie ? "#475569" : MEDAL_DETAIL_AMBER}
        strokeWidth="1"
        opacity="0.65"
      />
      <g opacity="0.95">{orbitStars}</g>
    </svg>
  );
}

type OrbitStarsOptions = {
  cx: number;
  cy: number;
  innerRingR: number;
  outerFaceR: number;
  count: number;
  outerR: number;
  innerR: number;
  fill: string;
};

function buildOrbitStars({
  cx,
  cy,
  innerRingR,
  outerFaceR,
  count,
  outerR,
  innerR,
  fill,
}: OrbitStarsOptions) {
  const minOrbit = innerRingR + outerR;
  const maxOrbit = outerFaceR - outerR;
  const orbitR = (minOrbit + maxOrbit) / 2;
  const localPoints = regularStarPolygonLocal(outerR, innerR);
  const phase = -Math.PI / 2;

  return Array.from({ length: count }, (_, index) => {
    const angle = phase + (index * 2 * Math.PI) / count;
    const starCx = cx + orbitR * Math.cos(angle);
    const starCy = cy + orbitR * Math.sin(angle);
    const rotationDeg = (angle * 180) / Math.PI + 90;

    return (
      <g
        key={index}
        transform={`translate(${starCx}, ${starCy}) rotate(${rotationDeg})`}
      >
        <polygon points={localPoints} fill={fill} />
      </g>
    );
  });
}

function regularStarPolygonLocal(outerR: number, innerR: number): string {
  const coords: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outerR : innerR;
    coords.push(`${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`);
  }
  return coords.join(" ");
}
