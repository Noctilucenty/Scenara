import { useState, useCallback, useRef } from "react";
import {
  SafeAreaView, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Linking, RefreshControl,
  Image, Dimensions, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useLanguage } from "@/src/i18n";
import { toChineseFallback } from "@/src/utils/zhFallback";
import { api } from "@/src/api/client";
import { SidebarContext } from "./_layout";
import React from "react";

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
const BORDER   = "rgba(255,255,255,0.07)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;
const AUTO_REFRESH_MS = 90_000;
const { width: SCREEN_W } = Dimensions.get("window");
const IS_WEB = Platform.OS === "web";
const MAX_W = Math.min(SCREEN_W, 900);

type Article = {
  title: string;
  description: string;
  url: string;
  image: string;
  published: string;
  source: string;
  source_url?: string;
};

const CATEGORIES = [
  { key: "all",           label_en: "All",           label_pt: "Todos",          label_zh: "全部",   icon: "⚡", color: PURPLE },
  { key: "politics",      label_en: "Politics",      label_pt: "Política",       label_zh: "政治",   icon: "🏛",  color: "#818CF8" },
  { key: "economy",       label_en: "Economy",       label_pt: "Economia",       label_zh: "经济",   icon: "📈", color: "#34D399" },
  { key: "crypto",        label_en: "Crypto",        label_pt: "Cripto",         label_zh: "加密",   icon: "₿",  color: "#F7931A" },
  { key: "sports",        label_en: "Sports",        label_pt: "Esportes",       label_zh: "体育",   icon: "⚽", color: "#60A5FA" },
  { key: "technology",    label_en: "Tech",          label_pt: "Tecnologia",     label_zh: "科技",   icon: "💻", color: "#A78BFA" },
  { key: "geopolitics",   label_en: "Global",        label_pt: "Global",         label_zh: "全球",   icon: "🌍", color: "#FB923C" },
  { key: "entertainment", label_en: "Entertainment", label_pt: "Entretenimento", label_zh: "娱乐",   icon: "🎬", color: "#F472B6" },
  { key: "music",         label_en: "Music",         label_pt: "Música",         label_zh: "音乐",   icon: "🎵", color: "#C084FC" },
  { key: "tv",            label_en: "TV",            label_pt: "TV",             label_zh: "电视",   icon: "📺", color: "#22D3EE" },
  { key: "science",       label_en: "Science",       label_pt: "Ciência",        label_zh: "科学",   icon: "🔬", color: "#86EFAC" },
  { key: "weather",       label_en: "Weather",       label_pt: "Clima",          label_zh: "天气",   icon: "🌦",  color: "#7DD3FC" },
];

const CATEGORY_IMAGES: Record<string, string> = {
  politics:      "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=200&q=80",
  economy:       "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&q=80",
  crypto:        "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=200&q=80",
  sports:        "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=200&q=80",
  technology:    "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=200&q=80",
  geopolitics:   "https://images.unsplash.com/photo-1551269901-5c5e14c25df7?w=200&q=80",
  entertainment: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=200&q=80",
  music:         "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80",
  tv:            "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=200&q=80",
  science:       "https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=200&q=80",
  weather:       "https://images.unsplash.com/photo-1504608524841-42584120d497?w=200&q=80",
};

const NEWS_QUERIES: Record<string, string> = {
  all:           "Brazil OR Brasil OR world news",
  politics:      "Brazil politics OR Lula OR elections",
  economy:       "Brazil economy OR Selic OR inflation",
  crypto:        "Bitcoin OR Ethereum OR crypto",
  sports:        "World Cup OR Brasileirao OR NBA",
  technology:    "AI OR artificial intelligence OR tech",
  geopolitics:   "war OR Ukraine OR Gaza OR China",
  entertainment: "Netflix OR cinema OR Oscar",
  music:         "music OR concert OR Spotify",
  tv:            "Globo OR BBB OR novela OR streaming",
  science:       "science OR NASA OR discovery",
  weather:       "Brazil weather OR climate OR flood",
};

