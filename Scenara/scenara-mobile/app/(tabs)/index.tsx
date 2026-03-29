import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import React from "react";
import {
  SafeAreaView, Text, ScrollView, View,
  TouchableOpacity, ActivityIndicator, Modal,
  TextInput, Alert, StatusBar, Dimensions, Platform, Linking, Image,
} from "react-native";import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";
import { CommentSection } from "@/components/CommentSection";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SidebarContext } from "./_layout";

const AUTO_REFRESH_MS = 60_000; // 60s - was 30s, reduces server load
import { ProbabilityChart, ScenarioHistory, SCENARIO_COLORS } from "@/components/ProbabilityChart";

// --- Scenara brand tokens -------------------------------------------------------
const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const BLUE     = "#4F8EF7";
const PURPLE   = "#7C5CFC";
const PINK     = "#F050AE";
const BLUE_D   = "#2A5CB8";
const PURPLE_D = "#4A3699";
const PINK_D   = "#8C2E67";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

const GRAD_BRAND   = [BLUE, PURPLE, PINK]     as const;
const GRAD_BP      = [BLUE, PURPLE]           as const;
const GRAD_PP      = [PURPLE, PINK]           as const;
const GRAD_GREEN   = ["#15803D", GREEN]       as const;
const GRAD_RED     = ["#991B1B", RED]         as const;
const GRAD_CARD    = ["rgba(79,142,247,0.07)", "rgba(124,92,252,0.03)"] as const;

// --- Category metadata (static colors/icons, labels come from i18n) -------------
const CAT_META: Record<string, { icon: string; color: string }> = {
  all:           { icon: "⚡", color: PURPLE   },
  politics:      { icon: "🏛",  color: "#818CF8" },
  economy:       { icon: "📈", color: "#34D399" },
  crypto:        { icon: "₿",  color: "#F7931A" },
  sports:        { icon: "⚽", color: "#60A5FA" },
  technology:    { icon: "💻", color: "#A78BFA" },
  geopolitics:   { icon: "🌍", color: "#FB923C" },
  entertainment: { icon: "🎬", color: "#F472B6" },
  music:         { icon: "🎵", color: "#C084FC" },
  tv:            { icon: "📺", color: "#22D3EE" },
  science:       { icon: "🔬", color: "#86EFAC" },
  weather:       { icon: "🌦",  color: "#7DD3FC" },
};
function catMeta(c: string) { return CAT_META[c] ?? { icon: "◈", color: PURPLE }; }

// --- Responsive -----------------------------------------------------------------
function getLayout(w: number) {
  const isWeb   = w >= 900;
  const isBig   = w >= 1300;
  const cols    = isBig ? 4 : isWeb ? 3 : 2;
  const sideW   = isBig ? 320 : 280;
  const mainW   = isWeb ? w - sideW - 32 - 16 : w;
  const gap     = 10;
  const padH    = 16;
  const cardW   = (mainW - padH * 2 - gap * (cols - 1)) / cols;
  return { isWeb, cols, sideW, gap, padH, cardW };
}

// --- Types ----------------------------------------------------------------------
type Scenario  = { id: number; title: string; title_pt?: string | null; probability: number; sort_order: number; status: string };
type EventItem = { id: number; slug: string; title: string; title_pt?: string | null; description?: string | null; description_pt?: string | null; category: string; status: string; resolution_note?: string | null; is_featured: boolean; closes_at?: string | null; resolved_at?: string | null; scenarios: Scenario[] };
type ResolveTarget = { eventId: number; eventTitle: string; scenarios: Scenario[] };
type DetailTarget  = { event: EventItem; history: ScenarioHistory[] };

// --- Bilingual helpers -----------------------------------------------------------
function eventTitle(event: EventItem, lang: string): string {
  return lang === "pt" && (event as any).title_pt ? (event as any).title_pt : event.title;
}
function eventDesc(event: EventItem, lang: string): string | null | undefined {
  return lang === "pt" && (event as any).description_pt ? (event as any).description_pt : event.description;
}
function scenarioTitle(s: Scenario | undefined | null, lang: string): string {
  if (!s) return "";
  return lang === "pt" && s.title_pt ? s.title_pt : s.title;
}

function timeAgo(d?: string | null, t?: any): string {
  if (!d) return "";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (!t) {
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  if (s < 60) return t.common.justNow;
  if (s < 3600) return t.common.mAgo(Math.floor(s / 60));
  if (s < 86400) return t.common.hAgo(Math.floor(s / 3600));
  return t.common.dAgo(Math.floor(s / 86400));
}

// --- ScenaraWordmark SVG --------------------------------------------------------
function ScenaraWordmark({ size = 22 }: { size?: number }) {
  // Inline SVG chevron icon matching the logo, scaled
  const iconH = size * 1.2;
  const iconW = size * 1.0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Svg width={iconW * 0.6} height={iconH * 0.6} viewBox="0 0 40 48">
        <Defs>
          <SvgGrad id="wm" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={BLUE} />
            <Stop offset="0.5" stopColor={PURPLE} />
            <Stop offset="1" stopColor={PINK} />
          </SvgGrad>
        </Defs>
        {/* Stylized chevron lines matching logo */}
        <Path d="M4 4 L20 36 L36 4" stroke="url(#wm)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8 10 L20 30 L32 10" stroke="url(#wm)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
        <Path d="M12 16 L20 28 L28 16" stroke="url(#wm)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      </Svg>
      <Text style={{ color: TEXT, fontSize: size, fontFamily: "DMSans_700Bold", letterSpacing: -0.3 }}>
        scenara
      </Text>
    </View>
  );
}

