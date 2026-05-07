"""
Signal Lab — experimental forecasting research endpoints.

This is an MVP that returns mock data so the frontend has something to render
while the real model pipeline is built. Replace each handler with a query
against the real BTC snapshot store / model service when ready.

Disclaimer: outputs are simulation/research only. Not financial advice.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

MarketType = Literal[
    "btc_direction_up",
    "btc_threshold_above",
    "btc_new_high",
    "btc_direction_24h",
]


class Market(BaseModel):
    id: str
    title: str
    category: str
    underlying: str
    marketType: MarketType
    crowdProbability: float = Field(..., ge=0.0, le=1.0)
    timeRemainingMs: int
    liquidity: float
    status: Literal["open", "closed", "resolved"]
    resolutionCriteria: str
    resolvedYes: Optional[bool] = None


class TransitionRow(BaseModel):
    UP: float
    FLAT: float
    DOWN: float


class TransitionMatrix(BaseModel):
    UP: TransitionRow
    FLAT: TransitionRow
    DOWN: TransitionRow


class Signal(BaseModel):
    marketId: str
    currentState: Literal["UP", "FLAT", "DOWN"]
    predictedState: Literal["UP", "FLAT", "DOWN"]
    modelProbability: float
    crowdProbability: float
    edgeGap: float
    confidence: Literal["Low", "Medium", "High"]
    sampleSize: int
    warnings: List[str]
    transitionMatrix: TransitionMatrix


class ForecastIn(BaseModel):
    marketId: str
    userProbability: float = Field(..., ge=0.0, le=1.0)
    side: Literal["YES", "NO"]
    reasoning: str = ""
    createdAt: str
    locked: bool = True


class Comparison(BaseModel):
    marketId: str
    resolved: bool
    outcomeYes: Optional[bool] = None
    userProbability: Optional[float] = None
    modelProbability: Optional[float] = None
    crowdProbability: Optional[float] = None
    userBrier: Optional[float] = None
    modelBrier: Optional[float] = None
    crowdBrier: Optional[float] = None


class BacktestSummary(BaseModel):
    testedSignals: int
    hitRate: float
    averageBrier: float
    simulatedPnl: float
    averageEdgeGap: float
    bestCategory: str
    warning: str


# ── Mock data ────────────────────────────────────────────────────────────────

_MOCK_MARKETS: List[Market] = [
    Market(
        id="btc-direction-1h",
        title="BTC 1-hour direction: up or down",
        category="crypto",
        underlying="BTC",
        marketType="btc_direction_24h",
        crowdProbability=0.58,
        timeRemainingMs=1000 * 60 * 47,
        liquidity=24500.0,
        status="open",
        resolutionCriteria="Resolves YES if BTC closes higher in 1 hour vs current spot.",
    ),
    Market(
        id="btc-above-70k-fri",
        title="BTC closes above $70,000 by Friday",
        category="crypto",
        underlying="BTC",
        marketType="btc_threshold_above",
        crowdProbability=0.71,
        timeRemainingMs=1000 * 60 * 60 * 38,
        liquidity=91200.0,
        status="open",
        resolutionCriteria="Resolves YES if BTC closes above $70,000 on Friday 23:59 UTC.",
    ),
    Market(
        id="btc-up-24h",
        title="BTC above current price after 24 hours",
        category="crypto",
        underlying="BTC",
        marketType="btc_direction_24h",
        crowdProbability=0.52,
        timeRemainingMs=1000 * 60 * 60 * 23,
        liquidity=56400.0,
        status="open",
        resolutionCriteria="Resolves YES if BTC price 24h from now exceeds spot at market open.",
    ),
    Market(
        id="btc-new-weekly-high",
        title="BTC reaches new weekly high",
        category="crypto",
        underlying="BTC",
        marketType="btc_new_high",
        crowdProbability=0.34,
        timeRemainingMs=1000 * 60 * 60 * 60,
        liquidity=18700.0,
        status="open",
        resolutionCriteria="Resolves YES if BTC trades above prior 7-day high before weekly close.",
    ),
]

# Pre-computed mock matrix — close to what the frontend Markov helper produces
# from the synthetic price series. Kept here so backend and frontend agree
# while no real model service is wired up.
_MOCK_MATRIX = TransitionMatrix(
    UP=TransitionRow(UP=0.52, FLAT=0.18, DOWN=0.30),
    FLAT=TransitionRow(UP=0.33, FLAT=0.41, DOWN=0.26),
    DOWN=TransitionRow(UP=0.29, FLAT=0.22, DOWN=0.49),
)


def _build_mock_signal(market: Market) -> Signal:
    # Mock heuristics — line up with the frontend's Markov computation so the
    # demo experience stays consistent when backend takes over.
    current = "UP"
    predicted = "UP"
    if market.marketType in ("btc_direction_up", "btc_direction_24h"):
        # YES = UP probability + half FLAT
        model_p = _MOCK_MATRIX.UP.UP + _MOCK_MATRIX.UP.FLAT * 0.5
    else:
        model_p = _MOCK_MATRIX.UP.UP

    edge_gap = (model_p - market.crowdProbability) * 100
    sample_size = 143
    confidence = "Medium"
    warnings: List[str] = []
    if abs(model_p - 0.5) < 0.05:
        warnings.append("Model is close to a coin flip. Treat as neutral.")
    if market.timeRemainingMs < 1000 * 60 * 30:
        warnings.append("Market is near expiry. Short-horizon signals can be unstable.")

    return Signal(
        marketId=market.id,
        currentState=current,
        predictedState=predicted,
        modelProbability=model_p,
        crowdProbability=market.crowdProbability,
        edgeGap=edge_gap,
        confidence=confidence,
        sampleSize=sample_size,
        warnings=warnings,
        transitionMatrix=_MOCK_MATRIX,
    )


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/markets", response_model=List[Market])
def list_markets() -> List[Market]:
    return list(_MOCK_MARKETS)


@router.get("/markets/{market_id}/signal", response_model=Signal)
def get_signal(market_id: str) -> Signal:
    market = next((m for m in _MOCK_MARKETS if m.id == market_id), None)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    return _build_mock_signal(market)


@router.post("/markets/{market_id}/forecast")
def submit_forecast(market_id: str, payload: ForecastIn):
    if payload.marketId != market_id:
        raise HTTPException(status_code=400, detail="marketId mismatch")
    # Stub: persistence will land when forecasts table is added.
    return {"ok": True}


@router.get("/markets/{market_id}/comparison", response_model=Comparison)
def get_comparison(market_id: str) -> Comparison:
    market = next((m for m in _MOCK_MARKETS if m.id == market_id), None)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    # Unresolved by default until the real comparison pipeline is wired.
    return Comparison(marketId=market_id, resolved=False)


@router.get("/backtest-summary", response_model=BacktestSummary)
def backtest_summary() -> BacktestSummary:
    return BacktestSummary(
        testedSignals=412,
        hitRate=0.561,
        averageBrier=0.214,
        simulatedPnl=1834.50,
        averageEdgeGap=6.7,
        bestCategory="BTC 1-hour direction",
        warning=(
            "Hit rate alone is not enough. Calibration (Brier) and edge gap "
            "matter more for long-term skill."
        ),
    )
