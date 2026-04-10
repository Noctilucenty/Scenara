import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  SafeAreaView, Text, View, ScrollView,
  ActivityIndicator, TouchableOpacity, StatusBar, Modal, Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";
import { api } from "@/src/api/client";
import { router } from "expo-router";

// ── Import from centralized theme (no more scattered color constants) ──────────
import {
  C, GRAD,
  getGrade,
  formatPnl,
  timeAgo,
  streakEmoji,
  streakLabel,
} from "@/src/theme";

// Aliases kept for readability inside JSX
const { BG, CARD, SURFACE, BLUE, PURPLE, PURPLE_DIM: PURPLE_D,
        TEXT, TEXT_SUB, TEXT_MID, BORDER, BORDER_P, GREEN, RED } = C;
const BLUE_A = "#60A5FA";

const AUTO_REFRESH_MS = 30_000;

// ── Types ──────────────────────────────────────────────────────────────────────

type PortfolioSummary = {
  current_streak: number; best_streak: number; win_rate: number;
  accuracy_score: number; percentile_rank: number; best_pnl: number; worst_pnl: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusStyle(status: string, t: any) {
  if (status === "won")  return { color: GREEN,    bg: "rgba(34,197,94,0.1)",   label: t.portfolio.won };
  if (status === "lost") return { color: RED,      bg: "rgba(239,68,68,0.1)",   label: t.portfolio.lost };
  if (status === "void") return { color: TEXT_MID, bg: "rgba(100,116,139,0.1)", label: "VOID" };
  return                        { color: BLUE_A,   bg: "rgba(96,165,250,0.1)",  label: t.portfolio.open };
}

// ── ShareCardModal ─────────────────────────────────────────────────────────────

type ShareCardData = {
  eventTitle: string; scenarioTitle: string;
  pnl: number; wagered: number; multiplier: number;
  entryProb: number; status: string;
};

function ShareCardModal({ data, onClose, language }: { data: ShareCardData; onClose(): void; language: string }) {
  const isWin = data.pnl >= 0;
  const pnlStr = `${isWin ? "+" : ""}$${Math.abs(data.pnl).toFixed(2)}`;

  return (
    <Modal visible animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center", padding: 24 }}>
        <View style={{ width: "100%", maxWidth: 380, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: isWin ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }}>
          <LinearGradient colors={isWin ? ["#0a1f14", BG] : ["#1f0a0a", BG]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 28 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 18, height: 18, borderRadius: 4, overflow: "hidden" }}>
                  <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 10, fontFamily: "DMSans_700Bold" }}>S</Text>
                  </LinearGradient>
                </View>
                <Text style={{ color: TEXT, fontSize: 14, fontFamily: "DMSans_700Bold", letterSpacing: -0.3 }}>scenara</Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: isWin ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: isWin ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }}>
                <Text style={{ color: isWin ? GREEN : RED, fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 1 }}>
                  {isWin ? (language === "pt" ? "GANHOU" : "WON") : (language === "pt" ? "PERDEU" : "LOST")}
                </Text>
              </View>
            </View>

            <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_500Medium", marginBottom: 6 }} numberOfLines={2}>{data.eventTitle}</Text>
            <Text style={{ color: TEXT, fontSize: 17, fontFamily: "DMSans_700Bold", lineHeight: 24, marginBottom: 24 }} numberOfLines={2}>{data.scenarioTitle}</Text>

            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 8 }}>
                {language === "pt" ? "RESULTADO" : "RESULT"}
              </Text>
              <LinearGradient colors={isWin ? [GREEN, "#16a34a"] : [RED, "#dc2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14 }}>
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 36, letterSpacing: -1 }}>{pnlStr}</Text>
              </LinearGradient>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14, marginBottom: 20 }}>
              {[
                { label: language === "pt" ? "APOSTADO" : "WAGERED", value: `$${data.wagered.toFixed(0)}` },
                { label: language === "pt" ? "ENTRADA" : "ENTRY PROB",  value: `${data.entryProb}%` },
                { label: "MULT", value: `${data.multiplier}x` },
              ].map(s => (
                <View key={s.label} style={{ alignItems: "center" }}>
                  <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{s.label}</Text>
                  <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 15, marginTop: 4 }}>{s.value}</Text>
                </View>
              ))}
            </View>

            <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular", textAlign: "center" }}>
              scenara.app  ·  {language === "pt" ? "Mercado de Previsões Simulado" : "Simulated Prediction Market"}
            </Text>
          </LinearGradient>
        </View>

        <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 20, marginBottom: 24 }}>
          {language === "pt" ? "Tire um print para compartilhar" : "Take a screenshot to share"}
        </Text>

        <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 32, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.08)" }}>
          <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 13, letterSpacing: 0.5 }}>
            {language === "pt" ? "Fechar" : "Close"}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── WinCelebrationBanner — dopamine hit on new resolved wins ──────────────────
