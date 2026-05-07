// Mock data for Signal Lab. Replace each function with a real `api.get(...)`
// call once the backend ships /signal-lab/* endpoints.

import {
  buildTransitionMatrix,
  convertStatePredictionToYesProbability,
  countTransitionsFrom,
  getCurrentState,
  predictNextState,
  priceSeriesToStates,
  MIN_SAMPLE_FOR_HIGH_CONFIDENCE,
} from "./markov";
import { calculateEdgeGap, classifyConfidence } from "./scoring";
import type {
  BacktestSummary,
  Market,
  MarketState,
  Signal,
} from "./types";

// Synthetic but plausible BTC price series (USD). Hand-tuned to give a non-
// uniform transition matrix so the demo signal isn't always 50/50.
// Replace with real data from /signal-lab/markets/{id}/signal once available.
const MOCK_BTC_PRICES = [
  68420, 68510, 68390, 68600, 68720, 68610, 68540, 68820, 68900, 68750,
  68930, 69100, 69020, 69180, 69040, 69210, 69390, 69280, 69450, 69330,
  69500, 69620, 69510, 69400, 69550, 69680, 69540, 69470, 69620, 69780,
  69850, 69720, 69590, 69680, 69810, 69930, 69860, 70010, 70150, 70080,
  69960, 70120, 70240, 70180, 70090, 70200, 70320, 70410, 70290, 70170,
  70250, 70380, 70490, 70380, 70260, 70410, 70560, 70470, 70390, 70520,
  70680, 70590, 70450, 70330, 70470, 70600, 70730, 70620, 70540, 70710,
  70840, 70780, 70650, 70490, 70620, 70780, 70910, 70850, 70720, 70840,
  70980, 71120, 71050, 70920, 71080, 71210, 71340, 71250, 71160, 71290,
  71430, 71350, 71210, 71380, 71520, 71450, 71320, 71190, 71340, 71480,
  71610, 71540, 71400, 71290, 71450, 71600, 71720, 71640, 71510, 71380,
  71540, 71690, 71820, 71740, 71600, 71460, 71630, 71790, 71910, 71820,
  71680, 71540, 71710, 71870, 71990, 71910, 71780, 71640, 71820, 71970,
  72110, 72020, 71890, 71750, 71920, 72090, 72210, 72130, 72000, 71860,
  72030, 72180, 72310, 72230, 72100, 71970, 72140, 72290,
];

const MOCK_MARKETS: Market[] = [
  {
    id: "btc-direction-1h",
    title: "BTC 1-hour direction: up or down",
    category: "crypto",
    underlying: "BTC",
    marketType: "btc_direction_24h",
    crowdProbability: 0.58,
    timeRemainingMs: 1000 * 60 * 47,
    liquidity: 24_500,
    status: "open",
    resolutionCriteria: "Resolves YES if BTC closes higher in 1 hour vs current spot. Source: Coinbase BTC/USD.",
  },
  {
    id: "btc-above-70k-fri",
    title: "BTC closes above $70,000 by Friday",
    category: "crypto",
    underlying: "BTC",
    marketType: "btc_threshold_above",
    crowdProbability: 0.71,
    timeRemainingMs: 1000 * 60 * 60 * 38,
    liquidity: 91_200,
    status: "open",
    resolutionCriteria: "Resolves YES if BTC closes above $70,000 on Friday 23:59 UTC. Source: CoinGecko daily close.",
  },
  {
    id: "btc-up-24h",
    title: "BTC above current price after 24 hours",
    category: "crypto",
    underlying: "BTC",
    marketType: "btc_direction_24h",
    crowdProbability: 0.52,
    timeRemainingMs: 1000 * 60 * 60 * 23,
    liquidity: 56_400,
    status: "open",
    resolutionCriteria: "Resolves YES if BTC price 24h from now exceeds the spot at market open.",
  },
  {
    id: "btc-new-weekly-high",
    title: "BTC reaches new weekly high",
    category: "crypto",
    underlying: "BTC",
    marketType: "btc_new_high",
    crowdProbability: 0.34,
    timeRemainingMs: 1000 * 60 * 60 * 60,
    liquidity: 18_700,
    status: "open",
    resolutionCriteria: "Resolves YES if BTC trades above the prior 7-day high before the weekly close.",
  },
];

function buildSignalForMarket(market: Market, prices: number[]): Signal {
  const flatThreshold = 0.0008;
  const states = priceSeriesToStates(prices, flatThreshold);
  const matrix = buildTransitionMatrix(states);
  const currentState: MarketState = getCurrentState(prices, flatThreshold);
  const predicted = predictNextState(currentState, matrix);
  const modelProbability = convertStatePredictionToYesProbability(
    predicted,
    matrix[currentState],
    market.marketType,
  );

  const sampleSize = countTransitionsFrom(states, currentState);
  const confidence = classifyConfidence(modelProbability, sampleSize);
  const edgeGap = calculateEdgeGap(modelProbability, market.crowdProbability);

  const warnings: string[] = [];
  if (sampleSize < MIN_SAMPLE_FOR_HIGH_CONFIDENCE) {
    warnings.push("Small sample size for the current state. Signal may be noisy.");
  }
  if (Math.abs(modelProbability - 0.5) < 0.05) {
    warnings.push("Model is close to a coin flip. Treat as neutral.");
  }
  if (market.timeRemainingMs < 1000 * 60 * 30) {
    warnings.push("Market is near expiry. Short-horizon signals can be unstable.");
  }
  if (Math.abs(edgeGap) > 25) {
    warnings.push("Edge gap is unusually large. Double-check data quality before trusting it.");
  }

  return {
    marketId: market.id,
    currentState,
    predictedState: predicted,
    modelProbability,
    crowdProbability: market.crowdProbability,
    edgeGap,
    confidence,
    sampleSize,
    warnings,
    transitionMatrix: matrix,
  };
}

const MOCK_BACKTEST: BacktestSummary = {
  testedSignals: 412,
  hitRate: 0.561,
  averageBrier: 0.214,
  simulatedPnl: 1834.50,
  averageEdgeGap: 6.7,
  bestCategory: "BTC 1-hour direction",
  warning: "Hit rate alone is not enough. Calibration (Brier) and edge gap matter more for long-term skill.",
};

// ── Public mock-API ──────────────────────────────────────────────────────────

export async function fetchMarketsMock(): Promise<Market[]> {
  return MOCK_MARKETS.map(m => ({ ...m }));
}

export async function fetchSignalMock(marketId: string): Promise<Signal | null> {
  const market = MOCK_MARKETS.find(m => m.id === marketId);
  if (!market) return null;
  return buildSignalForMarket(market, MOCK_BTC_PRICES);
}

export async function fetchBacktestMock(): Promise<BacktestSummary> {
  return { ...MOCK_BACKTEST };
}