// --- ArcGauge -------------------------------------------------------------------
function ArcGauge({ probability, size = 58, t }: { probability: number; size?: number; t?: any }) {
  const cx = size / 2, cy = size / 2, r = size * 0.37, sw = size * 0.09;
  const START = 135, SWEEP = 270;
  function pt(a: number) { const rad = ((a - 90) * Math.PI) / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; }
  function arc(a1: number, a2: number) { const s = pt(a1), e = pt(a2), lg = a2 - a1 > 180 ? 1 : 0; return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`; }
  const end = START + (Math.min(Math.max(probability, 1), 99) / 100) * SWEEP;
  // Color follows Scenara gradient based on probability
  const fillColor = probability >= 60 ? BLUE : probability >= 40 ? PURPLE : PINK;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <SvgGrad id={`gauge${Math.round(probability)}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BLUE} />
            <Stop offset="0.5" stopColor={PURPLE} />
            <Stop offset="1" stopColor={PINK} />
          </SvgGrad>
        </Defs>
        <Path d={arc(START, START + SWEEP)} stroke="rgba(255,255,255,0.07)" strokeWidth={sw} fill="none" strokeLinecap="round" />
        <Path d={arc(START, end)} stroke={`url(#gauge${Math.round(probability)})`} strokeWidth={sw} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: TEXT, fontSize: size * 0.19, fontFamily: "DMSans_700Bold", includeFontPadding: false }}>{Math.round(probability)}%</Text>
        <Text style={{ color: TEXT_MID, fontSize: size * 0.11, fontFamily: "DMSans_400Regular", includeFontPadding: false, marginTop: -1 }}>{t?.common?.chance ?? "chance"}</Text>
      </View>
    </View>
  );
}

