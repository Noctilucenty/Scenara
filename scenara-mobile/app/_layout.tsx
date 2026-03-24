import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { TradingProvider, useTrading } from "@/src/session/TradingContext";

const PURPLE = "#7C5CFC";
const BG     = "#08090C";

// ── Auth guard — redirects based on auth state ────────────────────────────────
function AuthGuard() {
  const { isAuthenticated, isLoadingAuth } = useTrading();
  const segments = useSegments();

  useEffect(() => {
    if (isLoadingAuth) return;

    const inAuthGroup = segments[0] === "(tabs)";
    const onLogin     = segments[0] === "login";
    const onRegister  = segments[0] === "register";

    if (!isAuthenticated && inAuthGroup) {
      // Not logged in but trying to access tabs → send to login
      router.replace("/login");
    } else if (isAuthenticated && (onLogin || onRegister)) {
      // Logged in but on auth screens → send to app
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoadingAuth, segments]);

  if (isLoadingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  return null;
}

// ── Root layout ───────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <TradingProvider>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login"    options={{ animation: "fade" }} />
        <Stack.Screen name="register" options={{ animation: "fade" }} />
      </Stack>
    </TradingProvider>
  );
}