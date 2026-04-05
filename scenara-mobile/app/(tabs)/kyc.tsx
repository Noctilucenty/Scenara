import { SafeAreaView, Text, Button, View, ScrollView } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/lib/api";
import { useSession } from "@/src/session/SessionContext";

type KycApiResponse = {
  applicant_id: string | null;
  status: string;
  review_result: any | null;
};

export default function KycScreen() {
  const {
    user,
    account,
    kycState,
    brokerage,
    fundingWarning,
    setFromBackendSnapshot,
  } = useSession();

  const [status, setStatus] = useState<string>("Idle");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<any>(null);

  const kycLabel = useMemo(() => {
    const s = (kycState ?? "not_started").toLowerCase();
    if (s === "not_started") return "Not started";
    if (s === "pending") return "Pending review";
    if (s === "created") return "Pending review";
    if (s === "already_exists") return "Already started (idempotent)";
    if (s === "approved") return "Approved";
    if (s === "rejected") return "Rejected";
    if (s === "failed") return "Error";
    return s;
  }, [kycState]);

  const startDisabled = useMemo(() => {
    const s = (kycState ?? "not_started").toLowerCase();
    return s === "pending" || s === "already_exists" || s === "approved";
  }, [kycState]);

  const ensureSession = (): { ok: boolean; message?: string } => {
    if (!user?.id) return { ok: false, message: "No user session found. Run /mvp/test-flow on Home first." };
    if (!user?.email) return { ok: false, message: "Session user has no email. Run /mvp/test-flow on Home again." };
    return { ok: true };
  };

  const mergeKycIntoSnapshot = (kyc: KycApiResponse) => {
    const merged = {
      user,
      account,
      kyc: {
        applicant_id: kyc.applicant_id ?? null,
        status: kyc.status ?? "failed",
        review_result: kyc.review_result ?? null,
      },
      payments: fundingWarning ? { warning: fundingWarning } : undefined,
      brokerage,
    };
    setFromBackendSnapshot(merged);
  };

  const startKyc = async () => {
    setError("");
    setResult(null);

    const sessionCheck = ensureSession();
    if (!sessionCheck.ok) {
      setStatus("No session");
      setError(sessionCheck.message || "Missing session");
      return;
    }

    // If already started, don’t spam Sumsub.
    if (startDisabled) {
      setStatus("Already started");
      setError("");
      // Still refresh status, so UI feels responsive.
      await refreshKycStatus();
      return;
    }

    try {
      setStatus("Starting KYC...");

      const payload = {
        user_id: user!.id,
        email: user!.email,
        first_name: "MVP",
        last_name: "User",
        country: "BR",
      };

      const res = await api.post<KycApiResponse>("/kyc/applicant", payload);

      mergeKycIntoSnapshot(res.data);
      setResult(res.data);
      setStatus("Success");
    } catch (e: any) {
      setStatus("Error");
      setError("Unexpected error starting KYC");
      setResult(e?.response?.data ?? null);
    }
  };

  const refreshKycStatus = async () => {
    setError("");
    setResult(null);

    const sessionCheck = ensureSession();
    if (!sessionCheck.ok) {
      setStatus("No session");
      setError(sessionCheck.message || "Missing session");
      return;
    }

    try {
      setStatus("Refreshing KYC status...");

      const res = await api.get<KycApiResponse>(
        `/kyc/status?user_id=${encodeURIComponent(user!.id)}`
      );

      mergeKycIntoSnapshot(res.data);
      setResult(res.data);
      setStatus("Success");
    } catch (e: any) {
      setStatus("Error");
      setError("Unexpected error fetching KYC status");
      setResult(e?.response?.data ?? null);
    }
  };

  // Auto-refresh when opening KYC tab (makes the app feel “live”)
  useEffect(() => {
    // Only run if session exists
    if (user?.id) {
      refreshKycStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <LinearGradient colors={["#050A1A", "#1B2B5C"]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: "white", fontSize: 22, fontWeight: "600" }}>
          Orryin — KYC
        </Text>

        <Text style={{ color: "#9CA3AF", marginTop: 4 }}>
          Status: {status}
        </Text>

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: "#9CA3AF" }}>
            Session user:{" "}
            {user?.id ? `${user.id} (${user.email ?? "no-email"})` : "None"}
          </Text>
          <Text style={{ color: "#9CA3AF" }}>
            Session account:{" "}
            {account?.id ? `${account.id} (${account.currency ?? "?"})` : "None"}
          </Text>

          <Text style={{ color: "white", marginTop: 8, fontWeight: "600" }}>
            KYC: {kycLabel}
          </Text>

          {startDisabled ? (
            <Text style={{ color: "#9CA3AF", marginTop: 4 }}>
              KYC is already started. Use “Refresh” to check for updates.
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: 16 }}>
          <Button title="Start KYC" onPress={startKyc} disabled={startDisabled} />
          <View style={{ height: 8 }} />
          <Button title="Refresh KYC Status" onPress={refreshKycStatus} />
        </View>

        {error ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: "#F87171" }}>{error}</Text>
          </View>
        ) : null}

        <ScrollView style={{ marginTop: 12, flex: 1 }}>
          <Text selectable style={{ color: "white" }}>
            {result ? JSON.stringify(result, null, 2) : "No result yet."}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
