import { useState, useCallback } from "react";
import {
  SafeAreaView, Text, View, ScrollView,
  ActivityIndicator, StatusBar, Dimensions, Platform,
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
const GREEN    = "#22C55E";
const RED      = "#EF4444";
const BLUE_A   = "#60A5FA";

const GRAD_CARD  = ["rgba(79,142,247,0.08)", "rgba(124,92,252,0.03)"] as const;
const SIDEBAR_W  = 300;

type Summary = {
  balance: number; total_predictions: number; open_count: number;
  won_count: number; lost_count: number; total_pnl: number; total_wagered: number;
  current_streak: number; best_streak: number; win_rate: number;
  accuracy_score: number; percentile_rank: number; avg_entry_prob: number;
  best_pnl: number; worst_pnl: number; avg_pnl_per_prediction: number;
};

function getGrade(a: number, t: any) {
  if (a >= 85) return { grade: "S", color: BLUE,    label: t.insights.gradeLabels.S };
  if (a >= 75) return { grade: "A", color: GREEN,   label: t.insights.gradeLabels.A };
  if (a >= 65) return { grade: "B", color: PURPLE,  label: t.insights.gradeLabels.B };
  if (a >= 55) return { grade: "C", color: TEXT_SUB,label: t.insights.gradeLabels.C };
  return            { grade: "D", color: RED,       label: t.insights.gradeLabels.D };
}

function StatRow({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{label}</Text>
        {sub && <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 2 }}>{sub}</Text>}
      </View>
      <Text style={{ color: color ?? TEXT, fontSize: 16, fontFamily: "DMSans_700Bold" }}>{value}</Text>
    </View>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: BORDER }}>
      {title && <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>{title}</Text>}
      {children}
    </View>
  );
}

