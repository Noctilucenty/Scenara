/**
 * MERGE SNIPPETS — drop into index.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Updated EventGridCard  — adds timeUntil countdown + live category counts
 * 2. CategoryTabStrip       — category tabs with open market count badges
 * 3. QuickAmountPicker      — reusable quick-bet amount buttons (psychoaddictive anchoring)
 * 4. PayoutPreviewRow       — inline payout preview before confirming a bet
 *
 * All components import from @/src/theme — no more inline color constants.
 */

import React from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { C, GRAD, SCENARIO_COLORS, CATEGORY_META, catMeta, timeUntil } from "@/src/theme";
import { ProbabilityChart, ScenarioHistory } from "@/components/ProbabilityChart";

// Re-export ArcGauge here so index.tsx can import from one place
// (You can move the implementation here if you want to clean up index.tsx)

// ── Types (copy from index.tsx — shared) ──────────────────────────────────────

type Scenario  = { id: number; title: string; title_pt?: string | null; title_zh?: string | null; probability: number; sort_order: number; status: string };
type EventItem = { id: number; slug: string; title: string; title_pt?: string | null; title_zh?: string | null; description?: string | null; description_pt?: string | null; description_zh?: string | null; category: string; status: string; resolution_note?: string | null; is_featured: boolean; closes_at?: string | null; resolved_at?: string | null; scenarios: Scenario[] };

function eventTitle(event: EventItem, lang: string): string {
  if (lang === "zh") return event.title_zh || event.title;
  if (lang === "pt") return event.title_pt || event.title;
  return event.title;
}
function scenarioTitle(s: Scenario | undefined | null, lang: string): string {
  if (!s) return "";
  if (lang === "zh") return s.title_zh || s.title;
  if (lang === "pt") return s.title_pt || s.title;
  return s.title;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. UPDATED EventGridCard
//    Changes vs original:
//    • Adds timeUntil(event.closes_at) countdown in card footer
//    • Uses catMeta() from theme — no local CAT_META duplication
// ─────────────────────────────────────────────────────────────────────────────

// ArcGauge (kept inline for this file — or import from index.tsx)
function ArcGauge({ probability, size = 58, t }: { probability: number; size?: number; t?: any }) {
  const cx = size / 2, cy = size / 2, r = size * 0.37, sw = size * 0.09;
  const START = 135, SWEEP = 270;
  function pt(a: number) { const rad = ((a - 90) * Math.PI) / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; }
  function arc(a1: number, a2: number) { const s = pt(a1), e = pt(a2), lg = a2 - a1 > 180 ? 1 : 0; return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`; }
  const end = START + (Math.min(Math.max(probability, 1), 99) / 100) * SWEEP;
  const Svg = require("react-native-svg").default;
  const { Path, Defs } = require("react-native-svg");
  const { LinearGradient: SvgGrad, Stop } = require("react-native-svg");
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <SvgGrad id={`g${Math.round(probability)}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.BLUE} /><Stop offset="0.5" stopColor={C.PURPLE} /><Stop offset="1" stopColor={C.PINK} />
          </SvgGrad>
        </Defs>
        <Path d={arc(START, START + SWEEP)} stroke="rgba(255,255,255,0.07)" strokeWidth={sw} fill="none" strokeLinecap="round" />
        <Path d={arc(START, end)} stroke={`url(#g${Math.round(probability)})`} strokeWidth={sw} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.TEXT, fontSize: size * 0.19, fontFamily: "DMSans_700Bold", includeFontPadding: false }}>{Math.round(probability)}%</Text>
        <Text style={{ color: C.TEXT_MID, fontSize: size * 0.11, fontFamily: "DMSans_400Regular", includeFontPadding: false, marginTop: -1 }}>{t?.common?.chance ?? "chance"}</Text>
      </View>
    </View>
  );
}

