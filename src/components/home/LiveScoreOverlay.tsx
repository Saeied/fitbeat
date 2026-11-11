"use client";
import { createPortal } from "react-dom";
import { AiFillFire } from "react-icons/ai";
import { useFullscreen } from "@/hooks/useFullscreen";
import { PiStarFill, PiStarLight } from "react-icons/pi";
import { useEffect, useId, useRef, useState } from "react";
import { PlayerProfileSlot } from "@/components/home/PlayerProfileSlot";
import type { LiveScoreSlot, UseLiveScoreState } from "@/hooks/useLiveScore";
import { assetUrl } from "@/lib/assetUrl";
import {
  filledLiveScoreStars,
  LIVE_SCORE_STAR_COUNT,
} from "@/lib/liveScoreStars";

type ScoreGrade = "perfect" | "good" | "not-bad" | "bad";

const DUAL_PLAYER_1_DISPLAY_NAME = "بازیکن ۱";
const DUAL_PLAYER_2_DISPLAY_NAME = "بازیکن ۲";
const DUAL_PLAYER_2_AVATAR_URL = assetUrl("/avatar_26.png");

type LiveScoreOverlayProps = {
  liveScore: UseLiveScoreState;
  linkedPlayerDisplayName?: string;
  linkedPlayerAvatarUrl?: string;
};

export function LiveScoreOverlay({
  liveScore,
  linkedPlayerDisplayName = "",
  linkedPlayerAvatarUrl = "",
}: LiveScoreOverlayProps) {
  if (!liveScore.visible) return null;

  const dual = liveScore.playerCount === 2;
  const linkedDisplayName = linkedPlayerDisplayName.trim();
  const linkedAvatarUrl = linkedPlayerAvatarUrl.trim();

  const panel = dual ? (
    <>
      <FeedbackPanel
        slot={1}
        data={liveScore.slots[1]}
        displayName={DUAL_PLAYER_1_DISPLAY_NAME}
        avatarImageUrl={linkedAvatarUrl}
      />
      <FeedbackPanel
        slot={2}
        data={liveScore.slots[2]}
        displayName={DUAL_PLAYER_2_DISPLAY_NAME}
        avatarImageUrl={DUAL_PLAYER_2_AVATAR_URL}
      />
      <ScoreProgressBar
        side="left"
        data={liveScore.slots[1]}
      />
      <ScoreProgressBar
        side="right"
        data={liveScore.slots[2]}
      />
    </>
  ) : (
    <>
      <FeedbackPanel
        slot={1}
        data={liveScore.slots[1]}
        displayName={linkedDisplayName}
        avatarImageUrl={linkedAvatarUrl}
      />
      <ScoreProgressBar
        side="left"
        data={liveScore.slots[1]}
      />
    </>
  );

  if (typeof document !== "undefined") {
    return createPortal(panel, document.body);
  }

  return panel;
}

