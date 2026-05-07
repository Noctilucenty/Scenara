import React, {
  createContext, useContext, useState,
  useCallback, useEffect, useRef,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "../api/client";
import { API_BASE_URL } from "../config/api";
import { setSentryUser } from "../observability/sentry";
import { resetAccountSnapshot } from "../state/portfolioStore";

// Register push token with backend — native (Expo) + web (W3C PushManager).
async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Web push: import util lazily so the SW/PushManager APIs are only
      // accessed in a browser context, never during SSR.
      const { registerForWebPushAsync, sendPushTokenToServer } =
        await import("../utils/usePushNotifications");
      const sub = await registerForWebPushAsync();
      if (sub) await sendPushTokenToServer(sub, "web");
      return;
    }
    // Native: get Expo push token and register it.
    const { registerForPushNotificationsAsync, sendPushTokenToServer } =
      await import("../utils/usePushNotifications");
    const token = await registerForPushNotificationsAsync();
    if (token) await sendPushTokenToServer(token, "expo");
  } catch {
    // Push notifications are optional — never crash the auth flow.
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
  event_closes_at: string | null;
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

  // Prevents overlapping in-flight refreshes — e.g. TradingContext's own
  // useEffect (fires on userId change) and the portfolio screen's useFocusEffect
  // both call refreshPortfolio on first mount.  Without this, two parallel
  // requests race to set the same state.
  const isRefreshingRef = useRef(false);

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
        if (!token) return;

        setAxiosToken(token);

        // Use a tighter timeout for the hydration path — the root layout
        // already fires a health ping to wake Render.com, so 20 s is enough.
        // If the server is still cold the request will fail with isTimeout=true
        // and we'll keep the token rather than logging the user out.
        const res = await api.get("/auth/me", { timeout: 20_000 });

        // Fetch balance separately; if this fails (e.g. temporary network
        // hiccup) we still log the user in — balance syncs on next portfolio
        // refresh rather than blocking auth entirely.
        let balance = 0;
        try {
          const accountRes = await api.get(
            `/accounts/user/${res.data.id}`,
            { timeout: 20_000 },
          );
          balance = accountRes.data.balance;
        } catch {
          // Balance fetch failed — non-fatal; portfolio refresh will recover it.
        }

        setAuthUser({
          id: res.data.id,
          email: res.data.email,
          display_name: res.data.display_name,
          balance,
        });
      } catch (e: any) {
        // Only wipe the stored token when the server explicitly rejects it
        // (401 Unauthorized / 403 Forbidden). Network timeouts, CORS errors,
        // 500s, or anything without an HTTP status code are transient — keep
        // the token so the user isn't logged out just because the server was
        // cold on page refresh.
        const status: number | undefined = e?.status;
        if (status === 401 || status === 403) {
          await deleteToken();
          setAxiosToken(null);
        }
        // For any other error we leave isAuthenticated=false (authUser stays
        // null) but the token is preserved — a hard reload will retry.
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
      // The axios interceptor in client.ts reshapes errors to { status, data, message }
      // so e?.response is undefined; read from e?.data instead.
      const detail = e?.data?.detail ?? e?.data?.message ?? e?.data?.error;
      const error = detail ?? e?.message ?? "Login failed";
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
      // The axios interceptor in client.ts reshapes errors to { status, data, message }
      // so e?.response is undefined; read from e?.data instead.
      const detail = e?.data?.detail ?? e?.data?.message ?? e?.data?.error;
      const error = detail ?? e?.message ?? "Registration failed";
      return { ok: false, error };
    }
  }, []);

  const logout = useCallback(async () => {
    await deleteToken();
    setAxiosToken(null);
    setAuthUser(null);
    setAccount(null);
    setPredictions([]);
    // Clear the module-level portfolio snapshot so a subsequent login
    // never briefly shows the previous user's balance.
    resetAccountSnapshot();
  }, []);

  // ── Portfolio ─────────────────────────────────────────────────────────────

  const refreshPortfolio = useCallback(async () => {
    if (!userId) return;
    // Deduplicate concurrent calls — e.g. TradingContext's userId-change effect
    // and the portfolio screen's useFocusEffect both fire on first mount.
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setLoadingPortfolio(true);
    setPortfolioError(null);
    try {
      // allSettled lets each request succeed/fail independently.
      // If predictions is slow, the account balance still updates (and vice-versa).
      const [accountRes, predictionsRes] = await Promise.allSettled([
        api.get(`/accounts/user/${userId}`),
        api.get(`/predictions/user/${userId}`),
      ]);
      if (accountRes.status === "fulfilled") {
        setAccount(accountRes.value.data);
        // Keep authUser balance in sync with the latest account data.
        setAuthUser(prev => prev ? { ...prev, balance: accountRes.value.data.balance } : prev);
      }
      if (predictionsRes.status === "fulfilled") {
        setPredictions(predictionsRes.value.data);
      }
      // Only surface an error when BOTH requests failed — a partial success
      // is still useful data and shouldn't block the portfolio view.
      if (accountRes.status === "rejected" && predictionsRes.status === "rejected") {
        setPortfolioError("Failed to load portfolio");
      }
    } finally {
      isRefreshingRef.current = false;
      setLoadingPortfolio(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) refreshPortfolio();
  }, [userId]);

  // Sync Sentry user scope with auth state. One effect covers hydrate,
  // login, register, and logout — any path that changes authUser.
  useEffect(() => {
    setSentryUser(authUser?.id ?? null, authUser?.email ?? null);
  }, [authUser?.id, authUser?.email]);

  const placePrediction = useCallback(async (
    scenarioId: number, amount: number
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!userId) return { ok: false, error: "Not logged in" };
    try {
      // Render free-tier cold-starts take 50-60s. The buy POST triggers a CORS
      // preflight (because of the Authorization header), and browsers time out
      // preflights faster than axios does — so the first buy after a long idle
      // fails with "Network error" before axios even gets a chance to retry.
      //
      // Fix: fire a bare fetch() GET to /health first. A simple GET with no
      // custom headers is a CORS "simple request" — no preflight needed — so
      // it reaches the server even while it's still spinning up. Once it
      // returns (backend is alive), the authenticated POST below succeeds.
      await Promise.race([
        fetch(`${API_BASE_URL}/health`).catch(() => {}),
        new Promise<void>(resolve => setTimeout(resolve, 58000)),
      ]);

      await api.post("/predictions/", {
        user_id: userId, scenario_id: scenarioId, simulated_amount: amount,
      });
      // Refresh in background — don't let a portfolio sync failure mask a
      // successful bet and cause the user to retry (double-bet).
      refreshPortfolio().catch(() => {});
      return { ok: true };
    } catch (err: any) {
      // axios interceptor reshapes errors: response data is at err.data (not err.response.data)
      return { ok: false, error: err?.data?.detail ?? err?.message ?? "Failed to place prediction" };
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
