import { useState, useCallback, useRef } from "react";
import {
  SafeAreaView, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Linking, RefreshControl,
  Image, Dimensions, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { useLanguage } from "@/src/i18n";
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
const AUTO_REFRESH_MS = 30_000;
const { width: SCREEN_W } = Dimensions.get("window");
const IS_WEB = Platform.OS === "web";
const MAX_W = Math.min(SCREEN_W, 900);

type Scenario = {
  id: number;
  title: string;
  title_pt: string | null;
  probability: number;
};

type EventItem = {
  id: number;
  title: string;
  title_pt: string | null;
  category: string;
  status: string;
  scenarios: Scenario[];
  closes_at: string | null;
};

type Article = {
  title: string;
  description: string;
  url: string;
  image: string;
  published: string;
  source: string;
};

const CATEGORIES = [
  { key: "all",           label_en: "All",           label_pt: "Todos",          icon: "⚡", color: PURPLE },
  { key: "politics",      label_en: "Politics",      label_pt: "Política",       icon: "🏛",  color: "#818CF8" },
  { key: "economy",       label_en: "Economy",       label_pt: "Economia",       icon: "📈", color: "#34D399" },
  { key: "crypto",        label_en: "Crypto",        label_pt: "Cripto",         icon: "₿",  color: "#F7931A" },
  { key: "sports",        label_en: "Sports",        label_pt: "Esportes",       icon: "⚽", color: "#60A5FA" },
  { key: "technology",    label_en: "Tech",          label_pt: "Tecnologia",     icon: "💻", color: "#A78BFA" },
  { key: "geopolitics",   label_en: "Global",        label_pt: "Global",         icon: "🌍", color: "#FB923C" },
  { key: "entertainment", label_en: "Entertainment", label_pt: "Entretenimento", icon: "🎬", color: "#F472B6" },
  { key: "music",         label_en: "Music",         label_pt: "Música",         icon: "🎵", color: "#C084FC" },
  { key: "tv",            label_en: "TV",            label_pt: "TV",             icon: "📺", color: "#22D3EE" },
  { key: "science",       label_en: "Science",       label_pt: "Ciência",        icon: "🔬", color: "#86EFAC" },
  { key: "weather",       label_en: "Weather",       label_pt: "Clima",          icon: "🌦",  color: "#7DD3FC" },
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
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";

function eventTitle(e: EventItem, lang: string) {
  return (lang === "pt" && e.title_pt) ? e.title_pt : e.title;
}

function scenarioTitle(s: Scenario, lang: string) {
  return (lang === "pt" && s.title_pt) ? s.title_pt : s.title;
}

// ── Sparkline mini chart ──────────────────────────────────────────────────────
function Sparkline({ points, color, w = 64, h = 32 }: { points: number[]; color: string; w?: number; h?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 2;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const ys = points.map(p => pad + (1 - (p - min) / range) * (h - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fill = `${d} L${xs[xs.length - 1].toFixed(1)},${h} L${xs[0].toFixed(1)},${h} Z`;
  const isUp = points[points.length - 1] >= points[0];
  const lineColor = isUp ? GREEN : RED;

  return (
    <Svg width={w} height={h} style={{ overflow: "hidden" }}>
      <Defs>
        <SvgGrad id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lineColor} stopOpacity={0.25} />
          <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
        </SvgGrad>
      </Defs>
      <Path d={fill} fill={`url(#sg${color.replace("#","")})`} />
      <Path d={d} stroke={lineColor} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Market row (Polymarket style) ─────────────────────────────────────────────
function MarketRow({ event, onPress, language, catColor, index, image, history }: {
  event: EventItem; onPress(): void; language: string; catColor: string; index: number; image?: string; history?: number[];
}) {
  const topScenario = event.scenarios[0];
  const prob = topScenario?.probability ?? 0;
  const isHigh = prob >= 60;
  const isLow = prob <= 40;
  const probColor = isHigh ? GREEN : isLow ? RED : TEXT_SUB;
  const cat = CATEGORIES.find(c => c.key === event.category);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 10 }}
    >
      {/* Thumbnail */}
      <View style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
        {image ? (
          <Image source={{ uri: image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 48, height: 48, backgroundColor: catColor + "18", alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: catColor + "30" }}>
            <Text style={{ fontSize: 20 }}>{cat?.icon ?? "◈"}</Text>
          </View>
        )}
      </View>

      {/* Title + meta */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 19, marginBottom: 4 }} numberOfLines={2}>
          {eventTitle(event, language)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: catColor + "15" }}>
            <Text style={{ color: catColor, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>
              {cat?.[language === "pt" ? "label_pt" : "label_en"] ?? event.category}
            </Text>
          </View>
          {event.scenarios.slice(0, 2).map((s, i) => (
            <Text key={s.id} style={{ color: TEXT_MID, fontSize: 10 }}>
              {scenarioTitle(s, language)} {s.probability.toFixed(0)}%{i === 0 && event.scenarios.length > 1 ? " ·" : ""}
            </Text>
          ))}
        </View>
      </View>

      {/* Sparkline + probability */}
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        {history && history.length >= 2 && (
          <Sparkline points={history} color={catColor} w={60} h={28} />
        )}
        <Text style={{ color: probColor, fontSize: 20, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>
          {prob.toFixed(0)}%
        </Text>
        <Text style={{ color: TEXT_MID, fontSize: 9, marginTop: 1 }} numberOfLines={1}>
          {topScenario ? scenarioTitle(topScenario, language) : ""}
        </Text>
      </View>

      <Text style={{ color: TEXT_MID, fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

// ── News row ──────────────────────────────────────────────────────────────────
function NewsRow({ article, onPress, language, catColor, index }: {
  article: Article; onPress(): void; language: string; catColor: string; index: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 }}
    >
      {/* Thumbnail */}
      <View style={{ width: 72, height: 56, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
        {article.image ? (
          <Image source={{ uri: article.image }} style={{ width: 72, height: 56 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 72, height: 56, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20 }}>📰</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 18, marginBottom: 5 }} numberOfLines={2}>
          {article.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: catColor, fontSize: 10, fontFamily: "DMSans_700Bold" }}>{article.source}</Text>
          <Text style={{ color: TEXT_MID, fontSize: 10 }}>·</Text>
          <Text style={{ color: TEXT_MID, fontSize: 10 }}>{timeAgo(article.published, language)}</Text>
        </View>
      </View>

      <Text style={{ color: TEXT_MID, fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NewsScreen() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { open: openSidebar } = React.useContext(SidebarContext);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [historyCache, setHistoryCache] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeCat = CATEGORIES.find(c => c.key === activeCategory) ?? CATEGORIES[0];

  const fetchAll = useCallback(async (cat = activeCategory, silent = false) => {
    try {
      if (!silent) setLoading(true);

      // Fetch events and news in parallel
      const [eventsRes, newsRes] = await Promise.allSettled([
        api.get("/events/"),
        api.get("/news/single", { params: { category: cat, lang: language, max_results: 15 } }),
      ]);

      if (eventsRes.status === "fulfilled") {
        let evts: EventItem[] = eventsRes.value.data ?? [];
        evts = evts.filter(e => e.status === "open");
        if (cat !== "all") evts = evts.filter(e => e.category === cat);
        const sliced = evts.slice(0, 20);
        setEvents(sliced);

        // Fetch sparkline history for top scenario of each event
        const histResults = await Promise.allSettled(
          sliced.map(e => api.get(`/events/${e.id}/history`))
        );
        const cache: Record<number, number[]> = {};
        histResults.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const scenarios = r.value.data?.scenarios ?? [];
            if (scenarios[0]?.points?.length >= 2) {
              // Downsample to 20 points for sparkline
              const pts: number[] = scenarios[0].points.map((p: any) => p.probability);
              const step = Math.max(1, Math.floor(pts.length / 20));
              cache[sliced[i].id] = pts.filter((_: any, idx: number) => idx % step === 0);
            }
          }
        });
        setHistoryCache(cache);
      }

      if (newsRes.status === "fulfilled") {
        setArticles(newsRes.value.data.articles ?? []);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [activeCategory, language]);

  useFocusEffect(useCallback(() => {
    fetchAll(activeCategory);
    intervalRef.current = setInterval(() => fetchAll(activeCategory, true), AUTO_REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchAll, activeCategory]));

  const handleCategory = (cat: string) => {
    setActiveCategory(cat);
    setEvents([]);
    setArticles([]);
    fetchAll(cat);
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
      },
    });
  };

  const openEvent = (event: EventItem) => {
    router.push({ pathname: "/market-detail", params: { eventId: String(event.id) } });
  };

  if (!fontsLoaded) return null;

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
                {language === "pt" ? "Ao Vivo" : "Breaking"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                <Text style={{ color: GREEN, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 1 }}>LIVE</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={() => fetchAll(activeCategory)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: BORDER_P, backgroundColor: "rgba(124,92,252,0.06)" }}>
            <Text style={{ color: PURPLE_D, fontFamily: "DMSans_700Bold", fontSize: 9, letterSpacing: 0.8 }}>
              {loading ? "..." : (language === "pt" ? "ATUALIZAR" : "REFRESH")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: "row" }} style={{ borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.08)", maxHeight: 50 }}>
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.key;
            const label = language === "pt" ? cat.label_pt : cat.label_en;
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(activeCategory); }} tintColor={PURPLE} />}
          >
            <View style={{ maxWidth: IS_WEB ? MAX_W : undefined, alignSelf: IS_WEB ? "center" : undefined, width: "100%" }}>

              {/* Markets section */}
              {events.length > 0 && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 }}>
                    <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>
                      {language === "pt" ? "MERCADOS ABERTOS" : "OPEN MARKETS"}
                    </Text>
                    <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>
                      {events.length} {language === "pt" ? "ativos" : "active"}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: CARD, borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER }}>
                    {events.map((event, idx) => {
                      const catImage = CATEGORY_IMAGES[event.category];
                      return (
                        <MarketRow
                          key={event.id}
                          event={event}
                          index={idx + 1}
                          onPress={() => openEvent(event)}
                          language={language}
                          catColor={CATEGORIES.find(c => c.key === event.category)?.color ?? PURPLE}
                          image={catImage}
                          history={historyCache[event.id]}
                        />
                      );
                    })}
                  </View>
                </>
              )}

              {/* News section */}
              {articles.length > 0 && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 }}>
                    <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>
                      {language === "pt" ? "NOTÍCIAS RELACIONADAS" : "RELATED NEWS"}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: CARD, borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER }}>
                    {articles.map((article, idx) => (
                      <NewsRow
                        key={idx}
                        article={article}
                        index={idx + 1}
                        onPress={() => openArticle(article)}
                        language={language}
                        catColor={activeCat.color}
                      />
                    ))}
                  </View>
                </>
              )}

              {events.length === 0 && articles.length === 0 && !loading && (
                <View style={{ alignItems: "center", paddingTop: 80 }}>
                  <Text style={{ color: PURPLE_D, fontSize: 32, marginBottom: 14 }}>◈</Text>
                  <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_500Medium" }}>
                    {language === "pt" ? "Nenhum mercado encontrado" : "No markets found"}
                  </Text>
                </View>
              )}

              <View style={{ height: 60 }} />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}