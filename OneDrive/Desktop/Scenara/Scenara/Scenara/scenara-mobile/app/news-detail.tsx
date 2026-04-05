import { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, SafeAreaView, StatusBar, Linking, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { useLanguage } from "@/src/i18n";
import { api } from "@/src/api/client";
import { CommentSection } from "@/components/CommentSection";

const BG       = "#08090C";
const CARD     = "#0D1117";
const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";
const BLUE     = "#4F8EF7";
const PINK     = "#F050AE";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER_P = "rgba(124,92,252,0.2)";

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;
const GRAD_DARK  = ["transparent", "rgba(8,9,12,0.97)"] as const;

function timeAgo(dateStr: string, lang: string): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (lang === "pt") {
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return `${Math.floor(diff / 86400)}d atrás`;
  }
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NewsDetailScreen() {
  const { language } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{
    title: string;
    description: string;
    url: string;
    image: string;
    published: string;
    source: string;
  }>();

  const [summary, setSummary] = useState<string>("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  const { title, description, url, image, published, source } = params;

  // Clean params — Expo Router passes undefined as string "undefined"
  const cleanDesc = (!description || description === "undefined") ? "" : description;
  const cleanImage = (!image || image === "undefined") ? "" : image;
  const cleanPublished = (!published || published === "undefined") ? "" : published;

  // Fetch AI summary from backend
  useEffect(() => {
    if (!url || url === "undefined") return;
    setLoadingSummary(true);
    api.post("/news/summary", {
      title,
      description: cleanDesc,
      url,
      language,
    })
      .then(r => setSummary(r.data.summary ?? ""))
      .catch(() => setSummary(cleanDesc))
      .finally(() => setLoadingSummary(false));
  }, [url, language]);

  if (!fontsLoaded) return null;

  const ago = timeAgo(cleanPublished, language);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Top bar */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14, padding: 4 }}>
            <Text style={{ color: PURPLE_D, fontSize: 20, lineHeight: 24 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 15, flex: 1 }} numberOfLines={1}>
            {source}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(url)}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.06)" }}
          >
            <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 9, letterSpacing: 0.8 }}>
              {language === "pt" ? "FONTE" : "SOURCE"} →
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>

          {/* Hero image */}
          {cleanImage ? (
            <View style={{ height: 220, position: "relative" }}>
              <Image source={{ uri: cleanImage }} style={{ width: "100%", height: 220 }} resizeMode="cover" />
              <LinearGradient colors={GRAD_DARK} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120 }} />
            </View>
          ) : (
            <LinearGradient colors={["#0f1420", "#1a1040"]} style={{ height: 120 }} />
          )}

          <View style={{ padding: 20 }}>

            {/* Meta */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(124,92,252,0.12)", borderWidth: 1, borderColor: BORDER_P }}>
                <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{source?.toUpperCase()}</Text>
              </View>
              {ago ? <Text style={{ color: TEXT_MID, fontSize: 11 }}>{ago}</Text> : null}
            </View>

            {/* Title */}
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", lineHeight: 30, letterSpacing: -0.4, marginBottom: 20 }}>
              {title}
            </Text>

            {/* AI Summary section */}
            <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER_P, marginBottom: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 6, padding: 1 }}>
                  <View style={{ backgroundColor: CARD, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>
                      {language === "pt" ? "RESUMO · IA" : "SUMMARY · AI"}
                    </Text>
                  </View>
                </LinearGradient>
              </View>

              {loadingSummary ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <ActivityIndicator color={PURPLE} />
                  <Text style={{ color: TEXT_MID, fontSize: 12, marginTop: 8 }}>
                    {language === "pt" ? "Gerando resumo..." : "Generating summary..."}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 22 }}>
                  {summary || cleanDesc || (language === "pt" ? "Resumo não disponível." : "Summary not available.")}
                </Text>
              )}
            </View>

            {/* Read full article button */}
            <TouchableOpacity onPress={() => Linking.openURL(url)} style={{ borderRadius: 14, overflow: "hidden", marginBottom: 32 }}>
              <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14, letterSpacing: 0.3 }}>
                  {language === "pt" ? "Ler artigo completo →" : "Read full article →"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: "rgba(124,92,252,0.1)", marginBottom: 24 }} />

            {/* Comments */}
            <CommentSection newsUrl={url} language={language} />

            <View style={{ height: 60 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}