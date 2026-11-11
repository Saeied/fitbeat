import { PiStarFill, PiStarLight } from "react-icons/pi";
import { LIVE_SCORE_STAR_COUNT } from "@/lib/liveScoreStars";

type LiveScoreStarsProps = {
  filled: number;
  size?: number;
  layout?: "vertical" | "horizontal";
  className?: string;
};

export function LiveScoreStars({
  filled,
  size = 28,
  layout = "horizontal",
  className = "",
}: LiveScoreStarsProps) {
  const layoutClass =
    layout === "vertical"
      ? "flex flex-col-reverse gap-y-5.25"
      : "flex flex-row-reverse items-center justify-center gap-x-1.25";

  return (
    <div className={`live-score-stars ${layoutClass} ${className}`.trim()} aria-hidden>
      {Array.from({ length: LIVE_SCORE_STAR_COUNT }, (_, index) => {
        const isFilled = index < filled;
        if (isFilled) {
          return (
            <PiStarFill
              key={index}
              className="live-score-star"
              color="#fbbf24"
              size={size}
            />
          );
        }
        return (
          <PiStarLight
            key={index}
            className="live-score-star"
            color="#fbbf24"
            size={size}
          />
        );
      })}
    </div>
  );
}
