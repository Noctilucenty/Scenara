import React, { createContext, useContext, useEffect, useState } from "react";

export type KycState =
  | "not_started"
  | "pending"
  | "approved"
  | "already_exists"
  | "failed";

interface SessionState {
  isReady: boolean;
  user: any | null;
  account: any | null;
  kycState: KycState;
  fundingWarning: string | null;
  brokerage: any | null;
}

interface SessionContextType extends SessionState {
  setFromBackendSnapshot: (snapshot: any) => void;
  resetSession: () => void;
}

const initialState: SessionState = {
  isReady: false,
  user: null,
  account: null,
  kycState: "not_started",
  fundingWarning: null,
  brokerage: null,
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<SessionState>(initialState);

  // Mark session as ready immediately (no blocking)
  useEffect(() => {
    setState((prev) => ({ ...prev, isReady: true }));
  }, []);

  const normalizeKyc = (raw: any): KycState => {
    if (!raw) return "not_started";
    if (raw.status === "approved") return "approved";
    if (raw.status === "already_exists") return "already_exists";
    if (raw.status === "created" || raw.status === "pending") return "pending";
    return "failed";
  };

  const setFromBackendSnapshot = (snapshot: any) => {
    setState({
      isReady: true,
      user: snapshot.user ?? null,
      account: snapshot.account ?? null,
      kycState: normalizeKyc(snapshot.kyc),
      fundingWarning:
        snapshot.payments?.warning ?? snapshot.payments?.error ?? null,
      brokerage: snapshot.brokerage ?? null,
    });
  };

  const resetSession = () => {
    setState({
      ...initialState,
      isReady: true,
    });
  };

  return (
    <SessionContext.Provider
      value={{
        ...state,
        setFromBackendSnapshot,
        resetSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
};