// Slides down from top when the portfolio shows won bets.
// Each win is a variable-ratio reward — the strongest schedule for engagement.

function WinCelebrationBanner({ topWin, language }: {
  topWin: { eventTitle: string; pnl: number } | null;
  language: string;
}) {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!topWin) return;
    setVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 7, tension: 60 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    // Auto-dismiss after 5s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -80, duration: 300, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    }, 5000);
    return () => clearTimeout(timer);
  }, [topWin?.eventTitle]);

  if (!topWin || !visible) return null;

  const pnlStr = `+$${topWin.pnl.toFixed(2)}`;
  return (
    <Animated.View style={{
      transform: [{ translateY: slideAnim }],
      opacity: opacityAnim,
      marginHorizontal: 0,
      marginBottom: 4,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.3)",
    }}>
      <LinearGradient
        colors={["rgba(34,197,94,0.15)", "rgba(34,197,94,0.05)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}
      >
        <Text style={{ fontSize: 24 }}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 13 }}>
            {language === "pt" ? `Você ganhou ${pnlStr}!` : `You won ${pnlStr}!`}
          </Text>
          <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 2 }} numberOfLines={1}>
            {topWin.eventTitle}
          </Text>
        </View>
        <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 18 }}>{pnlStr}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ── GradeLabel — the identity hook ────────────────────────────────────────────
// Shows "Elite Predictor / Sharp / Average / Needs Work" under the user's name.
// Players return daily to improve their grade — this is the core retention loop.

function GradeLabel({ accuracyScore, language }: { accuracyScore: number; language: string }) {
  const grade = getGrade(accuracyScore);
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: `${grade.color}15`,
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 20, borderWidth: 1,
      borderColor: `${grade.color}30`,
      alignSelf: "flex-start",
    }}>
      <Text style={{ fontSize: 12 }}>{grade.emoji}</Text>
      <Text style={{ color: grade.color, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 0.8 }}>
        {language === "pt" ? grade.label_pt : grade.label}
      </Text>
    </View>
  );
}

// ── PayoutPreview — live payout before confirming ─────────────────────────────
// Ported from Claude's BetModal — shows potential upside the moment
// a scenario + amount are selected. This is the dopamine trigger.

export function PayoutPreview({
  amount, probability, language,
}: {
  amount: string; probability: number; language: string;
}) {
  const amt = parseFloat(amount) || 0;
  if (amt <= 0 || probability <= 0) return null;
  const payout = amt * (100 / probability);
  const profit = payout - amt;
  const multiplier = (100 / probability).toFixed(2);

  return (
    <View style={{
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      backgroundColor: "rgba(34,197,94,0.06)",
      borderRadius: 12, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
      paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
    }}>
      <View>
        <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
          {language === "pt" ? "RETORNO POTENCIAL" : "POTENTIAL PAYOUT"}
        </Text>
        <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 20, marginTop: 2 }}>
          ${payout.toFixed(2)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
          {language === "pt" ? "LUCRO" : "PROFIT"}
        </Text>
        <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 16, marginTop: 2 }}>
          +${profit.toFixed(2)}
          <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}> ({multiplier}x)</Text>
        </Text>
      </View>
    </View>
  );
}

