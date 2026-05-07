import { useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, ActivityIndicator, TextInput, Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { useLanguage } from "@/src/i18n";
import { C, GRAD, timeUntil } from "@/src/theme";
import {
  fetchSignalLabBacktest,
  fetchSignalLabMarkets,
  fetchSignalLabSignal,
  submitSignalLabForecast,
} from "@/src/lib/signalLab/api";
import {
  formatEdgeGap, formatProbability, normalizeProbability,
} from "@/src/lib/signalLab/scoring";
import type {
  BacktestSummary, ConfidenceLabel, Market, MarketState, Signal,
} from "@/src/lib/signalLab/types";

const STATE_COLORS: Record<MarketState, string> = {
  UP:   C.GREEN,
  FLAT: C.TEXT_MID,
  DOWN: C.RED,
};

const STATE_LABEL: Record<MarketState, { en: string; pt: string }> = {
  UP:   { en: "UP",   pt: "ALTA"   },
  FLAT: { en: "FLAT", pt: "NEUTRO" },
  DOWN: { en: "DOWN", pt: "BAIXA"  },
};

const CONFIDENCE_COLOR: Record<ConfidenceLabel, string> = {
  Low:    C.RED,
  Medium: "#F59E0B",
  High:   C.GREEN,
};

export default function SignalLabScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [backtest, setBacktest] = useState<BacktestSummary | null>(null);

  const [userProb, setUserProb] = useState<string>("");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [reasoning, setReasoning] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

  const ispt = language === "pt";

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSignalLabMarkets(), fetchSignalLabBacktest()])
      .then(([ms, bt]) => {
        if (cancelled) return;
        setMarkets(ms);
        setBacktest(bt);
        if (ms.length > 0) setSelectedId(ms[0].id);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setSignalLoading(true);
    setSignal(null);
    fetchSignalLabSignal(selectedId).then(s => {
      if (cancelled) return;
      setSignal(s);
      setSignalLoading(false);
    });
    setSubmitted(false);
    return () => { cancelled = true; };
  }, [selectedId]);

  const selectedMarket = useMemo(
    () => markets?.find(m => m.id === selectedId) ?? null,
    [markets, selectedId],
  );

  if (!fontsLoaded) return null;

  const onSubmitForecast = async () => {
    if (!selectedMarket) return;
    const probNum = parseFloat(userProb.replace(",", "."));
    if (Number.isNaN(probNum) || probNum < 0 || probNum > 100) return;
    await submitSignalLabForecast({
      marketId: selectedMarket.id,
      userProbability: normalizeProbability(probNum / 100),
      side,
      reasoning: reasoning.trim(),
      createdAt: new Date().toISOString(),
      locked: true,
    });
    setSubmitted(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14, padding: 4 }}>
            <Text style={{ color: C.PURPLE_DIM, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: C.TEXT, fontSize: 17, fontFamily: "DMSans_700Bold" }}>
            Signal Lab
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2 }} />

          <View style={{ padding: 20, gap: 18 }}>

            {/* ── Hero ─────────────────────────────────────────────────── */}
            <View>
              <Text style={{ color: C.TEXT, fontSize: 26, fontFamily: "DMSans_700Bold", marginBottom: 6 }}>
                {ispt ? "Compare seu palpite contra sinais quantitativos" : "Compare your forecast against quantitative signals"}
              </Text>
              <Text style={{ color: C.TEXT_SUB, fontSize: 14, lineHeight: 20 }}>
                {ispt
                  ? "Compare seu palpite contra um sinal de modelo, a probabilidade da multidão e o resultado final."
                  : "Compare your forecast against a model signal, the crowd probability, and the final outcome."}
              </Text>
            </View>

            <DisclaimerBar ispt={ispt} />

            {/* ── Market selector ──────────────────────────────────────── */}
            <SectionTitle ispt={ispt} en="Markets" pt="Mercados" />
            {markets === null ? (
              <CardSkeleton />
            ) : (
              <View style={{ gap: 10 }}>
                {markets.map(m => (
                  <MarketCard
                    key={m.id}
                    market={m}
                    selected={m.id === selectedId}
                    onPress={() => setSelectedId(m.id)}
                    ispt={ispt}
                  />
                ))}
              </View>
            )}

            {/* ── Signal summary + transition matrix ───────────────────── */}
            {selectedMarket && (
              <>
                <SectionTitle ispt={ispt} en="Signal" pt="Sinal" />
                {signalLoading || !signal ? (
                  <CardSkeleton />
                ) : (
                  <>
                    <SignalSummaryCard signal={signal} market={selectedMarket} ispt={ispt} />
                    <SectionTitle ispt={ispt} en="Transition matrix" pt="Matriz de transição" />
                    <TransitionMatrixCard signal={signal} ispt={ispt} />
                  </>
                )}

                {/* ── Forecast input ─────────────────────────────────── */}
                <SectionTitle ispt={ispt} en="Your forecast" pt="Seu palpite" />
                <ForecastInputCard
                  ispt={ispt}
                  userProb={userProb}
                  onUserProb={setUserProb}
                  side={side}
                  onSide={setSide}
                  reasoning={reasoning}
                  onReasoning={setReasoning}
                  submitted={submitted}
                  onSubmit={onSubmitForecast}
                />

                {/* ── Comparison panel ───────────────────────────────── */}
                <SectionTitle ispt={ispt} en="Comparison" pt="Comparação" />
                <ComparisonPanelCard
                  signal={signal}
                  userProb={parseFloat(userProb.replace(",", ".")) / 100}
                  ispt={ispt}
                />
              </>
            )}

            {/* ── Backtest preview ────────────────────────────────────── */}
            <SectionTitle ispt={ispt} en="Backtest preview" pt="Histórico simulado" />
            {backtest ? (
              <BacktestCard backtest={backtest} ispt={ispt} />
            ) : (
              <CardSkeleton />
            )}

            {/* ── Educational ────────────────────────────────────────── */}
            <SectionTitle ispt={ispt} en="How the model works" pt="Como o modelo funciona" />
            <EducationalCard ispt={ispt} />

          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SectionTitle({ ispt, en, pt }: { ispt: boolean; en: string; pt: string }) {
  return (
    <Text style={{ color: C.TEXT, fontSize: 16, fontFamily: "DMSans_700Bold", marginTop: 6 }}>
      {ispt ? pt : en}
    </Text>
  );
}

