// Signal Lab — typed data models.
// Kept in one place so backend swap (mock → real API) doesn't drift.

export type MarketState = "UP" | "FLAT" | "DOWN";

export type ConfidenceLabel = "Low" | "Medium" | "High";

export type MarketStatus = "open" | "closed" | "resolved";

export type MarketType =
  | "btc_direction_up"      // YES = price goes up
  | "btc_threshold_above"   // YES = price ends above threshold
  | "btc_new_high"          // YES = price reaches new high
  | "btc_direction_24h";    // YES = price up over 24h window

export interface Market {
  id: string;
  title: string;
  category: string;
  underlying: string;            // "BTC"
  marketType: MarketType;
  crowdProbability: number;      // 0-1
  timeRemainingMs: number;
  liquidity: number;             // simulated $
  status: MarketStatus;
  resolutionCriteria: string;
  resolvedYes?: boolean;         // only set when status = "resolved"
}

export type TransitionMatrix = {
  // rows: from state, cols: to state. Values 0-1 summing to 1 per row.
  [from in MarketState]: {
    [to in MarketState]: number;
  };
};

export interface Signal {
  marketId: string;
  currentState: MarketState;
  predictedState: MarketState;
  modelProbability: number;      // 0-1, probability of YES (mapped from predicted state)
  crowdProbability: number;      // 0-1
  edgeGap: number;               // model - crowd, in percentage points (e.g. +9 = +0.09 pp * 100)
  confidence: ConfidenceLabel;
  sampleSize: number;            // number of historical transitions observed
  warnings: string[];
  transitionMatrix: TransitionMatrix;
}

export interface Forecast {
  marketId: string;
  userProbability: number;       // 0-1
  side: "YES" | "NO";
  reasoning: string;
  createdAt: string;             // ISO
  locked: boolean;
}

export interface Comparison {
  marketId: string;
  resolved: boolean;
  outcomeYes?: boolean;
  userProbability?: number;
  modelProbability?: number;
  crowdProbability?: number;
  userBrier?: number;
  modelBrier?: number;
  crowdBrier?: number;
}

export interface BacktestSummary {
  testedSignals: number;
  hitRate: number;               // 0-1
  averageBrier: number;          // 0-1
  simulatedPnl: number;
  averageEdgeGap: number;        // percentage points
  bestCategory: string;
  warning: string;
}
