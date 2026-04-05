import { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, SafeAreaView, StatusBar, Linking, ActivityIndicator,
  Animated,
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
    source_url: string;
  }>();

  const [summary, setSummary] = useState<string>("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  const { title, description, url, image, published, source, source_url } = params;

  // Clean params — Expo Router passes undefined as string "undefined"
  const cleanDesc    = (!description  || description  === "undefined") ? "" : description;
  const cleanImage   = (!image        || image        === "undefined") ? "" : image;
  const cleanPublished = (!published  || published    === "undefined") ? "" : published;
  const cleanSourceUrl = (!source_url || source_url   === "undefined") ? "" : source_url;

  // Favicon URI for hero when no photo available
  const faviconUri = cleanSourceUrl
    ? `https://www.google.com/s2/favicons?domain=${cleanSourceUrl}&sz=128`
    : null;

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

  // Animated pulse for the favicon hero ring
  const heroPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!faviconUri) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(heroPulse, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(heroPulse, { toValue: 0, duration: 0,    useNativeDriver: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [faviconUri]);

  if (!fontsLoaded) return null;

  const ago = timeAgo(cleanPublished, language);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Top bar — transparent overlay on hero */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(8,9,12,0.7)", alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}
          >
            <Text style={{ color: TEXT, fontSize: 16, lineHeight: 20 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => Linking.openURL(url)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(8,9,12,0.7)" }}
          >
            <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 0.8 }}>
              {language === "pt" ? "FONTE →" : "SOURCE →"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── Hero ───────────────────────────────────────────────── */}
          {cleanImage ? (
            <View style={{ height: 260 }}>
              <Image source={{ uri: cleanImage }} style={{ width: "100%", height: 260 }} resizeMode="cover" />
              <LinearGradient colors={GRAD_DARK} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 160 }} />
            </View>
          ) : faviconUri ? (
            <LinearGradient colors={["#060812", "#0e0a2a", "#160838"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 220, alignItems: "center", justifyContent: "center" }}>
              {/* Outer pulse ring */}
              <Animated.View style={{
                position: "absolute",
                width: 140, height: 140, borderRadius: 70,
                borderWidth: 1, borderColor: PURPLE,
                opacity: heroPulse.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.4, 0] }),
                transform: [{ scale: heroPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.4] }) }],
              }} />
              {/* Inner pulse ring */}
              <Animated.View style={{
                position: "absolute",
                width: 110, height: 110, borderRadius: 55,
                borderWidth: 1, borderColor: BLUE,
                opacity: heroPulse.interpolate({ inputRange: [0, 0.15, 0.6, 1], outputRange: [0, 0.5, 0.2, 0] }),
                transform: [{ scale: heroPulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }],
              }} />
              {/* Logo container */}
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(124,92,252,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(124,92,252,0.35)" }}>
                <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                  <Image source={{ uri: faviconUri }} style={{ width: 44, height: 44, borderRadius: 10 }} resizeMode="contain" />
                </View>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "DMSans_700Bold", marginTop: 14, letterSpacing: 2 }}>
                {source?.toUpperCase()}
              </Text>
              <LinearGradient colors={["transparent", BG]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80 }} />
            </LinearGradient>
          ) : (
            <LinearGradient colors={["#0a0d1f", "#12082e"]} style={{ height: 160 }} />
          )}

          <View style={{ padding: 20, paddingTop: 16 }}>

            {/* ── Meta row ─────────────────────────────────────────── */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
              {/* Favicon thumbnail next to source badge */}
              {faviconUri && (
                <Image source={{ uri: faviconUri }} style={{ width: 18, height: 18, borderRadius: 4 }} resizeMode="contain" />
              )}
              <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(124,92,252,0.1)", borderWidth: 1, borderColor: BORDER_P }}>
                <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{source?.toUpperCase()}</Text>
              </View>
              {ago ? (
                <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}>· {ago}</Text>
              ) : null}
            </View>

            {/* ── Title ────────────────────────────────────────────── */}
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", lineHeight: 31, letterSpacing: -0.5, marginBottom: 20 }}>
              {title}
            </Text>

            {/* ── Divider ──────────────────────────────────────────── */}
            <View style={{ height: 1, backgroundColor: "rgba(124,92,252,0.1)", marginBottom: 20 }} />

            {/* ── AI Summary ───────────────────────────────────────── */}
            <View style={{ borderRadius: 18, overflow: "hidden", marginBottom: 24 }}>
              <LinearGradient colors={["rgba(79,142,247,0.08)", "rgba(124,92,252,0.12)", "rgba(240,80,174,0.06)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16, borderWidth: 1, borderColor: "rgba(124,92,252,0.2)", borderRadius: 18 }}>
                {/* Badge */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: "white", fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>
                      ✦ {language === "pt" ? "RESUMO · IA" : "AI SUMMARY"}
                    </Text>
                  </LinearGradient>
                </View>

                {loadingSummary ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                    <ActivityIndicator color={PURPLE} size="small" />
                    <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular" }}>
                      {language === "pt" ? "Gerando resumo com IA..." : "Generating AI summary..."}
                    </Text>
                  </View>
                ) : summary ? (
                  <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 23 }}>
                    {summary}
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <Text style={{ fontSize: 18 }}>📡</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium", marginBottom: 4 }}>
                        {language === "pt" ? "Resumo não disponível" : "Summary unavailable"}
                      </Text>
                      <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", lineHeight: 17 }}>
                        {language === "pt"
                          ? "O artigo completo está disponível na fonte original."
                          : "The full article is available at the original source."}
                      </Text>
                    </View>
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* ── Read full article ─────────────────────────────────── */}
            <TouchableOpacity onPress={() => Linking.openURL(url)} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 32 }}>
              <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14, letterSpacing: 0.3 }}>
                  {language === "pt" ? "Ler artigo completo" : "Read full article"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 16 }}>→</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: "rgba(124,92,252,0.1)", marginBottom: 24 }} />

            {/* Comments */}
            <CommentSection newsUrl={url} newsTitle={title} language={language} />

            <View style={{ height: 60 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}