import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, TextInput, ActivityIndicator, Linking, Image,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { useLanguage } from "@/src/i18n";
import { useTrading } from "@/src/session/TradingContext";
import { api } from "@/src/api/client";
import { shareContent, buildMarketShareText } from "@/src/utils/useShare";
import { ProbabilityChart } from "@/components/ProbabilityChart";
import { CommentSection } from "@/components/CommentSection";

const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";
const BLUE     = "#4F8EF7";
const PINK     = "#F050AE";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;
const GRAD_GREEN = ["#15803D", GREEN] as const;
const GRAD_RED   = ["#991B1B", RED] as const;
const SCENARIO_COLORS = ["#22C55E", "#EF4444", "#7C5CFC", "#4F8EF7", "#F7931A", "#C084FC"];

const CAT_META: Record<string, { icon: string; color: string }> = {
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

type Scenario = { id: number; title: string; title_pt: string | null; probability: number; status: string };
type EventDetail = {
  id: number; title: string; title_pt: string | null;
  description: string | null; description_pt: string | null;
  category: string; status: string; scenarios: Scenario[];
};

function scenarioTitle(s: Scenario, lang: string) {
  return lang === "pt" && s.title_pt ? s.title_pt : s.title;
}

export default function MarketDetailScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const { isAuthenticated, userId, placePrediction, account, refreshPortfolio } = useTrading();
  const params = useLocalSearchParams<{ eventId: string }>();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [amount, setAmount] = useState("100");
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState("");
  const [relatedNews, setRelatedNews] = useState<any[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loading, setLoading] = useState(true);

  const eventId = params.eventId ? parseInt(params.eventId) : null;

  useEffect(() => {
    if (!eventId) return;
    Promise.all([
      api.get(`/events/${eventId}`),
      api.get(`/events/${eventId}/history`),
    ]).then(([eventRes, histRes]) => {
      const found = eventRes.data;
      if (found) {
        setEvent(found);
        setSelId(found.scenarios[0]?.id ?? null);
        api.get("/news/single", { params: { category: found.category, lang: language, max_results: 4 } })
          .then(r => {
            const articles = r.data.articles ?? [];
            const words = found.title.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter((w: string) => w.length > 4).slice(0, 3);
            const scored = articles.map((a: any) => ({
              ...a,
              score: words.filter((w: string) => a.title.toLowerCase().includes(w.toLowerCase())).length,
            })).sort((x: any, y: any) => y.score - x.score);
            setRelatedNews(scored.slice(0, 3));
            if (scored[0]) {
              setLoadingSummary(true);
              api.post("/news/summary", {
                title: scored[0].title,
                description: scored[0].description ?? "",
                url: scored[0].url,
                language,
              }).then(r => setSummary(r.data.summary ?? ""))
                .catch(() => {})
                .finally(() => setLoadingSummary(false));
            }
          }).catch(() => {});
      }
      setHistory(histRes.data?.scenarios ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [eventId, language]);

  const handleBet = async () => {
    if (!isAuthenticated) { router.push("/login"); return; }
    if (!selId) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    setPlacing(true);
    const result = await placePrediction(selId, amt);
    setPlacing(false);
    if (result.ok) {
      setMessage(language === "pt" ? `✓ Posição aberta · $${amt.toFixed(2)}` : `✓ Position opened · $${amt.toFixed(2)}`);
      refreshPortfolio();
      setTimeout(() => setMessage(""), 3000);
    }
  };

  if (!fontsLoaded || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  if (!event) return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: TEXT_MID }}>Event not found</Text>
    </View>
  );

  const cm = CAT_META[event.category] ?? { icon: "◈", color: PURPLE };
  const title = language === "pt" && event.title_pt ? event.title_pt : event.title;
  const desc = language === "pt" && event.description_pt ? event.description_pt : event.description;
  const resolved = event.status === "resolved";
  const selScene = event.scenarios.find(s => s.id === selId);
  const selIdx = event.scenarios.findIndex(s => s.id === selId);
  const hasChart = history.some((s: any) => s.points?.length >= 2);
  const balanceText = account ? Number(account.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  // Estimated payout
  const betAmt = parseFloat(amount) || 0;
  const entryProb = selScene?.probability ?? 50;
  const multiplier = entryProb > 0 ? (100 / entryProb) : 2;
  const estimatedPayout = (betAmt * multiplier).toFixed(2);
  const estimatedProfit = (betAmt * multiplier - betAmt).toFixed(2);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14, padding: 4 }}>
            <Text style={{ color: PURPLE_D, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: cm.color + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: cm.color + "25" }}>
              <Text style={{ color: cm.color, fontSize: 10, fontFamily: "DMSans_700Bold" }}>{cm.icon} {event.category.toUpperCase()}</Text>
            </View>
            {!resolved && (
              <View style={{ backgroundColor: "rgba(34,197,94,0.1)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                <Text style={{ color: GREEN, fontSize: 10, fontFamily: "DMSans_700Bold" }}>● {language === "pt" ? "AO VIVO" : "LIVE"}</Text>
              </View>
            )}
          </View>
          {isAuthenticated && (
            <View style={{ backgroundColor: "rgba(124,92,252,0.08)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: BORDER_P }}>
              <Text style={{ color: TEXT_MID, fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{language === "pt" ? "SALDO" : "BALANCE"}</Text>
              <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold" }}>${balanceText}</Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ padding: 20 }}>

            {/* Title */}
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", lineHeight: 30, letterSpacing: -0.4, marginBottom: 8 }}>
              {title}
            </Text>
            {desc && (
              <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 21, marginBottom: 20 }}>
                {desc}
              </Text>
            )}

            {/* Chart */}
            {hasChart && (
              <View style={{ backgroundColor: "rgba(124,92,252,0.04)", borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: "rgba(124,92,252,0.12)" }}>
                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.2, marginBottom: 10 }}>
                  {language === "pt" ? "HISTÓRICO DE PROBABILIDADE" : "PROBABILITY HISTORY"}
                </Text>
                <ProbabilityChart scenarios={history} height={160} compact={false} />
              </View>
            )}

            {/* Outcomes */}
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1.2, marginBottom: 10 }}>
              {language === "pt" ? "RESULTADOS" : "OUTCOMES"}
            </Text>
            {event.scenarios.map((s, idx) => {
              const won  = resolved && s.status === "won";
              const lost = resolved && s.status === "lost";
              const c    = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
              const sel  = selId === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => !resolved && setSelId(s.id)}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, backgroundColor: sel ? c + "08" : "rgba(255,255,255,0.02)", borderColor: sel ? c + "30" : "rgba(255,255,255,0.06)" }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: won ? c : TEXT, fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                      {scenarioTitle(s, language)}{won ? "  ✓" : lost ? "  ✗" : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ color: won ? c : TEXT, fontFamily: "DMSans_700Bold", fontSize: 18 }}>{s.probability.toFixed(1)}%</Text>
                    <View style={{ width: 80, height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <View style={{ width: `${s.probability}%` as any, height: "100%", backgroundColor: c, borderRadius: 2 }} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Bet section */}
            {!resolved && selScene && (
              <View style={{ backgroundColor: SURFACE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER_P, marginTop: 8, marginBottom: 24 }}>
                {/* Scenario selector */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  {event.scenarios.slice(0, 2).map((s, idx) => {
                    const c = SCENARIO_COLORS[idx];
                    const isSel = selId === s.id;
                    return (
                      <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
                        <LinearGradient
                          colors={isSel ? (idx === 0 ? GRAD_GREEN : GRAD_RED) : [c + "18", c + "18"]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={{ paddingVertical: 10, alignItems: "center" }}
                        >
                          <Text style={{ color: isSel ? "white" : c, fontFamily: "DMSans_700Bold", fontSize: 12 }} numberOfLines={1}>
                            {scenarioTitle(s, language)}  {s.probability.toFixed(0)}%
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Multi-option selector */}
                {event.scenarios.length > 2 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    {event.scenarios.map((s, idx) => {
                      const c = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
                      const isSel = selId === s.id;
                      return (
                        <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: isSel ? c : BORDER, backgroundColor: isSel ? c + "18" : "transparent" }}>
                          <Text style={{ color: isSel ? c : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 12 }} numberOfLines={1}>
                            {scenarioTitle(s, language)}
                          </Text>
                          <Text style={{ color: isSel ? c : TEXT_MID, fontSize: 11, textAlign: "center" }}>{s.probability.toFixed(0)}%</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Amount */}
                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 8 }}>
                  {language === "pt" ? "VALOR" : "AMOUNT"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, marginBottom: 10 }}>
                  <Text style={{ color: PURPLE_D, fontSize: 16, marginRight: 4 }}>$</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    style={{ flex: 1, color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", paddingVertical: 10 }}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
                  {["10", "50", "100", "500"].map(v => (
                    <TouchableOpacity key={v} onPress={() => setAmount(v)} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(124,92,252,0.08)", alignItems: "center", borderWidth: 1, borderColor: BORDER_P }}>
                      <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 12 }}>${v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {message ? (
                  <View style={{ gap: 8 }}>
                    <View style={{ backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 10, padding: 12, alignItems: "center" }}>
                      <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{message}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => shareContent({
                        title: language === "pt" ? "Apostei no Scenara!" : "I bet on Scenara!",
                        message: buildMarketShareText(title, scenarioTitle(selScene!, language), selScene?.probability ?? 50, language),
                      })}
                      style={{ paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: BORDER_P }}
                    >
                      <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 13 }}>
                        {language === "pt" ? "Compartilhar aposta ↗" : "Share bet ↗"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    {/* Estimated payout */}
                    {selScene && parseFloat(amount) > 0 && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 }}>
                        <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>
                          {language === "pt" ? "Retorno estimado" : "Estimated return"}
                        </Text>
                        <Text style={{ color: GREEN, fontSize: 12, fontFamily: "DMSans_700Bold" }}>
                          ${(parseFloat(amount || "0") / (selScene.probability / 100)).toFixed(2)}
                          <Text style={{ color: TEXT_MID, fontFamily: "DMSans_400Regular" }}>
                            {" "}({(100 / selScene.probability).toFixed(2)}x)
                          </Text>
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={handleBet} disabled={placing} style={{ borderRadius: 12, overflow: "hidden" }}>
                      <LinearGradient colors={placing ? ["#111", "#111"] : GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 15, alignItems: "center" }}>
                        <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                          {placing ? "..." : (language === "pt" ? `Apostar · $${amount}` : `Bet · $${amount}`)}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}

                {!isAuthenticated && (
                  <Text style={{ color: TEXT_MID, fontSize: 11, textAlign: "center", marginTop: 10 }}>
                    {language === "pt" ? "Faça login para apostar" : "Log in to place a bet"}
                  </Text>
                )}
              </View>
            )}

            {/* Related news with AI summary */}
            {relatedNews.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 14 }}>
                  {language === "pt" ? "NOTÍCIAS RELACIONADAS" : "RELATED NEWS"}
                </Text>

                {/* Top article with AI summary */}
                <View style={{ backgroundColor: CARD, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: BORDER_P, marginBottom: 10 }}>
                  {relatedNews[0].image && relatedNews[0].image !== "undefined" && (
                    <Image source={{ uri: relatedNews[0].image }} style={{ width: "100%", height: 160 }} resizeMode="cover" />
                  )}
                  <View style={{ padding: 14 }}>
                    <Text style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_700Bold", lineHeight: 21, marginBottom: 10 }}>
                      {relatedNews[0].title}
                    </Text>

                    {/* AI Summary */}
                    <View style={{ backgroundColor: "rgba(124,92,252,0.06)", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: BORDER_P }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5, padding: 1 }}>
                          <View style={{ backgroundColor: CARD, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                              {language === "pt" ? "RESUMO · IA" : "SUMMARY · AI"}
                            </Text>
                          </View>
                        </LinearGradient>
                        <Text style={{ color: TEXT_MID, fontSize: 10 }}>{relatedNews[0].source}</Text>
                      </View>
                      {loadingSummary ? (
                        <ActivityIndicator color={PURPLE} size="small" />
                      ) : (
                        <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 20 }}>
                          {summary || relatedNews[0].description || ""}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity onPress={() => Linking.openURL(relatedNews[0].url)} style={{ borderRadius: 10, overflow: "hidden" }}>
                      <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 11, alignItems: "center" }}>
                        <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 13 }}>
                          {language === "pt" ? "Ler artigo completo →" : "Read full article →"}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Other articles */}
                {relatedNews.slice(1).map((article, i) => (
                  <TouchableOpacity key={i} onPress={() => Linking.openURL(article.url)} style={{ flexDirection: "row", gap: 10, backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: BORDER }}>
                    {article.image && article.image !== "undefined" && (
                      <Image source={{ uri: article.image }} style={{ width: 60, height: 48, borderRadius: 8 }} resizeMode="cover" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 18, marginBottom: 4 }} numberOfLines={2}>{article.title}</Text>
                      <Text style={{ color: PURPLE_D, fontSize: 10 }}>{article.source}</Text>
                    </View>
                    <Text style={{ color: TEXT_MID, fontSize: 16, alignSelf: "center" }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Comments */}
            <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(124,92,252,0.08)", marginBottom: 40 }}>
              <CommentSection eventId={event.id} language={language} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}