function DisclaimerBar({ ispt }: { ispt: boolean }) {
  return (
    <View style={{
      backgroundColor: "rgba(245,158,11,0.08)",
      borderColor: "rgba(245,158,11,0.3)",
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      flexDirection: "row",
      gap: 10,
    }}>
      <Text style={{ color: "#F59E0B", fontSize: 14, fontFamily: "DMSans_700Bold" }}>!</Text>
      <Text style={{ color: C.TEXT_SUB, fontSize: 12, lineHeight: 17, flex: 1 }}>
        {ispt
          ? "Recurso experimental. Apenas para prática e pesquisa de previsões — não é orientação financeira."
          : "Experimental simulation feature. For forecasting practice and research only — not financial advice."}
      </Text>
    </View>
  );
}

function CardSkeleton() {
  return (
    <View style={{ backgroundColor: C.CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.BORDER, height: 96, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={C.PURPLE} />
    </View>
  );
}

function MarketCard({
  market, selected, onPress, ispt,
}: {
  market: Market; selected: boolean; onPress(): void; ispt: boolean;
}) {
  const closesAt = new Date(Date.now() + market.timeRemainingMs).toISOString();
  return (
    <Pressable onPress={onPress} style={{
      backgroundColor: selected ? "rgba(124,92,252,0.08)" : C.CARD,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: selected ? C.PURPLE : C.BORDER,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <View style={{
          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
          backgroundColor: "rgba(247,147,26,0.12)", marginRight: 8,
        }}>
          <Text style={{ color: "#F7931A", fontSize: 10, fontFamily: "DMSans_700Bold" }}>BTC</Text>
        </View>
        <Text style={{ color: C.TEXT_MID, fontSize: 11, fontFamily: "DMSans_500Medium" }}>
          {timeUntil(closesAt, ispt ? "pt" : "en")}
        </Text>
      </View>
      <Text style={{ color: C.TEXT, fontSize: 14, fontFamily: "DMSans_700Bold", marginBottom: 8 }}>
        {market.title}
      </Text>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <Stat label={ispt ? "Multidão" : "Crowd"} value={formatProbability(market.crowdProbability)} />
        <Stat label={ispt ? "Liquidez" : "Liquidity"} value={`$${market.liquidity.toLocaleString("en-US")}`} />
      </View>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: C.TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: C.TEXT, fontSize: 13, fontFamily: "DMSans_700Bold" }}>{value}</Text>
    </View>
  );
}

function SignalSummaryCard({
  signal, market, ispt,
}: {
  signal: Signal; market: Market; ispt: boolean;
}) {
  const stateLabel = STATE_LABEL[signal.currentState][ispt ? "pt" : "en"];
  const predictedLabel = STATE_LABEL[signal.predictedState][ispt ? "pt" : "en"];
  const stateColor = STATE_COLORS[signal.currentState];
  const predictedColor = STATE_COLORS[signal.predictedState];
  const edgeColor = signal.edgeGap >= 0 ? C.GREEN : C.RED;
  const confidenceColor = CONFIDENCE_COLOR[signal.confidence];

  return (
    <View style={{ backgroundColor: C.CARD, borderRadius: 14, borderWidth: 1, borderColor: C.BORDER_P, overflow: "hidden" }}>
      <LinearGradient colors={GRAD.CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16, gap: 14 }}>

        <Text style={{ color: C.TEXT_SUB, fontSize: 11, fontFamily: "DMSans_500Medium", letterSpacing: 1 }}>
          {market.title.toUpperCase()}
        </Text>

        {/* Current vs predicted */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.TEXT_MID, fontSize: 11, marginBottom: 4 }}>{ispt ? "Estado atual" : "Current state"}</Text>
            <Text style={{ color: stateColor, fontSize: 20, fontFamily: "DMSans_700Bold" }}>{stateLabel}</Text>
          </View>
          <Text style={{ color: C.TEXT_MID, fontSize: 18 }}>→</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.TEXT_MID, fontSize: 11, marginBottom: 4 }}>{ispt ? "Próximo previsto" : "Predicted next"}</Text>
            <Text style={{ color: predictedColor, fontSize: 20, fontFamily: "DMSans_700Bold" }}>{predictedLabel}</Text>
          </View>
        </View>

        {/* Probabilities */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <ProbBlock label={ispt ? "Modelo" : "Model"} value={formatProbability(signal.modelProbability)} accent={C.PURPLE} />
          <ProbBlock label={ispt ? "Multidão" : "Crowd"} value={formatProbability(signal.crowdProbability)} accent={C.BLUE} />
          <ProbBlock label={ispt ? "Diferença" : "Edge gap"} value={formatEdgeGap(signal.edgeGap)} accent={edgeColor} />
        </View>

        {/* Confidence + sample */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 6, borderTopWidth: 1, borderTopColor: C.BORDER }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: C.TEXT_MID, fontSize: 11 }}>{ispt ? "Confiança" : "Confidence"}</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, backgroundColor: `${confidenceColor}1F` }}>
              <Text style={{ color: confidenceColor, fontSize: 11, fontFamily: "DMSans_700Bold" }}>{signal.confidence}</Text>
            </View>
          </View>
          <Text style={{ color: C.TEXT_MID, fontSize: 11 }}>
            {ispt ? "Amostra: " : "Sample: "}{signal.sampleSize}
          </Text>
        </View>

        {/* Warnings */}
        {signal.warnings.length > 0 && (
          <View style={{ gap: 6, paddingTop: 4 }}>
            {signal.warnings.map((w, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ color: "#F59E0B", fontSize: 11 }}>!</Text>
                <Text style={{ color: C.TEXT_SUB, fontSize: 11, lineHeight: 16, flex: 1 }}>{w}</Text>
              </View>
            ))}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

