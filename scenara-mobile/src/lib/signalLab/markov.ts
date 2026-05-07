// Markov utilities for the Signal Lab.
//
// First-order discrete Markov chain over three states (UP / FLAT / DOWN).
// All functions are pure so they can be tested without React or network state.

import type { MarketState, MarketType, TransitionMatrix } from "./types";

const STATES: MarketState[] = ["UP", "FLAT", "DOWN"];

// Minimum transitions observed for the *current* state before we trust the
// row's probabilities. Below this we fall back to a neutral signal and flag a
// small-sample warning. Tuned for short-horizon BTC data; tighten for longer
// horizons later.
export const MIN_SAMPLE_FOR_HIGH_CONFIDENCE = 30;

/**
 * Convert a price series into a sequence of states.
 *
 * `flatThreshold` is expressed as a fraction (e.g. 0.001 = ±0.1%). Returns
 * `prices.length - 1` states, since each state describes a *transition* from
 * the previous price.
 */
export function priceSeriesToStates(
  prices: number[],
  flatThreshold = 0.001,
): MarketState[] {
  if (prices.length < 2) return [];
  const out: MarketState[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev === 0) { out.push("FLAT"); continue; }
    const change = (prices[i] - prev) / prev;
    if (change > flatThreshold)        out.push("UP");
    else if (change < -flatThreshold)  out.push("DOWN");
    else                               out.push("FLAT");
  }
  return out;
}

export function getCurrentState(
  prices: number[],
  flatThreshold = 0.001,
): MarketState {
  const states = priceSeriesToStates(prices, flatThreshold);
  return states[states.length - 1] ?? "FLAT";
}

/**
 * Build a row-stochastic 3x3 transition matrix.
 * Empty rows (states never observed) default to a uniform 1/3 distribution
 * so downstream code doesn't divide by zero.
 */
export function buildTransitionMatrix(states: MarketState[]): TransitionMatrix {
  const counts: Record<MarketState, Record<MarketState, number>> = {
    UP:   { UP: 0, FLAT: 0, DOWN: 0 },
    FLAT: { UP: 0, FLAT: 0, DOWN: 0 },
    DOWN: { UP: 0, FLAT: 0, DOWN: 0 },
  };
  for (let i = 0; i < states.length - 1; i++) {
    counts[states[i]][states[i + 1]]++;
  }
  const matrix: TransitionMatrix = {
    UP:   { UP: 0, FLAT: 0, DOWN: 0 },
    FLAT: { UP: 0, FLAT: 0, DOWN: 0 },
    DOWN: { UP: 0, FLAT: 0, DOWN: 0 },
  };
  for (const from of STATES) {
    const total = counts[from].UP + counts[from].FLAT + counts[from].DOWN;
    if (total === 0) {
      matrix[from] = { UP: 1 / 3, FLAT: 1 / 3, DOWN: 1 / 3 };
    } else {
      matrix[from] = {
        UP:   counts[from].UP / total,
        FLAT: counts[from].FLAT / total,
        DOWN: counts[from].DOWN / total,
      };
    }
  }
  return matrix;
}

/** Count transitions originating from a given state. Used for sample-size warnings. */
export function countTransitionsFrom(states: MarketState[], from: MarketState): number {
  let n = 0;
  for (let i = 0; i < states.length - 1; i++) {
    if (states[i] === from) n++;
  }
  return n;
}

/**
 * Pick the most likely next state given the current row of the matrix.
 * Returns the argmax; ties resolve to UP > FLAT > DOWN (declared order).
 */
export function predictNextState(
  currentState: MarketState,
  matrix: TransitionMatrix,
): MarketState {
  const row = matrix[currentState];
  let best: MarketState = "FLAT";
  let bestP = -1;
  for (const s of STATES) {
    if (row[s] > bestP) { bestP = row[s]; best = s; }
  }
  return best;
}

/**
 * Map a predicted state into a YES probability for the given market type.
 *
 * The mapping isn't a one-liner because different market types frame YES
 * differently (e.g. "BTC closes above $X" cares about UP, while a dual-direction
 * market may treat FLAT as a coin flip). FLAT always anchors near 50% — we
 * don't pretend to predict noise.
 */
export function convertStatePredictionToYesProbability(
  predictedState: MarketState,
  modelRow: { UP: number; FLAT: number; DOWN: number },
  marketType: MarketType,
): number {
  switch (marketType) {
    case "btc_direction_up":
    case "btc_direction_24h":
      // YES if price ends higher than start. UP probability + half of FLAT.
      return clamp01(modelRow.UP + modelRow.FLAT * 0.5);
    case "btc_threshold_above":
    case "btc_new_high":
      // YES if price clears a fixed level — needs sustained UP, FLAT counts as miss.
      return clamp01(modelRow.UP);
  }
  // Exhaustiveness fallback (shouldn't reach with typed inputs).
  void predictedState;
  return 0.5;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
