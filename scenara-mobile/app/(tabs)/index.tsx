/**
 * Markets Tab — Primary trading screen
 * Polymarket-style list with inline quick-bet, category filters, crowd sentiment,
 * countdown urgency, and a featured hero card.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, TextInput, ActivityIndicator, RefreshControl,
  Platform, Dimensions, Animated, KeyboardAvoidingView, Image,
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
        Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 0,    useNativeDriver: false }),
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
function MarketCard({ event, onPress, onBetPress, language, sentiment, t, history }: {
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
      }}
    >
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
          <ArcGauge probability={prob} size={46} />
        </View>

        {/* Title */}
        <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 19, marginBottom: 8 }} numberOfLines={2}>
          {eventTitle(event, language)}
        </Text>

        {/* Scenario probability bars */}
        {event.scenarios.slice(0, 2).map((s, i) => (
          <View key={s.id} style={{ marginBottom: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: SCENARIO_COLORS[i] }} />
                <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_500Medium" }}>{scenarioTitle(s, language)}</Text>
              </View>
              <Text style={{ color: SCENARIO_COLORS[i], fontSize: 12, fontFamily: "DMSans_700Bold" }}>{s.probability.toFixed(0)}%</Text>
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)", backgroundColor: "rgba(0,0,0,0.12)" }}>
        <MarketLiveDot language={language} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity
            onPress={onPress}
            style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: BORDER }}
          >
            <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_500Medium" }}>
              {language === "pt" ? "Detalhes" : "Details"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={e => { (e as any).stopPropagation?.(); onBetPress(); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.1)" }}
          >
            <Text style={{ color: PURPLE, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>
              {language === "pt" ? "⚡ Apostar" : "⚡ Trade"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Inline bet panel ──────────────────────────────────────────────────────────
function BetPanel({ event, language, t, onClose, isAuthenticated, userId, placePrediction, refreshPortfolio }: {
  event: EventItem; language: string; t: any; onClose(): void;
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
                return (
                  <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : BORDER, backgroundColor: isSel ? `${SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}18` : "transparent" }}>
                    <Text style={{ color: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 12 }} numberOfLines={1}>{scenarioTitle(s, language)}</Text>
                    <Text style={{ color: isSel ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : TEXT_MID, fontSize: 11, textAlign: "center" }}>{s.probability.toFixed(0)}%</Text>
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
              <Text style={{ color: PURPLE_D }}>{item.amount_label}</Text>
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
          Animated.timing(anim, { toValue: 1, duration: 1300, useNativeDriver: false }),
          Animated.timing(anim, { toValue: 0, duration: 0,    useNativeDriver: false }),
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
      Animated.timing(translateY, { toValue: -half, duration: half * 60, useNativeDriver: false })
    );
    animRef.current.start();
    return () => animRef.current?.stop();
  }, [contentH, liveComments.length]);

  if (liveComments.length === 0) return null;
  const doubled = [...liveComments, ...liveComments];

  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: "hidden" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}>
        <MarketLiveDot language={language} />
        <Text style={{ color: TEXT, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginLeft: 2 }}>
          {language === "pt" ? "COMENTÁRIOS" : "LIVE COMMENTS"}
        </Text>
      </View>

      {/* Scrolling body — fixed height with overflow hidden */}
      <View style={{ height: 260, overflow: "hidden" }}>
        <Animated.View
          style={{ transform: [{ translateY }] }}
          onLayout={e => setContentH(e.nativeEvent.layout.height)}
        >
          {doubled.map((item, i) => {
            const color = sidebarAvatarColor(item.uid);
            return (
              <View key={i} style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.03)", alignItems: "flex-start" }}>
                <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: color + "22", borderWidth: 1, borderColor: color + "44", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <Text style={{ color, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{sidebarInitials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_700Bold", marginBottom: 2 }}>{item.name}</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", lineHeight: 16 }}>{item.body}</Text>
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
function BreakingNewsPanel({ articles, hotEvents, language, featuredEventId }: {
  articles: NewsArticle[];
  hotEvents: EventItem[];
  language: string;
  featuredEventId?: number;
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

      {/* Live comments auto-scroller */}
      <SidebarLiveComments featuredEventId={featuredEventId} language={language} />
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
          if (key !== "all" && count === 0) return null;
          const label = language === "pt" ? meta.label_pt : meta.label;
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
              <Text style={{ color: isActive ? meta.color : TEXT_MID, fontSize: 11, fontFamily: isActive ? "DMSans_700Bold" : "DMSans_500Medium" }}>
                {meta.icon}  {label}
              </Text>
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

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MarketsScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { isAuthenticated, userId, account, placePrediction, refreshPortfolio } = useTrading();
  const { open: openSidebar } = React.useContext(SidebarContext);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<any>(null);
  const PAGE_SIZE = 20;
const MAX_EVENTS = 300;
const GUEST_CAP  = 6;

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
      setSentimentCache(prev => ({ ...prev, ...cache }));
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
      setHistoryCache(prev => ({ ...prev, ...newEntries }));
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
      setHasMore(all.length === PAGE_SIZE);
      // Only fetch history on first load (not silent auto-refresh)
      if (!silent) fetchHistory(all);

      api.get("/predictions/activity?limit=15").then(r => {
        setActivity(r.data ?? []);
      }).catch(() => {});

      api.get("/news/single", { params: { category: "all", lang: language, max_results: 8 } })
        .then(r => setNewsArticles(r.data?.articles ?? []))
        .catch(() => {});

      fetchSentiment(all);
    } catch {
      // Show error card only on non-silent (user-visible) loads
      if (!silent) setLoadError(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetchSentiment, fetchHistory, activeCategory]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params: Record<string, any> = { status: "open", limit: PAGE_SIZE, offset: events.length };
      if (activeCategory !== "all") params.category = activeCategory;
      const res = await api.get("/events/", { params });
      const page: EventItem[] = res.data ?? [];
      if (page.length === 0) { setHasMore(false); return; }
      setEvents(prev => {
        const ids = new Set(prev.map(e => e.id));
        const newItems = page.filter(e => !ids.has(e.id));
        fetchSentiment(newItems);
        fetchHistory(newItems);
        return [...prev, ...newItems];
      });
      setHasMore(page.length === PAGE_SIZE && (events.length + page.length) < MAX_EVENTS);
    } catch {}
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, events.length, fetchSentiment, activeCategory]);

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

  const featuredEvent = events.find(e => e.is_featured) ?? events[0];
  const featuredId = featuredEvent?.id;

  // Fetch comments + related news whenever featured event changes
  useEffect(() => {
    if (!featuredId) return;
    api.get(`/comments/event/${featuredId}`)
      .then(r => setFeaturedComments((r.data ?? []).slice(0, 3)))
      .catch(() => {});
    if (featuredEvent) {
      api.get("/news/single", { params: { category: featuredEvent.category, lang: "en", max_results: 3 } })
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
              <Text style={{ color: TEXT, fontSize: 20, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>
                {language === "pt" ? "Mercados" : "Markets"}
              </Text>
              {events.length > 0 && (
                <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>
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
              <TouchableOpacity onPress={() => router.push("/login")} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, overflow: "hidden" }}>
                <LinearGradient colors={GRAD.BP} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, alignItems: "center" }}>
                  <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 12 }}>
                    {language === "pt" ? "Entrar" : "Sign In"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
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
            contentContainerStyle={{ padding: 14, paddingBottom: 80 }}
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
                <View style={IS_WEB ? { flexDirection: "row", gap: 12, marginBottom: 6 } : { marginBottom: 6 }}>

                  {/* Left: Featured hero card */}
                  {featured && (
                    <View style={IS_WEB ? { flex: 0.58 } : {}}>
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

                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => router.push({ pathname: "/market-detail", params: { eventId: String(featured.id) } })}
                        style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: 1.5, borderColor: BORDER_P, overflow: "hidden", marginBottom: 4 }}
                      >
                        <LinearGradient
                          colors={["rgba(79,142,247,0.07)", "rgba(124,92,252,0.05)", "rgba(240,80,174,0.05)"]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          style={{ padding: 18 }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                                {(() => {
                                  const cm = catMeta(featured.category);
                                  return (
                                    <View style={{ backgroundColor: `${cm.color}12`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: `${cm.color}22` }}>
                                      <Text style={{ color: cm.color, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>
                                        {cm.icon}  {(language === "pt" ? cm.label_pt : cm.label).toUpperCase()}
                                      </Text>
                                    </View>
                                  );
                                })()}
                                <UrgencyBadge closesAt={featured.closes_at} language={language} />
                                {sentimentCache[featured.id] && (
                                  <HotBadge total={sentimentCache[featured.id].total} language={language} />
                                )}
                              </View>
                              <Text style={{ color: TEXT, fontSize: IS_WEB ? 17 : 18, fontFamily: "DMSans_700Bold", lineHeight: 25, letterSpacing: -0.3 }}>
                                {eventTitle(featured, language)}
                              </Text>
                            </View>
                            <ArcGauge probability={featured.scenarios[0]?.probability ?? 50} size={IS_WEB ? 56 : 64} />
                          </View>

                          {/* Scenario probability bars */}
                          {featured.scenarios.slice(0, 2).map((s, i) => {
                            const prob = s.probability;
                            const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
                            return (
                              <View key={s.id} style={{ marginBottom: 8 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                                    <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{scenarioTitle(s, language)}</Text>
                                  </View>
                                  <Text style={{ color, fontSize: 14, fontFamily: "DMSans_700Bold" }}>{prob.toFixed(0)}%</Text>
                                </View>
                                <View style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                                  <View style={{ width: `${prob}%` as any, height: 3, borderRadius: 2, backgroundColor: color }} />
                                </View>
                              </View>
                            );
                          })}

                          {sentimentCache[featured.id] && (
                            <SentimentBar
                              total={sentimentCache[featured.id].total}
                              scenarios={sentimentCache[featured.id].scenarios}
                              eventScenarios={featured.scenarios}
                              language={language}
                            />
                          )}

                          {/* Featured probability chart */}
                          {historyCache[featured.id] && historyCache[featured.id].some(s => s.points?.length >= 2) && (
                            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.1)" }}>
                              <Text style={{ color: PURPLE_D, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 6 }}>
                                {language === "pt" ? "HISTÓRICO" : "PROBABILITY HISTORY"}
                              </Text>
                              <ProbabilityChart scenarios={historyCache[featured.id]} height={100} compact={false} />
                            </View>
                          )}

                          {/* Related news for this event */}
                          {featuredNews.length > 0 && (
                            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.1)" }}>
                              <Text style={{ color: PURPLE_D, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 8 }}>
                                {language === "pt" ? "NOTÍCIAS RELACIONADAS" : "RELATED NEWS"}
                              </Text>
                              {featuredNews.map((article, i) => (
                                <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 7, borderBottomWidth: i < featuredNews.length - 1 ? 1 : 0, borderBottomColor: "rgba(255,255,255,0.04)" }}>
                                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(124,92,252,0.15)", alignItems: "center", justifyContent: "center" }}>
                                    <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{i + 1}</Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_500Medium", lineHeight: 15 }} numberOfLines={2}>
                                      {article.title}
                                    </Text>
                                    <Text style={{ color: TEXT_MID, fontSize: 8, marginTop: 2 }}>
                                      {article.source} · {timeAgo(article.published, language)}
                                    </Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* Community comments */}
                          {featuredComments.length > 0 && (
                            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.1)" }}>
                              <Text style={{ color: PURPLE_D, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 8 }}>
                                {language === "pt" ? "COMENTÁRIOS" : "COMMENTS"}
                              </Text>
                              {featuredComments.map((c, i) => {
                                const initials = (c.display_name ?? "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                                const avatarColors = [PURPLE, "#4F8EF7", "#F050AE", GREEN, "#F7931A"];
                                const avatarColor = avatarColors[c.id % avatarColors.length];
                                return (
                                  <View key={c.id} style={{ flexDirection: "row", gap: 8, paddingVertical: 7, borderBottomWidth: i < featuredComments.length - 1 ? 1 : 0, borderBottomColor: "rgba(255,255,255,0.04)" }}>
                                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: `${avatarColor}25`, borderWidth: 1, borderColor: `${avatarColor}40`, alignItems: "center", justifyContent: "center" }}>
                                      <Text style={{ color: avatarColor, fontSize: 8, fontFamily: "DMSans_700Bold" }}>{initials}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <View style={{ flexDirection: "row", gap: 5, alignItems: "center", marginBottom: 2 }}>
                                        <Text style={{ color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_700Bold" }}>{c.display_name ?? "Anonymous"}</Text>
                                        <Text style={{ color: TEXT_MID, fontSize: 8 }}>{timeAgo(c.created_at, language)}</Text>
                                      </View>
                                      <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", lineHeight: 15 }} numberOfLines={2}>
                                        {c.body}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })}
                              <TouchableOpacity
                                onPress={() => router.push({ pathname: "/market-detail", params: { eventId: String(featured.id) } })}
                                style={{ marginTop: 6 }}
                              >
                                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_500Medium" }}>
                                  {language === "pt" ? "Ver todos os comentários →" : "See all comments →"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </LinearGradient>

                        <View style={{ flexDirection: "row", gap: 8, padding: 14, paddingTop: 0, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.1)" }}>
                          <TouchableOpacity
                            onPress={() => router.push({ pathname: "/market-detail", params: { eventId: String(featured.id) } })}
                            style={{ flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.06)" }}
                          >
                            <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 12 }}>
                              {language === "pt" ? "Ver detalhes →" : "View details →"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleBetPress(featured.id)}
                            style={{ flex: 1, borderRadius: 12, overflow: "hidden" }}
                          >
                            <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 11, alignItems: "center" }}>
                              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 12 }}>
                                {language === "pt" ? "⚡ Apostar" : "⚡ Trade Now"}
                              </Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>

                      {betPanelId === featured.id && (
                        <BetPanel
                          event={featured} language={language} t={t}
                          onClose={() => setBetPanelId(null)}
                          isAuthenticated={isAuthenticated} userId={userId}
                          placePrediction={placePrediction} refreshPortfolio={refreshPortfolio}
                        />
                      )}
                    </View>
                  )}

                  {/* Right: Breaking news + hot topics sidebar (web only) */}
                  {IS_WEB && (
                    <View style={{ flex: 0.42 }}>
                      <BreakingNewsPanel
                        articles={newsArticles}
                        hotEvents={rest.slice(0, 6)}
                        language={language}
                        featuredEventId={featuredEvent?.id}
                      />
                    </View>
                  )}
                </View>

                {/* Mobile-only: breaking news strip (collapsed) */}
                {!IS_WEB && newsArticles.length > 0 && (
                  <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: BORDER }}>
                    <View style={{ marginBottom: 8 }}>
                      <LiveBadge />
                    </View>
                    {newsArticles.slice(0, 3).map((article, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => router.push({ pathname: "/news-detail", params: { title: article.title, url: article.url, source: article.source, published: article.published, image: article.image ?? "", description: article.description ?? "" } })}
                        activeOpacity={0.75}
                        style={{ flexDirection: "row", gap: 7, paddingVertical: 6, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: "rgba(255,255,255,0.04)", alignItems: "center" }}
                      >
                        <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", minWidth: 14 }}>{i + 1}</Text>
                        {/* Thumbnail — favicon from source domain, or placeholder */}
                        {(() => {
                          const faviconUri = article.source_url
                            ? `https://www.google.com/s2/favicons?domain=${article.source_url}&sz=64`
                            : null;
                          return faviconUri ? (
                            <View style={{ width: 40, height: 40, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", flexShrink: 0, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" }}>
                              <Image
                                source={{ uri: faviconUri }}
                                style={{ width: 26, height: 26, borderRadius: 4 }}
                                resizeMode="contain"
                              />
                            </View>
                          ) : (
                            <View style={{ width: 40, height: 40, borderRadius: 7, backgroundColor: "rgba(124,92,252,0.1)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Text style={{ fontSize: 16 }}>📰</Text>
                            </View>
                          );
                        })()}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_500Medium", lineHeight: 14 }} numberOfLines={2}>{article.title}</Text>
                          <Text style={{ color: TEXT_MID, fontSize: 8, marginTop: 2 }}>{article.source} · {timeAgo(article.published, language)}</Text>
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

                {/* ── All markets section ──────────────────────────────────── */}
                {rest.length > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
                    <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>
                      {language === "pt" ? "TODOS OS MERCADOS" : "ALL MARKETS"}
                    </Text>
                    <Text style={{ color: TEXT_MID, fontSize: 10 }}>{events.length} {language === "pt" ? "ativos" : "active"}</Text>
                  </View>
                )}

                {/* Market grid — guest sees 6, logged-in sees up to 300 */}
                {(() => {
                  const visibleRest = (!isAuthenticated && rest.length > GUEST_CAP)
                    ? rest.slice(0, GUEST_CAP)
                    : rest;
                  const showGate = !isAuthenticated && rest.length > GUEST_CAP;

                  return (
                    <>
                      {IS_WEB ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {visibleRest.map(event => (
                            <View key={event.id} style={{ width: "49%" as any }}>
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
                                />
                              )}
                            </View>
                          ))}
                        </View>
                      ) : (
                        visibleRest.map(event => (
                          <View key={event.id}>
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

            {/* Load more indicator */}
            {loadingMore && (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={PURPLE} size="small" />
                <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular", marginTop: 6 }}>
                  {language === "pt" ? "Carregando mais..." : "Loading more..."}
                </Text>
              </View>
            )}
            {!hasMore && events.length > 0 && (
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