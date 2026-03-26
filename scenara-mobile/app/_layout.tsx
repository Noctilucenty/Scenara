import { useEffect } from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { TradingProvider, useTrading } from "@/src/session/TradingContext";
import { LanguageProvider } from "@/src/i18n";

const PURPLE = "#7C5CFC";
const BG     = "#08090C";

function hasSeenOnboarding(): boolean {
  try {
    if (Platform.OS === "web") return localStorage.getItem("scenara_onboarded") === "1";
    return false;
  } catch { return false; }
}

function AuthGuard() {
  const { isAuthenticated, isLoadingAuth } = useTrading();
  const segments = useSegments();

  useEffect(() => {
    if (isLoadingAuth) return;

    const inAuthGroup  = segments[0] === "(tabs)";
    const onLogin      = segments[0] === "login";
    const onRegister   = segments[0] === "register";
    const onOnboarding = segments[0] === "onboarding";

    if (!isAuthenticated && inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && (onLogin || onRegister)) {
      // Show onboarding on first login
      if (!hasSeenOnboarding()) {
        router.replace("/onboarding");
      } else {
        router.replace("/(tabs)");
      }
    } else if (isAuthenticated && onOnboarding && hasSeenOnboarding()) {
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

export default function RootLayout() {
  return (
    <LanguageProvider>
      <TradingProvider>
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login"       options={{ animation: "fade" }} />
          <Stack.Screen name="register"    options={{ animation: "fade" }} />
          <Stack.Screen name="onboarding"  options={{ animation: "fade" }} />
        </Stack>
      </TradingProvider>
    </LanguageProvider>
  );
}