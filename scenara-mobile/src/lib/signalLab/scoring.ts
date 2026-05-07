// Scoring helpers — Brier, edge gap, confidence classification.
// Centralized so all comparison views agree on the math.

import type { ConfidenceLabel } from "./types";
import { MIN_SAMPLE_FOR_HIGH_CONFIDENCE } from "./markov";

/**
 * Brier score for a binary forecast.
 * `probability` is in [0,1]. `outcome` is 1 (YES occurred) or 0 (NO).
 * Lower is better. 0 = perfect, 1 = maximally wrong.
 */
export function calculateBrierScore(probability: number, outcome: 0 | 1): number {
  const p = normalizeProbability(probability);
  return Math.pow(p - outcome, 2);
}

/**
 * Edge gap = model probability − crowd probability, in *percentage points*.
 * E.g. model 0.67 vs crowd 0.58 → +9 pp. Useful for ranking signals; not a
 * profit estimate.
 */
export function calculateEdgeGap(modelProbability: number, crowdProbability: number): number {
  const m = normalizeProbability(modelProbability);
  const c = normalizeProbability(crowdProbability);
  return (m - c) * 100;
}

/**
 * Confidence label combines (a) sample size and (b) how decisive the model
 * probability is. Both must be solid for "High".
 */
export function classifyConfidence(probability: number, sampleSize: number): ConfidenceLabel {
  const p = normalizeProbability(probability);
  const distanceFromCoinFlip = Math.abs(p - 0.5);
  if (sampleSize < MIN_SAMPLE_FOR_HIGH_CONFIDENCE)        return "Low";
  if (distanceFromCoinFlip < 0.05)                        return "Low";
  if (distanceFromCoinFlip < 0.12 || sampleSize < 80)     return "Medium";
  return "High";
}

/** Clamp/sanitize any probability-like input to [0,1]. */
export function normalizeProbability(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Format a 0-1 probability as a percentage string with the given precision. */
export function formatProbability(value: number, decimals = 0): string {
  return `${(normalizeProbability(value) * 100).toFixed(decimals)}%`;
}

/** Format edge gap with explicit sign (e.g. "+9 pp", "-3 pp"). */
export function formatEdgeGap(pp: number): string {
  const sign = pp >= 0 ? "+" : "";
  return `${sign}${pp.toFixed(1)} pp`;
}
