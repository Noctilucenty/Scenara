import { useState } from "react";
import {
  SafeAreaView, Text, View, ScrollView,
  TouchableOpacity, StatusBar, Alert, Switch, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { useTrading } from "@/src/session/TradingContext";
import { useLanguage, Language } from "@/src/i18n";

const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const BLUE     = "#4F8EF7";
const PURPLE   = "#7C5CFC";
const PINK     = "#F050AE";
const PURPLE_D = "#4A3699";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const RED      = "#EF4444";

export default function SettingsScreen() {
  const { authUser, logout } = useTrading();
  const { t, language, setLanguage } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  if (!fontsLoaded) return null;

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (window.confirm(t.settings.logoutConfirm)) {
        logout().then(() => router.replace("/login"));
      }
    } else {
      Alert.alert(
        t.settings.logout,
        t.settings.logoutConfirm,
        [
          { text: t.settings.logoutCancel, style: "cancel" },
          { text: t.settings.logout, style: "destructive", onPress: () => logout().then(() => router.replace("/login")) },
        ]
      );
    }
  };

  const SectionLabel = ({ title }: { title: string }) => (
    <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 8, marginTop: 20 }}>
      {title}
    </Text>
  );

  const RowItem = ({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: CARD, borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: danger ? "rgba(239,68,68,0.2)" : BORDER }}
    >
      <Text style={{ color: danger ? RED : TEXT, fontSize: 15, fontFamily: "DMSans_500Medium" }}>{label}</Text>
      {value && <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{value}</Text>}
      {onPress && !value && <Text style={{ color: TEXT_MID, fontSize: 16 }}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>SCENARA</Text>
          <Text style={{ color: TEXT, fontSize: 26, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, marginTop: 4 }}>{t.settings.title}</Text>
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Account info */}
          <SectionLabel title={t.settings.account} />
          <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, marginBottom: 8, borderWidth: 1, borderColor: BORDER_P }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              {/* Avatar circle with gradient */}
              <View style={{ width: 52, height: 52, borderRadius: 26, overflow: "hidden" }}>
                <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontSize: 20, fontFamily: "DMSans_700Bold" }}>
                    {authUser?.display_name?.charAt(0).toUpperCase() ?? "?"}
                  </Text>
                </LinearGradient>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontSize: 17, fontFamily: "DMSans_700Bold" }}>{authUser?.display_name ?? "—"}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 2 }}>{authUser?.email ?? "—"}</Text>
              </View>
            </View>
          </View>

          {/* Language */}
          <SectionLabel title={t.settings.language} />
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
            {(["en", "pt"] as Language[]).map(lang => {
              const active = language === lang;
              const label = lang === "en" ? `🇺🇸  ${t.settings.english}` : `🇧🇷  ${t.settings.portuguese}`;
              return (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setLanguage(lang)}
                  style={{ flex: 1, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: active ? PURPLE : BORDER }}
                >
                  {active ? (
                    <LinearGradient colors={[BLUE, PURPLE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
                      <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>{label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={{ backgroundColor: CARD, paddingVertical: 14, alignItems: "center" }}>
                      <Text style={{ color: TEXT_SUB, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* App version */}
          <SectionLabel title={t.settings.appVersion} />
          <RowItem label={t.settings.version} />

          {/* Logout */}
          <View style={{ marginTop: 20 }}>
            <TouchableOpacity onPress={handleLogout} style={{ borderRadius: 14, overflow: "hidden" }}>
              <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 14, paddingVertical: 16, alignItems: "center" }}>
                <Text style={{ color: RED, fontFamily: "DMSans_700Bold", fontSize: 15 }}>{t.settings.logout}</Text>
              </View>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}