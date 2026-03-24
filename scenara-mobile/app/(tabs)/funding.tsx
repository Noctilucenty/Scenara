import { SafeAreaView, Text, View, Button, ScrollView } from "react-native";
import { useMemo, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/api/client";
import { API_BASE_URL } from "@/src/config/api";
import { useSession } from "@/src/session/SessionContext";

type FxRateResponse = {
  source: string;
  target: string;
  rate: string | number;
  source_amount: string | number;
  target_amount: string | number;
};

type SandboxTransferResponse = {
  user_id: number;
  account_id: number;
  source_currency: string;
  target_currency: string;
  source_amount: string | number;
  estimated_target_amount: string | number;
  fx_rate: string | number;
  wise_quote_snapshot?: any;
  error?: string | null;
};

function fmtNumber(x: any, decimals = 2): string {
  const n = typeof x === "string" ? Number(x) : x;
  if (typeof n !== "number" || Number.isNaN(n)) return String(x);
  return n.toFixed(decimals);
}

export default function FundingScreen() {
  const { user, account, hydrated } = useSession();

  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState("");
  const [rate, setRate] = useState<FxRateResponse | null>(null);
  const [transfer, setTransfer] = useState<SandboxTransferResponse | null>(null);

  const hasSession = useMemo(() => !!user?.id && !!account?.id, [user, account]);

  const getRate = async () => {
    setStatus("Fetching FX rate...");
    setError("");
    setRate(null);

    try {
      const res = await api.get<FxRateResponse>("/payments/fx-rate", {
        params: { source: "BRL", target: "USD", amount: 100 },
      });
      setRate(res.data);
      setStatus("Rate OK");
    } catch (e: any) {
      setStatus("Failed");
      setError(
        e?.response?.data
          ? JSON.stringify(e.response.data, null, 2)
          : e?.message || "Unknown error"
      );
    }
  };

  const sandboxTransfer = async () => {
    setStatus("Creating sandbox transfer...");
    setError("");
    setTransfer(null);

    if (!hasSession) {
      setStatus("Failed");
      setError("No user/account in session. Go Home and run /mvp/test-flow first.");
      return;
    }

    try {
      const res = await api.post<SandboxTransferResponse>("/payments/transfer/sandbox", {
        user_id: user!.id,
        account_id: account!.id,
        source_currency: "BRL",
        target_currency: "USD",
        source_amount: 100,
      });

      setTransfer(res.data);
      setStatus("Transfer OK");
    } catch (e: any) {
      setStatus("Failed");
      setError(
        e?.response?.data
          ? JSON.stringify(e.response.data, null, 2)
          : e?.message || "Unknown error"
      );
    }
  };

  return (
    <LinearGradient colors={["#0b1020", "#1a2a4a", "#6b7bd6"]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "700", marginBottom: 10 }}>
          Orryin — Funding
        </Text>

        <View
          style={{
            marginBottom: 12,
            backgroundColor: "rgba(255,255,255,0.08)",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "white" }}>API: {API_BASE_URL}</Text>
          <Text style={{ color: "white" }}>Status: {status}</Text>

          {!hydrated ? (
            <Text style={{ color: "#9CA3AF", marginTop: 6 }}>
              Loading session…
            </Text>
          ) : null}

          <Text style={{ color: "white", marginTop: 8, fontWeight: "700" }}>
            Current Session
          </Text>
          <Text style={{ color: "white" }}>
            User: {user ? `${user.id} (${user.email})` : "—"}
          </Text>
          <Text style={{ color: "white" }}>
            Account: {account ? `${account.id} (${account.currency})` : "—"}
          </Text>

          <View style={{ marginTop: 10 }}>
            <Text style={{ color: "#FACC15", fontWeight: "700" }}>
              Sandbox Mode
            </Text>
            <Text style={{ color: "#9CA3AF", marginTop: 4 }}>
              This Funding tab uses Wise sandbox endpoints and simulates a deposit transfer.
            </Text>
          </View>
        </View>

        <Button title="Get FX Rate (BRL → USD, 100)" onPress={getRate} />
        <View style={{ height: 10 }} />
        <Button
          title="Sandbox Transfer (simulate deposit)"
          onPress={sandboxTransfer}
          disabled={!hasSession}
        />

        {!hasSession ? (
          <Text style={{ color: "#9CA3AF", marginTop: 10 }}>
            Run /mvp/test-flow on Home first to create a session user + account.
          </Text>
        ) : null}

        {error ? (
          <View
            style={{
              marginTop: 12,
              padding: 10,
              borderWidth: 1,
              borderColor: "red",
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text selectable style={{ color: "#ff6b6b" }}>
              {error}
            </Text>
          </View>
        ) : null}

        <ScrollView style={{ marginTop: 12, flex: 1 }}>
          {rate ? (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ color: "white", fontWeight: "700", marginBottom: 6 }}>
                FX Rate Summary
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                {rate.source} → {rate.target}
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                Rate: {fmtNumber(rate.rate, 6)}
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                Source amount: {fmtNumber(rate.source_amount)} {rate.source}
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                Target amount: {fmtNumber(rate.target_amount)} {rate.target}
              </Text>

              <Text selectable style={{ color: "white", marginTop: 10 }}>
                Raw:
                {"\n"}
                {JSON.stringify(rate, null, 2)}
              </Text>
            </View>
          ) : null}

          {transfer ? (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ color: "white", fontWeight: "700", marginBottom: 6 }}>
                Sandbox Transfer Summary
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                {transfer.source_currency} → {transfer.target_currency}
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                Source amount: {fmtNumber(transfer.source_amount)} {transfer.source_currency}
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                Estimated target: {fmtNumber(transfer.estimated_target_amount)}{" "}
                {transfer.target_currency}
              </Text>
              <Text style={{ color: "#9CA3AF" }}>
                FX rate: {fmtNumber(transfer.fx_rate, 6)}
              </Text>

              {transfer.error ? (
                <Text style={{ color: "#FACC15", marginTop: 8 }}>
                  Note: {transfer.error}
                </Text>
              ) : null}

              <Text selectable style={{ color: "white", marginTop: 10 }}>
                Raw:
                {"\n"}
                {JSON.stringify(transfer, null, 2)}
              </Text>
            </View>
          ) : null}

          {!rate && !transfer ? (
            <Text style={{ color: "white" }}>No result yet.</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
