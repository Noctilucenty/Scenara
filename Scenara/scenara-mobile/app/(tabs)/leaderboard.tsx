import { useCallback, useState, useEffect } from "react";
import {
  SafeAreaView, Text, View, ScrollView,
  TouchableOpacity, ActivityIndicator, StatusBar,
  Dimensions, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";

const BG       = "#08090C";
const CARD     = "#0D1117";
const PURPLE   = "#7C5CFC";
const BLUE     = "#4F8EF7";
const PINK     = "#F050AE";
const PURPLE_D = "#4A3699";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

const GRAD_CARD = ["rgba(79,142,247,0.07)", "rgba(124,92,252,0.03)"] as const;
const SIDEBAR_W = 300;

type SortOption = "pnl" | "balance" | "win_rate";
type LeaderboardEntry = {
  rank: number; user_id: number; email: string; display_name: string;
  balance: number; total_pnl: number; total_predictions: number;
  won_count: number; lost_count: number; win_rate: number;
  current_streak: number; best_streak: number;
};
type LeaderboardData = { entries: LeaderboardEntry[]; total_users: number };

function rankMeta(rank: number) {
  if (rank === 1) return { label: "I",   size: 14, colors: [PURPLE, BLUE]         as const };
  if (rank === 2) return { label: "II",  size: 13, colors: ["#888", "#C0C0C0"]    as const };
  if (rank === 3) return { label: "III", size: 12, colors: ["#7A4A2A", "#CD7F32"] as const };
  return               { label: `${rank}`, size: 12, colors: null };
}

function streakBadge(n: number) {
  if (n >= 10) return "🔥🔥🔥";
  if (n >= 7)  return "🔥🔥";
  if (n >= 5)  return "🔥";
  if (n >= 3)  return "⚡";
  return "";
}

function EntryRow({ entry, isMe, t }: { entry: LeaderboardEntry; isMe: boolean; t: any }) {
  const pnlPos = entry.total_pnl >= 0;
  const rank   = rankMeta(entry.rank);
  const badge  = streakBadge(entry.current_streak);
  const isTop3 = entry.rank <= 3;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: isMe ? "rgba(124,92,252,0.07)" : CARD, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: isMe ? BORDER_P : isTop3 ? "rgba(124,92,252,0.12)" : BORDER }}>
      <View style={{ width: 44, alignItems: "center" }}>
        {rank.colors ? (
          <LinearGradient colors={rank.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: rank.size, letterSpacing: 0.5 }}>{rank.label}</Text>
          </LinearGradient>
        ) : (
          <Text style={{ color: TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{rank.label}</Text>
        )}
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: isMe ? BLUE : isTop3 ? TEXT : TEXT_SUB, fontFamily: "DMSans_700Bold", fontSize: 15 }}>{entry.display_name}</Text>
          {isMe && (
            <View style={{ backgroundColor: "rgba(79,142,247,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ color: BLUE, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>{t.rankings.youBadge}</Text>
            </View>
          )}
          {badge ? <Text style={{ fontSize: 13 }}>{badge}</Text> : null}
        </View>
        <Text style={{ color: TEXT_MID, fontSize: 12, marginTop: 3, fontFamily: "DMSans_400Regular" }}>{entry.won_count}W · {entry.lost_count}L · {entry.win_rate}% {t.rankings.winRate.toLowerCase()}</Text>
        {entry.current_streak >= 2 && <Text style={{ color: "#FB923C", fontSize: 11, marginTop: 2, fontFamily: "DMSans_500Medium" }}>🔥 {entry.current_streak} streak</Text>}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: pnlPos ? (isTop3 ? BLUE : PURPLE) : RED, fontFamily: "DMSans_700Bold", fontSize: 16 }}>{pnlPos ? "+" : ""}{entry.total_pnl.toFixed(2)}</Text>
        <Text style={{ color: TEXT_MID, fontSize: 11, marginTop: 3 }}>${entry.balance.toLocaleString("en-US", { maximumFractionDigits: 0 })}</Text>
      </View>
    </View>
  );
}

