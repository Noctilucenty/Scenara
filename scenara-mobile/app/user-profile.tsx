import { useCallback, useEffect, useState } from "react";
import {
  SafeAreaView, View, Text, ScrollView,
  TouchableOpacity, ActivityIndicator, StatusBar, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";
import { LevelBadge } from "@/components/LevelBadge";
import { ProfileSkeleton } from "@/components/Skeleton";

// ── Theme (matches leaderboard + news-detail) ───────────────────────────────
const BG       = "#08090C";
const CARD     = "#0D1117";
const PURPLE   = "#7C5CFC";
const BLUE     = "#4F8EF7";
const PURPLE_D = "#4A3699";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

// ── Types (mirror social.py schemas) ────────────────────────────────────────
type TraderProfile = {
  id: number;
  display_name: string;
  email_prefix: string;
  created_at: string;
  is_following: boolean;
  is_self: boolean;
  follower_count: number;
  following_count: number;
  balance: number;
  total_pnl: number;
  total_bets: number;
  winning_bets: number;
  win_rate: number;
  current_streak: number;
  best_streak: number;
  level?: number;
  xp?: number;
};

type TraderCard = {
  id: number;
  display_name: string;
  email_prefix: string;
  is_following: boolean;
  follower_count: number;
  total_pnl: number;
  win_rate: number;
  current_streak: number;
};

type Tab = "stats" | "followers" | "following";

// ── Small i18n helpers (keeps this screen self-contained — no t.profile keys
// exist in the i18n bundle yet, and shipping the social screen shouldn't
// block on a full translation pass) ─────────────────────────────────────────
function L(lang: string, en: string, pt: string, zh: string): string {
  return lang === "pt" ? pt : lang === "zh" ? zh : en;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const targetId = Number(id);
  const router = useRouter();
  const { userId, isAuthenticated } = useTrading();
  const { language } = useLanguage();

  const [profile, setProfile] = useState<TraderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [tab, setTab]         = useState<Tab>("stats");
  const [followers, setFollowers] = useState<TraderCard[] | null>(null);
  const [following, setFollowing] = useState<TraderCard[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  // Load profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!targetId || Number.isNaN(targetId)) {
        setError(L(language, "Invalid user", "Usuário inválido", "用户无效"));
        setLoading(false);
        return;
      }
      setLoading(true); setError("");
      try {
        const res = await api.get(`/social/users/${targetId}`);
        if (!cancelled) setProfile(res.data);
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.status === 401
              ? L(language, "Please sign in to view traders.", "Entre para ver traders.", "请登录查看交易者。")
              : L(language, "Trader not found.", "Trader não encontrado.", "未找到该交易者。"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetId, language]);

  // Lazy-load followers/following only when their tab is opened
  const loadTab = useCallback(async (which: Tab) => {
    if (!targetId) return;
    if (which === "followers" && followers === null) {
      try {
        const res = await api.get(`/social/users/${targetId}/followers?limit=50`);
        setFollowers(res.data);
      } catch { setFollowers([]); }
    } else if (which === "following" && following === null) {
      try {
        const res = await api.get(`/social/users/${targetId}/following?limit=50`);
        setFollowing(res.data);
      } catch { setFollowing([]); }
    }
  }, [targetId, followers, following]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  // Optimistic follow toggle on the main profile
  const toggleFollow = useCallback(async () => {
    if (!profile) return;
    if (!isAuthenticated) { router.push("/register"); return; }
    if (profile.is_self)  return;
    const nowFollowing = !profile.is_following;
    setBusy(true);
    setProfile(p => p ? {
      ...p,
      is_following: nowFollowing,
      follower_count: Math.max(0, p.follower_count + (nowFollowing ? 1 : -1)),
    } : p);
    try {
      if (nowFollowing) await api.post(`/social/users/${targetId}/follow`);
      else              await api.delete(`/social/users/${targetId}/follow`);
    } catch {
      // Rollback
      setProfile(p => p ? {
        ...p,
        is_following: !nowFollowing,
        follower_count: Math.max(0, p.follower_count + (nowFollowing ? -1 : 1)),
      } : p);
    } finally {
      setBusy(false);
    }
  }, [profile, isAuthenticated, targetId, router]);

  if (!fontsLoaded) return null;

  const initial = (profile?.display_name || profile?.email_prefix || "?").charAt(0).toUpperCase();
  const pnlPos = (profile?.total_pnl ?? 0) >= 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: "stats",     label: L(language, "STATS",     "STATS",     "数据") },
    { key: "followers", label: L(language, "FOLLOWERS", "SEGUIDORES", "粉丝") },
    { key: "following", label: L(language, "FOLLOWING", "SEGUINDO",   "关注") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header with back */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)", gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
            <Text style={{ color: TEXT_SUB, fontSize: 22, fontFamily: "DMSans_500Medium" }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ color: TEXT, fontSize: 16, fontFamily: "DMSans_700Bold" }}>
            {L(language, "Trader Profile", "Perfil do Trader", "交易者资料")}
          </Text>
        </View>

        {loading && (
          // Shape-matching skeleton so the avatar + stat tiles don't jump in
          // when the /users/:id response lands. The identity hit matters more
          // on this screen than anywhere else — it's the social layer.
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <ProfileSkeleton />
          </ScrollView>
        )}

        {error && !loading && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_500Medium", textAlign: "center" }}>{error}</Text>
          </View>
        )}

        {profile && !loading && !error && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {/* Identity card */}
            <LinearGradient
              colors={["rgba(79,142,247,0.09)", "rgba(124,92,252,0.04)"] as const}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: 18, padding: 20, borderWidth: 1, borderColor: BORDER_P, marginBottom: 16 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <LinearGradient
                  colors={[PURPLE, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 24 }}>{initial}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 20 }}>{profile.display_name}</Text>
                    <LevelBadge level={profile.level} size="md" />
                  </View>
                  <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 2 }}>@{profile.email_prefix}</Text>
                  {profile.current_streak >= 2 && (
                    <Text style={{ color: "#FB923C", fontSize: 12, fontFamily: "DMSans_500Medium", marginTop: 6 }}>
                      🔥 {profile.current_streak} {L(language, "streak", "sequência", "连胜")}
                    </Text>
                  )}
                </View>
              </View>

              {/* Followers / Following counts */}
              <View style={{ flexDirection: "row", marginTop: 18, gap: 8 }}>
                <TouchableOpacity onPress={() => setTab("followers")} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center" }}>
                  <Text style={{ color: TEXT, fontSize: 18, fontFamily: "DMSans_700Bold" }}>{profile.follower_count}</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", letterSpacing: 1, marginTop: 2 }}>
                    {L(language, "FOLLOWERS", "SEGUIDORES", "粉丝")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTab("following")} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center" }}>
                  <Text style={{ color: TEXT, fontSize: 18, fontFamily: "DMSans_700Bold" }}>{profile.following_count}</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", letterSpacing: 1, marginTop: 2 }}>
                    {L(language, "FOLLOWING", "SEGUINDO", "关注")}
                  </Text>
                </TouchableOpacity>
                <View style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center" }}>
                  <Text style={{ color: pnlPos ? BLUE : RED, fontSize: 18, fontFamily: "DMSans_700Bold" }}>
                    {pnlPos ? "+" : ""}{profile.total_pnl.toFixed(0)}
                  </Text>
                  <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", letterSpacing: 1, marginTop: 2 }}>
                    {L(language, "PNL", "L/G", "盈亏")}
                  </Text>
                </View>
              </View>

              {/* Follow button / self badge */}
              {profile.is_self ? (
                <View style={{ marginTop: 16, padding: 10, alignItems: "center", borderRadius: 10, backgroundColor: "rgba(79,142,247,0.12)", borderWidth: 1, borderColor: BORDER_P }}>
                  <Text style={{ color: BLUE, fontSize: 12, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                    {L(language, "THIS IS YOU", "ESTE É VOCÊ", "这是你")}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  disabled={busy}
                  onPress={toggleFollow}
                  style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", opacity: busy ? 0.6 : 1 }}
                >
                  {profile.is_following ? (
                    <View style={{ paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: BORDER }}>
                      <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                        {L(language, "FOLLOWING", "SEGUINDO", "已关注")}
                      </Text>
                    </View>
                  ) : (
                    <LinearGradient colors={[BLUE, PURPLE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 12, alignItems: "center" }}>
                      <Text style={{ color: "white", fontSize: 13, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                        {L(language, "+ FOLLOW", "+ SEGUIR", "+ 关注")}
                      </Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              )}
            </LinearGradient>

            {/* Tab selector */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {TABS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setTab(key)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                    backgroundColor: tab === key ? "rgba(124,92,252,0.12)" : "rgba(255,255,255,0.03)",
                    borderWidth: 1, borderColor: tab === key ? BORDER_P : BORDER,
                  }}
                >
                  <Text style={{ color: tab === key ? PURPLE : TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tab content */}
            {tab === "stats" && (
              <StatsGrid profile={profile} language={language} />
            )}
            {tab === "followers" && (
              <TraderList
                cards={followers}
                emptyText={L(language, "No followers yet.", "Sem seguidores.", "暂无粉丝。")}
                viewerId={userId}
                onOpen={(uid) => router.push({ pathname: "/user-profile", params: { id: String(uid) } })}
              />
            )}
            {tab === "following" && (
              <TraderList
                cards={following}
                emptyText={L(language, "Not following anyone.", "Sem seguir ninguém.", "还未关注任何人。")}
                viewerId={userId}
                onOpen={(uid) => router.push({ pathname: "/user-profile", params: { id: String(uid) } })}
              />
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatsGrid({ profile, language }: { profile: TraderProfile; language: string }) {
  const cells = [
    { label: L(language, "Balance",     "Saldo",            "余额"),   value: `$${Math.round(profile.balance).toLocaleString("en-US")}`, tone: TEXT },
    { label: L(language, "Total P&L",   "L/G Total",        "总盈亏"), value: `${profile.total_pnl >= 0 ? "+" : ""}$${profile.total_pnl.toFixed(2)}`, tone: profile.total_pnl >= 0 ? GREEN : RED },
    { label: L(language, "Predictions", "Previsões",        "预测数"), value: `${profile.total_bets}`, tone: TEXT },
    { label: L(language, "Wins",        "Vitórias",         "获胜"),   value: `${profile.winning_bets}`, tone: GREEN },
    { label: L(language, "Win Rate",    "Taxa de Vitória",  "胜率"),   value: `${profile.win_rate.toFixed(1)}%`, tone: profile.win_rate >= 50 ? GREEN : TEXT },
    { label: L(language, "Best Streak", "Melhor Sequência", "最长连胜"), value: `${profile.best_streak}`, tone: "#FB923C" },
  ];

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {cells.map((c) => (
        <View key={c.label} style={{ flexBasis: "48%", flexGrow: 1, backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
          <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.2 }}>{c.label.toUpperCase()}</Text>
          <Text style={{ color: c.tone, fontSize: 18, fontFamily: "DMSans_700Bold", marginTop: 6 }}>{c.value}</Text>
        </View>
      ))}
    </View>
  );
}

function TraderList({
  cards, emptyText, viewerId, onOpen,
}: {
  cards: TraderCard[] | null;
  emptyText: string;
  viewerId: number | null;
  onOpen: (uid: number) => void;
}) {
  if (cards === null) {
    return <View style={{ alignItems: "center", padding: 20 }}><ActivityIndicator color={PURPLE} /></View>;
  }
  if (cards.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 30 }}>
        <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {cards.map((c) => {
        const pnlPos = c.total_pnl >= 0;
        const isSelf = c.id === viewerId;
        return (
          <TouchableOpacity
            key={c.id}
            activeOpacity={0.85}
            onPress={() => onOpen(c.id)}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER }}
          >
            <LinearGradient colors={[PURPLE, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>{(c.display_name || c.email_prefix || "?").charAt(0).toUpperCase()}</Text>
            </LinearGradient>
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
              <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 14 }}>{c.display_name}</Text>
              <Text style={{ color: TEXT_MID, fontSize: 11, marginTop: 2 }}>
                {c.win_rate.toFixed(0)}% · {c.follower_count} {c.follower_count === 1 ? "follower" : "followers"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: pnlPos ? BLUE : RED, fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                {pnlPos ? "+" : ""}{c.total_pnl.toFixed(0)}
              </Text>
              {c.is_following && !isSelf && (
                <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginTop: 3 }}>FOLLOWING</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
