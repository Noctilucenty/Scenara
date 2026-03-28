import { useMemo, useState, useCallback, useRef } from "react";
import {
  SafeAreaView, Text, View, ScrollView,
  ActivityIndicator, TouchableOpacity, StatusBar, Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";
import { api } from "@/src/api/client";

const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const BLUE     = "#4F8EF7";
const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";
const BLUE_A   = "#60A5FA";

const AUTO_REFRESH_MS = 30_000;

type PortfolioSummary = {
  current_streak: number; best_streak: number; win_rate: number;
  accuracy_score: number; percentile_rank: number; best_pnl: number; worst_pnl: number;
};

function timeAgo(d?: string | null, t?: any): string {
  if (!d || !t) return "";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return t.common.justNow;
  if (s < 3600) return t.common.mAgo(Math.floor(s / 60));
  if (s < 86400) return t.common.hAgo(Math.floor(s / 3600));
  return t.common.dAgo(Math.floor(s / 86400));
}

function statusStyle(status: string, t: any) {
  if (status === "won")  return { color: GREEN,    bg: "rgba(34,197,94,0.1)",   label: t.portfolio.won };
  if (status === "lost") return { color: RED,      bg: "rgba(239,68,68,0.1)",   label: t.portfolio.lost };
  if (status === "void") return { color: TEXT_MID, bg: "rgba(100,116,139,0.1)", label: "VOID" };
  return                        { color: BLUE_A,   bg: "rgba(96,165,250,0.1)",  label: t.portfolio.open };
}

function streakMeta(n: number, t: any) {
  if (n >= 10) return { emoji: "🔥🔥🔥", label: t.portfolio.streak.unstoppable };
  if (n >= 7)  return { emoji: "🔥🔥",   label: t.portfolio.streak.onFire };
  if (n >= 5)  return { emoji: "🔥",     label: t.portfolio.streak.hotStreak };
  if (n >= 3)  return { emoji: "⚡",     label: t.portfolio.streak.streak };
  if (n >= 1)  return { emoji: "✦",     label: t.portfolio.streak.winning };
  return             { emoji: "",       label: "" };
}

// ── ShareCardModal ────────────────────────────────────────────────────────────
type ShareCardData = {
  eventTitle: string;
  scenarioTitle: string;
  pnl: number;
  wagered: number;
  multiplier: number;
  entryProb: number;
  status: string;
};

function ShareCardModal({ data, onClose, language }: { data: ShareCardData; onClose(): void; language: string }) {
  const isWin = data.pnl >= 0;
  const pnlStr = `${isWin ? "+" : ""}$${Math.abs(data.pnl).toFixed(2)}`;

  return (
    <Modal visible animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center", padding: 24 }}>

        {/* Card */}
        <View style={{ width: "100%", maxWidth: 380, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: isWin ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }}>
          <LinearGradient colors={isWin ? ["#0a1f14", "#08090C"] : ["#1f0a0a", "#08090C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 28 }}>

            {/* Top row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              {/* Wordmark */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 18, height: 18, borderRadius: 4, overflow: "hidden" }}>
                  <LinearGradient colors={["#4F8EF7", "#7C5CFC", "#F050AE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 10, fontFamily: "DMSans_700Bold" }}>S</Text>
                  </LinearGradient>
                </View>
                <Text style={{ color: "#F1F5F9", fontSize: 14, fontFamily: "DMSans_700Bold", letterSpacing: -0.3 }}>scenara</Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: isWin ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: isWin ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }}>
                <Text style={{ color: isWin ? "#22C55E" : "#EF4444", fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 1 }}>
                  {isWin ? (language === "pt" ? "GANHOU" : "WON") : (language === "pt" ? "PERDEU" : "LOST")}
                </Text>
              </View>
            </View>

            {/* Event title */}
            <Text style={{ color: "#64748B", fontSize: 11, fontFamily: "DMSans_500Medium", marginBottom: 6 }} numberOfLines={2}>{data.eventTitle}</Text>
            <Text style={{ color: "#F1F5F9", fontSize: 17, fontFamily: "DMSans_700Bold", lineHeight: 24, marginBottom: 24 }} numberOfLines={2}>{data.scenarioTitle}</Text>

            {/* PnL */}
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <Text style={{ color: "#64748B", fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 8 }}>
                {language === "pt" ? "RESULTADO" : "RESULT"}
              </Text>
              <LinearGradient colors={isWin ? ["#22C55E", "#16a34a"] : ["#EF4444", "#dc2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14 }}>
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 36, letterSpacing: -1 }}>{pnlStr}</Text>
              </LinearGradient>
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14, marginBottom: 20 }}>
              {[
                { label: language === "pt" ? "APOSTADO" : "WAGERED", value: `$${data.wagered.toFixed(0)}` },
                { label: language === "pt" ? "ENTRADA" : "ENTRY PROB", value: `${data.entryProb}%` },
                { label: "MULT", value: `${data.multiplier}x` },
              ].map(s => (
                <View key={s.label} style={{ alignItems: "center" }}>
                  <Text style={{ color: "#64748B", fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{s.label}</Text>
                  <Text style={{ color: "#F1F5F9", fontFamily: "DMSans_700Bold", fontSize: 15, marginTop: 4 }}>{s.value}</Text>
                </View>
              ))}
            </View>

            {/* Footer */}
            <Text style={{ color: "#64748B", fontSize: 10, fontFamily: "DMSans_400Regular", textAlign: "center" }}>
              scenara.app  ·  {language === "pt" ? "Mercado de Previsões Simulado" : "Simulated Prediction Market"}
            </Text>
          </LinearGradient>
        </View>

        {/* Instructions */}
        <Text style={{ color: "#64748B", fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 20, marginBottom: 24 }}>
          {language === "pt" ? "Tire um print para compartilhar" : "Take a screenshot to share"}
        </Text>

        {/* Close */}
        <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 32, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(124,92,252,0.2)", backgroundColor: "rgba(124,92,252,0.08)" }}>
          <Text style={{ color: "#4A3699", fontFamily: "DMSans_700Bold", fontSize: 13, letterSpacing: 0.5 }}>
            {language === "pt" ? "Fechar" : "Close"}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function PortfolioScreen() {
  const { account, predictions, loadingPortfolio, portfolioError, refreshPortfolio, userId } = useTrading();
  const { t, language } = useLanguage();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [shareCard, setShareCard] = useState<ShareCardData | null>(null);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocused = useRef(false);

  const fetchSummary = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api.get(`/predictions/user/${userId}/summary`);
      setSummary({
        current_streak: res.data.current_streak ?? 0,
        best_streak: res.data.best_streak ?? 0,
        win_rate: res.data.win_rate ?? 0,
        accuracy_score: res.data.accuracy_score ?? 0,
        percentile_rank: res.data.percentile_rank ?? 0,
        best_pnl: res.data.best_pnl ?? 0,
        worst_pnl: res.data.worst_pnl ?? 0,
      });
    } catch { }
  }, [userId]);

  const refreshAll = useCallback(() => {
    refreshPortfolio();
    fetchSummary();
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
    const won = predictions.filter(p => p.status === "won").length;
    const lost = predictions.filter(p => p.status === "lost").length;
    const open = predictions.filter(p => p.status === "open").length;
    const totalPnl = predictions.reduce((s, p) => s + (p.pnl ? Number(p.pnl) : 0), 0);
    const totalWagered = predictions.reduce((s, p) => s + Number(p.simulated_amount), 0);
    return { won, lost, open, total: predictions.length, totalPnl, totalWagered };
  }, [predictions]);

  if (!fontsLoaded) return null;

  const pnlPos = stats.totalPnl >= 0;
  const streak = streakMeta(summary?.current_streak ?? 0, t);
  const cs = summary?.current_streak ?? 0;
  const bs = summary?.best_streak ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>{t.common.scenara}</Text>
          <Text style={{ color: TEXT, fontSize: 26, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, marginTop: 4 }}>{t.portfolio.title}</Text>
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {cs >= 1 && (
            <LinearGradient colors={["rgba(79,142,247,0.1)", "rgba(124,92,252,0.05)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ marginTop: 14, marginBottom: 12, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER_P, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 18 }}>{streak.emoji}</Text>
                  <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13, letterSpacing: 1.5 }}>{streak.label}</Text>
                </View>
                <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{t.portfolio.streak.consecutive(cs)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{t.portfolio.streak.best}</Text>
                <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 28, marginTop: 2 }}>{bs}</Text>
              </View>
            </LinearGradient>
          )}

          <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 20, marginTop: cs >= 1 ? 0 : 14, marginBottom: 12, borderWidth: 1, borderColor: BORDER_P }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>{t.portfolio.balance}</Text>
            <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 36, letterSpacing: -1, marginTop: 6 }}>
              {account ? `$${Number(account.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              {[
                { label: t.portfolio.total, value: stats.total, color: TEXT },
                { label: t.portfolio.open,  value: stats.open,  color: BLUE_A },
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
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{t.portfolio.totalPnl}</Text>
                <Text style={{ color: pnlPos ? GREEN : RED, fontFamily: "DMSans_700Bold", fontSize: 22, marginTop: 4 }}>{pnlPos ? "+" : ""}{stats.totalPnl.toFixed(2)}</Text>
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

          {summary && (
            <View style={{ backgroundColor: CARD, borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 14 }}>{t.portfolio.performance}</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {[
                  { label: t.portfolio.accuracy,   value: `${summary.accuracy_score}`, sub: "/100",                   color: PURPLE },
                  { label: t.portfolio.percentile, value: `${summary.percentile_rank}%`, sub: t.portfolio.vsOthers,  color: BLUE },
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

          <TouchableOpacity onPress={refreshAll} style={{ paddingVertical: 12, borderRadius: 14, alignItems: "center", marginBottom: 22, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.04)" }}>
            <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 1.2 }}>{t.portfolio.refresh}</Text>
          </TouchableOpacity>

          {loadingPortfolio && <View style={{ alignItems: "center", paddingVertical: 20 }}><ActivityIndicator color={PURPLE} /></View>}
          {portfolioError && <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 16 }}><Text style={{ color: RED }}>{portfolioError}</Text></View>}

          {predictions.length > 0 && (
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2, marginBottom: 12 }}>{t.portfolio.positions(predictions.length)}</Text>
          )}

          {predictions.length === 0 && !loadingPortfolio && (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Text style={{ color: PURPLE_D, fontSize: 28, marginBottom: 12 }}>◉</Text>
              <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium" }}>{t.portfolio.noPositions}</Text>
              <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 4 }}>{t.portfolio.noPositionsSub}</Text>
            </View>
          )}

          {predictions.map(p => {
            const pnlNum = p.pnl !== null ? Number(p.pnl) : null;
            const isSettled = p.status === "won" || p.status === "lost";
            const sc = statusStyle(p.status, t);
            return (
              <View key={p.id} style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: p.status === "won" ? "rgba(34,197,94,0.15)" : p.status === "lost" ? "rgba(239,68,68,0.12)" : BORDER }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 18 }}>{p.event_title}</Text>
                    <Text style={{ color: TEXT_MID, marginTop: 3, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{p.scenario_title}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <View style={{ backgroundColor: sc.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 }}>
                      <Text style={{ color: sc.color, fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 0.8 }}>{sc.label}</Text>
                    </View>
                    {p.event_status === "resolved" && <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{t.portfolio.resolved}</Text>}
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
                      <Text style={{ color: pnlNum >= 0 ? GREEN : RED, fontFamily: "DMSans_700Bold", fontSize: 16 }}>{pnlNum >= 0 ? "+" : ""}{pnlNum.toFixed(2)}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        {p.settled_at && <Text style={{ color: TEXT_MID, fontSize: 10 }}>{timeAgo(p.settled_at, t)}</Text>}
                        <TouchableOpacity
                          onPress={() => setShareCard({
                            eventTitle: p.event_title,
                            scenarioTitle: p.scenario_title,
                            pnl: pnlNum,
                            wagered: Number(p.simulated_amount),
                            multiplier: Number(p.payout_multiplier),
                            entryProb: Number(p.entry_probability),
                            status: p.status,
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
                <Text style={{ color: "#1C1F28", marginTop: 8, fontSize: 10 }}>#{p.id} · {timeAgo(p.created_at, t)}</Text>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
      {shareCard && <ShareCardModal data={shareCard} onClose={() => setShareCard(null)} language={language} />}
    </View>
  );
}