// ── CategoryCountBadge — scarcity cue on category chips ───────────────────────
// Shows "(3)" count inside category pill. Scarcity per category
// ("Crypto 3") creates urgency and guides exploration.

export function CategoryCountBadge({
  count, color,
}: {
  count: number; color: string;
}) {
  if (count === 0) return null;
  return (
    <View style={{
      backgroundColor: `${color}20`, borderRadius: 10,
      paddingHorizontal: 5, paddingVertical: 1,
      marginLeft: 2,
    }}>
      <Text style={{ color, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{count}</Text>
    </View>
  );
}

// ── Main PortfolioScreen ───────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const { account, predictions, loadingPortfolio, portfolioError, refreshPortfolio, userId, isAuthenticated } = useTrading();
  const { t, language } = useLanguage();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [shareCard, setShareCard] = useState<ShareCardData | null>(null);
  const [streakDismissed, setStreakDismissed] = useState(false);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocused = useRef(false);

  const fetchSummary = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api.get(`/predictions/user/${userId}/summary`);
      setSummary({
        current_streak:  res.data.current_streak  ?? 0,
        best_streak:     res.data.best_streak     ?? 0,
        win_rate:        res.data.win_rate        ?? 0,
        accuracy_score:  res.data.accuracy_score  ?? 0,
        percentile_rank: res.data.percentile_rank ?? 0,
        best_pnl:        res.data.best_pnl        ?? 0,
        worst_pnl:       res.data.worst_pnl       ?? 0,
      });
    } catch { }
  }, [userId]);

  // ── Promise.allSettled — resilient parallel load ───────────────────────────
  // If summary endpoint fails, portfolio predictions still render.
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      refreshPortfolio(),
      fetchSummary(),
    ]);
  }, [refreshPortfolio, fetchSummary]);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    refreshAll();
    intervalRef.current = setInterval(() => {
      if (isFocused.current) refreshAll();
    }, AUTO_REFRESH_MS);
    return () => {
      isFocused.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshAll]));

  const stats = useMemo(() => {
    const won  = predictions.filter(p => p.status === "won").length;
    const lost = predictions.filter(p => p.status === "lost").length;
    const open = predictions.filter(p => p.status === "open").length;
    const totalPnl     = predictions.reduce((s, p) => s + (p.pnl ? Number(p.pnl) : 0), 0);
    const totalWagered = predictions.reduce((s, p) => s + Number(p.simulated_amount), 0);
    return { won, lost, open, total: predictions.length, totalPnl, totalWagered };
  }, [predictions]);

  // Most recent winning bet — powers the celebration banner
  const latestWin = useMemo(() => {
    const won = predictions
      .filter(p => p.status === "won" && p.pnl !== null && Number(p.pnl) > 0)
      .sort((a, b) => new Date(b.settled_at ?? 0).getTime() - new Date(a.settled_at ?? 0).getTime());
    if (!won[0]) return null;
    return { eventTitle: won[0].event_title, pnl: Number(won[0].pnl) };
  }, [predictions]);

  if (!fontsLoaded) return null;

  // ── Guest view ─────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 28 }}>
          <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <Text style={{ color: "white", fontSize: 28, fontFamily: "DMSans_700Bold" }}>S</Text>
          </LinearGradient>
          <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", marginBottom: 10, textAlign: "center" }}>
            {language === "pt" ? "Sua carteira está aqui" : "Your portfolio lives here"}
          </Text>
          <Text style={{ color: TEXT_MID, fontSize: 14, textAlign: "center", lineHeight: 21, marginBottom: 32 }}>
            {language === "pt"
              ? "Crie uma conta gratuita para acompanhar suas apostas, P&L e histórico de previsões."
              : "Create a free account to track your bets, P&L and prediction history."}
          </Text>
          {/* CTA inside empty state — removes dead end */}
          <TouchableOpacity onPress={() => router.push("/register")} style={{ borderRadius: 14, overflow: "hidden", width: "100%", marginBottom: 12 }}>
            <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 16 }}>
                {language === "pt" ? "Criar conta grátis" : "Create free account"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/login")} style={{ paddingVertical: 15, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: BORDER_P, width: "100%" }}>
            <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 16 }}>
              {language === "pt" ? "Já tenho conta" : "I already have an account"}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const cs = summary?.current_streak ?? 0;
  const bs = summary?.best_streak    ?? 0;
  const sEmoji = streakEmoji(cs);
  const sLabel = summary && cs >= 1 ? streakLabel(cs, t) : "";
  const pnlPos = stats.totalPnl >= 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>{t.common.scenara}</Text>
          <Text style={{ color: TEXT, fontSize: 26, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, marginTop: 4 }}>{t.portfolio.title}</Text>
          {/* Grade label — identity hook (port from Claude's getGrade) */}
          {summary && summary.accuracy_score > 0 && (
            <View style={{ marginTop: 8 }}>
              <GradeLabel accuracyScore={summary.accuracy_score} language={language} />
            </View>
          )}
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Streak milestone celebration banner */}
          {summary && cs >= 3 && !streakDismissed && (() => {
            let msg = "";
            if (cs >= 10) msg = "🏆 10-win streak! Legendary!";
            else if (cs >= 5) msg = "⚡ 5 wins in a row! You're on fire!";
            else msg = "🔥 3-win streak! Keep it up!";
            return (
              <View style={{
                marginTop: 14, marginBottom: 8, borderRadius: 14, overflow: "hidden",
                borderWidth: 1, borderColor: "rgba(247,147,26,0.35)",
              }}>
                <LinearGradient
                  colors={["rgba(247,147,26,0.18)", "rgba(124,92,252,0.08)"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}
                >
                  <Text style={{ color: "#F7931A", fontFamily: "DMSans_700Bold", fontSize: 14, flex: 1 }}>
                    {msg}
                  </Text>
                  <TouchableOpacity onPress={() => setStreakDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ color: TEXT_MID, fontSize: 18, lineHeight: 20 }}>×</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            );
          })()}

          {/* Streak banner */}
          {cs >= 1 && (
            <LinearGradient
              colors={["rgba(79,142,247,0.1)", "rgba(124,92,252,0.05)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ marginTop: 14, marginBottom: 12, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER_P, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
            >
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 18 }}>{sEmoji}</Text>
                  <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13, letterSpacing: 1.5 }}>{sLabel}</Text>
                </View>
                <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{t.portfolio.streak.consecutive(cs)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{t.portfolio.streak.best}</Text>
                <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 28, marginTop: 2 }}>{bs}</Text>
              </View>
            </LinearGradient>
          )}

          {/* Daily challenge nudge — drives return visits */}
          {stats.open > 0 && (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)")}
              style={{ marginTop: cs >= 1 ? 0 : 14, marginBottom: 10 }}
            >
              <LinearGradient
                colors={["rgba(247,147,26,0.1)", "rgba(124,92,252,0.06)"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(247,147,26,0.25)", flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Text style={{ fontSize: 22 }}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#F7931A", fontFamily: "DMSans_700Bold", fontSize: 13 }}>
                    {language === "pt" ? `${stats.open} aposta${stats.open > 1 ? "s" : ""} em aberto` : `${stats.open} open bet${stats.open > 1 ? "s" : ""} pending`}
                  </Text>
                  <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 2 }}>
                    {language === "pt" ? "Toque para ver novos mercados →" : "Tap to explore more markets →"}
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Balance card */}
          <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 20, marginTop: cs >= 1 || stats.open > 0 ? 0 : 14, marginBottom: 12, borderWidth: 1, borderColor: BORDER_P }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>{t.portfolio.balance}</Text>
            <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 36, letterSpacing: -1, marginTop: 6 }}>
              {account ? `$${Number(account.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
            </Text>

            {/* Stat pills */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              {[
                { label: t.portfolio.total, value: stats.total, color: TEXT },
                { label: t.portfolio.open,  value: stats.open,  color: "#60A5FA" },
                { label: t.portfolio.won,   value: stats.won,   color: GREEN },
                { label: t.portfolio.lost,  value: stats.lost,  color: RED },
              ].map(s => (
                <View key={s.label} style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: BORDER }}>
                  <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{s.label}</Text>
                  <Text style={{ color: s.color, fontFamily: "DMSans_700Bold", fontSize: 18, marginTop: 4 }}>{s.value}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 1, backgroundColor: "rgba(124,92,252,0.1)", marginVertical: 14 }} />

            {/* P&L row — uses formatPnl for consistent signed formatting */}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{t.portfolio.totalPnl}</Text>
                <Text style={{ color: pnlPos ? GREEN : RED, fontFamily: "DMSans_700Bold", fontSize: 22, marginTop: 4 }}>
                  {formatPnl(stats.totalPnl)}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{t.portfolio.winRate}</Text>
                <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 22, marginTop: 4 }}>{summary?.win_rate ?? 0}%</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{t.portfolio.wagered}</Text>
                <Text style={{ color: TEXT_SUB, fontFamily: "DMSans_700Bold", fontSize: 18, marginTop: 4 }}>${stats.totalWagered.toFixed(0)}</Text>
              </View>
            </View>
          </View>

          {/* Performance snapshot */}
          {summary && (
            <View style={{ backgroundColor: CARD, borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 14 }}>{t.portfolio.performance}</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {[
                  { label: t.portfolio.accuracy,   value: `${summary.accuracy_score}`, sub: "/100",                    color: PURPLE },
                  { label: t.portfolio.percentile, value: `${summary.percentile_rank}%`, sub: t.portfolio.vsOthers,   color: BLUE },
                  { label: t.portfolio.bestWin,    value: `+${summary.best_pnl.toFixed(0)}`, sub: t.portfolio.single, color: GREEN },
                ].map(s => (
                  <View key={s.label} style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: BORDER }}>
                    <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{s.label}</Text>
                    <Text style={{ color: s.color, fontFamily: "DMSans_700Bold", fontSize: 20, marginTop: 6 }}>{s.value}</Text>
                    <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_400Regular" }}>{s.sub}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Refresh */}
          <TouchableOpacity onPress={refreshAll} style={{ paddingVertical: 12, borderRadius: 14, alignItems: "center", marginBottom: 22, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.04)" }}>
            <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 1.2 }}>{t.portfolio.refresh}</Text>
          </TouchableOpacity>

          {loadingPortfolio && <View style={{ alignItems: "center", paddingVertical: 20 }}><ActivityIndicator color={PURPLE} /></View>}
          {portfolioError && (
            <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 16 }}>
              <Text style={{ color: RED }}>{portfolioError}</Text>
            </View>
          )}

          {predictions.length > 0 && (
            <>
              <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2, marginBottom: 8 }}>
                {t.portfolio.positions(predictions.length)}
              </Text>
              <WinCelebrationBanner topWin={latestWin} language={language} />
            </>
          )}

          {/* Empty state with CTA — no dead ends */}
          {predictions.length === 0 && !loadingPortfolio && (
            <View style={{ alignItems: "center", paddingTop: 40, paddingBottom: 20 }}>
              <Text style={{ color: PURPLE_D, fontSize: 28, marginBottom: 12 }}>◉</Text>
              <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium" }}>{t.portfolio.noPositions}</Text>
              <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 4, marginBottom: 20 }}>{t.portfolio.noPositionsSub}</Text>
              {/* Direct CTA — port from Claude's empty state pattern */}
              <TouchableOpacity onPress={() => router.push("/(tabs)")} style={{ borderRadius: 12, overflow: "hidden" }}>
                <LinearGradient colors={GRAD.BP} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 12, paddingHorizontal: 28 }}>
                  <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                    {language === "pt" ? "Ver mercados →" : "Browse Markets →"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Predictions list */}
          {predictions.map(p => {
            const pnlNum = p.pnl !== null ? Number(p.pnl) : null;
            const isSettled = p.status === "won" || p.status === "lost";
            const sc = statusStyle(p.status, t);
            const isWon = p.status === "won";
            const isClosingSoon = p.status === "open" && p.event_closes_at
              ? (new Date(p.event_closes_at).getTime() - Date.now()) < 2 * 3_600_000
                && new Date(p.event_closes_at).getTime() > Date.now()
              : false;
            return (
              <View key={p.id} style={{
                backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: isWon ? 1.5 : 1,
                borderColor: isWon ? "rgba(34,197,94,0.28)" : p.status === "lost" ? "rgba(239,68,68,0.12)" : BORDER,
                shadowColor: isWon ? GREEN : "transparent",
                shadowOpacity: isWon ? 0.2 : 0,
                shadowRadius: isWon ? 8 : 0,
                shadowOffset: isWon ? { width: 0, height: 0 } : { width: 0, height: 0 },
              }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 18 }}>{p.event_title}</Text>
                      {isClosingSoon && (
                        <View style={{ backgroundColor: "rgba(251,146,60,0.15)", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "rgba(251,146,60,0.35)" }}>
                          <Text style={{ color: "#FB923C", fontSize: 9, fontFamily: "DMSans_700Bold" }}>⏰ Closing soon</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: TEXT_MID, marginTop: 3, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{p.scenario_title}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <View style={{ backgroundColor: sc.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {p.status === "won" && <Text style={{ fontSize: 10 }}>🏆</Text>}
                      <Text style={{ color: sc.color, fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 0.8 }}>{sc.label}</Text>
                    </View>
                    {p.event_status === "resolved" && (
                      <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{t.portfolio.resolved}</Text>
                    )}
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 20, marginTop: 12 }}>
                  {[
                    { label: t.portfolio.wageredLabel, value: `$${Number(p.simulated_amount).toFixed(2)}` },
                    { label: t.portfolio.probLabel,    value: `${p.entry_probability}%` },
                    { label: t.portfolio.multLabel,    value: `${p.payout_multiplier}x` },
                  ].map(item => (
                    <View key={item.label}>
                      <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{item.label}</Text>
                      <Text style={{ color: TEXT_SUB, fontFamily: "DMSans_700Bold", fontSize: 13, marginTop: 2 }}>{item.value}</Text>
                    </View>
                  ))}
                </View>

                {pnlNum !== null && isSettled && (
                  <>
                    <View style={{ height: 1, backgroundColor: "rgba(124,92,252,0.08)", marginTop: 12, marginBottom: 10 }} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      {/* formatPnl ensures consistent "+$x.xx" / "-$x.xx" display */}
                      <Text style={{ color: pnlNum >= 0 ? GREEN : RED, fontFamily: "DMSans_700Bold", fontSize: 16 }}>
                        {formatPnl(pnlNum)}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        {p.settled_at && (
                          <Text style={{ color: TEXT_MID, fontSize: 10 }}>{timeAgo(p.settled_at, t)}</Text>
                        )}
                        <TouchableOpacity
                          onPress={() => setShareCard({
                            eventTitle:    p.event_title,
                            scenarioTitle: p.scenario_title,
                            pnl:           pnlNum,
                            wagered:       Number(p.simulated_amount),
                            multiplier:    Number(p.payout_multiplier),
                            entryProb:     Number(p.entry_probability),
                            status:        p.status,
                          })}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "rgba(124,92,252,0.25)", backgroundColor: "rgba(124,92,252,0.08)" }}
                        >
                          <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 9, letterSpacing: 0.8 }}>
                            {language === "pt" ? "COMPARTILHAR" : "SHARE"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}

                <Text style={{ color: TEXT_MID, marginTop: 8, fontSize: 10 }}>
                  #{p.id} · {timeAgo(p.created_at, t)}
                </Text>
              </View>
            );
          })}

        </ScrollView>
      </SafeAreaView>

      {shareCard && (
        <ShareCardModal data={shareCard} onClose={() => setShareCard(null)} language={language} />
      )}
    </View>
  );
}