import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useLanguage } from "@/src/i18n";
import { C, GRAD, timeUntil } from "@/src/theme";

type Scenario = {
  id: number;
  title: string;
  title_pt: string | null;
  title_zh: string | null;
  probability: number;
};

type DailyChallenge = {
  date: string;
  event_id: number;
  title: string;
  title_pt: string | null;
  title_zh: string | null;
  category: string;
  closes_at: string | null;
  scenarios: Scenario[];
  participants: number;
  you_predicted: boolean;
};

export default function DailyChallengeScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ispt = language === "pt";
  const iszh = language === "zh";

  useEffect(() => {
    let cancelled = false;
    api.get("/daily-challenge/today", { timeout: 12000 })
      .then(r => { if (!cancelled) setChallenge(r.data); })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Could not load today's challenge");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!fontsLoaded) return null;

  const t = (en: string, pt: string, zh: string) => ispt ? pt : iszh ? zh : en;
  const titleFor = (c: DailyChallenge | Scenario) =>
    iszh ? (c.title_zh || c.title) : ispt ? (c.title_pt || c.title) : c.title;

  return (
    <View style={{ flex: 1, backgroundColor: C.BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14, padding: 4 }}>
            <Text style={{ color: C.PURPLE_DIM, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: C.TEXT, fontSize: 17, fontFamily: "DMSans_700Bold" }}>
            {t("Daily Challenge", "Desafio Diário", "每日挑战")}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2, marginBottom: 18, borderRadius: 1 }} />

          <Text style={{ color: C.TEXT, fontSize: 24, fontFamily: "DMSans_700Bold", marginBottom: 6 }}>
            {t("One market. One day. The whole community predicts.",
               "Um mercado. Um dia. A comunidade inteira prevê.",
               "一个市场。一天。整个社区一起预测。")}
          </Text>
          <Text style={{ color: C.TEXT_SUB, fontSize: 13, lineHeight: 19, marginBottom: 20 }}>
            {t("Come back tomorrow to see the result and the next challenge.",
               "Volte amanhã para ver o resultado e o próximo desafio.",
               "明天回来查看结果和新的挑战。")}
          </Text>

          {loading && (
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <ActivityIndicator color={C.PURPLE} />
            </View>
          )}

          {error && !loading && (
            <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.06)" }}>
              <Text style={{ color: C.RED, fontSize: 13 }}>{error}</Text>
            </View>
          )}

          {challenge && (
            <View style={{ backgroundColor: C.CARD, borderRadius: 16, borderWidth: 1, borderColor: C.BORDER_P, overflow: "hidden" }}>
              <LinearGradient colors={GRAD.CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, gap: 14 }}>
                {/* Meta row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(124,92,252,0.18)" }}>
                    <Text style={{ color: C.PURPLE, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.6 }}>
                      {t("TODAY", "HOJE", "今日")}
                    </Text>
                  </View>
                  <Text style={{ color: C.TEXT_MID, fontSize: 11 }}>{challenge.category.toUpperCase()}</Text>
                  <Text style={{ color: C.TEXT_MID, fontSize: 11 }}>·</Text>
                  <Text style={{ color: C.TEXT_MID, fontSize: 11 }}>
                    {timeUntil(challenge.closes_at, ispt ? "pt" : iszh ? "zh" : "en")}
                  </Text>
                </View>

                {/* Title */}
                <Text style={{ color: C.TEXT, fontSize: 18, fontFamily: "DMSans_700Bold", lineHeight: 24 }}>
                  {titleFor(challenge)}
                </Text>

                {/* Participants */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: C.BORDER }} />
                  <Text style={{ color: C.TEXT_MID, fontSize: 11 }}>
                    {t(
                      `${challenge.participants} predicted today`,
                      `${challenge.participants} previram hoje`,
                      `今日已有 ${challenge.participants} 人预测`,
                    )}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: C.BORDER }} />
                </View>

                {/* CTA */}
                <TouchableOpacity
                  onPress={() => router.push(`/market-detail?eventId=${challenge.event_id}` as any)}
                  style={{ borderRadius: 12, overflow: "hidden" }}
                >
                  <LinearGradient colors={GRAD.BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
                    <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                      {challenge.you_predicted
                        ? t("View your prediction →", "Ver seu palpite →", "查看你的预测 →")
                        : t("Make your prediction →", "Fazer seu palpite →", "做出预测 →")}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {challenge.you_predicted && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.GREEN }} />
                    <Text style={{ color: C.GREEN, fontSize: 12, fontFamily: "DMSans_500Medium" }}>
                      {t("You predicted today.", "Você palpitou hoje.", "你今天已预测。")}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
