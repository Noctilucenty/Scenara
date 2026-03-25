import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { TradingProvider, useTrading } from "@/src/session/TradingContext";
import { LanguageProvider } from "@/src/i18n";

const PURPLE = "#7C5CFC";
const BG     = "#08090C";

function AuthGuard() {
  const { isAuthenticated, isLoadingAuth } = useTrading();
  const segments = useSegments();

  useEffect(() => {
    if (isLoadingAuth) return;

    const inAuthGroup  = segments[0] === "(tabs)";
    const onLogin      = segments[0] === "login";
    const onRegister   = segments[0] === "register";

    if (!isAuthenticated && inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && (onLogin || onRegister)) {
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
          <Stack.Screen name="login"    options={{ animation: "fade" }} />
          <Stack.Screen name="register" options={{ animation: "fade" }} />
        </Stack>
      </TradingProvider>
    </LanguageProvider>
  );
}