export default function InsightsScreen() {
  const { userId } = useTrading();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [screenW, setScreenW] = useState(Dimensions.get("window").width);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const isWeb = Platform.OS === "web" && screenW >= 900;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError("");
    try { const res = await api.get(`/predictions/user/${userId}/summary`); setSummary(res.data); }
    catch { setError(t.insights.noData); }
    finally { setLoading(false); }
  }, [userId, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!fontsLoaded) return null;

  const grade = summary ? getGrade(summary.accuracy_score, t) : null;
  const pnlPos = (summary?.total_pnl ?? 0) >= 0;

  const mainContent = summary && grade ? (
    <>
      <LinearGradient colors={GRAD_CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, padding: 24, marginBottom: 12, borderWidth: 1, borderColor: BORDER_P }}>
        <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 16 }}>{t.insights.grade}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: grade.color, fontSize: 80, fontFamily: "DMSans_700Bold", lineHeight: 84, letterSpacing: -2 }}>{grade.grade}</Text>
            <Text style={{ color: grade.color, fontSize: 15, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{grade.label.toUpperCase()}</Text>
            <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 4 }}>{t.insights.calibration}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: PURPLE_D, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 4 }}>{t.insights.accuracy}</Text>
            <Text style={{ color: grade.color, fontSize: 48, fontFamily: "DMSans_700Bold", letterSpacing: -2 }}>{summary.accuracy_score}</Text>
            <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>/100</Text>
          </View>
        </View>
      </LinearGradient>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 8 }}>{t.insights.percentileRank}</Text>
            <Text style={{ color: TEXT, fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 20 }}>
              {t.insights.outperform(summary.percentile_rank)}
            </Text>
          </View>
          <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginLeft: 16, overflow: "hidden" }}>
            <LinearGradient colors={[PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", width: "100%", height: "100%", borderRadius: 36 }} />
            <Text style={{ color: "white", fontSize: 19, fontFamily: "DMSans_700Bold" }}>{summary.percentile_rank}%</Text>
          </View>
        </View>
      </Card>

      <Card title={t.insights.tradingStats}>
        <StatRow label={t.insights.totalPreds}    value={`${summary.total_predictions}`} />
        <StatRow label={t.insights.winRate}        value={`${summary.win_rate}%`}          color={summary.win_rate >= 50 ? GREEN : RED} />
        <StatRow label={t.insights.accuracyScore}  value={`${summary.accuracy_score}/100`} color={grade.color} sub={t.insights.brierSub} />
        <StatRow label={t.insights.avgEntry}       value={`${summary.avg_entry_prob}%`}    color={TEXT_SUB} sub={t.insights.avgEntrySub} />
        <StatRow label={t.insights.currentStreak}  value={`🔥 ${summary.current_streak}`}  color={summary.current_streak > 0 ? "#FB923C" : TEXT_SUB} />
        <StatRow label={t.insights.bestStreak}     value={t.insights.wins(summary.best_streak)} color={PURPLE} />
      </Card>

      <Card title={t.insights.pnlBreakdown}>
        <StatRow label={t.insights.totalPnl}   value={`${pnlPos ? "+" : ""}${Number(summary.total_pnl).toFixed(2)}`} color={pnlPos ? GREEN : RED} />
        <StatRow label={t.insights.avgPnl}     value={`${summary.avg_pnl_per_prediction >= 0 ? "+" : ""}${summary.avg_pnl_per_prediction.toFixed(2)}`} color={summary.avg_pnl_per_prediction >= 0 ? GREEN : RED} />
        <StatRow label={t.insights.bestPred}   value={`+${summary.best_pnl.toFixed(2)}`}  color={GREEN} />
        <StatRow label={t.insights.worstPred}  value={`${summary.worst_pnl.toFixed(2)}`}  color={RED} />
        <StatRow label={t.insights.totalWagered} value={`$${Number(summary.total_wagered).toFixed(0)}`} color={TEXT_SUB} />
      </Card>

      <Card title={t.insights.positionSummary}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: t.portfolio.open, value: summary.open_count, color: BLUE_A },
            { label: t.portfolio.won,  value: summary.won_count,  color: GREEN },
            { label: t.portfolio.lost, value: summary.lost_count, color: RED },
          ].map(s => (
            <View key={s.label} style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{s.label}</Text>
              <Text style={{ color: s.color, fontSize: 26, fontFamily: "DMSans_700Bold", marginTop: 6 }}>{s.value}</Text>
            </View>
          ))}
        </View>
      </Card>
    </>
  ) : null;

  const gradeScale = [
    { grade: "S", range: "85–100", color: BLUE },
    { grade: "A", range: "75–84",  color: GREEN },
    { grade: "B", range: "65–74",  color: PURPLE },
    { grade: "C", range: "55–64",  color: TEXT_SUB },
    { grade: "D", range: "0–54",   color: RED },
  ];

  const sidebar = summary && grade ? (
    <View style={{ gap: 12 }}>
      <Card title={t.insights.gradeScale}>
        {gradeScale.map(g => (
          <View key={g.grade} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}>
            <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: `${g.color}15`, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${g.color}30` }}>
              <Text style={{ color: g.color, fontFamily: "DMSans_700Bold", fontSize: 15 }}>{g.grade}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: g.grade === grade.grade ? g.color : TEXT_SUB, fontFamily: "DMSans_700Bold", fontSize: 13 }}>
                {(t.insights.gradeLabels as any)[g.grade]}{g.grade === grade.grade ? `  ${t.insights.youLabel}` : ""}
              </Text>
              <Text style={{ color: TEXT_MID, fontFamily: "DMSans_400Regular", fontSize: 11 }}>{t.insights.score(g.range)}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card title={t.insights.quickStats}>
        {[
          { label: t.insights.balance,  value: `$${Number(summary.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: TEXT },
          { label: t.insights.winRate,  value: `${summary.win_rate}%`, color: summary.win_rate >= 50 ? GREEN : RED },
          { label: t.insights.totalPnl, value: `${pnlPos ? "+" : ""}${Number(summary.total_pnl).toFixed(2)}`, color: pnlPos ? GREEN : RED },
          { label: t.insights.accuracy, value: `${summary.accuracy_score}/100`, color: grade.color },
        ].map(s => (
          <View key={s.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
            <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{s.label}</Text>
            <Text style={{ color: s.color, fontSize: 13, fontFamily: "DMSans_700Bold" }}>{s.value}</Text>
          </View>
        ))}
      </Card>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>{t.common.scenara}</Text>
          <Text style={{ color: TEXT, fontSize: 26, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, marginTop: 4 }}>{t.insights.title}</Text>
        </View>

        {loading && <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color={PURPLE} /></View>}
        {error ? <View style={{ margin: 20, padding: 12, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}><Text style={{ color: RED }}>{error}</Text></View> : null}

        {!summary && !loading && !error && (
          <View style={{ alignItems: "center", paddingTop: 80 }}>
            <Text style={{ color: PURPLE_D, fontSize: 32, marginBottom: 12 }}>◎</Text>
            <Text style={{ color: TEXT_SUB, fontSize: 16, fontFamily: "DMSans_500Medium" }}>{t.insights.noData}</Text>
            <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 4 }}>{t.insights.noDataSub}</Text>
          </View>
        )}

        {summary && (
          isWeb ? (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", padding: 20, gap: 16, alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>{mainContent}</View>
                <View style={{ width: SIDEBAR_W }}>{sidebar}</View>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
              {mainContent}
              {sidebar}
            </ScrollView>
          )
        )}
      </SafeAreaView>
    </View>
  );
}
