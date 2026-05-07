import { useEffect, useState } from "react";
import { View, ActivityIndicator, Modal, Text, TouchableOpacity, Image, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, router, useSegments } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { TradingProvider, useTrading } from "@/src/session/TradingContext";
import { LanguageProvider, useLanguage } from "@/src/i18n";
import { hasSeenOnboarding } from "./onboarding";
import { api } from "@/src/api/client";
import { initSentry } from "@/src/observability/sentry";
import { usePushNotifications } from "@/src/utils/usePushNotifications";

// Initialize Sentry at module load — before any component renders. This
// way, a render-phase throw in the very first component (like the TDZ
// login bug from earlier) is still captured.
initSentry();

const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";
const BLUE     = "#4F8EF7";
const PINK     = "#F050AE";
const BG       = "#08090C";
const CARD     = "#0D1117";
const TEXT     = "#F1F5F9";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.25)";

const LANG_OPTIONS = [
  { lang: "pt" as const, flagUri: "https://flagcdn.com/w80/br.png", label: "Português", sub: "Brasil" },
  { lang: "en" as const, flagUri: "https://flagcdn.com/w80/us.png", label: "English",   sub: "United States" },
  { lang: "zh" as const, flagUri: "https://flagcdn.com/w80/cn.png", label: "中文",       sub: "中国大陆" },
];

function LanguageModal() {
  const { hasChosenLanguage, isLanguageHydrated, setLanguage, language } = useLanguage();
  const [selected, setSelected] = useState<"pt" | "en" | "zh">("en");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLanguageHydrated && !hasChosenLanguage) setVisible(true);
  }, [isLanguageHydrated, hasChosenLanguage]);

  const confirm = () => {
    void setLanguage(selected);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ width: "100%", maxWidth: 420, backgroundColor: CARD, borderRadius: 24, padding: 28, borderWidth: 1, borderColor: BORDER_P }}>
          {/* Header */}
          <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", textAlign: "center", marginBottom: 4 }}>scenara</Text>
          <Text style={{ color: TEXT_MID, fontSize: 13, textAlign: "center", marginBottom: 28 }}>
            {"Choose your language · Escolha seu idioma · 选择语言"}
          </Text>

          {/* Options */}
          <View style={{ gap: 12, marginBottom: 24 }}>
            {LANG_OPTIONS.map(opt => {
              const isSel = selected === opt.lang;
              return (
                <TouchableOpacity
                  key={opt.lang}
                  onPress={() => setSelected(opt.lang)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: isSel ? "rgba(124,92,252,0.1)" : "rgba(255,255,255,0.03)", borderRadius: 14, padding: 16, borderWidth: 2, borderColor: isSel ? PURPLE : BORDER }}
                >
                  <Image source={{ uri: opt.flagUri }} style={{ width: 44, height: 30, borderRadius: 5 }} resizeMode="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontSize: 16, fontFamily: "DMSans_700Bold" }}>{opt.label}</Text>
                    <Text style={{ color: TEXT_MID, fontSize: 12, marginTop: 1 }}>{opt.sub}</Text>
                  </View>
                  {isSel && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "white", fontSize: 11, fontFamily: "DMSans_700Bold" }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Confirm */}
          <TouchableOpacity onPress={confirm} style={{ borderRadius: 14, overflow: "hidden" }}>
            <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                {selected === "pt" ? "Continuar →" : selected === "zh" ? "继续 →" : "Continue →"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** Mounts the push notification tap-handler hook inside the router context. */
function PushHandler() {
  usePushNotifications();
  return null;
}

function AuthGuard() {
  const { isAuthenticated, isLoadingAuth } = useTrading();
  const { hasChosenLanguage, isLanguageHydrated } = useLanguage();
  const segments = useSegments();

  // Serialize segments to a string so the effect only re-runs when the
  // actual route changes — not on every render (useSegments() returns a
  // new array reference each time, which would otherwise retrigger this).
  const segmentKey = segments.join("/");

  useEffect(() => {
    if (isLoadingAuth || !isLanguageHydrated) return;

    const onLogin      = segments[0] === "login";
    const onRegister   = segments[0] === "register";
    const onOnboarding = segments[0] === "onboarding";
    const onLanguage   = segments[0] === "language-select";

    // If already on language-select screen (old flow), redirect away
    if (hasChosenLanguage && onLanguage) {
      router.replace(isAuthenticated ? (hasSeenOnboarding() ? "/(tabs)" : "/onboarding") : "/(tabs)");
      return;
    }

    // Authenticated users on login/register → redirect to app
    if (isAuthenticated && (onLogin || onRegister)) {
      router.replace(hasSeenOnboarding() ? "/(tabs)" : "/onboarding");
    } else if (isAuthenticated && onOnboarding && hasSeenOnboarding()) {
      router.replace("/(tabs)");
    }
    // Guests are allowed to stay on (tabs) — no redirect to login
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChosenLanguage, isAuthenticated, isLanguageHydrated, isLoadingAuth, segmentKey]);

  if (isLoadingAuth || !isLanguageHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  // Fire a health ping immediately so the backend wakes up (Render free tier hibernates).
  // Runs unconditionally — we don't wait for fonts before waking the server.
  useEffect(() => {
    api.get("/health", { timeout: 30000 }).catch(() => {});
  }, []);

  // Block the entire navigator until fonts are ready. Since fonts are bundled
  // with the app (not fetched from network), this resolves in < 100 ms and
  // prevents every tab screen from briefly flashing blank on first visit.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: BG }} />;
  }

  return (
    <LanguageProvider>
      <TradingProvider>
        <PushHandler />
        <AuthGuard />
        <LanguageModal />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login"          options={{ animation: "fade" }} />
          <Stack.Screen name="register"       options={{ animation: "fade" }} />
          <Stack.Screen name="language-select" options={{ animation: "fade" }} />
          <Stack.Screen name="onboarding"     options={{ animation: "fade" }} />
          <Stack.Screen name="news-detail"    options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="market-detail"  options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="user-profile"   options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="how-it-works"   options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="terms"          options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="notifications-settings" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="forgot-password"        options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="reset-password"         options={{ animation: "slide_from_right" }} />
        </Stack>
      </TradingProvider>
    </LanguageProvider>
  );
}
