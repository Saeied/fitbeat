export const LIVE_SCORE_STAR_COUNT = 5;

/** Same threshold as the live score sidebar (floor buckets over maxScore). */
export function filledLiveScoreStars(total: number, maxScore: number): number {
  if (!(maxScore > 0)) return 0;
  const scorePerStar = maxScore / LIVE_SCORE_STAR_COUNT;
  return Math.min(
    LIVE_SCORE_STAR_COUNT,
    Math.max(0, Math.floor(total / scorePerStar)),
  );
}
