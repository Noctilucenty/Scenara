/**
 * Markets Tab — Primary trading screen
 * Polymarket-style list with inline quick-bet, category filters, crowd sentiment,
 * countdown urgency, and a featured hero card.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, TextInput, ActivityIndicator, RefreshControl,
  Platform, Dimensions, Animated, Easing, KeyboardAvoidingView, Image,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";

import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";
import { api } from "@/src/api/client";
import { SidebarContext } from "./_layout";
import {
  C, GRAD, SCENARIO_COLORS, CATEGORY_META, catMeta, timeUntil,
} from "@/src/theme";
import { ProbabilityChart, ScenarioHistory } from "@/components/ProbabilityChart";
import { shareContent } from "@/src/utils/useShare";

// ── Aliases ───────────────────────────────────────────────────────────────────
const { BG, CARD, SURFACE, BLUE, PURPLE, PURPLE_DIM: PURPLE_D,
        TEXT, TEXT_SUB, TEXT_MID, BORDER, BORDER_P, GREEN, RED } = C;

const SCREEN_W = Dimensions.get("window").width;
const AUTO_REFRESH_MS = 25_000;
const IS_WEB = Platform.OS === "web";

// ── Types ──────────────────────────────────────────────────────────────────────
type NewsArticle = { title: string; source: string; published: string; url: string; image?: string; description?: string; source_url?: string; };
type Scenario = {
  id: number; title: string; title_pt: string | null;
  probability: number; sort_order: number; status: string;
};
type EventItem = {
  id: number; title: string; title_pt: string | null;
  description: string | null; description_pt: string | null;
  category: string; status: string; is_featured: boolean;
  closes_at: string | null; scenarios: Scenario[];
};
type SentimentItem = { scenario_id: number; player_count: number; percentage: number };

// ── Helpers ───────────────────────────────────────────────────────────────────
function eventTitle(e: EventItem, lang: string) {
  return lang === "pt" && e.title_pt ? e.title_pt : e.title;
}
function scenarioTitle(s: Scenario, lang: string) {
  return lang === "pt" && s.title_pt ? s.title_pt : s.title;
}

// Extract meaningful search keywords from an event title for targeted news fetch
const NEWS_STOP = new Set([
  "will","the","a","an","in","at","by","on","for","this","next","week",
  "month","year","day","stay","reach","hit","above","below","between",
  "before","after","can","could","would","should","might","have","has",
  "had","be","is","are","was","were","do","does","did","get","got",
  "make","take","give","go","see","to","of","and","or","not","but",
  "so","yet","even","just","than","more","most","first","last","new",
  "old","big","small","high","low","from","with","that","which","who",
  "what","when","where","how","its","it","he","she","we","they","his",
  "her","their","our","over","under","end","end","out","up","down",
  "into","onto","than","then","else","ever","hour","hours","week","weeks",
  "next","past","remain","hold","keep","drop","rise","fall","move",
]);
function extractNewsQuery(event: EventItem, lang: string): string {
  const title = (lang === "pt" && event.title_pt ? event.title_pt : event.title);
  const words = title
    .replace(/[%$€£@#&*()+=\[\]{}<>?!,.:;'"\/\\|-]/g, " ")
    .split(/\s+/)
    .filter(w => {
      const lw = w.toLowerCase();
      return w.length >= 3 && !NEWS_STOP.has(lw) && !/^\d+$/.test(w);
    });
  // Prefer short unique terms; cap at 3 to keep the query tight
  return words.slice(0, 3).join(" ") || event.category;
}

// ── Mini arc gauge ─────────────────────────────────────────────────────────────
function ArcGauge({ probability, size = 52 }: { probability: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36, sw = size * 0.1;
  const START = 135, SWEEP = 270;
  function pt(a: number) {
    const rad = ((a - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arc(a1: number, a2: number) {
    const s = pt(a1), e = pt(a2), lg = a2 - a1 > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }
  const end = START + (Math.min(Math.max(probability, 1), 99) / 100) * SWEEP;
  const probColor = probability >= 60 ? GREEN : probability <= 40 ? RED : TEXT_SUB;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <SvgGrad id={`arc${Math.round(probability)}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BLUE} />
            <Stop offset="0.5" stopColor={PURPLE} />
            <Stop offset="1" stopColor={C.PINK} />
          </SvgGrad>
        </Defs>
        <Path d={arc(START, START + SWEEP)} stroke="rgba(255,255,255,0.06)" strokeWidth={sw} fill="none" strokeLinecap="round" />
        <Path d={arc(START, end)} stroke={`url(#arc${Math.round(probability)})`} strokeWidth={sw} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: probColor, fontSize: size * 0.21, fontFamily: "DMSans_700Bold", includeFontPadding: false }}>
          {Math.round(probability)}%
        </Text>
      </View>
    </View>
  );
}

// ── Hot badge — social proof cue ──────────────────────────────────────────────
function HotBadge({ total, language }: { total: number; language: string }) {
  if (total < 5) return null;
  const isViral = total >= 20;
  return (
    <View style={{
      backgroundColor: isViral ? "rgba(239,68,68,0.14)" : "rgba(251,146,60,0.12)",
      paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
      borderWidth: 1, borderColor: isViral ? "rgba(239,68,68,0.3)" : "rgba(251,146,60,0.28)",
      flexDirection: "row", alignItems: "center", gap: 3,
    }}>
      <Text style={{ fontSize: 9 }}>{isViral ? "🔥" : "🌶"}</Text>
      <Text style={{ color: isViral ? RED : "#FB923C", fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.3 }}>
        {isViral
          ? (language === "pt" ? "VIRAL" : "VIRAL")
          : (language === "pt" ? "QUENTE" : "HOT")}
      </Text>
    </View>
  );
}

// ── Urgency badge ─────────────────────────────────────────────────────────────
function UrgencyBadge({ closesAt, language }: { closesAt: string | null; language: string }) {
  if (!closesAt) return null;
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0 || diff > 72 * 3_600_000) return null; // only show if < 72h
  const hours = Math.floor(diff / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);
  const urgent = diff < 6 * 3_600_000; // < 6h is red
  const label  = hours > 0
    ? (language === "pt" ? `${hours}h restam` : `${hours}h left`)
    : (language === "pt" ? `${mins}m restam` : `${mins}m left`);
  return (
    <View style={{
      backgroundColor: urgent ? "rgba(239,68,68,0.12)" : "rgba(251,146,60,0.12)",
      paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
      borderWidth: 1, borderColor: urgent ? "rgba(239,68,68,0.3)" : "rgba(251,146,60,0.3)",
      flexDirection: "row", alignItems: "center", gap: 4,
    }}>
      <Text style={{ fontSize: 9 }}>⏱</Text>
      <Text style={{ color: urgent ? RED : "#FB923C", fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

// ── Crowd sentiment bar ────────────────────────────────────────────────────────
function SentimentBar({ total, scenarios, eventScenarios, language }: {
  total: number; scenarios: SentimentItem[];
  eventScenarios: Scenario[]; language: string;
}) {
  if (total === 0) return null;
  const top2 = scenarios.slice(0, 2);
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", height: 3, borderRadius: 2, overflow: "hidden", gap: 1 }}>
        {top2.map((s, i) => (
          <View key={s.scenario_id} style={{ flex: s.percentage / 100, backgroundColor: SCENARIO_COLORS[i], borderRadius: 2 }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 5 }}>
        {top2.map((s, i) => {
          const sc = eventScenarios.find(x => x.id === s.scenario_id);
          return (
            <Text key={s.scenario_id} style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_400Regular" }}>
              <Text style={{ color: SCENARIO_COLORS[i] }}>●</Text> {sc ? scenarioTitle(sc, language) : ""}  {s.percentage.toFixed(0)}%
            </Text>
          );
        })}
        <Text style={{ color: TEXT_MID, fontSize: 9, marginLeft: "auto" as any }}>
          👥 {total}
        </Text>
      </View>
    </View>
  );
}

// ── Animated LIVE dot for market cards ───────────────────────────────────────
function MarketLiveDot({ language }: { language: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  const DS = 5;
  const CS = Math.ceil(DS * 3.5) + 4;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: CS, height: CS, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{
          position: "absolute", width: DS, height: DS, borderRadius: DS / 2,
          borderWidth: 1, borderColor: GREEN,
          opacity: pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 3.5] }) }],
        }} />
        <View style={{ width: DS, height: DS, borderRadius: DS / 2, backgroundColor: GREEN }} />
      </View>
      <Text style={{ color: GREEN, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>
        {language === "pt" ? "AO VIVO" : "LIVE"}
      </Text>
    </View>
  );
}

// ── Market card (list row) ────────────────────────────────────────────────────
const MarketCard = React.memo(function MarketCard({ event, onPress, onBetPress, language, sentiment, t, history }: {
  event: EventItem; onPress(): void; onBetPress(): void;
  language: string; sentiment: { total: number; scenarios: SentimentItem[] } | null; t: any;
  history?: ScenarioHistory[];
}) {
  const cm = catMeta(event.category);
  const topS = event.scenarios[0];
  const prob = topS?.probability ?? 50;
  const [cardWidth, setCardWidth] = useState(0);
  const hasChart = !!history && history.some(s => s.points?.length >= 2);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: CARD, borderRadius: 16, marginBottom: 8, borderWidth: 1,
        borderColor: BORDER, overflow: "hidden",
        flexDirection: "row",
      }}
    >
      {/* Category accent left border */}
      <View style={{ width: 3, backgroundColor: cm.color, opacity: 0.7 }} />
      <View style={{ flex: 1, flexDirection: "column" }}>
      <View onLayout={e => setCardWidth(e.nativeEvent.layout.width)} style={{ padding: 14 }}>
        {/* Top row: category + urgency + probability */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
            <View style={{ backgroundColor: `${cm.color}15`, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: `${cm.color}25` }}>
              <Text style={{ color: cm.color, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>
                {cm.icon}  {(language === "pt" ? cm.label_pt : cm.label).toUpperCase()}
              </Text>
            </View>
            <UrgencyBadge closesAt={event.closes_at} language={language} />
            {sentiment && <HotBadge total={sentiment.total} language={language} />}
          </View>
          <ArcGauge probability={prob} size={IS_WEB ? 54 : 46} />
        </View>

        {/* Title */}
        <Text style={{ color: TEXT, fontSize: IS_WEB ? 15 : 13, fontFamily: "DMSans_700Bold", lineHeight: IS_WEB ? 22 : 19, marginBottom: 8 }} numberOfLines={2}>
          {eventTitle(event, language)}
        </Text>

        {/* Scenario probability bars */}
        {event.scenarios.slice(0, 2).map((s, i) => (
          <View key={s.id} style={{ marginBottom: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: SCENARIO_COLORS[i] }} />
                <Text style={{ color: TEXT_SUB, fontSize: IS_WEB ? 13 : 11, fontFamily: "DMSans_500Medium" }}>{scenarioTitle(s, language)}</Text>
              </View>
              <Text style={{ color: SCENARIO_COLORS[i], fontSize: IS_WEB ? 13 : 12, fontFamily: "DMSans_700Bold" }}>{s.probability.toFixed(0)}%</Text>
            </View>
            <View style={{ height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)" }}>
              <View style={{ width: `${s.probability}%` as any, height: 2, borderRadius: 1, backgroundColor: SCENARIO_COLORS[i] }} />
            </View>
          </View>
        ))}

        {/* Mini probability chart */}
        {hasChart && cardWidth > 0 && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" }}>
            <ProbabilityChart scenarios={history!} height={70} compact width={cardWidth - 28} />
          </View>
        )}

        {/* Crowd sentiment */}
        {sentiment && (
          <SentimentBar
            total={sentiment.total}
            scenarios={sentiment.scenarios}
            eventScenarios={event.scenarios}
            language={language}
          />
        )}
      </View>

      {/* Footer */}
      <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)", backgroundColor: "rgba(0,0,0,0.12)" }}>
        {/* Date + multiplier row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 7, paddingBottom: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 10 : 8, fontFamily: "DMSans_400Regular" }}>
              📅 {event.closes_at
                ? (language === "pt" ? "Fecha " : "Ends ") + formatCloseDate(event.closes_at, language)
                : (language === "pt" ? "Em aberto" : "Open-ended")}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ backgroundColor: "rgba(34,197,94,0.08)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(34,197,94,0.18)" }}>
              <Text style={{ color: GREEN, fontSize: IS_WEB ? 11 : 9, fontFamily: "DMSans_700Bold" }}>
                {(100 / (topS?.probability ?? 50)).toFixed(2)}x
              </Text>
            </View>
            <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 10 : 8, fontFamily: "DMSans_400Regular" }}>
              {language === "pt" ? "retorno est." : "est. return"}
            </Text>
          </View>
        </View>
        {/* Action buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 8, paddingTop: 2 }}>
          <MarketLiveDot language={language} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              onPress={onPress}
              style={{ paddingHorizontal: IS_WEB ? 14 : 10, paddingVertical: IS_WEB ? 6 : 4, borderRadius: 7, borderWidth: 1, borderColor: BORDER }}
            >
              <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 11 : 9, fontFamily: "DMSans_500Medium" }}>
                {language === "pt" ? "Detalhes" : "Details"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={e => { (e as any).stopPropagation?.(); onBetPress(); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: IS_WEB ? 14 : 10, paddingVertical: IS_WEB ? 6 : 4, borderRadius: 7, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.1)" }}
            >
              <Text style={{ color: PURPLE, fontSize: IS_WEB ? 12 : 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>
                {language === "pt" ? "⚡ Apostar" : "⚡ Trade"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Inline bet panel ──────────────────────────────────────────────────────────
function BetPanel({ event, language, t, onClose, isAuthenticated, userId, placePrediction, refreshPortfolio, sentimentCache }: {
  event: EventItem; language: string; t: any; onClose(): void;
  isAuthenticated: boolean; userId: number | null;
  placePrediction(scenarioId: number, amount: number): Promise<{ ok: boolean; error?: string }>;
  refreshPortfolio(): Promise<void>;
  sentimentCache?: Record<number, { total: number; scenarios: SentimentItem[] }>;
}) {
  const router = useRouter();
  const [selId, setSelId] = useState<number>(event.scenarios[0]?.id ?? 0);
  const [amount, setAmount] = useState("100");
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, []);

  const selScene = event.scenarios.find(s => s.id === selId);
  const amt = parseFloat(amount) || 0;
  const payout = selScene && amt > 0 ? (amt * (100 / selScene.probability)).toFixed(2) : "0.00";
  const profit = selScene && amt > 0 ? (amt * (100 / selScene.probability) - amt).toFixed(2) : "0.00";
  const multiplier = selScene ? (100 / selScene.probability).toFixed(2) : "0.00";

  const handleBet = async () => {
    if (!isAuthenticated) { onClose(); router.push("/login"); return; }
    if (!selId || amt <= 0) return;
    setPlacing(true);
    setError("");
    const result = await placePrediction(selId, amt);
    setPlacing(false);
    if (result.ok) {
      setSuccess(true);
      refreshPortfolio();
      setTimeout(() => { setSuccess(false); onClose(); }, 2500);
    } else {
      setError(result.error ?? "Failed to place bet");
    }
  };

  return (
    <Animated.View style={{
      backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: BORDER_P,
      marginTop: 4, marginBottom: 12, overflow: "hidden",
      transform: [{ scaleY: slideAnim }, { translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
      opacity: slideAnim,
    }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>
              {language === "pt" ? "APOSTAR" : "PLACE BET"} · {eventTitle(event, language).slice(0, 40)}{eventTitle(event, language).length > 40 ? "…" : ""}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: TEXT_MID, fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Scenario selector */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {event.scenarios.slice(0, 2).map((s, idx) => {
              const isSel = selId === s.id;
              const sentimentItem = sentimentCache?.[event.id]?.scenarios?.find(ss => ss.scenario_id === s.id);
              return (
                <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
                  <LinearGradient
                    colors={isSel ? (idx === 0 ? GRAD.GREEN : GRAD.RED) : [`${SCENARIO_COLORS[idx]}18`, `${SCENARIO_COLORS[idx]}18`]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ paddingVertical: 10, alignItems: "center" }}
                  >
                    <Text style={{ color: isSel ? "white" : SCENARIO_COLORS[idx], fontFamily: "DMSans_700Bold", fontSize: 12 }} numberOfLines={1}>
                      {scenarioTitle(s, language)}  {s.probability.toFixed(0)}%
                    </Text>
                    {sentimentItem && sentimentItem.player_count > 0 && (
                      <Text style={{ color: isSel ? "rgba(255,255,255,0.7)" : TEXT_MID, fontSize: 9, fontFamily: "DMSans_400Regular", marginTop: 2 }}>
                        👥 {sentimentItem.player_count} bets
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Multi-scenario horizontal scroll */}
          {event.scenarios.length > 2 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {event.scenarios.map((s, idx) => {
                const isSel = selId === s.id;
                const sentimentItem = sentimentCache?.[event.id]?.scenarios?.find(ss => ss.scenario_id === s.id);
                return (
                  <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : BORDER, backgroundColor: isSel ? `${SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}18` : "transparent" }}>
                    <Text style={{ color: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 12 }} numberOfLines={1}>{scenarioTitle(s, language)}</Text>
                    <Text style={{ color: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : TEXT_MID, fontSize: 11, textAlign: "center" }}>{s.probability.toFixed(0)}%</Text>
                    {sentimentItem && sentimentItem.player_count > 0 && (
                      <Text style={{ color: TEXT_MID, fontSize: 9, textAlign: "center", marginTop: 1 }}>👥 {sentimentItem.player_count}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Amount */}
          <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 8 }}>
            {language === "pt" ? "VALOR" : "AMOUNT"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, marginBottom: 8 }}>
            <Text style={{ color: PURPLE_D, fontSize: 16, marginRight: 4 }}>$</Text>
            <TextInput
              value={amount} onChangeText={setAmount} keyboardType="numeric"
              style={{ flex: 1, color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", paddingVertical: 10 }}
            />
          </View>

          {/* Quick amount anchoring — $500 makes $100 feel small */}
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
            {["10", "50", "100", "500"].map(v => (
              <TouchableOpacity key={v} onPress={() => setAmount(v)} style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center", backgroundColor: amount === v ? "rgba(124,92,252,0.18)" : "rgba(124,92,252,0.06)", borderWidth: 1, borderColor: amount === v ? BORDER_P : "rgba(124,92,252,0.15)" }}>
                <Text style={{ color: amount === v ? PURPLE : PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 12 }}>${v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Payout preview — dopamine trigger */}
          {amt > 0 && selScene && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(34,197,94,0.06)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)", paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
              <View>
                <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                  {language === "pt" ? "RETORNO POTENCIAL" : "POTENTIAL PAYOUT"}
                </Text>
                <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 20, marginTop: 2 }}>${payout}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                  {language === "pt" ? "LUCRO" : "PROFIT"}
                </Text>
                <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 16, marginTop: 2 }}>
                  +${profit}
                  <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}> ({multiplier}x)</Text>
                </Text>
              </View>
            </View>
          )}

          {/* Error */}
          {error ? (
            <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <Text style={{ color: RED, fontSize: 12, fontFamily: "DMSans_500Medium" }}>{error}</Text>
            </View>
          ) : null}

          {/* Success */}
          {success ? (
            <View style={{ backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" }}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>🎉</Text>
              <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                {language === "pt" ? `✓ Posição aberta · $${amount}` : `✓ Position opened · $${amount}`}
              </Text>
            </View>
          ) : (
            <TouchableOpacity onPress={handleBet} disabled={placing} style={{ borderRadius: 12, overflow: "hidden" }}>
              <LinearGradient
                colors={placing ? ["#111", "#111"] : GRAD.BRAND}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 15, alignItems: "center" }}
              >
                {placing
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                      {isAuthenticated
                        ? (language === "pt" ? `Apostar $${amount}` : `Bet $${amount}`)
                        : (language === "pt" ? "Entrar para apostar" : "Log in to bet")}
                    </Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ── Persistent sidebar trade panel ────────────────────────────────────────────
function SidebarTradePanel({ event, language, isAuthenticated, userId, placePrediction, refreshPortfolio }: {
  event: EventItem; language: string;
  isAuthenticated: boolean; userId: number | null;
  placePrediction(scenarioId: number, amount: number): Promise<{ ok: boolean; error?: string }>;
  refreshPortfolio(): Promise<void>;
}) {
  const router = useRouter();
  const [selId, setSelId] = useState<number>(event.scenarios[0]?.id ?? 0);
  const [amount, setAmount] = useState("100");
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Reset state when event switches
  useEffect(() => {
    setSelId(event.scenarios[0]?.id ?? 0);
    setAmount("100");
    setSuccess(false);
    setError("");
  }, [event.id]);

  const selScene = event.scenarios.find(s => s.id === selId);
  const amt = parseFloat(amount) || 0;
  const payout = selScene && amt > 0 ? (amt * (100 / selScene.probability)).toFixed(2) : "0.00";
  const profit = selScene && amt > 0 ? (amt * (100 / selScene.probability) - amt).toFixed(2) : "0.00";
  const multiplier = selScene ? (100 / selScene.probability).toFixed(2) : "0.00";

  const handleBet = async () => {
    if (!isAuthenticated) { router.push("/login"); return; }
    if (!selId || amt <= 0) return;
    setPlacing(true); setError("");
    const result = await placePrediction(selId, amt);
    setPlacing(false);
    if (result.ok) {
      setSuccess(true);
      refreshPortfolio();
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error ?? (language === "pt" ? "Erro ao apostar" : "Failed to place bet"));
    }
  };

  return (
    <View style={{ backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: BORDER_P, overflow: "hidden" }}>
      {/* Header */}
      <LinearGradient
        colors={["rgba(124,92,252,0.12)", "rgba(124,92,252,0.04)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.12)" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 12 }}>⚡</Text>
          <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>
            {language === "pt" ? "APOSTAR" : "TRADE"}
          </Text>
        </View>
        <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular", flex: 1, marginLeft: 8 }} numberOfLines={1}>
          {eventTitle(event, language)}
        </Text>
      </LinearGradient>

      <View style={{ padding: 14 }}>
        {/* Scenario selector */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
          {event.scenarios.slice(0, 2).map((s, idx) => {
            const isSel = selId === s.id;
            return (
              <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
                <LinearGradient
                  colors={isSel ? (idx === 0 ? GRAD.GREEN : GRAD.RED) : [`${SCENARIO_COLORS[idx]}18`, `${SCENARIO_COLORS[idx]}18`]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 9, alignItems: "center" }}
                >
                  <Text style={{ color: isSel ? "white" : SCENARIO_COLORS[idx], fontFamily: "DMSans_700Bold", fontSize: 12 }} numberOfLines={1}>
                    {scenarioTitle(s, language)}  {s.probability.toFixed(0)}%
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
        {event.scenarios.length > 2 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {event.scenarios.map((s, idx) => {
              const isSel = selId === s.id;
              return (
                <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, marginRight: 6, borderWidth: 1, borderColor: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : BORDER, backgroundColor: isSel ? `${SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}18` : "transparent" }}>
                  <Text style={{ color: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 11 }}>{scenarioTitle(s, language)}</Text>
                  <Text style={{ color: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : TEXT_MID, fontSize: 10, textAlign: "center" }}>{s.probability.toFixed(0)}%</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Amount */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, marginBottom: 8 }}>
          <Text style={{ color: PURPLE_D, fontSize: 16, marginRight: 4 }}>$</Text>
          <TextInput
            value={amount} onChangeText={setAmount} keyboardType="numeric"
            style={{ flex: 1, color: TEXT, fontSize: 20, fontFamily: "DMSans_700Bold", paddingVertical: 9 }}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
          {["10", "50", "100", "500"].map(v => (
            <TouchableOpacity key={v} onPress={() => setAmount(v)} style={{ flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: "center", backgroundColor: amount === v ? "rgba(124,92,252,0.18)" : "rgba(124,92,252,0.06)", borderWidth: 1, borderColor: amount === v ? BORDER_P : "rgba(124,92,252,0.15)" }}>
              <Text style={{ color: amount === v ? PURPLE : PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 11 }}>${v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Payout preview */}
        {amt > 0 && selScene && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(34,197,94,0.06)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,197,94,0.18)", paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10 }}>
            <View>
              <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                {language === "pt" ? "RETORNO" : "PAYOUT"}
              </Text>
              <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 17 }}>${payout}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                {language === "pt" ? "LUCRO" : "PROFIT"}
              </Text>
              <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 14 }}>+${profit} <Text style={{ color: TEXT_MID, fontSize: 10 }}>({multiplier}x)</Text></Text>
            </View>
          </View>
        )}

        {error ? (
          <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 9, padding: 9, marginBottom: 9 }}>
            <Text style={{ color: RED, fontSize: 11 }}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={{ backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 11, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" }}>
            <Text style={{ fontSize: 24, marginBottom: 4 }}>🎉</Text>
            <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 13 }}>
              {language === "pt" ? `✓ Posição aberta · $${amount}` : `✓ Position opened · $${amount}`}
            </Text>
          </View>
        ) : (
          <TouchableOpacity onPress={handleBet} disabled={placing} style={{ borderRadius: 11, overflow: "hidden" }}>
            <LinearGradient
              colors={placing ? ["#111", "#111"] : GRAD.BRAND}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ paddingVertical: 13, alignItems: "center" }}
            >
              {placing
                ? <ActivityIndicator color="white" />
                : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                    {isAuthenticated
                      ? (language === "pt" ? `⚡ Apostar $${amount}` : `⚡ Bet $${amount}`)
                      : (language === "pt" ? "Entrar para apostar" : "Log in to bet")}
                  </Text>
              }
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Activity ticker — social proof strip ─────────────────────────────────────
type ActivityItem = {
  player: string; event_title: string; scenario_title: string;
  amount_label: string; seconds_ago: number;
};

function ActivityTicker({ items, language }: { items: ActivityItem[]; language: string }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [contentW, setContentW] = useState(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const timeLabel = (s: number) => {
    if (s < 60)   return language === "pt" ? `${s}s atrás`                    : `${s}s ago`;
    if (s < 3600) return language === "pt" ? `${Math.floor(s/60)}m atrás`     : `${Math.floor(s/60)}m ago`;
    return          language === "pt" ? `${Math.floor(s/3600)}h atrás`         : `${Math.floor(s/3600)}h ago`;
  };

  useEffect(() => {
    if (items.length === 0 || contentW === 0) return;
    const half = contentW / 2; // content is doubled, so one cycle = half width
    translateX.setValue(0);
    animRef.current = Animated.loop(
      Animated.timing(translateX, {
        toValue: -half,
        duration: half * 28,   // ~28 ms per pixel → smooth, not too fast
        useNativeDriver: true,
      })
    );
    animRef.current.start();
    return () => animRef.current?.stop();
  }, [items.length, contentW]);

  if (items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.08)", backgroundColor: "rgba(124,92,252,0.03)", height: 32, overflow: "hidden", justifyContent: "center" }}>
      <Animated.View
        style={{ flexDirection: "row", alignItems: "center", gap: 24, paddingHorizontal: 16, transform: [{ translateX }] }}
        onLayout={e => setContentW(e.nativeEvent.layout.width)}
      >
        {doubled.map((item, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_500Medium" }}>⚡</Text>
            <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_500Medium" }}>
              <Text style={{ color: TEXT_SUB }}>{item.player}</Text>
              {" "}{language === "pt" ? "apostou" : "bet"}{" "}
              <Text style={{ color: PURPLE_D }}>{parseAmount(item.amount_label)}</Text>
              {" "}{language === "pt" ? "em" : "on"}{" "}
              <Text style={{ color: TEXT_SUB }}>{item.scenario_title}</Text>
              {"  "}
              <Text style={{ color: TEXT_MID, fontSize: 8 }}>{timeLabel(item.seconds_ago)}</Text>
            </Text>
            <Text style={{ color: "rgba(124,92,252,0.2)", fontSize: 9 }}>·</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// ── Close date formatter (Polymarket-style) ──────────────────────────────────
function formatCloseDate(dateStr: string, lang = "en"): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const months = lang === "pt"
    ? ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
    : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── Amount label: parse "$50-$100" range → single midpoint value ─────────────
function parseAmount(label: string): string {
  const m = label.match(/\$(\d[\d,]*)\s*[-–]\s*\$(\d[\d,]*)/);
  if (!m) return label;
  const lo = parseInt(m[1].replace(/,/g, ""));
  const hi = parseInt(m[2].replace(/,/g, ""));
  const mid = Math.round((lo + hi) / 2);
  return `$${mid.toLocaleString("en-US")}`;
}

// ── Time ago helper ───────────────────────────────────────────────────────────
function timeAgo(dateStr: string, lang = "en"): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (lang === "pt") {
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return `${Math.floor(diff / 86400)}d atrás`;
  }
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Radar LIVE badge ──────────────────────────────────────────────────────────
const DOT = 7;
const MAX_RING = DOT * 3.5; // 24.5 — container must fit this
function LiveBadge() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function pulse(anim: Animated.Value, delay: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 1300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0,    useNativeDriver: true }),
        ])
      );
    }
    const a1 = pulse(ring1, 0);
    const a2 = pulse(ring2, 550);
    a1.start();
    a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, []);

  const ringStyle = (anim: Animated.Value) => ({
    position: "absolute" as const,
    width: DOT, height: DOT, borderRadius: DOT / 2,
    borderWidth: 1.5, borderColor: RED,
    opacity: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.5] }) }],
  });

  const containerSize = Math.ceil(MAX_RING) + 4; // 30px — rings have room to breathe

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {/* Dot + pulse rings — container sized to fit max ring expansion */}
      <View style={{ width: containerSize, height: containerSize, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={ringStyle(ring1)} />
        <Animated.View style={ringStyle(ring2)} />
        <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: RED }} />
      </View>
      <Text style={{ color: TEXT, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>
        BREAKING NEWS
      </Text>
      <Text style={{ color: RED, fontSize: 7, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>LIVE</Text>
    </View>
  );
}

// ── Sidebar live comments auto-scroller ──────────────────────────────────────
const SIDEBAR_SEED: Array<{ uid: number; name: string; body: string }> = [
  { uid: 101, name: "rafaelk",    body: "just put $20 on Yes lol let's see" },
  { uid: 102, name: "tom_wex",    body: "been watching this one all week. finally moving" },
  { uid: 103, name: "cryptodave", body: "nah the No side is way underpriced rn" },
  { uid: 104, name: "liz_m",      body: "anyone else think the chart looks bullish?" },
  { uid: 105, name: "pablof",     body: "lost my last bet here but I still think Yes" },
  { uid: 106, name: "8ball_fx",   body: "the market moved 12% in 2h... insane" },
  { uid: 107, name: "quietmike",  body: "waiting for more info before I commit" },
  { uid: 108, name: "Ana_trader", body: "already up 40% this week on these markets 🔥" },
  { uid: 109, name: "newbie99",   body: "is this safe to bet on? first time here" },
  { uid: 110, name: "markosv",    body: "people sleeping on the No side here imo" },
  { uid: 111, name: "jess_q",     body: "this aged well lmao called it yesterday" },
  { uid: 112, name: "droptrades", body: "added more at 34%, feels like easy money" },
  { uid: 113, name: "felix_r",    body: "honestly surprised how accurate these odds are" },
  { uid: 114, name: "sam__w",     body: "anyone know when this resolves?" },
  { uid: 115, name: "TaraK",      body: "diversifying across 5 markets today, no all-in" },
  { uid: 116, name: "nico_b",     body: "chart says Yes but gut says No 😅" },
];

const AVATAR_HEX = [PURPLE, "#4F8EF7", "#F050AE", GREEN, "#F7931A", "#22D3EE", "#A78BFA"];
function sidebarAvatarColor(uid: number) { return AVATAR_HEX[uid % AVATAR_HEX.length]; }
function sidebarInitials(name: string) { return name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase(); }

function SidebarLiveComments({ featuredEventId, language }: { featuredEventId?: number; language: string }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [contentH, setContentH] = useState(0);
  const [liveComments, setLiveComments] = useState<Array<{ uid: number; name: string; body: string }>>([]);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Fetch real comments and merge with seed
  useEffect(() => {
    if (!featuredEventId) { setLiveComments(SIDEBAR_SEED); return; }
    api.get(`/comments/event/${featuredEventId}`).then(r => {
      const real = (r.data ?? []).slice(0, 8).map((c: any) => ({
        uid: c.user_id ?? 999,
        name: c.display_name ?? `user${c.user_id}`,
        body: c.body,
      }));
      const merged = [...real, ...SIDEBAR_SEED].slice(0, 20);
      setLiveComments(merged.length > 0 ? merged : SIDEBAR_SEED);
    }).catch(() => setLiveComments(SIDEBAR_SEED));
  }, [featuredEventId]);

  // Start animation once content height is known
  useEffect(() => {
    if (contentH === 0 || liveComments.length === 0) return;
    const half = contentH / 2;
    translateY.setValue(0);
    animRef.current = Animated.loop(
      Animated.timing(translateY, { toValue: -half, duration: half * 60, useNativeDriver: true })
    );
    animRef.current.start();
    return () => animRef.current?.stop();
  }, [contentH, liveComments.length]);

  if (liveComments.length === 0) return null;
  const doubled = [...liveComments, ...liveComments];

  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: "hidden" }}>
      {/* Header */}
      <LinearGradient
        colors={["rgba(124,92,252,0.08)", "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}
      >
        <MarketLiveDot language={language} />
        <Text style={{ color: TEXT, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, flex: 1 }}>
          {language === "pt" ? "COMENTÁRIOS" : "LIVE COMMENTS"}
        </Text>
        <View style={{ backgroundColor: "rgba(124,92,252,0.15)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: BORDER_P }}>
          <Text style={{ color: PURPLE_D, fontSize: 8, fontFamily: "DMSans_700Bold" }}>{liveComments.length}</Text>
        </View>
      </LinearGradient>

      {/* Scrolling body — fixed height with overflow hidden */}
      <View style={{ height: 260, overflow: "hidden" }}>
        <Animated.View
          style={{ transform: [{ translateY }] }}
          onLayout={e => setContentH(e.nativeEvent.layout.height)}
        >
          {doubled.map((item, i) => {
            const color = sidebarAvatarColor(item.uid);
            return (
              <View key={i} style={{ flexDirection: "row", gap: 9, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.03)", alignItems: "flex-start" }}>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: color + "1A", borderWidth: 1, borderColor: color + "40", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <Text style={{ color, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{sidebarInitials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_700Bold", marginBottom: 3 }}>{item.name}</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", lineHeight: 15 }}>{item.body}</Text>
                </View>
              </View>
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
}

// ── Breaking News + Hot Topics sidebar ───────────────────────────────────────
function BreakingNewsPanel({ articles, hotEvents, language }: {
  articles: NewsArticle[];
  hotEvents: EventItem[];
  language: string;
}) {
  const router = useRouter();

  function openArticle(article: NewsArticle) {
    router.push({
      pathname: "/news-detail",
      params: {
        title: article.title,
        url: article.url,
        source: article.source,
        published: article.published,
        image: article.image ?? "",
        description: article.description ?? "",
        source_url: article.source_url ?? "",
      },
    });
  }

  return (
    <View style={{ gap: 10 }}>
      {articles.length > 0 && (
        <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER }}>
          <View style={{ marginBottom: 10 }}>
            <LiveBadge />
          </View>
          {articles.slice(0, 6).map((article, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => openArticle(article)}
              activeOpacity={0.75}
              style={{
                flexDirection: "row", gap: 8, paddingVertical: 8,
                borderBottomWidth: i < Math.min(articles.length, 6) - 1 ? 1 : 0,
                borderBottomColor: "rgba(255,255,255,0.04)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: PURPLE_D, fontSize: 11, fontFamily: "DMSans_700Bold", minWidth: 16, paddingTop: 1 }}>{i + 1}</Text>
              {/* Thumbnail — favicon from source domain, or placeholder */}
              {(() => {
                const faviconUri = article.source_url
                  ? `https://www.google.com/s2/favicons?domain=${article.source_url}&sz=64`
                  : null;
                return faviconUri ? (
                  <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", flexShrink: 0, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" }}>
                    <Image
                      source={{ uri: faviconUri }}
                      style={{ width: 28, height: 28, borderRadius: 4 }}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "rgba(124,92,252,0.1)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Text style={{ fontSize: 18 }}>📰</Text>
                  </View>
                );
              })()}
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_500Medium", lineHeight: 15 }} numberOfLines={2}>
                  {article.title}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <Text style={{ color: PURPLE_D, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>
                    {article.source.toUpperCase().slice(0, 14)}
                  </Text>
                  <Text style={{ color: TEXT_MID, fontSize: 8 }}>·</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 8 }}>{timeAgo(article.published, language)}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => shareContent({ title: article.title, message: article.title, url: article.url })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Text style={{ color: TEXT_MID, fontSize: 12 }}>⎙</Text>
              </TouchableOpacity>
              <Text style={{ color: TEXT_MID, fontSize: 14 }}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {hotEvents.length > 0 && (
        <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Text style={{ fontSize: 12 }}>🔥</Text>
            <Text style={{ color: TEXT, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>
              {language === "pt" ? "EM ALTA" : "HOT TOPICS"}
            </Text>
          </View>
          {hotEvents.slice(0, 6).map((event, i) => {
            const cm = catMeta(event.category);
            const prob = event.scenarios[0]?.probability ?? 50;
            const probColor = prob >= 60 ? GREEN : prob <= 40 ? RED : TEXT_SUB;
            return (
              <TouchableOpacity
                key={event.id}
                onPress={() => router.push({ pathname: "/market-detail", params: { eventId: String(event.id) } })}
                activeOpacity={0.75}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7,
                  borderBottomWidth: i < Math.min(hotEvents.length, 6) - 1 ? 1 : 0,
                  borderBottomColor: "rgba(255,255,255,0.04)",
                }}
              >
                <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", minWidth: 14 }}>{i + 1}</Text>
                <Text style={{ fontSize: 11 }}>{cm.icon}</Text>
                <Text style={{ color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_500Medium", flex: 1 }} numberOfLines={1}>
                  {eventTitle(event, language)}
                </Text>
                <Text style={{ color: probColor, fontSize: 12, fontFamily: "DMSans_700Bold" }}>{Math.round(prob)}%</Text>
                <Text style={{ color: TEXT_MID, fontSize: 14 }}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

    </View>
  );
}

// ── Category tab strip ────────────────────────────────────────────────────────
function CategoryTabs({ events, active, onSelect, t, language }: {
  events: EventItem[]; active: string; onSelect(k: string): void; t: any; language: string;
}) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6, flexDirection: "row" }}
      >
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const isActive = active === key;
          const count = key === "all" ? events.length : events.filter(e => e.category === key).length;
          if (key !== "all" && key !== "brazil" && count === 0) return null;
          const label = language === "pt" ? meta.label_pt : meta.label;
          const isBrazil = key === "brazil";
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelect(key)}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                backgroundColor: isActive ? `${meta.color}15` : "rgba(255,255,255,0.03)",
                borderWidth: 1,
                borderColor: isActive ? `${meta.color}35` : "rgba(255,255,255,0.06)",
                flexDirection: "row", alignItems: "center", gap: 4,
              }}
            >
              {isBrazil ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Image source={{ uri: "https://flagcdn.com/w40/br.png" }} style={{ width: 18, height: 12, borderRadius: 2 }} />
                  <Text style={{ color: isActive ? meta.color : TEXT_MID, fontSize: IS_WEB ? 13 : 11, fontFamily: isActive ? "DMSans_700Bold" : "DMSans_500Medium" }}>{label}</Text>
                </View>
              ) : (
                <Text style={{ color: isActive ? meta.color : TEXT_MID, fontSize: IS_WEB ? 13 : 11, fontFamily: isActive ? "DMSans_700Bold" : "DMSans_500Medium" }}>
                  {meta.icon}  {label}
                </Text>
              )}
              {count > 0 && (
                <View style={{ backgroundColor: `${meta.color}20`, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ color: meta.color, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Full-width news grid ──────────────────────────────────────────────────────
const NewsGrid = React.memo(function NewsGrid({ articles, language, onPress }: {
  articles: NewsArticle[];
  language: string;
  onPress(a: NewsArticle): void;
}) {
  if (articles.length === 0) return null;
  const { width: newsW } = useWindowDimensions();
  const cols = newsW >= 700 ? 3 : newsW >= 500 ? 2 : 1;
  const items = articles.slice(0, newsW >= 700 ? 6 : 4);

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Section header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <LinearGradient
            colors={["#4F8EF7", PURPLE, "#F050AE"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ width: 3, height: 14, borderRadius: 2 }}
          />
          <Text style={{ color: TEXT, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 1.2 }}>
            {language === "pt" ? "ÚLTIMAS NOTÍCIAS" : "LATEST NEWS"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN }} />
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_400Regular" }}>
            {language === "pt" ? "feed ao vivo" : "live feed"}
          </Text>
        </View>
      </View>

      {/* Card grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {items.map((article, i) => {
          const faviconUri = article.source_url
            ? `https://www.google.com/s2/favicons?domain=${article.source_url}&sz=64`
            : null;
          const accentColors: [string, string] = [
            ["#4F8EF7", PURPLE],
            [PURPLE, "#F050AE"],
            ["#22D3EE", "#4F8EF7"],
            ["#F050AE", "#F7931A"],
            ["#22C55E", "#22D3EE"],
            ["#F7931A", PURPLE],
          ][i % 6] as [string, string];

          const wordCount = (article.title + " " + (article.description ?? "")).split(/\s+/).length;
          const readMin = Math.max(1, Math.ceil(wordCount / 200));

          return (
            <TouchableOpacity
              key={i}
              onPress={() => onPress(article)}
              activeOpacity={0.82}
              style={{
                width: `${Math.floor(100 / cols) - 1}%` as any,
                backgroundColor: CARD,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: BORDER,
                overflow: "hidden",
              }}
            >
              {/* Gradient accent top bar */}
              <LinearGradient
                colors={accentColors}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 3 }}
              />
              <View style={{ padding: 12, flex: 1 }}>
                {/* Source + time row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  {faviconUri ? (
                    <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                      <Image source={{ uri: faviconUri }} style={{ width: 14, height: 14, borderRadius: 3 }} resizeMode="contain" />
                    </View>
                  ) : (
                    <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: `${accentColors[0]}18`, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 11 }}>📰</Text>
                    </View>
                  )}
                  <Text style={{ color: accentColors[0], fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.5, flex: 1 }} numberOfLines={1}>
                    {article.source.toUpperCase().slice(0, 16)}
                  </Text>
                  <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_400Regular" }}>
                    {timeAgo(article.published, language)}
                  </Text>
                </View>

                {/* Title */}
                <Text
                  style={{ color: TEXT, fontSize: IS_WEB ? 12 : 11, fontFamily: "DMSans_700Bold", lineHeight: IS_WEB ? 18 : 16, marginBottom: 6 }}
                  numberOfLines={3}
                >
                  {article.title}
                </Text>
              </View>

              {/* Card footer */}
              <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 12, paddingBottom: 10, paddingTop: 2,
                borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)",
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: accentColors[0], fontSize: 9, fontFamily: "DMSans_700Bold" }}>
                    {language === "pt" ? "Ler →" : "Read →"}
                  </Text>
                  <Text style={{ color: TEXT_MID, fontSize: 8 }}>· {readMin} min</Text>
                </View>
                <TouchableOpacity
                  onPress={() => shareContent({ title: article.title, message: article.title, url: article.url })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: TEXT_MID, fontSize: 11 }}>⎙</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

// ── Live stats bar ────────────────────────────────────────────────────────────
function LiveStatsBar({ eventCount, language }: { eventCount: number; language: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Deterministic but "live-looking" fake stats based on time + event count
  const base = Math.floor(Date.now() / 60000);
  const traders = 140 + (base % 180);
  const volume  = 42 + (base % 90);

  const stats = [
    { value: String(traders), label: language === "pt" ? "traders" : "traders", color: BLUE },
    { value: `$${volume}K`,   label: language === "pt" ? "volume hoje" : "vol. today",  color: GREEN },
    { value: String(eventCount), label: language === "pt" ? "mercados" : "markets",  color: PURPLE },
  ];

  return (
    <View style={{ backgroundColor: "rgba(124,92,252,0.04)", borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.08)" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 16 }}>
        {/* Live indicator */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginRight: 16 }}>
          <Animated.View style={{
            width: 7, height: 7, borderRadius: 3.5, backgroundColor: GREEN,
            opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.25, 1] }),
          }} />
          <Text style={{ color: GREEN, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>LIVE</Text>
        </View>

        {/* Stats */}
        {stats.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.06)", marginHorizontal: 14 }} />}
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: s.color, fontSize: IS_WEB ? 18 : 14, fontFamily: "DMSans_700Bold", lineHeight: IS_WEB ? 22 : 17 }}>{s.value}</Text>
              <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 11 : 8, fontFamily: "DMSans_400Regular" }}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ── Trending picks horizontal strip ──────────────────────────────────────────
function TrendingPicks({ events, language, onBetPress, onCardPress }: {
  events: EventItem[]; language: string;
  onBetPress(id: number): void; onCardPress(id: number): void;
}) {
  if (events.length === 0) return null;
  const picks = events.slice(0, 6);
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Text style={{ fontSize: 12 }}>🔥</Text>
        <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.2 }}>
          {language === "pt" ? "EM ALTA" : "TRENDING"}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
        {picks.map(event => {
          const cm = catMeta(event.category);
          const prob = event.scenarios[0]?.probability ?? 50;
          const probColor = prob >= 60 ? GREEN : prob <= 40 ? RED : TEXT_SUB;
          return (
            <TouchableOpacity
              key={event.id}
              onPress={() => onCardPress(event.id)}
              activeOpacity={0.85}
              style={{
                width: 160, backgroundColor: CARD, borderRadius: 14,
                borderWidth: 1, borderColor: BORDER, padding: 12, overflow: "hidden",
              }}
            >
              <LinearGradient
                colors={[`${cm.color}10`, "transparent"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14 }}
              />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <Text style={{ fontSize: 10 }}>{cm.icon}</Text>
                <Text style={{ color: cm.color, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>
                  {(language === "pt" ? cm.label_pt : cm.label).toUpperCase()}
                </Text>
              </View>
              <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_500Medium", lineHeight: 15, marginBottom: 8 }} numberOfLines={2}>
                {eventTitle(event, language)}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: probColor, fontSize: 20, fontFamily: "DMSans_700Bold", lineHeight: 22 }}>{Math.round(prob)}%</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 8 }}>
                    {scenarioTitle(event.scenarios[0], language)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => onBetPress(event.id)}
                  style={{ backgroundColor: "rgba(124,92,252,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: BORDER_P }}
                >
                  <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold" }}>⚡ Bet</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Brazil section ────────────────────────────────────────────────────────────
const BR_KEYWORDS = ["brazil", "brazilian", "lula", "stf", "petrobras", "bolsonaro",
  "copa do brasil", "nordeste", "são paulo", "rio de janeiro", "brasil",
  "ibovespa", "selic", "ipca", "nubank", "vale iron", "fluminense", "palmeiras",
  "corinthians", "vasco", "seleção", "selecao", "embraer", "pix ", "amazon deforestation",
  "itau", "mercadolibre"];

function BrazilSection({ events, language, sentimentCache, historyCache, onCardPress, onBetPress, onBetPanelId, setBetPanelId, isAuthenticated, userId, placePrediction, refreshPortfolio, t, gridCols, cardPct }: {
  events: EventItem[]; language: string;
  sentimentCache: Record<number, { total: number; scenarios: SentimentItem[] }>;
  historyCache: Record<number, ScenarioHistory[]>;
  onCardPress(id: number): void; onBetPress(id: number): void;
  onBetPanelId: number | null; setBetPanelId: (id: number | null) => void;
  isAuthenticated: boolean; userId: number | null;
  placePrediction: any; refreshPortfolio: any; t: any;
  gridCols: number; cardPct: string;
}) {
  const brazilEvents = events.filter(e => {
    const text = (e.title + " " + (e.title_pt ?? "")).toLowerCase();
    return BR_KEYWORDS.some(k => text.includes(k));
  }).slice(0, gridCols * 3);

  if (brazilEvents.length === 0) return null;

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Section header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: "#009C3B" }} />
        <Text style={{ fontSize: 16 }}>🇧🇷</Text>
        <Text style={{ color: TEXT, fontSize: IS_WEB ? 14 : 11, fontFamily: "DMSans_700Bold", letterSpacing: 1.2 }}>
          {language === "pt" ? "MERCADOS BRASIL" : "BRAZIL MARKETS"}
        </Text>
        <View style={{ backgroundColor: "rgba(0,156,59,0.15)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(0,156,59,0.3)" }}>
          <Text style={{ color: "#009C3B", fontSize: 9, fontFamily: "DMSans_700Bold" }}>{brazilEvents.length}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#009C3B" }} />
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_400Regular" }}>
            {language === "pt" ? "ao vivo" : "live"}
          </Text>
        </View>
      </View>

      {/* Accent bar */}
      <View style={{ height: 2, borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
        <LinearGradient colors={["#009C3B", "#FEDD00", "#009C3B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </View>

      {/* Events grid */}
      {gridCols > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {brazilEvents.map(event => (
            <View key={event.id} style={{ width: cardPct as any }}>
              <MarketCard
                event={event}
                onPress={() => onCardPress(event.id)}
                onBetPress={() => onBetPress(event.id)}
                language={language}
                sentiment={sentimentCache[event.id] ?? null}
                history={historyCache[event.id]}
                t={t}
              />
              {onBetPanelId === event.id && (
                <BetPanel
                  event={event} language={language} t={t}
                  onClose={() => setBetPanelId(null)}
                  isAuthenticated={isAuthenticated} userId={userId}
                  placePrediction={placePrediction} refreshPortfolio={refreshPortfolio}
                  sentimentCache={sentimentCache}
                />
              )}
            </View>
          ))}
        </View>
      ) : (
        brazilEvents.map(event => (
          <View key={event.id} style={{ marginBottom: 8 }}>
            <MarketCard
              event={event}
              onPress={() => onCardPress(event.id)}
              onBetPress={() => onBetPress(event.id)}
              language={language}
              sentiment={sentimentCache[event.id] ?? null}
              history={historyCache[event.id]}
              t={t}
            />
            {onBetPanelId === event.id && (
              <BetPanel
                event={event} language={language} t={t}
                onClose={() => setBetPanelId(null)}
                isAuthenticated={isAuthenticated} userId={userId}
                placePrediction={placePrediction} refreshPortfolio={refreshPortfolio}
                sentimentCache={sentimentCache}
              />
            )}
          </View>
        ))
      )}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MarketsScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { isAuthenticated, userId, account, placePrediction, refreshPortfolio } = useTrading();
  const { open: openSidebar } = React.useContext(SidebarContext);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { width: winW } = useWindowDimensions();
  // Responsive grid: 4 cols on desktop, 2 on tablet/large phone, 1 on phone
  const gridCols = IS_WEB ? (winW >= 1100 ? 4 : winW >= 700 ? 2 : 1) : 1;
  const cardPct  = gridCols === 4 ? "24%" : gridCols === 2 ? "49%" : "100%";

  const [featuredChartWidth, setFeaturedChartWidth] = useState(0);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [betPanelId, setBetPanelId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sentimentCache, setSentimentCache] = useState<Record<number, { total: number; scenarios: SentimentItem[] }>>({});
  const [historyCache, setHistoryCache] = useState<Record<number, ScenarioHistory[]>>({});
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [featuredComments, setFeaturedComments] = useState<{ id: number; body: string; display_name: string | null; created_at: string }[]>([]);
  const [featuredNews, setFeaturedNews] = useState<NewsArticle[]>([]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const [carouselIdx, setCarouselIdx] = useState(0);
  const [marketPageIdx, setMarketPageIdx] = useState(0);
  const [marketPageWidth, setMarketPageWidth] = useState(0);
  const marketSlideAnim = useRef(new Animated.Value(0)).current;
  const marketPageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const marketPageCountRef = useRef(0);
  const marketPageIdxRef = useRef(0);
  const marketPageWidthRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const carouselRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const featuredSlideAnim = useRef(new Animated.Value(0)).current;
  const featuredOpacityAnim = useRef(new Animated.Value(1)).current;
  const carouselIdxRef = useRef(0);
  const featuredSwipeTouchX = useRef(0);
  const scrollRef = useRef<any>(null);
  const PAGE_SIZE = 100;
  const GUEST_CAP = 100;
  // Refs that let loadMore read current state without stale closure
  const eventsRef = useRef<EventItem[]>([]);
  const scrollStateRef = useRef({ loadingMore: false, hasMore: true });

  const fetchSentiment = useCallback((items: EventItem[]) => {
    const toFetch = items.slice(0, 8);
    Promise.allSettled(
      toFetch.map(e => api.get(`/predictions/events/${e.id}/sentiment`))
    ).then(results => {
      const cache: Record<number, { total: number; scenarios: SentimentItem[] }> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          cache[toFetch[i].id] = {
            total: r.value.data.total_players ?? 0,
            scenarios: r.value.data.scenarios ?? [],
          };
        }
      });
      setSentimentCache(prev => {
        const keys = Object.keys(prev);
        const trimmed = keys.length > 150 ? Object.fromEntries(Object.entries(prev).slice(-100)) : prev;
        return { ...trimmed, ...cache };
      });
    });
  }, []);

  const historyCacheRef = useRef<Record<number, ScenarioHistory[]>>({});

  const fetchHistory = useCallback((items: EventItem[]) => {
    const toFetch = items.filter(e => !historyCacheRef.current[e.id]).slice(0, 12);
    if (toFetch.length === 0) return;
    Promise.allSettled(
      toFetch.map(e => api.get(`/events/${e.id}/history`))
    ).then(results => {
      const newEntries: Record<number, ScenarioHistory[]> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          newEntries[toFetch[i].id] = r.value.data?.scenarios ?? [];
        }
      });
      historyCacheRef.current = { ...historyCacheRef.current, ...newEntries };
      setHistoryCache(prev => {
        const keys = Object.keys(prev);
        const trimmed = keys.length > 150 ? Object.fromEntries(Object.entries(prev).slice(-100)) : prev;
        return { ...trimmed, ...newEntries };
      });
    });
  }, []);

  const fetchEvents = useCallback(async (silent = false, cat = activeCategory) => {
    try {
      if (!silent) { setLoading(true); setLoadError(false); }
      const params: Record<string, any> = { status: "open", limit: PAGE_SIZE, offset: 0 };
      if (cat !== "all") params.category = cat;
      const res = await api.get("/events/", { params });
      const all: EventItem[] = res.data ?? [];
      setEvents(all);
      const initialHasMore = all.length === PAGE_SIZE;
      scrollStateRef.current.hasMore = initialHasMore;
      setHasMore(initialHasMore);
      // Only fetch history on first load (not silent auto-refresh)
      if (!silent) fetchHistory(all);

      api.get("/predictions/activity?limit=15").then(r => {
        setActivity(r.data ?? []);
      }).catch(() => {});

      api.get("/news/single", { params: { category: "all", lang: language, max_results: 12 } })
        .then(r => setNewsArticles(r.data?.articles ?? []))
        .catch(() => {});

      fetchSentiment(all);
    } catch {
      // Show error card only on non-silent (user-visible) loads
      if (!silent) setLoadError(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetchSentiment, fetchHistory, activeCategory]);

  // Keep eventsRef in sync so loadMore always reads current length
  useEffect(() => { eventsRef.current = events; }, [events]);

  const loadMore = useCallback(async () => {
    const st = scrollStateRef.current;
    if (st.loadingMore || !st.hasMore) return;
    st.loadingMore = true;
    setLoadingMore(true);
    try {
      const params: Record<string, any> = { status: "open", limit: PAGE_SIZE, offset: eventsRef.current.length };
      if (activeCategory !== "all") params.category = activeCategory;
      let res = await api.get("/events/", { params });
      let page: EventItem[] = res.data ?? [];

      // If empty, trigger on-demand generation then retry once
      if (page.length === 0) {
        try { await api.post("/events/top-up"); } catch {}
        res = await api.get("/events/", { params });
        page = res.data ?? [];
      }

      if (page.length === 0) {
        st.hasMore = false;
        setHasMore(false);
        return;
      }
      setEvents(prev => {
        const ids = new Set(prev.map(e => e.id));
        const newItems = page.filter(e => !ids.has(e.id));
        fetchSentiment(newItems);
        fetchHistory(newItems);
        return [...prev, ...newItems];
      });
      st.hasMore = true;
      setHasMore(true);
    } catch {}
    finally { st.loadingMore = false; setLoadingMore(false); }
  }, [fetchSentiment, fetchHistory, activeCategory]); // stable — no stale closures

  // Keep a stable ref so useFocusEffect never recreates its callback
  const fetchEventsRef = useRef(fetchEvents);
  useEffect(() => { fetchEventsRef.current = fetchEvents; }, [fetchEvents]);

  useFocusEffect(useCallback(() => {
    fetchEventsRef.current();
    intervalRef.current = setInterval(() => fetchEventsRef.current(true), AUTO_REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [])); // empty deps — only re-runs on actual tab focus/blur

  // Restore category from localStorage (web)
  useEffect(() => {
    try {
      if (Platform.OS === "web") {
        const saved = localStorage.getItem("scenara_cat");
        if (saved) setActiveCategory(saved);
      }
    } catch {}
  }, []);

  // Carousel pool: featured events first, then top events
  const featuredEvents = events.filter(e => e.is_featured);
  const carouselPool = events.length > 0
    ? (featuredEvents.length >= 2 ? featuredEvents.slice(0, 6) : events.slice(0, 6))
    : [];
  // tick is used here so time-based displays (UrgencyBadge, countdown timers) re-render every 30s
  void tick;
  const featuredEvent = carouselPool[carouselIdx % Math.max(1, carouselPool.length)] ?? events[0];
  const featuredId = featuredEvent?.id;

  // Keep carouselIdxRef in sync
  useEffect(() => { carouselIdxRef.current = carouselIdx; }, [carouselIdx]);

  // Navigate carousel by delta (+1 or -1) — reused by auto-advance and swipe gestures
  const navigateCarousel = useCallback((delta: number) => {
    const poolLen = carouselPool.length;
    if (poolLen <= 1) return;
    const next = (carouselIdxRef.current + poolLen + delta) % poolLen;
    const easeOut = Easing.out(Easing.cubic);
    const exitDir = delta > 0 ? 60 : -60;
    const enterDir = delta > 0 ? -60 : 60;
    Animated.parallel([
      Animated.timing(featuredSlideAnim, { toValue: exitDir, duration: 260, easing: easeOut, useNativeDriver: false }),
      Animated.timing(featuredOpacityAnim, { toValue: 0, duration: 180, easing: easeOut, useNativeDriver: false }),
    ]).start(() => {
      setCarouselIdx(next);
      carouselIdxRef.current = next;
      featuredSlideAnim.setValue(enterDir);
      Animated.parallel([
        Animated.timing(featuredSlideAnim, { toValue: 0, duration: 320, easing: easeOut, useNativeDriver: false }),
        Animated.timing(featuredOpacityAnim, { toValue: 1, duration: 320, easing: easeOut, useNativeDriver: false }),
      ]).start();
    });
  }, [carouselPool.length]);

  // Auto-advance carousel every 5 seconds
  useEffect(() => {
    if (carouselPool.length <= 1) return;
    carouselRef.current = setInterval(() => { navigateCarousel(1); }, 5000);
    return () => { if (carouselRef.current) clearInterval(carouselRef.current); };
  }, [carouselPool.length, navigateCarousel]);

  // Reset carousel when events reload
  useEffect(() => { setCarouselIdx(0); carouselIdxRef.current = 0; featuredSlideAnim.setValue(0); featuredOpacityAnim.setValue(1); }, [events.length === 0]);

  // Keep refs in sync for stale-closure-safe access inside setInterval
  useEffect(() => { marketPageIdxRef.current = marketPageIdx; }, [marketPageIdx]);
  useEffect(() => { marketPageWidthRef.current = marketPageWidth; }, [marketPageWidth]);

// Reset market page on fresh load
  useEffect(() => {
    if (!loading) { setMarketPageIdx(0); marketPageIdxRef.current = 0; marketSlideAnim.setValue(0); }
  }, [loading]);

  // Fetch comments + related news whenever featured event changes
  useEffect(() => {
    if (!featuredId) return;
    api.get(`/comments/event/${featuredId}`)
      .then(r => setFeaturedComments((r.data ?? []).slice(0, 3)))
      .catch(() => {});
    if (featuredEvent) {
      const newsQuery = extractNewsQuery(featuredEvent, language);
      api.get("/news/single", { params: { query: newsQuery, lang: language, max_results: 3 } })
        .then(r => setFeaturedNews(r.data?.articles ?? []))
        .catch(() => {});
    }
  }, [featuredId]);

  if (!fontsLoaded) return null;

  const featured = featuredEvent;
  const rest = featured ? events.filter(e => e.id !== featured.id) : events;

  const balanceText = account
    ? `$${Number(account.balance).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : null;

  const handleCategorySelect = (key: string) => {
    setActiveCategory(key);
    setBetPanelId(null);
    setEvents([]);
    scrollStateRef.current = { loadingMore: false, hasMore: true };
    setHasMore(true);
    fetchEvents(false, key);
    try { if (Platform.OS === "web") localStorage.setItem("scenara_cat", key); } catch {}
  };

  const handleCardPress = (id: number) => {
    router.push({ pathname: "/market-detail", params: { eventId: String(id) } });
  };

  const handleBetPress = (id: number) => {
    setBetPanelId(prev => prev === id ? null : id);
    setExpandedId(null);
  };

  const handleNewsPress = (article: NewsArticle) => {
    router.push({
      pathname: "/news-detail",
      params: {
        title: article.title,
        url: article.url,
        source: article.source,
        published: article.published,
        image: article.image ?? "",
        description: article.description ?? "",
        source_url: article.source_url ?? "",
      },
    });
  };

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
            <View>
              <Text style={{ color: TEXT, fontSize: IS_WEB ? 26 : 20, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>
                {language === "pt" ? "Mercados" : "Markets"}
              </Text>
              {events.length > 0 && (
                <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 12 : 10, fontFamily: "DMSans_400Regular" }}>
                  {events.length} {language === "pt" ? "abertos" : "open"}
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {isAuthenticated && balanceText && (
              <View style={{ backgroundColor: "rgba(124,92,252,0.08)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: BORDER_P }}>
                <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                  {language === "pt" ? "SALDO" : "BALANCE"}
                </Text>
                <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold" }}>{balanceText}</Text>
              </View>
            )}
            {!isAuthenticated && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => router.push("/register")}
                  style={{ paddingHorizontal: IS_WEB ? 14 : 10, paddingVertical: IS_WEB ? 8 : 6, borderRadius: 10, borderWidth: 1, borderColor: BORDER_P }}
                >
                  <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: IS_WEB ? 13 : 11 }}>
                    {language === "pt" ? "Criar conta" : "Sign Up"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push("/login")} style={{ borderRadius: 10, overflow: "hidden" }}>
                  <LinearGradient colors={GRAD.BP} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: IS_WEB ? 14 : 10, paddingVertical: IS_WEB ? 8 : 6, borderRadius: 10, alignItems: "center" }}>
                    <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: IS_WEB ? 13 : 11 }}>
                      {language === "pt" ? "Entrar" : "Sign In"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Category tabs — counts are approximate (from current page) */}
        <CategoryTabs
          events={events}
          active={activeCategory}
          onSelect={handleCategorySelect}
          t={t}
          language={language}
        />

        {/* Live stats bar */}
        <LiveStatsBar eventCount={events.length} language={language} />

        {/* Activity ticker */}
        <ActivityTicker items={activity} language={language} />

        {/* Body */}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={PURPLE} size="large" />
          </View>
        ) : loadError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Text style={{ color: PURPLE_D, fontSize: 32, marginBottom: 14 }}>⚡</Text>
            <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_700Bold", textAlign: "center", marginBottom: 8 }}>
              {language === "pt" ? "Falha ao carregar mercados" : "Failed to load markets"}
            </Text>
            <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", marginBottom: 24 }}>
              {language === "pt"
                ? "O servidor pode estar iniciando. Aguarde alguns segundos e tente novamente."
                : "The server may be warming up. Wait a few seconds and try again."}
            </Text>
            <TouchableOpacity
              onPress={() => fetchEvents()}
              style={{ borderRadius: 12, overflow: "hidden" }}
            >
              <LinearGradient
                colors={GRAD.BRAND}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingHorizontal: 28, paddingVertical: 12 }}
              >
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                  {language === "pt" ? "Tentar novamente" : "Retry"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            testID="markets-scroll"
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchEvents(); }}
                tintColor={PURPLE}
              />
            }
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const h = contentSize.height || 9999;
              const distFromBottom = h - contentOffset.y - layoutMeasurement.height;
              if (distFromBottom < 300 && !loadingMore && hasMore) loadMore();
            }}
            scrollEventThrottle={150}
            contentContainerStyle={IS_WEB
              ? { padding: 20, paddingBottom: 60, maxWidth: 1400, alignSelf: "center" as const, width: "100%" }
              : { padding: 12, paddingBottom: 120 }
            }
          >
            {events.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: 80 }}>
                <Text style={{ color: PURPLE_D, fontSize: 32, marginBottom: 14 }}>◈</Text>
                <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium" }}>
                  {language === "pt" ? "Nenhum mercado encontrado" : "No markets found"}
                </Text>
              </View>
            ) : (
              <>
                {/* ── Hero row: Featured card + Breaking news sidebar ─────── */}
                <View style={IS_WEB && winW >= 700 ? { flexDirection: "row", gap: 12, marginBottom: 6 } : { marginBottom: 6 }}>

                  {/* Left: Featured hero card */}
                  {featured && (
                    <View style={IS_WEB && winW >= 700 ? { flex: 0.58 } : {}}>
                      {/* "Featured" badge */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5, padding: 1 }}>
                          <View style={{ backgroundColor: BG, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                              {language === "pt" ? "✦ DESTAQUE" : "✦ FEATURED"}
                            </Text>
                          </View>
                        </LinearGradient>
                      </View>

                      <Animated.View
                        style={{ transform: [{ translateX: featuredSlideAnim }], opacity: featuredOpacityAnim }}
                        onStartShouldSetResponder={() => true}
                        onResponderGrant={e => { featuredSwipeTouchX.current = e.nativeEvent.pageX; }}
                        onResponderRelease={e => {
                          const dx = e.nativeEvent.pageX - featuredSwipeTouchX.current;
                          if (Math.abs(dx) > 50) { navigateCarousel(dx < 0 ? 1 : -1); }
                        }}
                      >
                      <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: 1.5, borderColor: BORDER_P, overflow: "hidden", marginBottom: 4 }}>
                        <LinearGradient
                          colors={["rgba(79,142,247,0.06)", "rgba(124,92,252,0.04)", "rgba(0,0,0,0)"]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 4 }}
                        >
                          {/* Badges row */}
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                            {(() => { const cm = catMeta(featured.category); return (
                              <View style={{ backgroundColor: `${cm.color}12`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: `${cm.color}22` }}>
                                <Text style={{ color: cm.color, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>
                                  {cm.icon}  {(language === "pt" ? cm.label_pt : cm.label).toUpperCase()}
                                </Text>
                              </View>
                            ); })()}
                            <UrgencyBadge closesAt={featured.closes_at} language={language} />
                            {sentimentCache[featured.id] && <HotBadge total={sentimentCache[featured.id].total} language={language} />}
                          </View>

                          {/* Title */}
                          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push({ pathname: "/market-detail", params: { eventId: String(featured.id) } })}>
                            <Text style={{ color: TEXT, fontSize: IS_WEB ? 22 : 17, fontFamily: "DMSans_700Bold", lineHeight: IS_WEB ? 30 : 24, letterSpacing: -0.4, marginBottom: 16 }}>
                              {eventTitle(featured, language)}
                            </Text>
                          </TouchableOpacity>
                        </LinearGradient>

                        {/* Scenarios (left) + Chart (right) */}
                        <View style={{ flexDirection: IS_WEB ? "row" : "column", gap: IS_WEB ? 0 : 12, paddingHorizontal: 18, paddingBottom: 14 }}>
                          {/* Scenario list */}
                          <View style={{ width: IS_WEB ? 160 : "100%" as any, paddingRight: IS_WEB ? 16 : 0 }}>
                            {featured.scenarios.slice(0, 4).map((s, i) => {
                              const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
                              return (
                                <View key={s.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                                    <Text style={{ color: TEXT_SUB, fontSize: IS_WEB ? 14 : 13, fontFamily: "DMSans_500Medium", flex: 1 }} numberOfLines={1}>
                                      {scenarioTitle(s, language)}
                                    </Text>
                                  </View>
                                  <Text style={{ color, fontSize: IS_WEB ? 17 : 15, fontFamily: "DMSans_700Bold", marginLeft: 10 }}>
                                    {s.probability.toFixed(0)}%
                                  </Text>
                                </View>
                              );
                            })}
                            {sentimentCache[featured.id] && (
                              <View style={{ marginTop: 10 }}>
                                <SentimentBar total={sentimentCache[featured.id].total} scenarios={sentimentCache[featured.id].scenarios} eventScenarios={featured.scenarios} language={language} />
                              </View>
                            )}
                          </View>

                          {/* Probability chart */}
                          {historyCache[featured.id]?.some(s => s.points?.length >= 2) && (
                            <View
                              style={{ flex: 1, borderLeftWidth: IS_WEB ? 1 : 0, borderLeftColor: "rgba(255,255,255,0.05)", paddingLeft: IS_WEB ? 16 : 0 }}
                              onLayout={e => setFeaturedChartWidth(e.nativeEvent.layout.width)}
                            >
                              <ProbabilityChart
                                scenarios={historyCache[featured.id]}
                                height={IS_WEB ? 150 : 110}
                                compact={false}
                                width={featuredChartWidth > 0 ? featuredChartWidth : undefined}
                              />
                            </View>
                          )}
                        </View>

                        {/* News flowing below */}
                        {featuredNews.length > 0 && (
                          <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)", paddingHorizontal: 18 }}>
                            {featuredNews.map((article, i) => (
                              <TouchableOpacity
                                key={i}
                                onPress={() => handleNewsPress(article)}
                                activeOpacity={0.75}
                                style={{ paddingVertical: 10, borderBottomWidth: i < featuredNews.length - 1 ? 1 : 0, borderBottomColor: "rgba(255,255,255,0.04)" }}
                              >
                                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.3, marginBottom: 3 }}>
                                  {article.source}  ·  {timeAgo(article.published, language)}
                                </Text>
                                <Text style={{ color: TEXT_SUB, fontSize: IS_WEB ? 13 : 12, fontFamily: "DMSans_500Medium", lineHeight: IS_WEB ? 18 : 17 }} numberOfLines={2}>
                                  {article.title}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}

                        {/* Footer: volume + close date + actions */}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.1)", backgroundColor: "rgba(0,0,0,0.18)" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                            {sentimentCache[featured.id] && (
                              <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 11 : 10, fontFamily: "DMSans_500Medium" }}>
                                👥 {sentimentCache[featured.id].total}
                              </Text>
                            )}
                            {featured.closes_at && (
                              <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 11 : 10 }}>
                                · {language === "pt" ? "Fecha" : "Ends"} {formatCloseDate(featured.closes_at, language)}
                              </Text>
                            )}
                          </View>
                          <View style={{ flexDirection: "row", gap: 7 }}>
                            <TouchableOpacity
                              onPress={() => router.push({ pathname: "/market-detail", params: { eventId: String(featured.id) } })}
                              style={{ paddingHorizontal: IS_WEB ? 14 : 11, paddingVertical: IS_WEB ? 8 : 7, borderRadius: 10, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.07)" }}
                            >
                              <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: IS_WEB ? 12 : 11 }}>
                                {language === "pt" ? "Ver →" : "View →"}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleBetPress(featured.id)} style={{ borderRadius: 10, overflow: "hidden" }}>
                              <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: IS_WEB ? 14 : 11, paddingVertical: IS_WEB ? 8 : 7, alignItems: "center" }}>
                                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: IS_WEB ? 12 : 11 }}>
                                  {language === "pt" ? "⚡ Apostar" : "⚡ Trade"}
                                </Text>
                              </LinearGradient>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      </Animated.View>

                      {betPanelId === featured.id && (
                        <BetPanel
                          event={featured} language={language} t={t}
                          onClose={() => setBetPanelId(null)}
                          isAuthenticated={isAuthenticated} userId={userId}
                          placePrediction={placePrediction} refreshPortfolio={refreshPortfolio}
                          sentimentCache={sentimentCache}
                        />
                      )}

                      {/* Carousel dot indicators */}
                      {carouselPool.length > 1 && (
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }}>
                          {carouselPool.map((_, i) => (
                            <TouchableOpacity key={i} onPress={() => {
                              const easeOut = Easing.out(Easing.cubic);
                              Animated.parallel([
                                Animated.timing(featuredSlideAnim, { toValue: 60, duration: 260, easing: easeOut, useNativeDriver: false }),
                                Animated.timing(featuredOpacityAnim, { toValue: 0, duration: 180, easing: easeOut, useNativeDriver: false }),
                              ]).start(() => {
                                setCarouselIdx(i); carouselIdxRef.current = i;
                                featuredSlideAnim.setValue(-60);
                                Animated.parallel([
                                  Animated.timing(featuredSlideAnim, { toValue: 0, duration: 320, easing: easeOut, useNativeDriver: false }),
                                  Animated.timing(featuredOpacityAnim, { toValue: 1, duration: 320, easing: easeOut, useNativeDriver: false }),
                                ]).start();
                              });
                            }}>
                              <View style={{
                                width: i === carouselIdx ? 20 : 6,
                                height: 6, borderRadius: 3,
                                backgroundColor: i === carouselIdx ? PURPLE : "rgba(124,92,252,0.25)",
                              }} />
                            </TouchableOpacity>
                          ))}
                          <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular", marginLeft: 6 }}>
                            {carouselIdx + 1}/{carouselPool.length}
                          </Text>
                        </View>
                      )}

                      {/* Trade panel — always visible below featured card */}
                      {featured && (
                        <SidebarTradePanel
                          key={featured.id}
                          event={featured}
                          language={language}
                          isAuthenticated={isAuthenticated}
                          userId={userId}
                          placePrediction={placePrediction}
                          refreshPortfolio={refreshPortfolio}
                        />
                      )}
                    </View>
                  )}

                  {/* Right: Breaking news + hot topics sidebar (wide desktop only) */}
                  {IS_WEB && winW >= 700 && (
                    <View style={{ flex: 0.42, gap: 10 }}>
                      <BreakingNewsPanel
                        articles={newsArticles}
                        hotEvents={rest.slice(0, 6)}
                        language={language}
                      />
                    </View>
                  )}
                </View>

                {/* ── News grid ────────────────────────────────────────────── */}
                {newsArticles.length > 0 && (
                  <View style={{ marginBottom: IS_WEB ? 16 : 10 }}>
                    <NewsGrid
                      articles={newsArticles}
                      language={language}
                      onPress={handleNewsPress}
                    />
                  </View>
                )}
                {/* Trending picks strip — mobile only */}
                {!IS_WEB && rest.length > 3 && (
                  <TrendingPicks
                    events={rest.slice(0, 6)}
                    language={language}
                    onBetPress={handleBetPress}
                    onCardPress={handleCardPress}
                  />
                )}

                {/* ── Brazil Markets section ───────────────────────────────── */}
                <BrazilSection
                  events={events}
                  language={language}
                  sentimentCache={sentimentCache}
                  historyCache={historyCache}
                  onCardPress={handleCardPress}
                  onBetPress={handleBetPress}
                  onBetPanelId={betPanelId}
                  setBetPanelId={setBetPanelId}
                  isAuthenticated={isAuthenticated}
                  userId={userId}
                  placePrediction={placePrediction}
                  refreshPortfolio={refreshPortfolio}
                  t={t}
                  gridCols={gridCols}
                  cardPct={cardPct}
                />

                {/* ── All markets section ──────────────────────────────────── */}
                {rest.length > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
                    <Text style={{ color: PURPLE_D, fontSize: IS_WEB ? 13 : 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>
                      {language === "pt" ? "TODOS OS MERCADOS" : "ALL MARKETS"}
                    </Text>
                    <Text style={{ color: TEXT_MID, fontSize: IS_WEB ? 12 : 10 }}>{events.length} {language === "pt" ? "ativos" : "active"}</Text>
                  </View>
                )}

                {/* Market grid — paginated carousel, auto-advances every 5s */}
                {(() => {
                  const visibleRest = (!isAuthenticated && rest.length > GUEST_CAP)
                    ? rest.slice(0, GUEST_CAP)
                    : rest;
                  const showGate = !isAuthenticated && rest.length > GUEST_CAP;
                  const CARDS_PER_PAGE = gridCols * 2;
                  const pages: EventItem[][] = [];
                  for (let i = 0; i < visibleRest.length; i += CARDS_PER_PAGE) {
                    pages.push(visibleRest.slice(i, i + CARDS_PER_PAGE));
                  }
                  marketPageCountRef.current = pages.length;

                  const goToPage = (i: number) => {
                    const w = marketPageWidthRef.current;
                    if (w === 0) return;
                    // Phase 1: slide current page out to the right
                    Animated.timing(marketSlideAnim, { toValue: w, duration: 380, useNativeDriver: false }).start(() => {
                      setMarketPageIdx(i);
                      marketPageIdxRef.current = i;
                      // Snap new page in from the left
                      marketSlideAnim.setValue(-w);
                      // Phase 2: slide in from left to center
                      Animated.timing(marketSlideAnim, { toValue: 0, duration: 380, useNativeDriver: false }).start();
                    });
                  };

                  return (
                    <>
                      {gridCols > 1 ? (
                        <View
                          onLayout={e => {
                            const w = e.nativeEvent.layout.width;
                            if (w > 0 && w !== marketPageWidth) setMarketPageWidth(w);
                          }}
                          style={{ overflow: "hidden" }}
                        >
                          <Animated.View style={{ transform: [{ translateX: marketSlideAnim }] }}>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                              {(pages[marketPageIdx] ?? []).map(event => (
                                <View key={event.id} style={{ width: cardPct as any }}>
                                  <MarketCard
                                    event={event}
                                    onPress={() => handleCardPress(event.id)}
                                    onBetPress={() => handleBetPress(event.id)}
                                    language={language}
                                    sentiment={sentimentCache[event.id] ?? null}
                                    history={historyCache[event.id]}
                                    t={t}
                                  />
                                  {betPanelId === event.id && (
                                    <BetPanel
                                      event={event} language={language} t={t}
                                      onClose={() => setBetPanelId(null)}
                                      isAuthenticated={isAuthenticated} userId={userId}
                                      placePrediction={placePrediction} refreshPortfolio={refreshPortfolio}
                                      sentimentCache={sentimentCache}
                                    />
                                  )}
                                </View>
                              ))}
                            </View>
                          </Animated.View>

                          {/* Page indicator dots */}
                          {pages.length > 1 && (
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 }}>
                              {pages.map((_, i) => (
                                <TouchableOpacity key={i} onPress={() => goToPage(i)}>
                                  <View style={{
                                    width: i === marketPageIdx ? 20 : 6, height: 6, borderRadius: 3,
                                    backgroundColor: i === marketPageIdx ? PURPLE : "rgba(124,92,252,0.25)",
                                  }} />
                                </TouchableOpacity>
                              ))}
                              <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular", marginLeft: 6 }}>
                                {marketPageIdx + 1}/{pages.length}
                              </Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        visibleRest.map(event => (
                          <View key={event.id} style={{ marginBottom: 8 }}>
                            <MarketCard
                              event={event}
                              onPress={() => handleCardPress(event.id)}
                              onBetPress={() => handleBetPress(event.id)}
                              language={language}
                              sentiment={sentimentCache[event.id] ?? null}
                              history={historyCache[event.id]}
                              t={t}
                            />
                            {betPanelId === event.id && (
                              <BetPanel
                                event={event} language={language} t={t}
                                onClose={() => setBetPanelId(null)}
                                isAuthenticated={isAuthenticated} userId={userId}
                                placePrediction={placePrediction} refreshPortfolio={refreshPortfolio}
                                sentimentCache={sentimentCache}
                              />
                            )}
                          </View>
                        ))
                      )}

                      {/* Guest gate — fade + CTA */}
                      {showGate && (
                        <View style={{ marginTop: -100, paddingTop: 80 }}>
                          <LinearGradient
                            colors={["transparent", BG, BG]}
                            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                            style={{ height: 140, marginBottom: -8 }}
                          />
                          <View style={{ backgroundColor: CARD, borderRadius: 18, padding: 22, alignItems: "center", borderWidth: 1, borderColor: BORDER_P, marginBottom: 16 }}>
                            <Text style={{ fontSize: 28, marginBottom: 10 }}>🔒</Text>
                            <Text style={{ color: TEXT, fontSize: 16, fontFamily: "DMSans_700Bold", textAlign: "center", marginBottom: 6 }}>
                              {language === "pt" ? `+${rest.length - GUEST_CAP} mercados esperando` : `+${rest.length - GUEST_CAP} more markets waiting`}
                            </Text>
                            <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", marginBottom: 18, lineHeight: 18 }}>
                              {language === "pt"
                                ? "Crie uma conta gratuita para ver todos os mercados e fazer previsões."
                                : "Create a free account to see all markets and start making predictions."}
                            </Text>
                            <TouchableOpacity
                              onPress={() => router.push("/login")}
                              style={{ borderRadius: 14, overflow: "hidden", width: "100%" }}
                            >
                              <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 13, alignItems: "center" }}>
                                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                                  {language === "pt" ? "⚡ Criar conta grátis" : "⚡ Create free account"}
                                </Text>
                              </LinearGradient>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.push("/login")} style={{ marginTop: 10 }}>
                              <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>
                                {language === "pt" ? "Já tenho conta →" : "Already have an account →"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </>
                  );
                })()}
              </>
            )}

            {/* Load more / generating indicator */}
            {loadingMore && (
              <View style={{ paddingVertical: 20, alignItems: "center", gap: 6 }}>
                <ActivityIndicator color={PURPLE} size="small" />
                <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>
                  {language === "pt" ? "Gerando novos mercados..." : "Generating new markets..."}
                </Text>
              </View>
            )}
            {!hasMore && !loadingMore && events.length > 0 && (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>
                  {language === "pt" ? "— Todos os mercados carregados —" : "— All markets loaded —"}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}