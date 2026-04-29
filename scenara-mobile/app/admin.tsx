import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useLanguage } from "@/src/i18n";

const BG      = "#08090C";
const CARD    = "#0D1117";
const SURFACE = "#111620";
const BLUE    = "#4F8EF7";
const PURPLE  = "#7C5CFC";
const PURPLE_D = "#4A3699";
const TEXT    = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER  = "rgba(255,255,255,0.08)";
const GREEN   = "#22C55E";
const RED     = "#EF4444";
const YELLOW  = "#F59E0B";
const SCENARIO_COLORS = [GREEN, RED, PURPLE, BLUE, YELLOW];

type Scenario = { id: number; title: string; title_pt: string | null; title_zh: string | null; probability: number; sort_order: number };
type PendingEvent = {
  id: number; title: string; title_pt: string | null; title_zh: string | null;
  category: string; closes_at: string | null; status: string; is_featured: boolean;
  scenarios: Scenario[];
};

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    brazil: "#22C55E", politics: "#F59E0B", sports: "#4F8EF7",
    entertainment: "#F050AE", science: "#7C5CFC", global: "#06B6D4",
    economy: "#F59E0B", tech: "#818CF8", music: "#EC4899",
    tv: "#10B981", weather: "#60A5FA",
  };
  return map[cat] ?? TEXT_MID;
}