function scoreGrade(feedback: string): ScoreGrade | null {
  const key = feedback
    .trim()
    .toLowerCase()
    .replace(/[\_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!key) return null;

  if (key.includes("perfect")) return "perfect";
  if (key.includes("not bad") || key.includes("notbad")) return "not-bad";
  if (key.includes("good")) return "good";
  if (key.includes("bad") || key.includes("miss")) return "bad";

  return null;
}

function hitLine(data: LiveScoreSlot): string {
  return data.feedback.trim();
}

function HitFeedback({ data }: { data: LiveScoreSlot }) {
  const label = hitLine(data);

  if (!label) return null;

  const grade = scoreGrade(data.feedback);

  const sizeClass =
    grade === "perfect" ||
    grade === "good" ||
    grade === "not-bad" ||
    grade === "bad"
      ? "text-3xl md:text-5xl"
      : "text-3xl md:text-5xl";

  return (
    <p
      key={data.hitNonce}
      className={`score-hit-label score-fade-anim inline-block uppercase ${sizeClass}${
        grade ? ` score-hit-label--${grade}` : ""
      }`}
    >
      {label}
    </p>
  );
}

/** Hit feedback + player chip at top-left / top-right during playback. */
function FeedbackPanel({
  slot,
  data,
  displayName,
  avatarImageUrl,
}: {
  slot: 1 | 2;
  data: LiveScoreSlot;
  displayName: string;
  avatarImageUrl: string;
}) {
  const rowClass = slot === 1 ? "flex-row" : "flex-row-reverse";
  const side = slot === 1 ? "left-6" : "right-6 text-right";

  return (
    <div
      className={`live-score-panel live-score-panel--slot-${slot} pointer-events-none fixed top-6 z-[60] ${side}`}
    >
      <div
        className={`live-score-panel__hit-row flex ${rowClass} items-center gap-6.5`}
      >
        {data.feedback.trim() ? <HitFeedback data={data} /> : null}
        <PlayerProfileSlot
          displayName={displayName}
          avatarImageUrl={avatarImageUrl}
        />
      </div>
    </div>
  );
}

/** Vertical progress: single + P1 = center-left, P2 = center-right. */
function scoreFillPercent(data: LiveScoreSlot): number {
  if (!(data.maxScore > 0)) return 0;

  return Math.min(100, Math.max(0, (data.total / data.maxScore) * 100));
}

function CaloriesFireBadge({
  calories,
  large,
}: {
  calories: number;
  large: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const iconSize = large ? 86 : 76;

  return (
    <div
      className="live-score-calories-fire"
      aria-label={`${Math.round(calories)} kcal`}
    >
      <svg
        width={0}
        height={0}
        aria-hidden
        className="absolute overflow-hidden"
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="objectBoundingBox"
            x1="0.5"
            y1="1"
            x2="0.5"
            y2="0"
          >
            <stop
              offset="0%"
              stopColor="#c2410c"
            />
            <stop
              offset="35%"
              stopColor="#ea580c"
            />
            <stop
              offset="72%"
              stopColor="#fb923c"
            />
            <stop
              offset="100%"
              stopColor="#ffedd5"
            />
          </linearGradient>
        </defs>
      </svg>
      <AiFillFire
        className="live-score-calories-fire__icon"
        size={iconSize}
        style={{ fill: `url(#${gradientId})` }}
        aria-hidden
      />
      <div className="live-score-calories-fire__value">
        <span className="live-score-calories-fire__number tabular-nums">
          {Math.round(calories)}
        </span>
        <span className="live-score-calories-fire__unit">kcal</span>
      </div>
    </div>
  );
}

function ScoreProgressBar({
  side,
  data,
}: {
  side: "left" | "right";
  data: LiveScoreSlot;
}) {
  const { active } = useFullscreen();
  const hasMaxScore = data.maxScore > 0;
  const fill = scoreFillPercent(data);
  const starCount = LIVE_SCORE_STAR_COUNT;
  const filledStars = filledLiveScoreStars(data.total, data.maxScore);

  const prevFilledStarsRef = useRef(filledStars);
  const [starPopIndex, setStarPopIndex] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevFilledStarsRef.current;
    prevFilledStarsRef.current = filledStars;

    if (filledStars > prev && filledStars > 0) {
      const newStarIndex = filledStars - 1;
      setStarPopIndex(null);
      const frame = requestAnimationFrame(() => {
        setStarPopIndex(newStarIndex);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [filledStars]);

  if (!hasMaxScore) return null;

  return (
    <div
      className={`flex ${
        side === "left" ? "flex-row" : "flex-row-reverse"
      } live-score-progress pointer-events-none fixed z-[60] items-start justify-center gap-x-0 ${
        side === "left"
          ? "live-score-progress--left"
          : "live-score-progress--right"
      }`}
      aria-hidden
    >
      <div className="flex flex-col-reverse gap-y-5.25">
        {Array.from({ length: starCount }, (_, index) => {
          const filled = index < filledStars;
          const popping = filled && starPopIndex === index;

          if (filled) {
            return (
              <PiStarFill
                key={index}
                className={
                  popping
                    ? "live-score-star live-score-star--pop"
                    : "live-score-star"
                }
                color="#fbbf24"
                size={active ? 35 : 32}
                onAnimationEnd={() => {
                  if (starPopIndex === index) setStarPopIndex(null);
                }}
              />
            );
          }

          return (
            <PiStarLight
              key={index}
              className="live-score-star"
              color="#fbbf24"
              size={active ? 35 : 32}
            />
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="live-score-progress__track">
          <div
            className="live-score-progress__fill"
            style={{ height: `${fill}%` }}
          />
        </div>
        <CaloriesFireBadge
          calories={data.calories}
          large={active}
        />
      </div>
    </div>
  );
}
