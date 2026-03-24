import React, { useState } from "react";
import { View, Text, Button, ScrollView, StyleSheet } from "react-native";
import { api } from "../api/client";
import { useSession } from "../session/SessionContext";

export default function TestBackend() {
  const {
    user,
    account,
    kycState,
    fundingWarning,
    brokerage,
    setFromBackendSnapshot,
    resetSession,
  } = useSession();

  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    const res = await api.post("/mvp/test-flow", {});
    setFromBackendSnapshot(res.data);
    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button title="Run Backend System Test" onPress={runTest} />
      <Button title="Reset Session" onPress={resetSession} color="gray" />

      {loading && <Text style={styles.info}>Running test...</Text>}

      <View style={styles.card}>
        <Text style={styles.title}>User</Text>
        <Text>{user ? JSON.stringify(user, null, 2) : "None"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Account</Text>
        <Text>{account ? JSON.stringify(account, null, 2) : "None"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>KYC Status</Text>
        <Text>{kycState}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Brokerage</Text>
        <Text>{brokerage ? JSON.stringify(brokerage, null, 2) : "None"}</Text>
      </View>

      {fundingWarning && (
        <View style={[styles.card, styles.warning]}>
          <Text style={styles.title}>Funding Warning</Text>
          <Text>{fundingWarning}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  card: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f2f2f2",
  },
  warning: {
    backgroundColor: "#fff3cd",
  },
  title: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  info: {
    marginVertical: 8,
  },
});