// --- ResolveModal ----------------------------------------------------------------
function ResolveModal({ target, onClose, onResolved, t, language }: { target: ResolveTarget; onClose(): void; onResolved(): void; t: any; language: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!sel) return; setBusy(true);
    try {
      const r = await api.post(`/events/${target.eventId}/resolve`, { winning_scenario_id: sel });
      Alert.alert("✓ " + t.markets.resolveMarket, `${r.data.total_winners ?? 0} winner(s) paid out`, [{ text: "Done", onPress: () => { onResolved(); onClose(); } }]);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? "";
      if (detail.toLowerCase().includes("already resolved")) {
        Alert.alert("Already Resolved", "This market was already resolved automatically.", [{ text: "OK", onPress: () => { onResolved(); onClose(); } }]);
      } else {
        Alert.alert("Error", detail || "Failed to resolve");
      }
    }
    finally { setBusy(false); }
  };
  return (
    <Modal visible animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderTopColor: BORDER_P }}>
          <View style={{ width: 36, height: 3, borderRadius: 2, alignSelf: "center", marginBottom: 24, overflow: "hidden" }}>
            <LinearGradient colors={GRAD_BP} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </View>
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2, marginBottom: 4 }}>{t.markets.resolveMarket}</Text>
          <Text style={{ color: TEXT, fontSize: 16, fontFamily: "DMSans_700Bold", marginBottom: 20 }}>{target.eventTitle}</Text>
          {target.scenarios.map((s, i) => {
            const on = sel === s.id, c = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
            return (
              <TouchableOpacity key={s.id} onPress={() => setSel(s.id)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: on ? c : BORDER, backgroundColor: on ? `${c}10` : "rgba(255,255,255,0.02)", borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: on ? c : TEXT_MID, backgroundColor: on ? c : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {on && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BG }} />}
                  </View>
                  <Text style={{ color: on ? c : TEXT_SUB, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{scenarioTitle(s, language)}</Text>
                </View>
                <Text style={{ color: TEXT_MID, fontSize: 13 }}>{s.probability.toFixed(1)}%</Text>
              </TouchableOpacity>
            );
          })}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TouchableOpacity onPress={onClose} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: "center" }}>
              <Text style={{ color: TEXT_SUB, fontFamily: "DMSans_500Medium" }}>{t.markets.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} disabled={!sel || busy} style={{ flex: 2, borderRadius: 12, overflow: "hidden" }}>
              <LinearGradient colors={sel && !busy ? GRAD_BP : ["#111", "#111"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
                {busy ? <ActivityIndicator color={BG} /> : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>{t.markets.confirmWinner}</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailPanelContent({ target, onClose, onResolve, placingId, amounts, onAmountChange, onPredict, t, language }: {
  target: DetailTarget; onClose(): void; onResolve(): void;
  placingId: number | null; amounts: Record<number, string>;
  onAmountChange(id: number, val: string): void; onPredict(id: number): void; t: any; language: string;
}) {
  const { event, history } = target;
  const resolved = event.status === "resolved";
  const cm = catMeta(event.category);
  const hasChart = history.some(s => s.points.length >= 2);
  const [selId, setSelId] = useState<number | null>(event.scenarios[0]?.id ?? null);
  const selScene = event.scenarios.find(s => s.id === selId) ?? event.scenarios[0];
  const selIdx   = event.scenarios.findIndex(s => s.id === selId);
  const title = eventTitle(event, language);
  const desc  = eventDesc(event, language);

  // Crowd sentiment
  const [sentiment, setSentiment] = useState<{ total: number; scenarios: { id: number; pct: number; title: string; title_pt: string | null }[] } | null>(null);
  useEffect(() => {
    api.get(`/predictions/events/${event.id}/sentiment`)
      .then(r => {
        if (r.data.total_players > 0) {
          setSentiment({
            total: r.data.total_players,
            scenarios: r.data.scenarios.map((s: any) => ({ id: s.scenario_id, pct: s.percentage, title: s.scenario_title, title_pt: s.scenario_title_pt })),
          });
        }
      })
      .catch(() => {});
  }, [event.id]);

  // Related news - search in user's language only
  const [relatedNews, setRelatedNews] = useState<{ title: string; url: string; source: string; image: string; published: string }[]>([]);
  useEffect(() => {
    const stopWords = new Set(["will", "that", "this", "from", "with", "before", "after", "above", "below", "their", "between", "which", "where", "what", "when", "into", "about", "have", "been", "more", "than", "some", "over", "also", "para", "sera", "vai", "ficar", "estar", "pelo", "pela", "mais", "como", "uma", "que"]);
    const words = event.title
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()))
      .slice(0, 4);
    if (words.length === 0) return;
    // Single language only - no mixed feed
    api.get("/news/single", {
      params: { category: event.category, lang: language === "pt" ? "pt" : "en", max_results: 6 }
    })
      .then(r => {
        const articles = r.data.articles ?? [];
        const scored = articles.map((a: any) => {
          const score = words.filter(w => a.title.toLowerCase().includes(w.toLowerCase())).length;
          return { ...a, score };
        }).sort((x: any, y: any) => y.score - x.score);
        setRelatedNews(scored.slice(0, 3));
      })
      .catch(() => {});
  }, [event.id, language]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <View style={{ backgroundColor: `${cm.color}15`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: `${cm.color}25` }}>
          <Text style={{ color: cm.color, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{cm.icon}  {((t.markets as any)[event.category] ?? event.category).toUpperCase()}</Text>
        </View>
        {!resolved
          ? <View style={{ backgroundColor: "rgba(34,197,94,0.1)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}><Text style={{ color: GREEN, fontSize: 10, fontFamily: "DMSans_700Bold" }}>{t.common.live}</Text></View>
          : <View style={{ backgroundColor: "rgba(100,116,139,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}><Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold" }}>{t.markets.closed}</Text></View>
        }
        <TouchableOpacity onPress={onClose} style={{ marginLeft: "auto", padding: 4 }}>
          <Text style={{ color: TEXT_MID, fontSize: 18, lineHeight: 20 }}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: TEXT, fontSize: 18, fontFamily: "DMSans_700Bold", lineHeight: 26, marginBottom: 6 }}>{title}</Text>
      {desc && <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 19, marginBottom: 16 }}>{desc}</Text>}

      {hasChart && (
        <View style={{ backgroundColor: "rgba(124,92,252,0.04)", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "rgba(124,92,252,0.12)" }}>
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.2, marginBottom: 10 }}>{t.markets.probHistory}</Text>
          <ProbabilityChart scenarios={history} height={160} compact={false} />
        </View>
      )}

      {/* Crowd sentiment */}
      {sentiment && sentiment.total > 0 && (
        <View style={{ backgroundColor: "rgba(124,92,252,0.04)", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "rgba(124,92,252,0.1)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.2 }}>
              {language === "pt" ? "COMO OS JOGADORES APOSTARAM" : "HOW PLAYERS BET"}
            </Text>
            <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium" }}>
              {sentiment.total} {language === "pt" ? (sentiment.total === 1 ? "jogador" : "jogadores") : (sentiment.total === 1 ? "player" : "players")}
            </Text>
          </View>
          {sentiment.scenarios.map((s, idx) => {
            const c = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
            const label = language === "pt" && s.title_pt ? s.title_pt : s.title;
            return (
              <View key={s.id} style={{ marginBottom: idx < sentiment.scenarios.length - 1 ? 10 : 0 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                  <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_500Medium" }}>{label}</Text>
                  <Text style={{ color: c, fontSize: 12, fontFamily: "DMSans_700Bold" }}>{s.pct.toFixed(0)}%</Text>
                </View>
                <View style={{ height: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ width: `${s.pct}%`, height: "100%", backgroundColor: c, borderRadius: 3, opacity: 0.85 }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.2, marginBottom: 10 }}>{t.markets.outcomes}</Text>
      {event.scenarios.map((s, idx) => {
        const won  = resolved && s.status === "won";
        const lost = resolved && s.status === "lost";
        const c    = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
        const sel  = selId === s.id;
        return (
          <TouchableOpacity key={s.id} onPress={() => !resolved && setSelId(s.id)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6, borderWidth: 1, backgroundColor: sel ? `${c}08` : "rgba(255,255,255,0.02)", borderColor: sel ? `${c}30` : "rgba(255,255,255,0.06)" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: won ? c : TEXT, fontFamily: "DMSans_700Bold", fontSize: 14 }}>{scenarioTitle(s, language)}{won ? "  ✓" : lost ? "  ✗" : ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={{ color: won ? c : TEXT, fontFamily: "DMSans_700Bold", fontSize: 16 }}>{s.probability.toFixed(1)}%</Text>
              <View style={{ width: 80, height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <View style={{ width: `${s.probability}%`, height: "100%", backgroundColor: c, borderRadius: 2 }} />
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {!resolved && selScene && (
        <View style={{ marginTop: 16, backgroundColor: SURFACE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER_P }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            <TouchableOpacity onPress={() => setSelId(event.scenarios[0]?.id)} style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
              <LinearGradient colors={selIdx === 0 ? GRAD_GREEN : ["rgba(34,197,94,0.1)", "rgba(34,197,94,0.1)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ color: selIdx === 0 ? "white" : GREEN, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{scenarioTitle(event.scenarios[0], language)}  {event.scenarios[0]?.probability.toFixed(0)}%</Text>
              </LinearGradient>
            </TouchableOpacity>
            {event.scenarios[1] && (
              <TouchableOpacity onPress={() => setSelId(event.scenarios[1].id)} style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
                <LinearGradient colors={selIdx === 1 ? GRAD_RED : ["rgba(239,68,68,0.1)", "rgba(239,68,68,0.1)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: selIdx === 1 ? "white" : RED, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{scenarioTitle(event.scenarios[1], language)}  {event.scenarios[1]?.probability.toFixed(0)}%</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 8 }}>{t.markets.amount}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, marginBottom: 10 }}>
            <Text style={{ color: PURPLE_D, fontSize: 16, marginRight: 4 }}>$</Text>
            <TextInput value={amounts[selScene.id] ?? "100"} onChangeText={v => onAmountChange(selScene.id, v)} keyboardType="numeric" placeholder="0" placeholderTextColor={TEXT_MID} style={{ flex: 1, color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", paddingVertical: 10 }} />
          </View>

          <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
            {["1", "5", "10", "100"].map(v => (
              <TouchableOpacity key={v} onPress={() => onAmountChange(selScene.id, v)} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(124,92,252,0.08)", alignItems: "center", borderWidth: 1, borderColor: "rgba(124,92,252,0.2)" }}>
                <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 12 }}>+${v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={() => onPredict(selScene.id)} disabled={placingId !== null} style={{ borderRadius: 12, overflow: "hidden" }}>
            <LinearGradient colors={placingId !== null ? ["#111", "#111"] : GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                {placingId === selScene.id ? t.markets.opening : t.markets.trade(amounts[selScene.id] ?? "100")}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {!resolved && (
        <TouchableOpacity onPress={onResolve} style={{ marginTop: 10, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: BORDER_P, alignItems: "center", backgroundColor: "rgba(124,92,252,0.04)" }}>
          <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 0.8 }}>{t.markets.resolveMarket}</Text>
        </TouchableOpacity>
      )}

      {/* Related news */}
      {relatedNews.length > 0 && (
        <View style={{ marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.08)" }}>
          <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 12 }}>
            {language === "pt" ? "NOTÍCIAS RELACIONADAS" : "RELATED NEWS"}
          </Text>
          {relatedNews.map((article, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => Linking.openURL(article.url)}
              style={{ flexDirection: "row", gap: 10, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
            >
              {article.image && article.image !== "undefined" ? (
                <View style={{ width: 56, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                  <Image source={{ uri: article.image }} style={{ width: 56, height: 44 }} resizeMode="cover" />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontSize: 12, fontFamily: "DMSans_700Bold", lineHeight: 17, marginBottom: 4 }} numberOfLines={2}>
                  {article.title}
                </Text>
                <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_500Medium" }}>{article.source}</Text>
              </View>
              <Text style={{ color: TEXT_MID, fontSize: 14, alignSelf: "center" }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Comments */}
      <View style={{ marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.08)" }}>
        <CommentSection eventId={event.id} language={language} />
      </View>
    </ScrollView>
  );
}

function DetailModal({ target, onClose, onResolve, placingId, amounts, onAmountChange, onPredict, t, language }: {
  target: DetailTarget; onClose(): void; onResolve(): void;
  placingId: number | null; amounts: Record<number, string>;
  onAmountChange(id: number, val: string): void; onPredict(id: number): void; t: any; language: string;
}) {
  return (
    <Modal visible animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", borderTopWidth: 1, borderTopColor: BORDER, padding: 22 }}>
          <View style={{ width: 36, height: 3, borderRadius: 2, alignSelf: "center", marginBottom: 20, overflow: "hidden" }}>
            <LinearGradient colors={GRAD_BP} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </View>
          <DetailPanelContent target={target} onClose={onClose} onResolve={onResolve} placingId={placingId} amounts={amounts} onAmountChange={onAmountChange} onPredict={onPredict} t={t} language={language} />
        </View>
      </View>
    </Modal>
  );
}

// --- HeroCard --------------------------------------------------------------------
const HeroCard = React.memo(function HeroCard({ event, history, onPredict, onResolve, placingId, amounts, onAmountChange, t, language }: {
  event: EventItem; history: ScenarioHistory[];
  onPredict(id: number): void; onResolve(): void;
  placingId: number | null; amounts: Record<number, string>;
  onAmountChange(id: number, val: string): void; t: any; language: string;
}) {
  const resolved = event.status === "resolved";
  const cm = catMeta(event.category);
  const hasChart = history.some(s => s.points.length >= 2);
  const title = eventTitle(event, language);
  const desc  = eventDesc(event, language);
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER_P, overflow: "hidden", marginBottom: 16 }}>
      <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2 }} />
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <View style={{ backgroundColor: `${cm.color}15`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: `${cm.color}25` }}>
            <Text style={{ color: cm.color, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{cm.icon}  {((t.markets as any)[event.category] ?? event.category).toUpperCase()}</Text>
          </View>
          {!resolved && <View style={{ backgroundColor: "rgba(34,197,94,0.1)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}><Text style={{ color: GREEN, fontSize: 10, fontFamily: "DMSans_700Bold" }}>{t.common.live}</Text></View>}
          <View style={{ marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: "rgba(124,92,252,0.08)" }}>
            <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>{t.markets.featured}</Text>
          </View>
        </View>
        <Text style={{ color: TEXT, fontSize: 20, fontFamily: "DMSans_700Bold", lineHeight: 27, marginBottom: 6 }}>{title}</Text>
        {desc && <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 17, marginBottom: 16 }}>{desc}</Text>}

        {hasChart && (
          <View style={{ backgroundColor: "rgba(124,92,252,0.04)", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "rgba(124,92,252,0.1)" }}>
            <ProbabilityChart scenarios={history} height={140} compact={false} />
          </View>
        )}

        {event.scenarios.map((s, idx) => {
          const won = resolved && s.status === "won";
          const c = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
          return (
            <View key={s.id} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
                  <Text style={{ color: won ? c : TEXT_SUB, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{scenarioTitle(s, language)}</Text>
                </View>
                <Text style={{ color: won ? c : TEXT, fontFamily: "DMSans_700Bold", fontSize: 15 }}>{s.probability.toFixed(1)}%</Text>
              </View>
              <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <View style={{ width: `${s.probability}%`, height: "100%", backgroundColor: c, borderRadius: 2, opacity: 0.8 }} />
              </View>
              {!resolved && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <View style={{ width: 80, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 8 }}>
                    <Text style={{ color: PURPLE_D, fontSize: 12 }}>$</Text>
                    <TextInput value={amounts[s.id] ?? "100"} onChangeText={v => onAmountChange(s.id, v)} keyboardType="numeric" placeholder="100" placeholderTextColor={TEXT_MID} style={{ flex: 1, color: TEXT, fontSize: 13, fontFamily: "DMSans_500Medium", paddingVertical: 7, marginLeft: 3 }} />
                  </View>
                  <TouchableOpacity onPress={() => onPredict(s.id)} disabled={placingId !== null} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }}>
                    <LinearGradient colors={placingId !== null ? ["#111", "#111"] : idx === 0 ? GRAD_GREEN : GRAD_RED} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 8, alignItems: "center" }}>
                      <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 12 }}>{placingId === s.id ? "..." : scenarioTitle(s, language)}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        {!resolved && (
          <TouchableOpacity onPress={onResolve} style={{ marginTop: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER_P, alignItems: "center", backgroundColor: "rgba(124,92,252,0.04)" }}>
            <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 0.8 }}>{t.markets.resolveMarket}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

// --- Sidebar ---------------------------------------------------------------------
function Sidebar({ events, historyCache, onEventPress, t, language }: {
  events: EventItem[]; historyCache: Record<number, ScenarioHistory[]>;
  onEventPress(e: EventItem): void; t: any; language: string;
}) {
  const live = events.filter(e => e.status === "open").slice(0, 6);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: "hidden" }}>
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{t.rankings.hotMarkets}</Text>
          <Text style={{ color: TEXT_MID, fontSize: 10 }}>{live.length} {t.markets.live.replace("● ", "").toLowerCase()}</Text>
        </View>
        {live.map((event, idx) => {
          const first = event.scenarios[0];
          const cm = catMeta(event.category);
          const title = eventTitle(event, language);
          return (
            <TouchableOpacity key={event.id} onPress={() => onEventPress(event)} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: idx < live.length - 1 ? 1 : 0, borderBottomColor: "rgba(255,255,255,0.04)", gap: 10 }}>
              <Text style={{ color: TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 11, width: 14 }}>{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT_SUB, fontFamily: "DMSans_500Medium", fontSize: 11, lineHeight: 15 }} numberOfLines={2}>{title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: cm.color }} />
                  <Text style={{ color: TEXT_MID, fontSize: 9 }}>{((t.markets as any)[event.category] ?? event.category)}</Text>
                </View>
              </View>
              <Text style={{ color: (first?.probability ?? 50) >= 60 ? BLUE : (first?.probability ?? 50) >= 40 ? PURPLE : PINK, fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                {first?.probability.toFixed(0)}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }}>
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{t.rankings.byCategory}</Text>
        </View>
        {Object.entries(CAT_META).filter(([k]) => k !== "all").map(([key, meta]) => {
          const count = events.filter(e => e.category === key && e.status === "open").length;
          if (count === 0) return null;
          const label = (t.markets as any)[key] ?? key;
          return (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.03)", gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: `${meta.color}12`, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${meta.color}20` }}>
                <Text style={{ fontSize: 14 }}>{meta.icon}</Text>
              </View>
              <Text style={{ color: TEXT_SUB, fontFamily: "DMSans_500Medium", fontSize: 12, flex: 1 }}>{label}</Text>
              <View style={{ backgroundColor: `${meta.color}12`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                <Text style={{ color: meta.color, fontFamily: "DMSans_700Bold", fontSize: 10 }}>{count}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// --- EventGridCard ---------------------------------------------------------------
const EventGridCard = React.memo(function EventGridCard({ event, history, cardW, onPress, onResolve, t, language }: {
  event: EventItem; history: ScenarioHistory[]; cardW: number;
  onPress(): void; onResolve(): void; t: any; language: string;
}) {
  const resolved = event.status === "resolved";
  const cm = catMeta(event.category);
  const hasChart = history.some(s => s.points.length >= 2);
  const firstProb = event.scenarios[0]?.probability ?? 50;
  const gaugeSize = Math.min(cardW * 0.34, 60);
  const title = eventTitle(event, language);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ width: cardW, backgroundColor: CARD, borderRadius: 13, borderWidth: 1, borderColor: resolved ? "rgba(124,92,252,0.08)" : BORDER, overflow: "hidden" }}>
      <View style={{ padding: 11 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <View style={{ backgroundColor: `${cm.color}12`, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: `${cm.color}20`, maxWidth: cardW * 0.54 }}>
            <Text style={{ color: cm.color, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }} numberOfLines={1}>{cm.icon}  {((t.markets as any)[event.category] ?? event.category).toUpperCase()}</Text>
          </View>
          <ArcGauge probability={firstProb} size={gaugeSize} />
        </View>
        <Text style={{ color: TEXT, fontSize: 11, fontFamily: "DMSans_700Bold", lineHeight: 15, marginBottom: 8 }} numberOfLines={3}>{title}</Text>
        {hasChart && (
          <View style={{ borderRadius: 7, overflow: "hidden", marginBottom: 8, backgroundColor: "rgba(124,92,252,0.03)" }}>
            <ProbabilityChart scenarios={history} height={46} compact width={cardW - 22} />
          </View>
        )}
        {event.scenarios.map((s, idx) => (
          <View key={s.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }} />
              <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_500Medium" }} numberOfLines={1}>{scenarioTitle(s, language)}</Text>
            </View>
            <Text style={{ color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length], fontSize: 12, fontFamily: "DMSans_700Bold" }}>{s.probability.toFixed(0)}%</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 11, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)", backgroundColor: "rgba(0,0,0,0.18)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: resolved ? TEXT_MID : GREEN }} />
          <Text style={{ color: resolved ? TEXT_MID : GREEN, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>{resolved ? t.markets.closed : t.markets.live}</Text>
        </View>
        {!resolved && (
          <TouchableOpacity onPress={e => { (e as any).stopPropagation?.(); onResolve(); }} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.06)" }}>
            <Text style={{ color: PURPLE_D, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>{t.markets.resolve}</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

// --- ShareCardModal --------------------------------------------------------------
type ShareCardData = {
  eventTitle: string;
  scenarioTitle: string;
  pnl: number;
  wagered: number;
  multiplier: number;
  entryProb: number;
};

function ShareCardModal({ data, onClose, t, language }: { data: ShareCardData; onClose(): void; t: any; language: string }) {
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
              <ScenaraWordmark size={18} />
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: isWin ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: isWin ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" }}>
                <Text style={{ color: isWin ? GREEN : RED, fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 1 }}>{isWin ? (language === "pt" ? "GANHOU" : "WON") : (language === "pt" ? "PERDEU" : "LOST")}</Text>
              </View>
            </View>

            {/* Event title */}
            <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_500Medium", marginBottom: 6 }} numberOfLines={2}>{data.eventTitle}</Text>
            <Text style={{ color: TEXT, fontSize: 17, fontFamily: "DMSans_700Bold", lineHeight: 24, marginBottom: 24 }} numberOfLines={2}>{data.scenarioTitle}</Text>

            {/* PnL */}
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 8 }}>{language === "pt" ? "RESULTADO" : "RESULT"}</Text>
              <LinearGradient colors={isWin ? [GREEN, "#16a34a"] : [RED, "#dc2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14 }}>
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 36, letterSpacing: -1 }}>{pnlStr}</Text>
              </LinearGradient>
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14, marginBottom: 20 }}>
              {[
                { label: language === "pt" ? "APOSTADO" : "WAGERED", value: `$${data.wagered.toFixed(0)}` },
                { label: language === "pt" ? "PROB ENTRADA" : "ENTRY PROB", value: `${data.entryProb}%` },
                { label: language === "pt" ? "MULT" : "MULT", value: `${data.multiplier}x` },
              ].map(s => (
                <View key={s.label} style={{ alignItems: "center" }}>
                  <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{s.label}</Text>
                  <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 15, marginTop: 4 }}>{s.value}</Text>
                </View>
              ))}
            </View>

            {/* Footer */}
            <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular", textAlign: "center" }}>scenara.app  ·  {language === "pt" ? "Mercado de Previsões Simulado" : "Simulated Prediction Market"}</Text>
          </LinearGradient>
        </View>

        {/* Instructions */}
        <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", marginTop: 20, marginBottom: 24 }}>
          {language === "pt" ? "Tire um print para compartilhar" : "Take a screenshot to share"}
        </Text>

        {/* Close */}
        <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 32, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.08)" }}>
          <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 13, letterSpacing: 0.5 }}>{language === "pt" ? "Fechar" : "Close"}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function HomeScreen() {
  const { account, placePrediction, refreshPortfolio, isAuthenticated, predictions } = useTrading();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { open: openSidebar } = React.useContext(SidebarContext);
  const params = useLocalSearchParams<{ eventId?: string }>();
  const [events, setEvents]               = useState<EventItem[]>([]);
  const [loading, setLoading]             = useState(false);
  const [placingId, setPlacingId]         = useState<number | null>(null);
  const [error, setError]                 = useState("");
  const [message, setMessage]             = useState("");
  const [amounts, setAmounts]             = useState<Record<number, string>>({});
  const [resolveTarget, setResolveTarget] = useState<ResolveTarget | null>(null);
  const [detailTarget, setDetailTarget]   = useState<DetailTarget | null>(null);
  const [historyCache, setHistoryCache]   = useState<Record<number, ScenarioHistory[]>>({});
  const historyCacheTime = useRef<number>(0);
  const [activeCategory, setActiveCategory] = useState(() => {
    try { return (Platform.OS === "web" && localStorage.getItem("scenara_cat")) || "all"; }
    catch { return "all"; }
  });
  const [screenW, setScreenW]             = useState(Dimensions.get("window").width);
  const [shareCard, setShareCard]         = useState<ShareCardData | null>(null);
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<EventItem[]>([]);
  const [searchActive, setSearchActive]   = useState(false);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocused = useRef(false);

  const layout = useMemo(() => getLayout(screenW), [screenW]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = () => setScreenW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const balanceText = useMemo(() => {
    if (!account) return "—";
    return Number(account.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [account]);

  const [warmingUp, setWarmingUp] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const res = await api.get("/events/?limit=80");
      const evts: EventItem[] = (res.data ?? []).filter((e: EventItem) => e.status === "open");
      setEvents(evts);
      setWarmingUp(false);
      // Only fetch history for first 10 events to avoid hammering backend
      const now = Date.now();
      if (now - historyCacheTime.current < 5 * 60 * 1000 && Object.keys(historyCache).length > 0) {
        return;
      }
      historyCacheTime.current = now;
      const results = await Promise.allSettled(evts.slice(0, 10).map(e => api.get(`/events/${e.id}/history`)));
      const cache: Record<number, ScenarioHistory[]> = {};
      results.forEach((r, i) => { if (r.status === "fulfilled") cache[evts[i].id] = r.value.data.scenarios; });
      setHistoryCache(cache);
    } catch {
      setWarmingUp(true);
      setError("");
      // Auto-retry — Render free tier takes up to 60s to wake
      setTimeout(() => loadEvents(), 8000);
    }
    finally { setLoading(false); }
  }, [language]);

  const handlePredict = async (scenarioId: number) => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const amount = parseFloat(amounts[scenarioId] ?? "100");
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid amount"); return; }
    try {
      setPlacingId(scenarioId); setError(""); setMessage("");
      const result = await placePrediction(scenarioId, amount);
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      setMessage(t.markets.positionOpened(amount.toFixed(2)));
      setTimeout(() => setMessage(""), 3500);

      // Find event + scenario for share card
      const event = events.find(e => e.scenarios.some(s => s.id === scenarioId));
      const scenario = event?.scenarios.find(s => s.id === scenarioId);
      if (event && scenario) {
        setTimeout(() => {
          const multiplier = parseFloat((1 / (scenario.probability / 100)).toFixed(2));
          setShareCard({
            eventTitle: eventTitle(event, language),
            scenarioTitle: scenarioTitle(scenario, language),
            pnl: amount * multiplier - amount, // actual expected profit
            wagered: amount,
            multiplier,
            entryProb: scenario.probability,
          });
        }, 500);
      }
    } catch { setError("Could not place position"); setTimeout(() => setError(""), 4000); }
    finally { setPlacingId(null); }
  };

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); setSearchActive(false); return; }
    setSearchActive(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/events/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.data ?? []);
      } catch { setSearchResults([]); }
    }, 300);
  }, []);

  const handleResolved = useCallback(() => { loadEvents(); refreshPortfolio(); setDetailTarget(null); }, [loadEvents, refreshPortfolio]);

  // Auto-open event from navigation params (e.g. from Breaking tab)
  useEffect(() => {
    const id = params.eventId ? parseInt(params.eventId) : null;
    if (!id || events.length === 0) return;
    const event = events.find(e => e.id === id);
    if (event) setDetailTarget({ event, history: historyCache[event.id] ?? [] });
  }, [params.eventId, events]);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    loadEvents();
    intervalRef.current = setInterval(() => {
      if (isFocused.current) loadEvents();
    }, AUTO_REFRESH_MS);
    return () => {
      isFocused.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadEvents]));

  if (!fontsLoaded) return null;

  const filtered = activeCategory === "all" ? events : events.filter(e => e.category === activeCategory);
  const heroEvent = events.find(e => e.is_featured && e.status === "open") ?? events.find(e => e.status === "open") ?? events[0];
  const gridEvents = filtered.filter(e => e.id !== heroEvent?.id);
  const { isWeb, cols, sideW, gap, padH, cardW } = layout;
  const rows: EventItem[][] = [];
  for (let i = 0; i < gridEvents.length; i += cols) rows.push(gridEvents.slice(i, i + cols));
  const liveCount = events.filter(e => e.status === "open").length;
  const closedCount = events.filter(e => e.status === "resolved").length;
  const openDetail = (e: EventItem) => setDetailTarget({ event: e, history: historyCache[e.id] ?? [] });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity onPress={openSidebar} style={{ padding: 4 }}>
              <View style={{ gap: 4 }}>
                <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: TEXT_SUB }} />
                <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: TEXT_SUB }} />
                <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: TEXT_SUB }} />
              </View>
            </TouchableOpacity>
            <ScenaraWordmark size={20} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={loadEvents} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.06)" }}>
              <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 9, letterSpacing: 0.8 }}>{loading ? "..." : t.markets.refresh}</Text>
            </TouchableOpacity>
            {isAuthenticated ? (
              <View style={{ borderRadius: 10, overflow: "hidden" }}>
                <LinearGradient colors={GRAD_CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: BORDER_P, borderRadius: 10 }}>
                  <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{t.markets.balance}</Text>
                  <Text style={{ color: TEXT, fontSize: 14, fontFamily: "DMSans_700Bold", marginTop: 1 }}>${balanceText}</Text>
                </LinearGradient>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity onPress={() => router.push("/login")} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: BORDER_P }}>
                  <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 11 }}>{language === "pt" ? "Entrar" : "Log In"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push("/register")} style={{ borderRadius: 10, overflow: "hidden" }}>
                  <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 11 }}>{language === "pt" ? "Cadastrar" : "Sign Up"}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Search bar */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.08)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, borderWidth: 1, borderColor: searchActive ? BORDER_P : "rgba(255,255,255,0.08)", paddingHorizontal: 12, gap: 8 }}>
            <Text style={{ color: TEXT_MID, fontSize: 14 }}>🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder={language === "pt" ? "Buscar mercados..." : "Search markets..."}
              placeholderTextColor={TEXT_MID}
              style={{ flex: 1, color: TEXT, fontSize: 13, fontFamily: "DMSans_400Regular", paddingVertical: 9 }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); setSearchActive(false); }}>
                <Text style={{ color: TEXT_MID, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search results overlay */}
        {searchActive && (
          <View style={{ position: "absolute", top: 160, left: 0, right: 0, bottom: 0, backgroundColor: BG, zIndex: 100 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {searchResults.length === 0 ? (
                <View style={{ alignItems: "center", paddingTop: 60 }}>
                  <Text style={{ color: TEXT_MID, fontSize: 14 }}>
                    {language === "pt" ? "Nenhum resultado encontrado" : "No results found"}
                  </Text>
                </View>
              ) : (
                <View style={{ padding: 16, gap: 8 }}>
                  <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 4 }}>
                    {searchResults.length} {language === "pt" ? "resultados" : "results"}
                  </Text>
                  {searchResults.map(event => {
                    const cm = catMeta(event.category);
                    const topProb = event.scenarios[0]?.probability ?? 50;
                    return (
                      <TouchableOpacity
                        key={event.id}
                        onPress={() => { setSearchActive(false); setSearchQuery(""); openDetail(event); }}
                        style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 12 }}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
                            <View style={{ backgroundColor: `${cm.color}15`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                              <Text style={{ color: cm.color, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{cm.icon} {event.category.toUpperCase()}</Text>
                            </View>
                          </View>
                          <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 18 }} numberOfLines={2}>
                            {eventTitle(event, language)}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={{ color: topProb >= 60 ? GREEN : topProb <= 40 ? RED : TEXT_SUB, fontSize: 18, fontFamily: "DMSans_700Bold" }}>
                            {topProb.toFixed(0)}%
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* Warming up banner */}
        {warmingUp && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "rgba(124,92,252,0.08)", borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.15)" }}>
            <ActivityIndicator size="small" color={PURPLE} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold" }}>
                {language === "pt" ? "Acordando o servidor..." : "Warming up server..."}
              </Text>
              <Text style={{ color: TEXT_MID, fontSize: 11 }}>
                {language === "pt" ? "Primeira visita pode levar até 60s. Tentando novamente..." : "First visit may take up to 60s. Retrying automatically..."}
              </Text>
            </View>
          </View>
        )}

        {/* Trending bar */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.08)", backgroundColor: "rgba(124,92,252,0.02)" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 7, gap: 6, flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginRight: 4 }}>{t.markets.trending}</Text>
            {events.filter(e => e.status === "open").slice(0, 10).map(e => (
              <TouchableOpacity key={e.id} onPress={() => openDetail(e)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(124,92,252,0.08)", borderWidth: 1, borderColor: "rgba(124,92,252,0.15)" }}>
                <Text style={{ color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_500Medium" }} numberOfLines={1}>{eventTitle(e, language).slice(0, 40)}{eventTitle(e, language).length > 40 ? "…" : ""}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Active bets banner — shows when user has open predictions */}
        {isAuthenticated && predictions.filter(p => p.status === "open").length > 0 && (
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/portfolio")}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "rgba(124,92,252,0.08)", borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.15)" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN }} />
              <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_500Medium" }}>
                {language === "pt"
                  ? `${predictions.filter(p => p.status === "open").length} apostas abertas`
                  : `${predictions.filter(p => p.status === "open").length} open bets`}
              </Text>
            </View>
            <Text style={{ color: PURPLE_D, fontSize: 11, fontFamily: "DMSans_700Bold" }}>
              {language === "pt" ? "Ver carteira →" : "View portfolio →"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Category tabs */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6, flexDirection: "row" }}>
            {Object.entries(CAT_META).map(([key, meta]) => {
              const active = activeCategory === key;
              const label = (t.markets as any)[key] ?? key;
              return (
                <TouchableOpacity key={key} onPress={() => {
                  setActiveCategory(key);
                  try { if (Platform.OS === "web") localStorage.setItem("scenara_cat", key); } catch {}
                }} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: active ? `${meta.color}15` : "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: active ? `${meta.color}35` : "rgba(255,255,255,0.06)" }}>
                  <Text style={{ color: active ? meta.color : TEXT_SUB, fontSize: 11, fontFamily: active ? "DMSans_700Bold" : "DMSans_500Medium" }}>{meta.icon}  {label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Floating toast banner — always visible over content */}
        {(message || error) ? (
          <View style={{
            position: "absolute", top: 80, left: 16, right: 16, zIndex: 999,
            backgroundColor: message ? "rgba(22,163,74,0.95)" : "rgba(220,38,38,0.95)",
            borderRadius: 12, padding: 12,
            flexDirection: "row", alignItems: "center", gap: 8,
            shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12,
          }}>
            <Text style={{ color: "white", fontSize: 15 }}>{message ? "✓" : "⚠"}</Text>
            <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 13, flex: 1 }}>
              {message || error}
            </Text>
          </View>
        ) : null}

        {loading && !events.length && <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color={PURPLE} /></View>}

        {/* Main content */}
        {isWeb ? (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", padding: 16, gap: 16, alignItems: "flex-start" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={{ color: TEXT_SUB, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>{t.markets.liveCount(liveCount, closedCount)} · {filtered.length} SHOWN</Text>
                </View>
                {heroEvent && <HeroCard event={heroEvent} history={historyCache[heroEvent.id] ?? []} onPredict={handlePredict} onResolve={() => setResolveTarget({ eventId: heroEvent.id, eventTitle: heroEvent.title, scenarios: heroEvent.scenarios })} placingId={placingId} amounts={amounts} onAmountChange={(id, val) => setAmounts(p => ({ ...p, [id]: val }))} t={t} language={language} />}
                <Text style={{ color: TEXT_SUB, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 10 }}>{t.markets.allMarkets}</Text>
                <View style={{ gap }}>
                  {rows.map((row, ri) => (
                    <View key={ri} style={{ flexDirection: "row", gap }}>
                      {row.map(event => <EventGridCard key={event.id} event={event} history={historyCache[event.id] ?? []} cardW={cardW} onPress={() => openDetail(event)} onResolve={() => setResolveTarget({ eventId: event.id, eventTitle: event.title, scenarios: event.scenarios })} t={t} language={language} />)}
                      {row.length < cols && Array(cols - row.length).fill(0).map((_, i) => <View key={i} style={{ width: cardW }} />)}
                    </View>
                  ))}
                </View>
                {events.length === 0 && !loading && (
                  <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 32 }}>
                    <Text style={{ color: PURPLE_D, fontSize: 28, marginBottom: 12 }}>◈</Text>
                    <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium", marginBottom: 8, textAlign: "center" }}>{t.markets.noMarkets}</Text>
                    {error ? (
                      <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", padding: 14, marginTop: 8, width: "100%" }}>
                        <Text style={{ color: RED, fontSize: 13, fontFamily: "DMSans_500Medium", textAlign: "center", marginBottom: 10 }}>{error}</Text>
                        <Text style={{ color: TEXT_MID, fontSize: 12, textAlign: "center", marginBottom: 12 }}>
                          {language === "pt" ? "O servidor pode estar acordando (até 30s). Tente novamente." : "The server may be waking up (up to 30s). Please retry."}
                        </Text>
                        <TouchableOpacity onPress={loadEvents} style={{ backgroundColor: "rgba(124,92,252,0.1)", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: BORDER_P }}>
                          <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{language === "pt" ? "Tentar novamente" : "Retry"}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>

              {/* Inline detail panel */}
              {detailTarget && (
                <View style={{ width: 420, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER_P, padding: 20, maxHeight: "85vh" as any, position: "sticky" as any, top: 16, alignSelf: "flex-start" }}>
                  <DetailPanelContent target={detailTarget} onClose={() => setDetailTarget(null)} onResolve={() => { setDetailTarget(null); setResolveTarget({ eventId: detailTarget.event.id, eventTitle: detailTarget.event.title, scenarios: detailTarget.event.scenarios }); }} placingId={placingId} amounts={amounts} onAmountChange={(id, val) => setAmounts(p => ({ ...p, [id]: val }))} onPredict={handlePredict} t={t} language={language} />
                </View>
              )}

              <View style={{ width: detailTarget ? 240 : sideW }}>
                <Sidebar events={events} historyCache={historyCache} onEventPress={openDetail} t={t} language={language} />
              </View>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ padding: 16, gap }}>
              <Text style={{ color: TEXT_SUB, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>{t.markets.liveCount(liveCount, closedCount)}</Text>
              {heroEvent && <HeroCard event={heroEvent} history={historyCache[heroEvent.id] ?? []} onPredict={handlePredict} onResolve={() => setResolveTarget({ eventId: heroEvent.id, eventTitle: heroEvent.title, scenarios: heroEvent.scenarios })} placingId={placingId} amounts={amounts} onAmountChange={(id, val) => setAmounts(p => ({ ...p, [id]: val }))} t={t} language={language} />}
              {rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: "row", gap }}>
                  {row.map(event => <EventGridCard key={event.id} event={event} history={historyCache[event.id] ?? []} cardW={cardW} onPress={() => openDetail(event)} onResolve={() => setResolveTarget({ eventId: event.id, eventTitle: event.title, scenarios: event.scenarios })} t={t} language={language} />)}
                  {row.length < cols && Array(cols - row.length).fill(0).map((_, i) => <View key={i} style={{ width: cardW }} />)}
                </View>
              ))}
              {events.length === 0 && !loading && <View style={{ alignItems: "center", paddingTop: 60 }}><Text style={{ color: PURPLE_D, fontSize: 28, marginBottom: 12 }}>◈</Text><Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium" }}>{t.markets.noMarkets}</Text></View>}
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>

      {resolveTarget && <ResolveModal target={resolveTarget} onClose={() => setResolveTarget(null)} onResolved={handleResolved} t={t} language={language} />}
      {!isWeb && detailTarget && <DetailModal target={detailTarget} onClose={() => setDetailTarget(null)} onResolve={() => { setDetailTarget(null); setResolveTarget({ eventId: detailTarget.event.id, eventTitle: detailTarget.event.title, scenarios: detailTarget.event.scenarios }); }} placingId={placingId} amounts={amounts} onAmountChange={(id, val) => setAmounts(p => ({ ...p, [id]: val }))} onPredict={handlePredict} t={t} language={language} />}
      {shareCard && <ShareCardModal data={shareCard} onClose={() => setShareCard(null)} t={t} language={language} />}
    </View>
  );
}