function ProbBlock({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: C.BORDER }}>
      <Text style={{ color: C.TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: accent, fontSize: 16, fontFamily: "DMSans_700Bold" }}>{value}</Text>
    </View>
  );
}

function TransitionMatrixCard({ signal, ispt }: { signal: Signal; ispt: boolean }) {
  const states: MarketState[] = ["UP", "FLAT", "DOWN"];
  return (
    <View style={{ backgroundColor: C.CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.BORDER }}>
      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        <View style={{ width: 56 }} />
        {states.map(s => (
          <Text key={s} style={{ flex: 1, color: C.TEXT_MID, fontSize: 11, fontFamily: "DMSans_700Bold", textAlign: "center" }}>
            {STATE_LABEL[s][ispt ? "pt" : "en"]}
          </Text>
        ))}
      </View>
      {states.map(from => (
        <View key={from} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.BORDER }}>
          <Text style={{ width: 56, color: STATE_COLORS[from], fontSize: 12, fontFamily: "DMSans_700Bold" }}>
            {STATE_LABEL[from][ispt ? "pt" : "en"]}
          </Text>
          {states.map(to => {
            const p = signal.transitionMatrix[from][to];
            const isCurrent = from === signal.currentState;
            return (
              <View key={to} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{
                  color: isCurrent ? C.TEXT : C.TEXT_SUB,
                  fontSize: 13,
                  fontFamily: isCurrent ? "DMSans_700Bold" : "DMSans_500Medium",
                }}>
                  {p.toFixed(2)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      <Text style={{ color: C.TEXT_MID, fontSize: 10, marginTop: 10, lineHeight: 14 }}>
        {ispt
          ? "Linha em destaque é o estado atual. Cada linha soma 1.0."
          : "The highlighted row is the current state. Each row sums to 1.0."}
      </Text>
    </View>
  );
}

function ForecastInputCard({
  ispt, userProb, onUserProb, side, onSide,
  reasoning, onReasoning, submitted, onSubmit,
}: {
  ispt: boolean;
  userProb: string; onUserProb(v: string): void;
  side: "YES" | "NO"; onSide(s: "YES" | "NO"): void;
  reasoning: string; onReasoning(v: string): void;
  submitted: boolean; onSubmit(): void;
}) {
  const probNum = parseFloat(userProb.replace(",", "."));
  const valid = !Number.isNaN(probNum) && probNum >= 0 && probNum <= 100;

  return (
    <View style={{ backgroundColor: C.CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.BORDER, gap: 12 }}>
      <Text style={{ color: C.TEXT_SUB, fontSize: 12, lineHeight: 17 }}>
        {ispt
          ? "Envie sua probabilidade antes de olhar muito para a multidão. Isso ajuda a medir se você tem visão independente."
          : "Submit your probability before looking too much at the crowd. This helps measure whether you have independent edge."}
      </Text>

      {/* Probability input */}
      <View>
        <Text style={{ color: C.TEXT_MID, fontSize: 11, marginBottom: 6 }}>
          {ispt ? "Sua probabilidade (0–100%)" : "Your probability (0–100%)"}
        </Text>
        <TextInput
          value={userProb}
          onChangeText={onUserProb}
          keyboardType="numeric"
          placeholder="50"
          placeholderTextColor={C.TEXT_MID}
          style={{
            color: C.TEXT,
            fontSize: 16,
            fontFamily: "DMSans_700Bold",
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: "rgba(255,255,255,0.02)",
            borderWidth: 1,
            borderColor: valid || userProb === "" ? C.BORDER : C.RED,
            borderRadius: 10,
          }}
        />
      </View>

      {/* Side toggle */}
      <View>
        <Text style={{ color: C.TEXT_MID, fontSize: 11, marginBottom: 6 }}>
          {ispt ? "Sua aposta" : "Your call"}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["YES", "NO"] as const).map(s => {
            const active = side === s;
            const color = s === "YES" ? C.GREEN : C.RED;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => onSide(s)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: active ? color : C.BORDER,
                  backgroundColor: active ? `${color}1A` : "rgba(255,255,255,0.02)",
                }}
              >
                <Text style={{ color: active ? color : C.TEXT_SUB, fontSize: 14, fontFamily: "DMSans_700Bold" }}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Reasoning */}
      <View>
        <Text style={{ color: C.TEXT_MID, fontSize: 11, marginBottom: 6 }}>
          {ispt ? "Raciocínio (opcional)" : "Reasoning (optional)"}
        </Text>
        <TextInput
          value={reasoning}
          onChangeText={onReasoning}
          multiline
          placeholder={ispt ? "Por que você acredita nisso?" : "Why do you believe this?"}
          placeholderTextColor={C.TEXT_MID}
          style={{
            color: C.TEXT,
            fontSize: 13,
            fontFamily: "DMSans_400Regular",
            paddingHorizontal: 12,
            paddingVertical: 10,
            minHeight: 70,
            textAlignVertical: "top",
            backgroundColor: "rgba(255,255,255,0.02)",
            borderWidth: 1,
            borderColor: C.BORDER,
            borderRadius: 10,
          }}
        />
      </View>

      <TouchableOpacity disabled={!valid} onPress={onSubmit} style={{ borderRadius: 12, overflow: "hidden", opacity: valid ? 1 : 0.4 }}>
        <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>
            {submitted
              ? (ispt ? "Palpite registrado ✓" : "Forecast locked ✓")
              : (ispt ? "Travar palpite" : "Lock forecast")}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function ComparisonPanelCard({
  signal, userProb, ispt,
}: {
  signal: Signal; userProb: number; ispt: boolean;
}) {
  const hasUser = !Number.isNaN(userProb) && userProb >= 0 && userProb <= 1;
  return (
    <View style={{ backgroundColor: C.CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.BORDER, gap: 10 }}>
      <ComparisonRow label={ispt ? "Você" : "You"}     value={hasUser ? formatProbability(userProb) : "—"} accent={C.PINK} />
      <ComparisonRow label={ispt ? "Modelo" : "Model"} value={formatProbability(signal.modelProbability)} accent={C.PURPLE} />
      <ComparisonRow label={ispt ? "Multidão" : "Crowd"} value={formatProbability(signal.crowdProbability)} accent={C.BLUE} />
      <View style={{ borderTopWidth: 1, borderTopColor: C.BORDER, paddingTop: 10 }}>
        <Text style={{ color: C.TEXT_MID, fontSize: 11, lineHeight: 16 }}>
          {ispt
            ? "Pontuações de Brier aparecem após a resolução do mercado."
            : "Scores appear after resolution."}
        </Text>
      </View>
    </View>
  );
}

function ComparisonRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
        <Text style={{ color: C.TEXT_SUB, fontSize: 13 }}>{label}</Text>
      </View>
      <Text style={{ color: C.TEXT, fontSize: 14, fontFamily: "DMSans_700Bold" }}>{value}</Text>
    </View>
  );
}

function BacktestCard({ backtest, ispt }: { backtest: BacktestSummary; ispt: boolean }) {
  return (
    <View style={{ backgroundColor: C.CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.BORDER, gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <BacktestStat label={ispt ? "Sinais testados" : "Tested signals"} value={backtest.testedSignals.toLocaleString("en-US")} />
        <BacktestStat label={ispt ? "Taxa de acerto" : "Hit rate"} value={`${(backtest.hitRate * 100).toFixed(1)}%`} />
        <BacktestStat label={ispt ? "Brier médio" : "Avg Brier"} value={backtest.averageBrier.toFixed(3)} />
        <BacktestStat
          label={ispt ? "P/L simulado" : "Simulated P/L"}
          value={`${backtest.simulatedPnl >= 0 ? "+" : ""}$${backtest.simulatedPnl.toFixed(0)}`}
          color={backtest.simulatedPnl >= 0 ? C.GREEN : C.RED}
        />
        <BacktestStat label={ispt ? "Diferença média" : "Avg edge gap"} value={`${backtest.averageEdgeGap >= 0 ? "+" : ""}${backtest.averageEdgeGap.toFixed(1)} pp`} />
        <BacktestStat label={ispt ? "Melhor categoria" : "Best category"} value={backtest.bestCategory} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.BORDER }}>
        <Text style={{ color: "#F59E0B", fontSize: 11, fontFamily: "DMSans_700Bold" }}>!</Text>
        <Text style={{ color: C.TEXT_SUB, fontSize: 11, lineHeight: 16, flex: 1 }}>{backtest.warning}</Text>
      </View>
    </View>
  );
}

function BacktestStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ minWidth: "30%", flexGrow: 1, padding: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: C.BORDER }}>
      <Text style={{ color: C.TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: color ?? C.TEXT, fontSize: 14, fontFamily: "DMSans_700Bold" }}>{value}</Text>
    </View>
  );
}

