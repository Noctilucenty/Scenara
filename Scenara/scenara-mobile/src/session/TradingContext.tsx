import React, {
  createContext, useContext, useState,
  useCallback, useEffect,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "../api/client";

// Register Expo push token with backend
async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (token) await api.post("/push/register-token", { token });
  } catch {
    // Push notifications optional
  }
}

// ── Token storage (SecureStore on mobile, localStorage on web) ───────────────

const TOKEN_KEY = "scenara_token";
const USER_KEY  = "scenara_user";

async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function deleteToken(): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  balance: number;
}

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
  // Auth
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (email: string, password: string, displayName: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;

  // Portfolio
  account: Account | null;
  predictions: Prediction[];
  loadingPortfolio: boolean;
  portfolioError: string | null;
  userId: number | null;
  refreshPortfolio: () => Promise<void>;
  placePrediction: (scenarioId: number, amount: number) => Promise<{ ok: boolean; error?: string }>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authUser, setAuthUser]         = useState<AuthUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [account, setAccount]           = useState<Account | null>(null);
  const [predictions, setPredictions]   = useState<Prediction[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [portfolioError, setPortfolioError]     = useState<string | null>(null);

  const userId = authUser?.id ?? null;
  const isAuthenticated = !!authUser;

  // ── Set axios auth header ─────────────────────────────────────────────────

  const setAxiosToken = (token: string | null) => {
    if (token) {
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common["Authorization"];
    }
  };

  // ── Load token on app start ───────────────────────────────────────────────

  useEffect(() => {
    const hydrate = async () => {
      try {
        const token = await loadToken();
        if (token) {
          setAxiosToken(token);
          // Verify token is still valid by fetching /auth/me
          const res = await api.get("/auth/me");
          const accountRes = await api.get(`/accounts/user/${res.data.id}`);
          setAuthUser({
            id: res.data.id,
            email: res.data.email,
            display_name: res.data.display_name,
            balance: accountRes.data.balance,
          });
        }
      } catch {
        // Token expired or invalid — clear it
        await deleteToken();
        setAxiosToken(null);
      } finally {
        setIsLoadingAuth(false);
      }
    };
    hydrate();
  }, []);

  // ── Auth actions ──────────────────────────────────────────────────────────

  const login = useCallback(async (
    email: string, password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await api.post("/auth/login", { email, password });
      const { access_token, user_id, display_name, balance } = res.data;
      await saveToken(access_token);
      setAxiosToken(access_token);
      setAuthUser({ id: user_id, email, display_name, balance });
      // Register push token after login
      registerPushToken();
      return { ok: true };
    } catch (e: any) {
      const error = e?.response?.data?.detail ?? "Login failed";
      return { ok: false, error };
    }
  }, []);

  const register = useCallback(async (
    email: string, password: string, displayName: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await api.post("/auth/register", {
        email, password, display_name: displayName,
      });
      const { access_token, user_id, display_name: dn, balance } = res.data;
      await saveToken(access_token);
      setAxiosToken(access_token);
      setAuthUser({ id: user_id, email, display_name: dn, balance });
      // Register push token after register
      registerPushToken();
      return { ok: true };
    } catch (e: any) {
      const error = e?.response?.data?.detail ?? "Registration failed";
      return { ok: false, error };
    }
  }, []);

  const logout = useCallback(async () => {
    await deleteToken();
    setAxiosToken(null);
    setAuthUser(null);
    setAccount(null);
    setPredictions([]);
  }, []);

  // ── Portfolio ─────────────────────────────────────────────────────────────

  const refreshPortfolio = useCallback(async () => {
    if (!userId) return;
    setLoadingPortfolio(true);
    setPortfolioError(null);
    try {
      const [accountRes, predictionsRes] = await Promise.all([
        api.get(`/accounts/user/${userId}`),
        api.get(`/predictions/user/${userId}`),
      ]);
      setAccount(accountRes.data);
      setPredictions(predictionsRes.data);
      // Keep authUser balance in sync
      setAuthUser(prev => prev ? { ...prev, balance: accountRes.data.balance } : prev);
    } catch (err: any) {
      setPortfolioError(err?.message ?? "Failed to load portfolio");
    } finally {
      setLoadingPortfolio(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) refreshPortfolio();
  }, [userId]);

  const placePrediction = useCallback(async (
    scenarioId: number, amount: number
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!userId) return { ok: false, error: "Not logged in" };
    try {
      await api.post("/predictions/", {
        user_id: userId, scenario_id: scenarioId, simulated_amount: amount,
      });
      await refreshPortfolio();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.detail ?? "Failed to place prediction" };
    }
  }, [userId, refreshPortfolio]);

  return (
    <TradingContext.Provider value={{
      authUser, isAuthenticated, isLoadingAuth,
      login, register, logout,
      account, predictions, loadingPortfolio,
      portfolioError, userId,
      refreshPortfolio, placePrediction,
    }}>
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTrading must be used within TradingProvider");
  return ctx;
};