function timeAgo(dateStr: string, lang: string): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (lang === "pt") {
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return `${Math.floor(diff / 86400)}d atrás`;
  }
  if (lang === "zh") {
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  }
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── News card — with image hero + AI summary ──────────────────────────────────
function NewsCard({ article, onPress, language, catColor, summary, loadingSummary }: {
  article: Article; onPress(): void; language: string; catColor: string;
  summary?: string; loadingSummary?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ backgroundColor: CARD, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER, overflow: "hidden" }}
    >
      {/* Hero image */}
      {article.image ? (
        <Image source={{ uri: article.image }} style={{ width: "100%", height: 160 }} resizeMode="cover" />
      ) : (
        <View style={{ width: "100%", height: 100, backgroundColor: catColor + "15", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 32 }}>📰</Text>
        </View>
      )}

      <View style={{ padding: 14 }}>
        {/* Source + time */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <View style={{ backgroundColor: catColor + "15", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
            <Text style={{ color: catColor, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>{article.source.toUpperCase()}</Text>
          </View>
          <Text style={{ color: TEXT_MID, fontSize: 10 }}>·</Text>
          <Text style={{ color: TEXT_MID, fontSize: 10 }}>{timeAgo(article.published, language)}</Text>
        </View>

        {/* Title */}
        <Text style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_700Bold", lineHeight: 22, marginBottom: 8 }}>
          {toChineseFallback(article.title, language)}
        </Text>

        {/* AI Summary */}
        {(loadingSummary || !!summary) && (
          <View style={{ backgroundColor: "rgba(124,92,252,0.06)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "rgba(124,92,252,0.15)", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: "white", fontSize: 8, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                  {language === "pt" ? "RESUMO · IA" : language === "zh" ? "AI 摘要" : "AI SUMMARY"}
                </Text>
              </LinearGradient>
            </View>
            {loadingSummary ? (
              <ActivityIndicator color={PURPLE} size="small" />
            ) : (
              <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 18 }}>
                {summary}
              </Text>
            )}
          </View>
        )}

        {/* Description fallback */}
        {!summary && !loadingSummary && article.description ? (
          <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_400Regular", lineHeight: 18, marginBottom: 6 }} numberOfLines={3}>
            {toChineseFallback(article.description, language)}
          </Text>
        ) : null}

        <Text style={{ color: PURPLE_D, fontSize: 11, fontFamily: "DMSans_700Bold" }}>
          {language === "zh" ? "阅读更多 →" : language === "pt" ? "Ler mais →" : "Read more →"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NewsScreen() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { open: openSidebar } = React.useContext(SidebarContext);
  const [articles, setArticles] = useState<Article[]>([]);
  const [summaries, setSummaries] = useState<Record<number, string>>({});
  const [loadingSummaries, setLoadingSummaries] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchedAt  = useRef<Record<string, number>>({});

  const activeCat = CATEGORIES.find(c => c.key === activeCategory) ?? CATEGORIES[0];

  const fetchAll = useCallback(async (cat = activeCategory, silent = false, force = false) => {
    const tabKey = `${cat}_${language}`;

    // ── Tab-switch cache guard ────────────────────────────────────────────────
    // Skip network if data was fetched within AUTO_REFRESH_MS and not forced.
    if (!force) {
      const ts = lastFetchedAt.current[tabKey];
      if (ts && Date.now() - ts < AUTO_REFRESH_MS) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    try {
      if (!silent) setLoading(true);

      // News-only tab: a single /news/single fetch is all we need.  Markets
      // live exclusively in their own tab now, so we no longer pay for an
      // /events/ call + a /events/history/batch call on every news view.
      const newsRes = await api.get("/news/single", {
        params: { category: cat, lang: language, max_results: 15 },
        timeout: 25000,
      }).then(r => ({ status: "fulfilled" as const, value: r }))
       .catch(e => ({ status: "rejected" as const, reason: e }));

      if (newsRes.status === "fulfilled") {
        const arts: Article[] = newsRes.value.data.articles ?? [];
        setArticles(arts);
        // Clear summaries only when we have fresh articles (not on tab-switch cache hit)
        setSummaries({});

        // Fetch AI summaries for first 4 articles in background
        const toSummarise = arts.slice(0, 4);
        toSummarise.forEach((a, i) => {
          setLoadingSummaries(prev => ({ ...prev, [i]: true }));
          api.post("/news/summary", {
            title: a.title,
            description: a.description ?? "",
            url: a.url,
            language,
          }).then(r => {
            setSummaries(prev => ({ ...prev, [i]: r.data.summary ?? "" }));
          }).catch(() => {}).finally(() => {
            setLoadingSummaries(prev => ({ ...prev, [i]: false }));
          });
        });
      }

      // Stamp successful fetch so tab-switch returns early next time
      lastFetchedAt.current[tabKey] = Date.now();
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [activeCategory, language]);

  useFocusEffect(useCallback(() => {
    fetchAll(activeCategory);
    // Clear any stale interval before starting a new one (prevents multiple intervals)
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchAll(activeCategory, true), AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  // fetchAll already captures activeCategory and language via its own useCallback deps
  }, [fetchAll]));

  const handleCategory = (cat: string) => {
    setActiveCategory(cat);
    setArticles([]);
    setSummaries({});
    // Invalidate cache so the new category always fetches fresh data
    delete lastFetchedAt.current[`${cat}_${language}`];
    fetchAll(cat, false, true);
  };

  const openArticle = (article: Article) => {
    router.push({
      pathname: "/news-detail",
      params: {
        title:       article.title,
        description: article.description ?? "",
        url:         article.url,
        image:       article.image ?? "",
        published:   article.published ?? "",
        source:      article.source ?? "",
        source_url:  article.source_url ?? "",
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: TEXT, fontSize: 20, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>
                {language === "pt" ? "Ao Vivo" : language === "zh" ? "头条新闻" : "Breaking"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                <Text style={{ color: GREEN, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>LIVE</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={() => fetchAll(activeCategory, false, true)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.06)" }}>
            <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 9, letterSpacing: 0.8 }}>
              {loading ? "..." : (language === "pt" ? "ATUALIZAR" : language === "zh" ? "刷新" : "REFRESH")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: "row" }} style={{ borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.08)", maxHeight: 50 }}>
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.key;
            const label = language === "pt" ? cat.label_pt : language === "zh" ? cat.label_zh : cat.label_en;
            return (
              <TouchableOpacity key={cat.key} onPress={() => handleCategory(cat.key)} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: active ? cat.color : BORDER, backgroundColor: active ? cat.color + "18" : "transparent" }}>
                <Text style={{ color: active ? cat.color : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 0.5 }}>
                  {cat.icon} {label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={PURPLE} size="large" />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(activeCategory, false, true); }} tintColor={PURPLE} />}
          >
            <View style={{ maxWidth: IS_WEB ? MAX_W : undefined, alignSelf: IS_WEB ? "center" : undefined, width: "100%" }}>

              {/* Pure breaking-news feed.  Markets live in their own tab. */}
              {articles.length > 0 && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 }}>
                    <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>
                      {language === "zh" ? "头条新闻" : language === "pt" ? "ÚLTIMAS NOTÍCIAS" : "BREAKING NEWS"}
                    </Text>
                    <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_400Regular" }}>
                      {language === "zh" ? "含AI摘要" : language === "pt" ? "Com resumo por IA" : "With AI summary"}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 16 }}>
                    {articles.map((article, idx) => (
                      <NewsCard
                        key={article.url || String(idx)}
                        article={article}
                        onPress={() => openArticle(article)}
                        language={language}
                        catColor={activeCat.color}
                        summary={summaries[idx]}
                        loadingSummary={loadingSummaries[idx]}
                      />
                    ))}
                  </View>
                </>
              )}

              {articles.length === 0 && !loading && (
                <View style={{ alignItems: "center", paddingTop: 80 }}>
                  <Text style={{ color: PURPLE_D, fontSize: 32, marginBottom: 14 }}>◈</Text>
                  <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium" }}>
                    {language === "zh" ? "暂无新闻" : language === "pt" ? "Nenhuma notícia encontrada" : "No news available"}
                  </Text>
                </View>
              )}

              <View style={{ height: 100 }} />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