function timeLeft(closes_at: string | null) {
  if (!closes_at) return "No deadline";
  const diff = new Date(closes_at).getTime() - Date.now();
  if (diff < 0) return "EXPIRED";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d left`;
  if (h > 0) return `${h}h left`;
  return `${Math.floor(diff / 60000)}m left`;
}

// ── Analytics types ───────────────────────────────────────────────────────────

type Overview = {
  users:       { total: number; new_today: number; new_this_week: number; dau_today: number; dau_yesterday: number };
  predictions: { total: number; today: number; total_volume: number; volume_today: number };
  comments:    { total: number; today: number };
  markets:     { open: number; resolved: number };
};
type DailyRow = { date: string; signups: number; dau: number; predictions: number; volume: number; comments: number };
type TopMarket = { event_id: number; title: string; category: string; status: string; prediction_count: number; total_volume: number };
type TopUser   = { user_id: number; display_name: string; email: string; xp: number; current_streak: number; prediction_count: number; total_volume: number; last_login: string | null };

// ── Analytics sub-screen ──────────────────────────────────────────────────────

function AnalyticsTab() {
  const { width: winW } = useWindowDimensions();
  const [range,       setRange]       = useState<7 | 30>(30);
  const [overview,    setOverview]    = useState<Overview | null>(null);
  const [daily,       setDaily]       = useState<DailyRow[]>([]);
  const [topMarkets,  setTopMarkets]  = useState<TopMarket[]>([]);
  const [topUsers,    setTopUsers]    = useState<TopUser[]>([]);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async (days: number) => {
    let mounted = true;
    setLoading(true);
    // Use allSettled so one failing endpoint doesn't block the rest.
    const [ovRes, dailyRes, mktRes, userRes] = await Promise.allSettled([
      api.get("/admin/stats/overview"),
      api.get(`/admin/stats/daily?days=${days}`),
      api.get(`/admin/stats/top-markets?days=${days}&limit=8`),
      api.get("/admin/stats/top-users?limit=8"),
    ]);
    if (!mounted) return;
    // Auth error on any sub-request → navigate back
    for (const r of [ovRes, dailyRes, mktRes, userRes]) {
      if (r.status === "rejected" && r.reason?.status === 403) { router.back(); return; }
    }
    if (ovRes.status === "fulfilled")    setOverview(ovRes.value.data);
    if (dailyRes.status === "fulfilled") setDaily(dailyRes.value.data ?? []);
    if (mktRes.status === "fulfilled")   setTopMarkets(mktRes.value.data ?? []);
    if (userRes.status === "fulfilled")  setTopUsers(userRes.value.data ?? []);
    setLoading(false);
    return () => { mounted = false; };
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  // Derived values for bar charts
  const maxDau      = Math.max(...daily.map(d => d.dau),         1);
  const maxSignups  = Math.max(...daily.map(d => d.signups),     1);
  const maxPreds    = Math.max(...daily.map(d => d.predictions), 1);
  const maxMktVol   = Math.max(...topMarkets.map(m => m.prediction_count), 1);
  const maxUserXP   = Math.max(...topUsers.map(u => u.xp), 1);

  const isWide = winW >= 700;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>

      {/* ── Date range toggle ─────────────────────────────────────────── */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 20, marginTop: 4 }}>
        {([7, 30] as const).map(d => (
          <TouchableOpacity
            key={d}
            onPress={() => setRange(d)}
            style={{
              paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10,
              backgroundColor: range === d ? PURPLE : CARD,
              borderWidth: 1, borderColor: range === d ? PURPLE : BORDER,
            }}
          >
            <Text style={{ color: range === d ? "white" : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 12 }}>
              Last {d}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Overview cards ─────────────────────────────────────────────── */}
      {overview && (
        <>
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 10 }}>
            PLATFORM OVERVIEW
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
            {[
              { label: "Total Users",      value: overview.users.total.toLocaleString(),              color: PURPLE, sub: `+${overview.users.new_today} today` },
              { label: "DAU Today",        value: overview.users.dau_today.toLocaleString(),          color: BLUE,   sub: `${overview.users.dau_yesterday} yesterday` },
              { label: "New This Week",    value: overview.users.new_this_week.toLocaleString(),      color: GREEN,  sub: `+${overview.users.new_today} today` },
              { label: "Total Bets",       value: overview.predictions.total.toLocaleString(),        color: YELLOW, sub: `${overview.predictions.today} today` },
              { label: "Total Volume",     value: `$${overview.predictions.total_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: GREEN, sub: `$${overview.predictions.volume_today.toFixed(0)} today` },
              { label: "Open Markets",     value: overview.markets.open.toLocaleString(),             color: BLUE,   sub: `${overview.markets.resolved} resolved` },
              { label: "Total Comments",   value: overview.comments.total.toLocaleString(),           color: PURPLE, sub: `${overview.comments.today} today` },
            ].map(stat => (
              <View key={stat.label} style={{ width: isWide ? "30%" : "47%", backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
                <Text style={{ color: stat.color, fontSize: 22, fontFamily: "DMSans_700Bold" }}>{stat.value}</Text>
                <Text style={{ color: TEXT, fontSize: 11, fontFamily: "DMSans_500Medium", marginTop: 2 }}>{stat.label}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular", marginTop: 2 }}>{stat.sub}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Daily Active Users bar chart ────────────────────────────────── */}
      {daily.length > 0 && (
        <>
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>
            DAILY ACTIVE USERS — LAST {range} DAYS
          </Text>
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 24 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 80 }}>
                {daily.map((row, i) => {
                  const h = Math.max(4, (row.dau / maxDau) * 72);
                  const isLast = i === daily.length - 1;
                  return (
                    <View key={row.date} style={{ alignItems: "center", gap: 2 }}>
                      <View style={{ width: 12, height: h, backgroundColor: isLast ? BLUE : `${BLUE}70`, borderRadius: 3 }} />
                      {(i === 0 || i === Math.floor(daily.length / 2) || isLast) && (
                        <Text style={{ color: TEXT_MID, fontSize: 7, fontFamily: "DMSans_400Regular" }}>
                          {row.date.slice(5)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={{ color: TEXT_MID, fontSize: 10 }}>Peak: {maxDau} users</Text>
              <Text style={{ color: TEXT_MID, fontSize: 10 }}>Avg: {Math.round(daily.reduce((s, r) => s + r.dau, 0) / Math.max(daily.length, 1))} users/day</Text>
            </View>
          </View>

          {/* Signups bar chart */}
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>
            NEW SIGNUPS — LAST {range} DAYS
          </Text>
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 24 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 80 }}>
                {daily.map((row, i) => {
                  const h = Math.max(4, (row.signups / maxSignups) * 72);
                  const isLast = i === daily.length - 1;
                  return (
                    <View key={row.date} style={{ alignItems: "center", gap: 2 }}>
                      <View style={{ width: 12, height: h, backgroundColor: isLast ? GREEN : `${GREEN}70`, borderRadius: 3 }} />
                      {(i === 0 || i === Math.floor(daily.length / 2) || isLast) && (
                        <Text style={{ color: TEXT_MID, fontSize: 7 }}>{row.date.slice(5)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={{ color: TEXT_MID, fontSize: 10 }}>Total: {daily.reduce((s, r) => s + r.signups, 0)} new users</Text>
              <Text style={{ color: TEXT_MID, fontSize: 10 }}>Peak: {maxSignups}/day</Text>
            </View>
          </View>

          {/* Predictions bar chart */}
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>
            BETS PLACED — LAST {range} DAYS
          </Text>
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 24 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 80 }}>
                {daily.map((row, i) => {
                  const h = Math.max(4, (row.predictions / maxPreds) * 72);
                  const isLast = i === daily.length - 1;
                  return (
                    <View key={row.date} style={{ alignItems: "center", gap: 2 }}>
                      <View style={{ width: 12, height: h, backgroundColor: isLast ? YELLOW : `${YELLOW}70`, borderRadius: 3 }} />
                      {(i === 0 || i === Math.floor(daily.length / 2) || isLast) && (
                        <Text style={{ color: TEXT_MID, fontSize: 7 }}>{row.date.slice(5)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={{ color: TEXT_MID, fontSize: 10 }}>Total: {daily.reduce((s, r) => s + r.predictions, 0)} bets</Text>
              <Text style={{ color: TEXT_MID, fontSize: 10 }}>Peak: {maxPreds}/day</Text>
            </View>
          </View>
        </>
      )}

      {/* ── Top Markets ────────────────────────────────────────────────── */}
      {topMarkets.length > 0 && (
        <>
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>
            TOP MARKETS BY BETS — LAST {range} DAYS
          </Text>
          <View style={{ gap: 8, marginBottom: 24 }}>
            {topMarkets.map((m, i) => {
              const barPct = (m.prediction_count / maxMktVol) * 100;
              const catColor = categoryColor(m.category);
              return (
                <View key={m.event_id} style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Text style={{ color: TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 12, width: 20 }}>#{i + 1}</Text>
                    <View style={{ backgroundColor: `${catColor}18`, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
                      <Text style={{ color: catColor, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{m.category.toUpperCase()}</Text>
                    </View>
                    <View style={{ backgroundColor: m.status === "open" ? `${GREEN}18` : `${TEXT_MID}18`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                      <Text style={{ color: m.status === "open" ? GREEN : TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{m.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={{ color: TEXT, fontSize: 12, fontFamily: "DMSans_500Medium", marginBottom: 8 }} numberOfLines={2}>{m.title}</Text>
                  {/* Proportional bar */}
                  <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 2, marginBottom: 6 }}>
                    <View style={{ height: 4, width: `${barPct}%` as any, backgroundColor: PURPLE, borderRadius: 2 }} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_500Medium" }}>{m.prediction_count} bets</Text>
                    <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_500Medium" }}>${m.total_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })} volume</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Top Users ──────────────────────────────────────────────────── */}
      {topUsers.length > 0 && (
        <>
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>
            TOP USERS BY XP
          </Text>
          <View style={{ gap: 8, marginBottom: 24 }}>
            {topUsers.map((u, i) => {
              const barPct = (u.xp / maxUserXP) * 100;
              return (
                <View key={u.user_id} style={{ backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    {/* Rank badge */}
                    <View style={{
                      width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
                      backgroundColor: i === 0 ? "#F59E0B" : i === 1 ? "#94A3B8" : i === 2 ? "#B45309" : "rgba(255,255,255,0.07)",
                    }}>
                      <Text style={{ color: i < 3 ? BG : TEXT_MID, fontSize: 11, fontFamily: "DMSans_700Bold" }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold" }}>{u.display_name || "—"}</Text>
                      <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>{u.email}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: PURPLE, fontSize: 14, fontFamily: "DMSans_700Bold" }}>{u.xp.toLocaleString()} XP</Text>
                      <Text style={{ color: TEXT_MID, fontSize: 10 }}>🔥 {u.current_streak}d streak</Text>
                    </View>
                  </View>
                  {/* XP bar */}
                  <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 2, marginTop: 10, marginBottom: 6 }}>
                    <View style={{ height: 3, width: `${barPct}%` as any, backgroundColor: PURPLE, borderRadius: 2 }} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: TEXT_MID, fontSize: 10 }}>{u.prediction_count} bets · ${u.total_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })} vol</Text>
                    <Text style={{ color: TEXT_MID, fontSize: 10 }}>
                      {u.last_login ? `Last seen ${new Date(u.last_login).toLocaleDateString()}` : "Never logged in"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ── Main Admin Screen ─────────────────────────────────────────────────────────

export default function AdminScreen() {
  const { language } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const [activeTab, setActiveTab] = useState<"resolve" | "analytics">("resolve");
  const [events, setEvents] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/pending-events");
      setEvents(res.data ?? []);
    } catch (e: any) {
      if (e?.status === 403) {
        Alert.alert("Access Denied", "Admin access required.");
        router.back();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = (event: PendingEvent, scenarioId: number) => {
    const scenario = event.scenarios.find(s => s.id === scenarioId);
    const note = noteText[event.id] || "";
    const title = language === "zh" ? (event.title_zh || event.title) : language === "pt" ? (event.title_pt || event.title) : event.title;
    const scenarioLabel = language === "zh" ? (scenario?.title_zh || scenario?.title) : language === "pt" ? (scenario?.title_pt || scenario?.title) : scenario?.title;

    const confirm = () => {
      setResolving(event.id);
      api.post(`/admin/events/${event.id}/resolve`, {
        winning_scenario_id: scenarioId,
        resolution_note: note || undefined,
      })
        .then(() => {
          setEvents(prev => prev.filter(e => e.id !== event.id));
          setExpandedId(null);
        })
        .catch(err => {
          Alert.alert("Error", err?.message ?? "Resolution failed");
        })
        .finally(() => setResolving(null));
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Resolve "${title.slice(0, 60)}" → Winner: "${scenarioLabel}"?`)) {
        confirm();
      }
    } else {
      Alert.alert(
        "Resolve Event",
        `"${title.slice(0, 60)}"\n\nWinner: "${scenarioLabel}"`,
        [{ text: "Cancel", style: "cancel" }, { text: "Confirm", style: "destructive", onPress: confirm }]
      );
    }
  };

  const voidEvent = (event: PendingEvent) => {
    const title = language === "zh" ? (event.title_zh || event.title) : language === "pt" ? (event.title_pt || event.title) : event.title;
    const confirm = () => {
      setResolving(event.id);
      api.post(`/admin/events/${event.id}/void`, { note: "Voided by admin" })
        .then(() => setEvents(prev => prev.filter(e => e.id !== event.id)))
        .catch(err => Alert.alert("Error", err?.message ?? "Void failed"))
        .finally(() => setResolving(null));
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Void and refund all bets for "${title.slice(0, 60)}"?`)) confirm();
    } else {
      Alert.alert("Void Event", `Refund all bets for "${title.slice(0, 60)}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Void & Refund", style: "destructive", onPress: confirm },
      ]);
    }
  };

  if (!fontsLoaded) return null;

  const filtered = filter.trim()
    ? events.filter(e =>
        e.title.toLowerCase().includes(filter.toLowerCase()) ||
        e.category.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  const expired = filtered.filter(e => e.closes_at && new Date(e.closes_at) < new Date());
  const pending = filtered.filter(e => !e.closes_at || new Date(e.closes_at) >= new Date());

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
            <Text style={{ color: PURPLE, fontSize: 22, fontFamily: "DMSans_700Bold" }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>SCENARA</Text>
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>Admin Panel</Text>
          </View>
          {activeTab === "resolve" && (
            <TouchableOpacity onPress={load} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(124,92,252,0.1)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(124,92,252,0.2)" }}>
              <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 12 }}>Refresh</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab strip */}
        <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
          {([
            { id: "resolve",   label: "⚖️  Resolve Events" },
            { id: "analytics", label: "📊  Analytics" },
          ] as const).map(tab => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={{
                flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center",
                backgroundColor: activeTab === tab.id ? PURPLE : CARD,
                borderWidth: 1, borderColor: activeTab === tab.id ? PURPLE : BORDER,
              }}
            >
              <Text style={{ color: activeTab === tab.id ? "white" : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 12 }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Analytics tab */}
        {activeTab === "analytics" && <AnalyticsTab />}

        {/* Resolve tab: search + list */}
        {activeTab === "resolve" && (
        <>
        {/* Search */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search events..."
            placeholderTextColor={TEXT_MID}
            style={{ backgroundColor: CARD, color: TEXT, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "DMSans_400Regular", fontSize: 14, borderWidth: 1, borderColor: BORDER }}
          />
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={PURPLE} size="large" />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

            {/* Stats bar */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total Open", value: filtered.length, color: PURPLE },
                { label: "Expired", value: expired.length, color: RED },
                { label: "Pending", value: pending.length, color: YELLOW },
              ].map(stat => (
                <View key={stat.label} style={{ flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER, alignItems: "center" }}>
                  <Text style={{ color: stat.color, fontSize: 22, fontFamily: "DMSans_700Bold" }}>{stat.value}</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", marginTop: 2 }}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {/* Expired events first */}
            {expired.length > 0 && (
              <>
                <Text style={{ color: RED, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 10 }}>EXPIRED — NEEDS RESOLUTION</Text>
                {expired.map(event => <EventCard key={event.id} event={event} language={language} expanded={expandedId === event.id} onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)} onResolve={resolve} onVoid={voidEvent} resolving={resolving === event.id} noteText={noteText[event.id] ?? ""} onNoteChange={t => setNoteText(prev => ({ ...prev, [event.id]: t }))} />)}
              </>
            )}

            {/* Open/upcoming events */}
            {pending.length > 0 && (
              <>
                <Text style={{ color: YELLOW, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 10, marginTop: expired.length > 0 ? 20 : 0 }}>OPEN — RESOLVE EARLY</Text>
                {pending.map(event => <EventCard key={event.id} event={event} language={language} expanded={expandedId === event.id} onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)} onResolve={resolve} onVoid={voidEvent} resolving={resolving === event.id} noteText={noteText[event.id] ?? ""} onNoteChange={t => setNoteText(prev => ({ ...prev, [event.id]: t }))} />)}
              </>
            )}

            {filtered.length === 0 && (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <Text style={{ color: GREEN, fontSize: 42, marginBottom: 12 }}>✓</Text>
                <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 16 }}>No events to resolve</Text>
                <Text style={{ color: TEXT_MID, fontSize: 13, marginTop: 6 }}>All caught up!</Text>
              </View>
            )}
          </ScrollView>
        )}
        </>
        )}
      </SafeAreaView>
    </View>
  );
}

function EventCard({
  event, language, expanded, onToggle, onResolve, onVoid, resolving, noteText, onNoteChange,
}: {
  event: PendingEvent; language: string; expanded: boolean;
  onToggle(): void; onResolve(e: PendingEvent, sid: number): void;
  onVoid(e: PendingEvent): void; resolving: boolean;
  noteText: string; onNoteChange(t: string): void;
}) {
  const title = language === "zh" ? (event.title_zh || event.title) : language === "pt" ? (event.title_pt || event.title) : event.title;
  const tl = timeLeft(event.closes_at);
  const isExpired = !!(event.closes_at && new Date(event.closes_at) < new Date());
  const catColor = categoryColor(event.category);

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: isExpired ? "rgba(239,68,68,0.25)" : BORDER, marginBottom: 10, overflow: "hidden" }}
    >
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <View style={{ backgroundColor: `${catColor}18`, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ color: catColor, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>{event.category.toUpperCase()}</Text>
            </View>
            <Text style={{ color: isExpired ? RED : YELLOW, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{tl}</Text>
            {event.is_featured && <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold" }}>✦ FEATURED</Text>}
          </View>
          <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 18 }} numberOfLines={expanded ? undefined : 2}>
            {title}
          </Text>
        </View>
        <Text style={{ color: TEXT_MID, fontSize: 16 }}>{expanded ? "▲" : "▼"}</Text>
      </View>

      {/* Expanded: scenario buttons */}
      {expanded && (
        <View style={{ borderTopWidth: 1, borderTopColor: BORDER, padding: 14, gap: 8 }}>
          <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 4 }}>SELECT WINNER</Text>

          {event.scenarios.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              disabled={resolving}
              onPress={() => onResolve(event, s.id)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${SCENARIO_COLORS[i % SCENARIO_COLORS.length]}12`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${SCENARIO_COLORS[i % SCENARIO_COLORS.length]}30` }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }} />
                <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13 }}>
                  {language === "zh" ? (s.title_zh || s.title) : language === "pt" ? (s.title_pt || s.title) : s.title}
                </Text>
              </View>
              <Text style={{ color: SCENARIO_COLORS[i % SCENARIO_COLORS.length], fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                {s.probability.toFixed(0)}%
              </Text>
            </TouchableOpacity>
          ))}

          {/* Optional note */}
          <TextInput
            value={noteText}
            onChangeText={onNoteChange}
            placeholder="Resolution note (optional)"
            placeholderTextColor={TEXT_MID}
            style={{ backgroundColor: SURFACE, color: TEXT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontFamily: "DMSans_400Regular", borderWidth: 1, borderColor: BORDER, marginTop: 4 }}
          />

          {/* Void button */}
          <TouchableOpacity
            disabled={resolving}
            onPress={() => onVoid(event)}
            style={{ paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.06)", marginTop: 4 }}
          >
            {resolving
              ? <ActivityIndicator color={RED} size="small" />
              : <Text style={{ color: RED, fontFamily: "DMSans_700Bold", fontSize: 13 }}>Void & Refund All</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}
