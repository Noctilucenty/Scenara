/**
 * components/SearchBar.tsx — Polymarket-style search with Browse + Topics panels
 *
 * States:
 *   • Idle:                   plain input, collapsed
 *   • Focused + empty query:  full dropdown with Browse pills + Topics 2-col grid
 *   • Focused + ≥2 chars:     debounced server search results list
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useLanguage } from "@/src/i18n";
import { C } from "@/src/theme";

const DEBOUNCE_MS   = 220;
const MIN_QUERY_LEN = 2;

// ── Category definitions ───────────────────────────────────────────────────
const CATEGORIES: {
  id: string;
  label_en: string;
  label_pt: string;
  label_zh: string;
  icon: string;
  color: string;
}[] = [
  { id: "brazil",        label_en: "Brazil",        label_pt: "Brasil",         label_zh: "巴西",  icon: "🇧🇷", color: "#22C55E" },
  { id: "politics",      label_en: "Politics",      label_pt: "Política",       label_zh: "政治",  icon: "🏛",  color: "#818CF8" },
  { id: "sports",        label_en: "Sports",        label_pt: "Esportes",       label_zh: "体育",  icon: "⚽", color: "#60A5FA" },
  { id: "crypto",        label_en: "Crypto",        label_pt: "Cripto",         label_zh: "加密",  icon: "₿",  color: "#F7931A" },
  { id: "economy",       label_en: "Economy",       label_pt: "Economia",       label_zh: "经济",  icon: "📈", color: "#34D399" },
  { id: "geopolitics",   label_en: "World",         label_pt: "Geopolítica",    label_zh: "地缘",  icon: "🌍", color: "#FB923C" },
  { id: "entertainment", label_en: "Entertainment", label_pt: "Entretenimento", label_zh: "娱乐",  icon: "🎬", color: "#F472B6" },
  { id: "technology",    label_en: "Tech",          label_pt: "Tecnologia",     label_zh: "科技",  icon: "💻", color: "#A78BFA" },
  { id: "science",       label_en: "Science",       label_pt: "Ciência",        label_zh: "科学",  icon: "🔬", color: "#86EFAC" },
  { id: "music",         label_en: "Music",         label_pt: "Música",         label_zh: "音乐",  icon: "🎵", color: "#C084FC" },
  { id: "tv",            label_en: "TV",            label_pt: "TV",             label_zh: "电视",  icon: "📺", color: "#22D3EE" },
  { id: "weather",       label_en: "Weather",       label_pt: "Clima",          label_zh: "天气",  icon: "🌦",  color: "#7DD3FC" },
];

// Quick-access "Browse" shortcuts — subset shown as top pill row
const BROWSE_SHORTCUTS = [
  { id: "all",           label_en: "All",        label_pt: "Tudo",      label_zh: "全部",  icon: "◈" },
  { id: "crypto",        label_en: "Crypto",     label_pt: "Cripto",    label_zh: "加密",  icon: "₿" },
  { id: "politics",      label_en: "Politics",   label_pt: "Política",  label_zh: "政治",  icon: "🏛" },
  { id: "sports",        label_en: "Sports",     label_pt: "Esportes",  label_zh: "体育",  icon: "⚽" },
  { id: "economy",       label_en: "Economy",    label_pt: "Economia",  label_zh: "经济",  icon: "📈" },
  { id: "geopolitics",   label_en: "World",      label_pt: "Mundo",     label_zh: "世界",  icon: "🌍" },
];

function catLabel(cat: { label_en: string; label_pt: string; label_zh: string }, lang: string): string {
  if (lang === "pt") return cat.label_pt;
  if (lang === "zh") return cat.label_zh;
  return cat.label_en;
}

// ── Types ──────────────────────────────────────────────────────────────────
export type SearchResult = {
  id: number;
  slug: string;
  title: string;
  title_pt?: string | null;
  title_zh?: string | null;
  category: string;
};

function pickTitle(r: SearchResult, lang: string): string {
  if (lang === "zh" && r.title_zh) return r.title_zh;
  if (lang === "pt" && r.title_pt) return r.title_pt;
  return r.title;
}

// ── Component ──────────────────────────────────────────────────────────────
export function SearchBar({
  style,
  category,
  onCategorySelect,
}: {
  style?: ViewStyle;
  category?: string;
  onCategorySelect?: (catId: string) => void;
}) {
  const router = useRouter();
  const { language } = useLanguage();
  const [q,       setQ]       = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const reqVersion     = useRef(0);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setResults([]); }, [category, language]);

  const runSearch = useCallback(async (query: string) => {
    if (query.length < MIN_QUERY_LEN) { setResults([]); setLoading(false); return; }
    const myVersion = ++reqVersion.current;
    setLoading(true);
    try {
      const params: Record<string, string> = { q: query, lang: language };
      if (category && category !== "all") params.category = category;
      const res = await api.get("/events/search", { params });
      if (myVersion === reqVersion.current) setResults((res.data || []).slice(0, 8));
    } catch {
      if (myVersion === reqVersion.current) setResults([]);
    } finally {
      if (myVersion === reqVersion.current) setLoading(false);
    }
  }, [category, language]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q.trim()), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, runSearch]);

  const clearAndBlur = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setQ(""); setResults([]); setFocused(false);
  };

  const handleShortcut = (id: string) => {
    clearAndBlur();
    onCategorySelect?.(id);
  };

  const showBrowse   = focused && q.trim().length === 0;
  const showResults  = focused && q.trim().length >= MIN_QUERY_LEN;
  const isWeb        = Platform.OS === "web";

  return (
    <View style={[{ position: "relative", zIndex: 1000 }, style]}>

      {/* ── Input ──────────────────────────────────────────────────────── */}
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={
            language === "pt" ? "Buscar mercados…"
            : language === "zh" ? "搜索市场…"
            : "Search markets…"
          }
          placeholderTextColor={C.TEXT_MID}
          style={styles.input}
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => { blurTimeoutRef.current = setTimeout(() => setFocused(false), 150); }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading ? (
          <ActivityIndicator size="small" color={C.PURPLE} style={{ marginRight: 12 }} />
        ) : q.length > 0 ? (
          <Pressable onPress={clearAndBlur} hitSlop={8} style={{ marginRight: 12 }}>
            <Text style={{ color: C.TEXT_MID, fontSize: 16 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Browse + Topics dropdown ────────────────────────────────────── */}
      {showBrowse && (
        <View style={[styles.dropdown, isWeb && styles.dropdownWeb]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {/* BROWSE row */}
            <Text style={styles.sectionLabel}>
              {language === "pt" ? "EXPLORAR" : language === "zh" ? "浏览" : "BROWSE"}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.browseRow}
              keyboardShouldPersistTaps="always"
            >
              {BROWSE_SHORTCUTS.map(s => {
                const isActive = s.id === "all" ? category === "all" || !category : category === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => handleShortcut(s.id)}
                    style={({ pressed }) => [
                      styles.browsePill,
                      isActive && styles.browsePillActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.browsePillIcon}>{s.icon}</Text>
                    <Text style={[styles.browsePillLabel, isActive && { color: C.TEXT }]}>
                      {catLabel(s, language)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* TOPICS grid */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              {language === "pt" ? "CATEGORIAS" : language === "zh" ? "分类" : "TOPICS"}
            </Text>
            <View style={styles.topicsGrid}>
              {CATEGORIES.map(cat => {
                const isActive = category === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => handleShortcut(cat.id)}
                    style={({ pressed }) => [
                      styles.topicCard,
                      isActive && { borderColor: `${cat.color}50`, backgroundColor: `${cat.color}15` },
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    {/* Colored icon box */}
                    <View style={[styles.topicIconBox, { backgroundColor: `${cat.color}20` }]}>
                      <Text style={styles.topicIcon}>{cat.icon}</Text>
                    </View>
                    <Text style={[styles.topicLabel, isActive && { color: cat.color }]} numberOfLines={1}>
                      {catLabel(cat, language)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Hint */}
            <Text style={styles.hint}>
              {language === "pt" ? "Ou comece a digitar para buscar…"
               : language === "zh" ? "或开始输入进行搜索…"
               : "Or start typing to search…"}
            </Text>
          </ScrollView>
        </View>
      )}

      {/* ── Search results ──────────────────────────────────────────────── */}
      {showResults && (
        <View style={[styles.dropdown, isWeb && styles.dropdownWeb]}>
          {results.length === 0 && !loading ? (
            <Text style={styles.emptyText}>
              {language === "pt" ? "Nenhum mercado encontrado"
               : language === "zh" ? "未找到市场"
               : "No markets found"}
            </Text>
          ) : (
            results.map(r => {
              const meta = CATEGORIES.find(c => c.id === r.category);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    clearAndBlur();
                    router.push({ pathname: "/market-detail", params: { eventId: String(r.id) } });
                  }}
                  style={({ pressed }) => [
                    styles.resultRow,
                    pressed && { backgroundColor: "rgba(124,92,252,0.08)" },
                  ]}
                >
                  <View style={[styles.resultIconBox, { backgroundColor: `${meta?.color ?? "#7C5CFC"}18` }]}>
                    <Text style={{ fontSize: 14 }}>{meta?.icon ?? "◈"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle} numberOfLines={2}>
                      {pickTitle(r, language)}
                    </Text>
                    <Text style={[styles.resultCat, { color: meta?.color ?? C.TEXT_MID }]}>
                      {meta ? catLabel(meta, language).toUpperCase() : r.category.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ color: C.TEXT_MID, fontSize: 16, paddingLeft: 8 }}>›</Text>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Input
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.BORDER,
    paddingLeft: 14,
  },
  inputWrapFocused: {
    borderColor: "rgba(124,92,252,0.5)",
    backgroundColor: "#0D1117",
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: C.TEXT,
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    paddingVertical: 12,
    paddingRight: 8,
  },

  // Dropdown shell
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    backgroundColor: "#0D1117",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(124,92,252,0.2)",
    overflow: "hidden",
    maxHeight: 480,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  dropdownWeb: {
    maxWidth: 540,
  },

  // Section labels (BROWSE / TOPICS)
  sectionLabel: {
    color: C.TEXT_MID,
    fontSize: 9,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 1.8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },

  // Browse pill row
  browseRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    gap: 8,
    paddingBottom: 4,
  },
  browsePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  browsePillActive: {
    borderColor: "rgba(124,92,252,0.5)",
    backgroundColor: "rgba(124,92,252,0.14)",
  },
  browsePillIcon: {
    fontSize: 12,
  },
  browsePillLabel: {
    color: C.TEXT_SUB,
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
  },

  // Topics 2-col grid
  topicsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 6,
  },
  topicCard: {
    width: "47.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  topicIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  topicIcon: {
    fontSize: 18,
  },
  topicLabel: {
    color: C.TEXT_SUB,
    fontFamily: "DMSans_700Bold",
    fontSize: 13,
    flex: 1,
  },

  // Hint at bottom of browse panel
  hint: {
    color: C.TEXT_MID,
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
    marginTop: 10,
  },

  // Search result rows
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  resultIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    color: C.TEXT,
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  resultCat: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 3,
  },
  emptyText: {
    padding: 20,
    color: C.TEXT_MID,
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
});