function LeaderboardSidebar({ data, userId, t }: { data: LeaderboardData | null; userId: number | null; t: any }) {
  if (!data) return null;
  const myEntry = data.entries.find(e => e.user_id === userId);
  const top3 = data.entries.filter(e => e.rank <= 3);
  const gradients: readonly [string, string][] = [[PURPLE, BLUE], ["#888", "#C0C0C0"], ["#7A4A2A", "#CD7F32"]];

  return (
    <View style={{ gap: 12 }}>
      {myEntry && (
        <LinearGradient colors={GRAD_CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER_P }}>
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2, marginBottom: 14 }}>{t.rankings.yourStanding}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: BORDER_P, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(124,92,252,0.08)" }}>
                <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 15 }}>#{myEntry.rank}</Text>
              </View>
              <View>
                <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 16 }}>{myEntry.display_name}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 12, marginTop: 2 }}>{t.rankings.predictions(myEntry.total_predictions)}</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: myEntry.total_pnl >= 0 ? GREEN : RED, fontFamily: "DMSans_700Bold", fontSize: 20 }}>{myEntry.total_pnl >= 0 ? "+" : ""}{myEntry.total_pnl.toFixed(2)}</Text>
              <Text style={{ color: TEXT_MID, fontSize: 9, letterSpacing: 0.8, marginTop: 2 }}>{t.rankings.pnl}</Text>
            </View>
          </View>
          {myEntry.current_streak > 0 && (
            <Text style={{ color: "#FB923C", fontSize: 12, fontFamily: "DMSans_500Medium", marginTop: 10 }}>
              {t.rankings.streak(myEntry.current_streak, myEntry.best_streak)}
            </Text>
          )}
        </LinearGradient>
      )}

      <View style={{ backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: "hidden" }}>
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{t.rankings.topTraders}</Text>
        </View>
        {top3.map((entry, idx) => (
          <View key={entry.user_id} style={{ flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: idx < 2 ? 1 : 0, borderBottomColor: "rgba(255,255,255,0.04)", gap: 12 }}>
            <LinearGradient colors={gradients[idx]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 11 }}>{["I", "II", "III"][idx]}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{entry.display_name}</Text>
              <Text style={{ color: TEXT_MID, fontSize: 11 }}>{entry.win_rate}% {t.rankings.winRate.toLowerCase()}</Text>
            </View>
            <Text style={{ color: entry.total_pnl >= 0 ? BLUE : RED, fontFamily: "DMSans_700Bold", fontSize: 14 }}>{entry.total_pnl >= 0 ? "+" : ""}{entry.total_pnl.toFixed(0)}</Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER }}>
        <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>{t.rankings.platformStats}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}>
          <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{t.rankings.totalTraders}</Text>
          <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold" }}>{data.total_users}</Text>
        </View>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const { userId } = useTrading();
  const { t } = useLanguage();
  const [data, setData]       = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [sortBy, setSortBy]   = useState<SortOption>("pnl");
  const [screenW, setScreenW] = useState(Dimensions.get("window").width);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const isWeb = Platform.OS === "web" && screenW >= 900;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const h = () => setScreenW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const load = useCallback(async (sort: SortOption) => {
    setLoading(true); setError("");
    try { const res = await api.get(`/accounts/leaderboard?sort_by=${sort}&limit=50`); setData(res.data); }
    catch { setError(t.rankings.noTraders); }
    finally { setLoading(false); }
  }, [t]);

  useFocusEffect(useCallback(() => { load(sortBy); }, [sortBy, load]));
  if (!fontsLoaded) return null;

  const SORTS: { key: SortOption; label: string }[] = [
    { key: "pnl",      label: t.rankings.topPnl },
    { key: "balance",  label: t.rankings.balance },
    { key: "win_rate", label: t.rankings.winRate },
  ];

  const mainContent = (
    <>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {SORTS.map(({ key, label }) => (
          <TouchableOpacity key={key} onPress={() => setSortBy(key)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: sortBy === key ? "rgba(124,92,252,0.12)" : "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: sortBy === key ? BORDER_P : BORDER }}>
            <Text style={{ color: sortBy === key ? PURPLE : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 0.5 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {data?.entries.length ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 8 }}>
          <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{t.rankings.trader}</Text>
          <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{t.rankings.pnl}</Text>
        </View>
      ) : null}

      {loading && <View style={{ alignItems: "center", paddingVertical: 20 }}><ActivityIndicator color={PURPLE} /></View>}
      {error ? <View style={{ marginBottom: 12, backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", borderWidth: 1, padding: 12, borderRadius: 12 }}><Text style={{ color: RED, fontSize: 13 }}>{error}</Text></View> : null}

      {data?.entries.map(entry => <EntryRow key={entry.user_id} entry={entry} isMe={entry.user_id === userId} t={t} />)}

      {data?.entries.length === 0 && !loading && (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <Text style={{ color: PURPLE_D, fontSize: 30, marginBottom: 12 }}>◆</Text>
          <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium" }}>{t.rankings.noTraders}</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>{t.common.scenara}</Text>
            <Text style={{ color: TEXT, fontSize: 26, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, marginTop: 4 }}>{t.rankings.title}</Text>
          </View>
          {data && <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", paddingBottom: 2 }}>{t.rankings.traders(data.total_users)}</Text>}
        </View>

        {isWeb ? (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", padding: 20, gap: 16, alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>{mainContent}</View>
              <View style={{ width: SIDEBAR_W }}><LeaderboardSidebar data={data} userId={userId} t={t} /></View>
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1, padding: 16 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {data && <><LeaderboardSidebar data={data} userId={userId} t={t} /><View style={{ height: 12 }} /></>}
            {mainContent}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