function EducationalCard({ ispt }: { ispt: boolean }) {
  const [open, setOpen] = useState(false);
  const items = ispt ? [
    { q: "O que é um modelo de Markov?", a: "Um modelo simples que olha o estado atual (ex: BTC subindo) e estima o próximo estado com base em quantas vezes essa transição aconteceu no histórico." },
    { q: "O que significa P(Xₙ₊₁ = j | Xₙ = i)?", a: "É a probabilidade do próximo estado ser j dado que o estado atual é i. Em outras palavras, dada a situação de agora, qual a chance do próximo movimento?" },
    { q: "Probabilidade alta = lucro garantido?", a: "Não. Mesmo um sinal com 80% pode errar 1 em cada 5 vezes. Lucro depende também de spread, taxa, slippage e tamanho da amostra." },
    { q: "Por que tamanho da amostra importa?", a: "Se você só tem 5 transições do estado UP, qualquer probabilidade vinda dessa linha é ruído. Confiabilidade só aparece com dezenas de observações." },
    { q: "Por que comparar modelo vs multidão?", a: "A multidão já reflete muita informação. Se o modelo diverge, você precisa entender o porquê — caso contrário a multidão tende a estar certa." },
    { q: "Apostar YES e NO ao mesmo tempo é arbitragem?", a: "Geralmente não. Spread, slippage e taxas costumam consumir a diferença. Entradas duplicadas raramente são neutras na prática." },
  ] : [
    { q: "What is a Markov model?", a: "A simple model that looks at the current state (e.g. BTC trending up) and estimates the next state from how often that transition has happened historically." },
    { q: "What does P(Xₙ₊₁ = j | Xₙ = i) mean?", a: "It's the probability that the next state is j given the current state is i. In plain terms: given where things are now, what's the chance of the next move?" },
    { q: "Does high probability mean guaranteed profit?", a: "No. Even an 80% signal can be wrong 1 in 5 times. Profit also depends on spread, fees, slippage and sample size." },
    { q: "Why does sample size matter?", a: "If you only have 5 observed transitions from state UP, any probability from that row is noise. Reliability only appears with tens of observations." },
    { q: "Why compare model vs crowd?", a: "The crowd already reflects a lot of information. If the model diverges, you need to understand why — otherwise the crowd tends to be right." },
    { q: "Is betting YES and NO simultaneously arbitrage?", a: "Usually not. Spread, slippage and fees typically eat the difference. Double entries are rarely neutral in practice." },
  ];

  return (
    <View style={{ backgroundColor: C.CARD, borderRadius: 14, borderWidth: 1, borderColor: C.BORDER, overflow: "hidden" }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={{ padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: C.TEXT, fontSize: 14, fontFamily: "DMSans_700Bold" }}>
          {ispt ? "Explicação simples" : "Plain-English explainer"}
        </Text>
        <Text style={{ color: C.TEXT_MID, fontSize: 14 }}>{open ? "−" : "+"}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>
          {items.map((it, i) => (
            <View key={i} style={{ borderTopWidth: 1, borderTopColor: C.BORDER, paddingTop: 10 }}>
              <Text style={{ color: C.TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", marginBottom: 4 }}>{it.q}</Text>
              <Text style={{ color: C.TEXT_SUB, fontSize: 12, lineHeight: 17 }}>{it.a}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