export const EventGridCard = React.memo(function EventGridCard({ event, history, cardW, onPress, onResolve, t, language }: {
  event: EventItem; history: ScenarioHistory[]; cardW: number;
  onPress(): void; onResolve(): void; t: any; language: string;
}) {
  const resolved  = event.status === "resolved";
  const cm        = catMeta(event.category);
  const hasChart  = history.some(s => s.points.length >= 2);
  const firstProb = event.scenarios[0]?.probability ?? 50;
  const gaugeSize = Math.min(cardW * 0.34, 60);
  const title     = eventTitle(event, language);

  // timeUntil — countdown urgency, one of the strongest conversion drivers
  const countdown = event.closes_at ? timeUntil(event.closes_at, language as any) : null;

  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.85}
      style={{ width: cardW, backgroundColor: C.CARD, borderRadius: 13, borderWidth: 1, borderColor: resolved ? "rgba(124,92,252,0.08)" : C.BORDER, overflow: "hidden" }}
    >
      <View style={{ padding: 11 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <View style={{ backgroundColor: `${cm.color}12`, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: `${cm.color}20`, maxWidth: cardW * 0.54 }}>
            <Text style={{ color: cm.color, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }} numberOfLines={1}>
              {cm.icon}  {(language === "pt" ? cm.label_pt : cm.label).toUpperCase()}
            </Text>
          </View>
          <ArcGauge probability={firstProb} size={gaugeSize} t={t} />
        </View>

        <Text style={{ color: C.TEXT, fontSize: 11, fontFamily: "DMSans_700Bold", lineHeight: 15, marginBottom: 8 }} numberOfLines={3}>{title}</Text>

        {hasChart && (
          <View style={{ borderRadius: 7, overflow: "hidden", marginBottom: 8, backgroundColor: "rgba(124,92,252,0.03)" }}>
            <ProbabilityChart scenarios={history} height={46} compact width={cardW - 22} />
          </View>
        )}

        {event.scenarios.map((s, idx) => (
          <View key={s.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }} />
              <Text style={{ color: C.TEXT_SUB, fontSize: 11, fontFamily: "DMSans_500Medium" }} numberOfLines={1}>
                {scenarioTitle(s, language)}
              </Text>
            </View>
            <Text style={{ color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length], fontSize: 12, fontFamily: "DMSans_700Bold" }}>
              {s.probability.toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>

      {/* Footer — countdown replaces simple LIVE/CLOSED */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 11, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)", backgroundColor: "rgba(0,0,0,0.18)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: resolved ? C.TEXT_MID : C.GREEN }} />
          <Text style={{ color: resolved ? C.TEXT_MID : C.GREEN, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>
            {resolved
              ? (language === "pt" ? "ENCERRADO" : language === "zh" ? "已关闭" : "CLOSED")
              // countdown if available, otherwise LIVE
              : countdown && countdown !== (language === "pt" ? "Encerrado" : language === "zh" ? "已关闭" : "Closed")
                ? countdown.toUpperCase()
                : (language === "pt" ? "● AO VIVO" : language === "zh" ? "● 直播" : "● LIVE")}
          </Text>
        </View>
        {!resolved && (
          <TouchableOpacity
            onPress={e => { (e as any).stopPropagation?.(); onResolve(); }}
            style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: C.BORDER_P, backgroundColor: "rgba(124,92,252,0.06)" }}
          >
            <Text style={{ color: C.PURPLE_DIM, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>
              {t.markets.resolve}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CATEGORY TAB STRIP with open market count badges
//    Shows "Crypto (3)" — scarcity cue drives category exploration.
//    Merge: replace the existing ScrollView category tabs in index.tsx
// ─────────────────────────────────────────────────────────────────────────────

export function CategoryTabStrip({
  events,
  activeCategory,
  onSelect,
  t,
  language,
}: {
  events: EventItem[];
  activeCategory: string;
  onSelect(cat: string): void;
  t: any;
  language: string;
}) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}>
      {/* Horizontal scroll — same as original */}
      {React.createElement(
        require("react-native").ScrollView,
        {
          horizontal: true,
          showsHorizontalScrollIndicator: false,
          contentContainerStyle: { paddingHorizontal: 16, paddingVertical: 8, gap: 6, flexDirection: "row" },
        },
        Object.entries(CATEGORY_META).map(([key, meta]) => {
          const active = activeCategory === key;
          const openCount = events.filter(e => e.category === key && e.status === "open").length;
          // Hide empty categories (same as original)
          if (key !== "all" && openCount === 0) return null;
          const label = language === "pt" ? meta.label_pt : meta.label;

          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelect(key)}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                backgroundColor: active ? `${meta.color}15` : "rgba(255,255,255,0.03)",
                borderWidth: 1,
                borderColor: active ? `${meta.color}35` : "rgba(255,255,255,0.06)",
                flexDirection: "row", alignItems: "center", gap: 4,
              }}
            >
              <Text style={{ color: active ? meta.color : C.TEXT_SUB, fontSize: 11, fontFamily: active ? "DMSans_700Bold" : "DMSans_500Medium" }}>
                {meta.icon}  {label}
              </Text>
              {/* Count badge — scarcity cue */}
              {key !== "all" && openCount > 0 && (
                <View style={{ backgroundColor: `${meta.color}20`, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ color: meta.color, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{openCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. QUICK AMOUNT PICKER
//    Port from Claude's BetModal — preset buttons above input.
//    Anchoring: $500 button makes $100 feel "small" → higher avg bets.
//    Usage: drop inside DetailPanelContent and HeroCard bet sections.
// ─────────────────────────────────────────────────────────────────────────────

export function QuickAmountPicker({
  currentAmount,
  onSelect,
  presets = ["10", "50", "100", "500"],
}: {
  currentAmount: string;
  onSelect(v: string): void;
  presets?: string[];
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
      {presets.map(v => {
        const active = currentAmount === v;
        return (
          <TouchableOpacity
            key={v}
            onPress={() => onSelect(v)}
            style={{
              flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center",
              backgroundColor: active ? "rgba(124,92,252,0.18)" : "rgba(124,92,252,0.06)",
              borderWidth: 1,
              borderColor: active ? C.BORDER_P : "rgba(124,92,252,0.15)",
            }}
          >
            <Text style={{ color: active ? C.PURPLE : C.PURPLE_DIM, fontFamily: "DMSans_700Bold", fontSize: 12 }}>
              ${v}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PAYOUT PREVIEW ROW
//    Shows potential payout + profit the instant user selects scenario + amount.
//    This is the dopamine trigger before confirming — port from Claude's BetModal.
//    Usage: render just above the "Confirm" button in any bet flow.
// ─────────────────────────────────────────────────────────────────────────────

export function PayoutPreviewRow({
  amount,
  probability,
  language,
}: {
  amount: string;
  probability: number;
  language: string;
}) {
  const amt = parseFloat(amount) || 0;
  if (amt <= 0 || probability <= 0) return null;

  const payout     = amt * (100 / probability);
  const profit     = payout - amt;
  const multiplier = (100 / probability).toFixed(2);

  return (
    <View style={{
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      backgroundColor: "rgba(34,197,94,0.06)",
      borderRadius: 12, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
      paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
    }}>
      <View>
        <Text style={{ color: C.TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
          {language === "pt" ? "RETORNO POTENCIAL" : language === "zh" ? "潜在收益" : "POTENTIAL PAYOUT"}
        </Text>
        <Text style={{ color: C.GREEN, fontFamily: "DMSans_700Bold", fontSize: 20, marginTop: 2 }}>
          ${payout.toFixed(2)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: C.TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
          {language === "pt" ? "LUCRO" : language === "zh" ? "利润" : "PROFIT"}
        </Text>
        <Text style={{ color: C.GREEN, fontFamily: "DMSans_700Bold", fontSize: 16, marginTop: 2 }}>
          +${profit.toFixed(2)}
          <Text style={{ color: C.TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}> ({multiplier}x)</Text>
        </Text>
      </View>
    </View>
  );
}