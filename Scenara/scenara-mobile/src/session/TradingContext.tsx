import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

import { useSession } from "./SessionContext";
import {
  getAccountSnapshot,
  setAccountSnapshot,
  subscribeAccount,
} from "../state/portfolioStore";
import { api } from "../api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Prediction {
  id: number;
  user_id: number;
  scenario_id: number;
  scenario_title: string;
  event_id: number;
  event_title: string;
  event_status: string;
  simulated_amount: number;
  entry_probability: number;
  status: string;
  payout_multiplier: number;
  pnl: number | null;
  created_at: string;
  settled_at: string | null;
}

export interface Account {
  id: number;
  user_id: number;
  currency: string;
  balance: number;
  account_type: string;
  is_active: boolean;
}

interface TradingContextType {
  account: Account | null;
  predictions: Prediction[];
  loadingPortfolio: boolean;
  portfolioError: string | null;
  userId: number | null;
  refreshPortfolio: () => Promise<void>;
  placePrediction: (
    scenarioId: number,
    amount: number
  ) => Promise<{ ok: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Dev user ID — matches the id returned from POST /users/dev-create
// ---------------------------------------------------------------------------
const DEV_USER_ID = 2;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useSession();

  // Use session user if available, otherwise fall back to DEV_USER_ID
  const userId: number | null = user?.id ?? DEV_USER_ID;

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const [account, setAccount] = useState<Account | null>(getAccountSnapshot());

  useEffect(() => {
    const unsub = subscribeAccount(() => {
      setAccount(getAccountSnapshot());
    });
    return unsub;
  }, []);

  // ---------------------------------------------------------------------------
  // refreshPortfolio
  // ---------------------------------------------------------------------------

  const refreshPortfolio = useCallback(async () => {
    if (!userId) return;

    setLoadingPortfolio(true);
    setPortfolioError(null);

    try {
      const [accountRes, predictionsRes] = await Promise.all([
        api.get(`/accounts/user/${userId}`),
        api.get(`/predictions/user/${userId}`),
      ]);

      const fetchedAccount: Account = accountRes.data;
      setAccountSnapshot(fetchedAccount);
      setAccount(fetchedAccount);

      setPredictions(predictionsRes.data);
    } catch (err: any) {
      const message =
        err?.message ??
        err?.data?.detail ??
        "Failed to load portfolio";
      setPortfolioError(message);
    } finally {
      setLoadingPortfolio(false);
    }
  }, [userId]);

  // Auto-load on mount
  useEffect(() => {
    if (userId) {
      refreshPortfolio();
    }
  }, [userId, refreshPortfolio]);

  // ---------------------------------------------------------------------------
  // placePrediction
  // ---------------------------------------------------------------------------

  const placePrediction = useCallback(
    async (
      scenarioId: number,
      amount: number
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!userId) return { ok: false, error: "No user loaded" };

      try {
        await api.post("/predictions/", {
          user_id: userId,
          scenario_id: scenarioId,
          simulated_amount: amount,
        });

        await refreshPortfolio();
        return { ok: true };
      } catch (err: any) {
        const error =
          err?.message ??
          err?.data?.detail ??
          "Failed to place prediction";
        return { ok: false, error };
      }
    },
    [userId, refreshPortfolio]
  );

  // ---------------------------------------------------------------------------

  return (
    <TradingContext.Provider
      value={{
        account,
        predictions,
        loadingPortfolio,
        portfolioError,
        userId,
        refreshPortfolio,
        placePrediction,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const ctx = useContext(TradingContext);
  if (!ctx) {
    throw new Error("useTrading must be used within TradingProvider");
  }
  return ctx;
};