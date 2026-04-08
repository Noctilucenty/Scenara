import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, SafeAreaView, StatusBar, Linking, ActivityIndicator,
  Platform, Share,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { useLanguage } from "@/src/i18n";
import { api } from "@/src/api/client";
import { CommentSection } from "@/components/CommentSection";

const IS_WEB   = Platform.OS === "web";
const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const PURPLE   = "#7C5CFC";
const BLUE     = "#4F8EF7";
const PINK     = "#F050AE";
const GREEN    = "#22C55E";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.07)";
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

function readTime(text: string): number {
  const words = text?.trim().split(/\s+/).length ?? 0;
  return Math.max(1, Math.ceil(words / 200));
}

function extractTags(title: string): string[] {
  const stop = new Set(["the","a","an","in","at","by","on","for","to","of","and","or","is","are","was","were","will","that","this","with","from","as","it","its","be","been","have","has","had","not","but","do","did","can","o","de","da","do","dos","das","em","na","no","nas","nos","e","ou","é","está","um","uma"]);
  return title
    .replace(/[^a-zA-ZÀ-ú0-9 ]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !stop.has(w.toLowerCase()))
    .slice(0, 5);
}

export default function NewsDetailScreen() {
  const { language } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{
    title: string; description: string; url: string;
    image: string; published: string; source: string; source_url: string;
  }>();

  const [summary, setSummary]           = useState<string>("");
  const [loadingSummary, setLoading]    = useState(false);
  const [copied, setCopied]             = useState(false);
  const [scrollPct, setScrollPct]       = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { title, description, url, image, published, source, source_url } = params;

  const cleanDesc      = (!description  || description  === "undefined") ? "" : description;
  const cleanImage     = (!image        || image        === "undefined") ? "" : image;
  const cleanPublished = (!published    || published    === "undefined") ? "" : published;
  const cleanSourceUrl = (!source_url   || source_url   === "undefined") ? "" : source_url;
  const faviconUri     = cleanSourceUrl ? `https://www.google.com/s2/favicons?domain=${cleanSourceUrl}&sz=128` : null;

  useEffect(() => {
    if (!url || url === "undefined") return;
    setLoading(true);
    api.post("/news/summary", { title, description: cleanDesc, url, language })
      .then(r => setSummary(r.data.summary ?? ""))
      .catch(() => setSummary(cleanDesc))
      .finally(() => setLoading(false));
  }, [url, language]);

  const handleCopy = useCallback(() => {
    if (IS_WEB) {
      navigator.clipboard?.writeText(url).catch(() => {});
    } else {
      Share.share({ url, message: title });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url, title]);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const pct = contentOffset.y / Math.max(1, contentSize.height - layoutMeasurement.height);
    setScrollPct(Math.min(1, Math.max(0, pct)));
  }, []);

  if (!fontsLoaded) return null;

  const ago      = timeAgo(cleanPublished, language);
  const isPt     = language === "pt";
  const readMin  = readTime((summary || cleanDesc || title) + " " + (summary || ""));
  const tags     = extractTags(title ?? "");

  // ── HERO ────────────────────────────────────────────────────────────────
  const heroSection = cleanImage ? (
    <View style={{ height: IS_WEB ? 320 : 240, position: "relative", borderRadius: IS_WEB ? 16 : 0, overflow: "hidden" }}>
      <Image source={{ uri: cleanImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      <LinearGradient colors={GRAD_DARK} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 160 }} />
    </View>
  ) : (
    // Compact editorial header — clean, no giant circle
    <LinearGradient
      colors={["#0a0c1e", "#0e0926", "#100a2c"]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ borderRadius: IS_WEB ? 16 : 0, overflow: "hidden", paddingHorizontal: 28, paddingVertical: IS_WEB ? 32 : 24 }}
    >
      {/* Decorative background orbs */}
      <View style={{ position: "absolute", top: -80, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(124,92,252,0.07)" }} />
      <View style={{ position: "absolute", bottom: -60, left: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(79,142,247,0.05)" }} />

      {/* Gradient accent line */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }}>
        <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </View>

      {/* Source pill */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
        {faviconUri && (
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
            <Image source={{ uri: faviconUri }} style={{ width: 22, height: 22, borderRadius: 5 }} resizeMode="contain" />
          </View>
        )}
        <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: "rgba(124,92,252,0.12)", borderWidth: 1, borderColor: BORDER_P }}>
          <Text style={{ color: PURPLE, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>{source?.toUpperCase()}</Text>
        </View>
        {ago ? <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>· {ago}</Text> : null}
      </View>

      {/* Title preview */}
      <Text style={{ color: TEXT, fontSize: IS_WEB ? 22 : 18, fontFamily: "DMSans_700Bold", lineHeight: IS_WEB ? 32 : 26, letterSpacing: -0.3 }} numberOfLines={IS_WEB ? 3 : 2}>
        {title}
      </Text>
    </LinearGradient>
  );

  // ── ARTICLE BODY ────────────────────────────────────────────────────────
  const articleBody = (
    <View>
      {/* Meta row — only show source/time if hero didn't already show them */}
      {cleanImage ? (
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {faviconUri && <Image source={{ uri: faviconUri }} style={{ width: 18, height: 18, borderRadius: 4 }} resizeMode="contain" />}
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(124,92,252,0.1)", borderWidth: 1, borderColor: BORDER_P }}>
            <Text style={{ color: PURPLE, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>{source?.toUpperCase()}</Text>
          </View>
          {ago ? <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>· {ago}</Text> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10 }}>🕐</Text>
            <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{readMin} min</Text>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10 }}>🕐</Text>
            <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{readMin} min {isPt ? "de leitura" : "read"}</Text>
          </View>
        </View>
      )}

      {/* Title — only show here if hero already showed it (image variant) */}
      {cleanImage && (
        <Text style={{ color: TEXT, fontSize: IS_WEB ? 26 : 22, fontFamily: "DMSans_700Bold", lineHeight: IS_WEB ? 36 : 31, letterSpacing: -0.5, marginBottom: 16 }}>
          {title}
        </Text>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {tags.map((tag, i) => (
            <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 1, backgroundColor: "rgba(124,92,252,0.1)", marginBottom: 20 }} />

      {/* AI Summary */}
      <View style={{ borderRadius: 18, overflow: "hidden", marginBottom: 24 }}>
        <LinearGradient colors={["rgba(79,142,247,0.08)", "rgba(124,92,252,0.12)", "rgba(240,80,174,0.06)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, borderWidth: 1, borderColor: "rgba(124,92,252,0.2)", borderRadius: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "white", fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>✦ {isPt ? "RESUMO · IA" : "AI SUMMARY"}</Text>
            </LinearGradient>
          </View>
          {loadingSummary ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <ActivityIndicator color={PURPLE} size="small" />
              <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{isPt ? "Gerando resumo com IA..." : "Generating AI summary..."}</Text>
            </View>
          ) : summary ? (
            <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_400Regular", lineHeight: 24 }}>{summary}</Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Text style={{ fontSize: 18 }}>📡</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium", marginBottom: 4 }}>{isPt ? "Resumo não disponível" : "Summary unavailable"}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", lineHeight: 17 }}>{isPt ? "O artigo completo está disponível na fonte original." : "The full article is available at the original source."}</Text>
              </View>
            </View>
          )}
        </LinearGradient>
      </View>

      {/* Read full article */}
      <TouchableOpacity onPress={() => Linking.openURL(url)} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 28 }}>
        <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
          <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 14, letterSpacing: 0.3 }}>{isPt ? "Ler artigo completo" : "Read full article"}</Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 16 }}>→</Text>
        </LinearGradient>
      </TouchableOpacity>

      <View style={{ height: 1, backgroundColor: BORDER, marginBottom: 24 }} />

      {/* Comments */}
      <CommentSection newsUrl={url} newsTitle={title} language={language} />
      <View style={{ height: 60 }} />
    </View>
  );

  // ── SIDEBAR (web only) ───────────────────────────────────────────────────
  const sidebar = (
    <View style={{ gap: 16 }}>
      {/* Reading progress */}
      <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER }}>
        <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 12 }}>{isPt ? "PROGRESSO DE LEITURA" : "READING PROGRESS"}</Text>
        <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
          <View style={{ height: "100%", width: `${Math.round(scrollPct * 100)}%`, backgroundColor: PURPLE, borderRadius: 2 }} />
        </View>
        <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{Math.round(scrollPct * 100)}% · {readMin} min {isPt ? "de leitura" : "read"}</Text>
      </View>

      {/* Share */}
      <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER }}>
        <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 14 }}>{isPt ? "COMPARTILHAR" : "SHARE"}</Text>
        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={handleCopy} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: copied ? "rgba(34,197,94,0.1)" : SURFACE, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: copied ? "rgba(34,197,94,0.3)" : BORDER }}>
            <Text style={{ fontSize: 16 }}>{copied ? "✓" : "🔗"}</Text>
            <Text style={{ color: copied ? GREEN : TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium", flex: 1 }}>{copied ? (isPt ? "Link copiado!" : "Link copied!") : (isPt ? "Copiar link" : "Copy link")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(url)} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: SURFACE, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ fontSize: 16 }}>↗</Text>
            <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium", flex: 1 }}>{isPt ? "Abrir fonte" : "Open source"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Source card */}
      <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER }}>
        <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 14 }}>{isPt ? "FONTE" : "SOURCE"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {faviconUri && (
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BORDER }}>
              <Image source={{ uri: faviconUri }} style={{ width: 28, height: 28, borderRadius: 6 }} resizeMode="contain" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontSize: 14, fontFamily: "DMSans_700Bold" }}>{source}</Text>
            {ago ? <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 2 }}>{ago}</Text> : null}
          </View>
        </View>
      </View>

      {/* Tags card */}
      {tags.length > 0 && (
        <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER }}>
          <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 14 }}>{isPt ? "TÓPICOS" : "TOPICS"}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tags.map((tag, i) => (
              <View key={i} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(124,92,252,0.08)", borderWidth: 1, borderColor: BORDER_P }}>
                <Text style={{ color: PURPLE, fontSize: 12, fontFamily: "DMSans_500Medium" }}>#{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Tip */}
      <View style={{ borderRadius: 16, overflow: "hidden" }}>
        <LinearGradient colors={["rgba(79,142,247,0.07)", "rgba(124,92,252,0.1)"]} style={{ padding: 18, borderWidth: 1, borderColor: BORDER_P, borderRadius: 16 }}>
          <Text style={{ fontSize: 20, marginBottom: 8 }}>💡</Text>
          <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", marginBottom: 6 }}>{isPt ? "Notícias impactam mercados" : "News impacts markets"}</Text>
          <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 18 }}>
            {isPt ? "Use esta notícia para embasar suas previsões nos mercados da Scenara." : "Use this news to inform your predictions on Scenara markets."}
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12, borderRadius: 10, overflow: "hidden" }}>
            <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 12 }}>{isPt ? "Ver mercados →" : "View markets →"}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );

  // ── WEB LAYOUT ───────────────────────────────────────────────────────────
  if (IS_WEB) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="light-content" />

        {/* Reading progress bar — sticky top */}
        <View style={{ position: "absolute" as const, top: 0, left: 0, right: 0, height: 3, zIndex: 100, backgroundColor: "rgba(255,255,255,0.04)" }}>
          <View style={{ height: "100%", width: `${Math.round(scrollPct * 100)}%`, backgroundColor: PURPLE }} />
        </View>

        {/* Top bar */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderColor: BORDER, backgroundColor: "rgba(8,9,12,0.98)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginRight: 16 }}>
            <Text style={{ color: TEXT_SUB, fontSize: 18, lineHeight: 20 }}>←</Text>
            <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{isPt ? "Voltar" : "Back"}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_500Medium" }} numberOfLines={1}>{title}</Text>
          </View>
          <TouchableOpacity onPress={handleCopy} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: copied ? "rgba(34,197,94,0.4)" : BORDER_P, backgroundColor: copied ? "rgba(34,197,94,0.08)" : "rgba(124,92,252,0.06)" }}>
            <Text style={{ color: copied ? GREEN : PURPLE, fontFamily: "DMSans_700Bold", fontSize: 11, letterSpacing: 0.5 }}>{copied ? (isPt ? "✓ COPIADO" : "✓ COPIED") : (isPt ? "🔗 COMPARTILHAR" : "🔗 SHARE")}</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <ScrollView
          ref={scrollRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ maxWidth: 1200, alignSelf: "center" as const, width: "100%", padding: 32, paddingTop: 40 }}
        >
          {/* Hero — full width */}
          <View style={{ marginBottom: 32 }}>{heroSection}</View>

          {/* Two column */}
          <View style={{ flexDirection: "row", gap: 32, alignItems: "flex-start" }}>
            {/* Article — 65% */}
            <View style={{ flex: 0.65 }}>{articleBody}</View>
            {/* Sidebar — 35% */}
            <View style={{ flex: 0.35 }}>{sidebar}</View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      {/* Progress bar */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 100, backgroundColor: "rgba(255,255,255,0.04)" }}>
        <View style={{ height: "100%", width: `${Math.round(scrollPct * 100)}%`, backgroundColor: PURPLE }} />
      </View>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Top bar */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(8,9,12,0.75)", alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
            <Text style={{ color: TEXT, fontSize: 16, lineHeight: 20 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={handleCopy} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: copied ? "rgba(34,197,94,0.4)" : BORDER_P, backgroundColor: "rgba(8,9,12,0.75)" }}>
            <Text style={{ color: copied ? GREEN : PURPLE, fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 0.8 }}>{copied ? "✓" : (isPt ? "🔗 COMPARTILHAR" : "🔗 SHARE")}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} onScroll={handleScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
          {heroSection}
          <View style={{ padding: 20, paddingTop: 16 }}>{articleBody}</View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
