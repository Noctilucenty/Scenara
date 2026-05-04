/**
 * src/utils/ranking.ts — Rank score formula
 * ──────────────────────────────────────────
 * Canonical rankScore used for sorting the leaderboard and ordering the user
 * pool.  All components are scaled to comparable units before weighting so
 * the 0.45/0.20/0.20/0.10/0.05 coefficients reflect real relative importance.
 *
 * Formula (user-specified):
 *   rankScore = totalPnL*0.45 + volumeScore*0.20 + winRateScore*0.20
 *             + activityScore*0.10 + streakScore*0.05
 *
 * Component scales (all ≈ 0–2000 for a typical active trader):
 *   totalPnL      → dollars (raw); ranges ≈ -2000 … +6000
 *   volumeScore   → totalPredictions * 8, capped at 1000
 *   winRateScore  → winRate% * 10  (0 … 1000)
 *   activityScore → currentStreak * 100, capped at 1000
 *   streakScore   → bestStreak * 50, capped at 1000
 */

export type RankInputs = {
  totalPnL: number;
  totalPredictions: number;
  winRate: number;          // 0–100
  currentStreak: number;
  bestStreak: number;
};

/** Individual sub-scores (exported for display / tooltip purposes). */
export type ScoreBreakdown = {
  volumeScore: number;
  winRateScore: number;
  activityScore: number;
  streakScore: number;
  rankScore: number;
};

export function computeRankScore(u: RankInputs): ScoreBreakdown {
  const volumeScore   = Math.min(u.totalPredictions * 8, 1000);
  const winRateScore  = u.winRate * 10;
  const activityScore = Math.min(u.currentStreak * 100, 1000);
  const streakScore   = Math.min(u.bestStreak * 50, 1000);

  const rankScore =
    u.totalPnL       * 0.45 +
    volumeScore      * 0.20 +
    winRateScore     * 0.20 +
    activityScore    * 0.10 +
    streakScore      * 0.05;

  return { volumeScore, winRateScore, activityScore, streakScore, rankScore };
}

/**
 * Sort a list of objects that have a `rankScore` field descending and assign
 * 1-based `rank` (mutates the rank field if present, otherwise returns sorted copy).
 */
export function rankSorted<T extends { rankScore: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.rankScore - a.rankScore);
}
