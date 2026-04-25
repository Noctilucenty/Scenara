/**
 * Notification Preferences screen — /notifications-settings
 *
 * Renders four toggle rows (settled, followers, closing, weekly_recap).
 * Loads current prefs from GET /notifications/preferences on mount,
 * then PATCHes the single field that changed on each toggle tap.
 *
 * Optimistic UI: the switch flips immediately; the PATCH is fire-and-forget.
 * A brief error banner appears if the server rejects the update so the user
 * knows the preference may not have saved.
 */
import { useEffect, useState, useCallback } from "react";
import {
  SafeAreaView, View, Text, Switch, ScrollView,
  TouchableOpacity, ActivityIndicator, StatusBar, Platform,
} from "react-native";
import { router } from "expo-router";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";

// ── Colours (matching app palette) ───────────────────────────────────────────
const BG       = "#08090C";
const CARD     = "#0D1117";
const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

// ── Types ────────────────────────────────────────────────────────────────────

interface Prefs {
  notify_settled: boolean;
  notify_followers: boolean;
  notify_closing: boolean;
  notify_weekly_recap: boolean;
}

type PrefKey = keyof Prefs;

// ── Component ────────────────────────────────────────────────────────────────

export default function NotificationsSettingsScreen() {
  const { isAuthenticated } = useTrading();
  const { t } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  const [prefs, setPrefs]       = useState<Prefs | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [saveErr, setSaveErr]   = useState<string | null>(null);

  // ── Load prefs ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    api.get<Prefs>("/notifications/preferences")
      .then(res => { setPrefs(res.data); setLoading(false); })
      .catch(() => { setError("Could not load preferences."); setLoading(false); });
  }, [isAuthenticated]);

  // ── Toggle ────────────────────────────────────────────────────────────────

  const toggle = useCallback((key: PrefKey) => {
    if (!prefs) return;
    const next = !prefs[key];
    // Optimistic update
    setPrefs(prev => prev ? { ...prev, [key]: next } : prev);
    setSaveErr(null);

    api.patch("/notifications/preferences", { [key]: next }).catch(() => {
      // Roll back on failure
      setPrefs(prev => prev ? { ...prev, [key]: !next } : prev);
      setSaveErr("Couldn't save — check your connection.");
    });
  }, [prefs]);

  // ── Render helpers ────────────────────────────────────────────────────────

  if (!fontsLoaded) return null;

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: TEXT_MID, fontSize: 15, fontFamily: "DMSans_400Regular", textAlign: "center" }}>
          Sign in to manage notification preferences.
        </Text>
      </View>
    );
  }

  const rows: { key: PrefKey; label: string; desc: string }[] = [
    { key: "notify_settled",      label: t.settings.notifSettled,   desc: t.settings.notifSettledDesc   },
    { key: "notify_followers",    label: t.settings.notifFollowers,  desc: t.settings.notifFollowersDesc },
    { key: "notify_closing",      label: t.settings.notifClosing,    desc: t.settings.notifClosingDesc   },
    { key: "notify_weekly_recap", label: t.settings.notifWeekly,     desc: t.settings.notifWeeklyDesc    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 14 }}>
            <Text style={{ color: PURPLE, fontSize: 22, lineHeight: 28 }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>SCENARA</Text>
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", letterSpacing: -0.4, marginTop: 2 }}>
              {t.settings.notificationsRow}
            </Text>
          </View>
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Save error banner */}
          {saveErr && (
            <View style={{ marginTop: 14, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", borderRadius: 12, padding: 12 }}>
              <Text style={{ color: RED, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{saveErr}</Text>
            </View>
          )}

          {/* Loading */}
          {loading ? (
            <View style={{ flex: 1, paddingTop: 60, alignItems: "center" }}>
              <ActivityIndicator color={PURPLE} />
            </View>
          ) : error ? (
            <View style={{ paddingTop: 60, alignItems: "center" }}>
              <Text style={{ color: RED, fontSize: 14, fontFamily: "DMSans_400Regular" }}>{error}</Text>
            </View>
          ) : (
            <>
              <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 20, marginBottom: 16, lineHeight: 18 }}>
                {"Choose which push notifications you receive. You can change these at any time."}
              </Text>

              <View style={{ gap: 10 }}>
                {rows.map(({ key, label, desc }) => (
                  <View
                    key={key}
                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: prefs?.[key] ? BORDER_P : BORDER }}
                  >
                    {/* Text block */}
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_500Medium" }}>{label}</Text>
                      <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 3, lineHeight: 16 }}>{desc}</Text>
                    </View>

                    {/* Toggle */}
                    <Switch
                      value={prefs?.[key] ?? false}
                      onValueChange={() => toggle(key)}
                      trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(124,92,252,0.45)" }}
                      thumbColor={prefs?.[key] ? PURPLE : TEXT_MID}
                      ios_backgroundColor="rgba(255,255,255,0.08)"
                    />
                  </View>
                ))}
              </View>

              {/* Test notification button (dev convenience) */}
              {__DEV__ && (
                <TouchableOpacity
                  onPress={() => api.post("/notifications/test").catch(() => {})}
                  style={{ marginTop: 32, borderRadius: 12, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.06)", paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>
                    Send test notification ✨
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
