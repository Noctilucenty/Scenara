// Signal Lab data layer.
//
// Each function tries the real backend first, then falls back to the local
// mock so the UI always has something to render. To swap fully to live data,
// just delete the catch blocks once /signal-lab endpoints are stable.

import { api } from "../../api/client";
import {
  fetchBacktestMock,
  fetchMarketsMock,
  fetchSignalMock,
} from "./mockData";
import type {
  BacktestSummary,
  Comparison,
  Forecast,
  Market,
  Signal,
} from "./types";

export async function fetchSignalLabMarkets(): Promise<Market[]> {
  try {
    const res = await api.get("/signal-lab/markets", { timeout: 8000 });
    if (Array.isArray(res.data) && res.data.length > 0) return res.data as Market[];
  } catch { /* fall through to mock */ }
  return fetchMarketsMock();
}

export async function fetchSignalLabSignal(marketId: string): Promise<Signal | null> {
  try {
    const res = await api.get(`/signal-lab/markets/${marketId}/signal`, { timeout: 8000 });
    if (res.data) return res.data as Signal;
  } catch { /* fall through to mock */ }
  return fetchSignalMock(marketId);
}

export async function fetchSignalLabBacktest(): Promise<BacktestSummary> {
  try {
    const res = await api.get("/signal-lab/backtest-summary", { timeout: 8000 });
    if (res.data) return res.data as BacktestSummary;
  } catch { /* fall through to mock */ }
  return fetchBacktestMock();
}

export async function submitSignalLabForecast(forecast: Forecast): Promise<{ ok: boolean }> {
  try {
    await api.post(`/signal-lab/markets/${forecast.marketId}/forecast`, forecast);
    return { ok: true };
  } catch {
    // Mock mode: accept silently. Real backend will enforce auth + persistence.
    return { ok: true };
  }
}

export async function fetchSignalLabComparison(marketId: string): Promise<Comparison | null> {
  try {
    const res = await api.get(`/signal-lab/markets/${marketId}/comparison`, { timeout: 8000 });
    if (res.data) return res.data as Comparison;
  } catch { /* fall through */ }
  // Mock: return an unresolved placeholder.
  return {
    marketId,
    resolved: false,
  };
}
