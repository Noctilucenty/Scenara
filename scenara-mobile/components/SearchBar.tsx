/**
 * components/SearchBar.tsx — debounced full-text search across markets.
 *
 * Behaviour:
 *   • Idle (not focused): plain search input with placeholder
 *   • Focused + empty query: shows scrollable category chips so users can
 *     browse by market type (Brazil, Politics, Sports, …) without typing
 *   • Focused + ≥2 chars: debounced server search, inline result dropdown
 *
 * Design notes:
 *   - 220ms debounce: tuned so a two-word query fires once, not once per char.
 *   - Request-version guard (lastReqRef) prevents stale responses stomping
 *     the latest result — classic search-box race condition fix.
 *   - Blur delay of 120ms lets result/chip taps register before the dropdown
 *     unmounts.
 *   - Category chips call onCategorySelect (passed by the parent markets
 *     screen) so tapping "Sports" does the same thing as tapping the Sports
 *     tab — single source of truth for the active category state.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
// Emoji + colour for every category the backend produces.
// Keep in sync with CAT_META in market-detail.tsx and categoryColor in admin.tsx.
const CATEGORIES: {
  id: string;
  label_en: string;
  label_pt: string;
  label_zh: string;
  icon: string;
  color: string;
}[] = [
  { id: "brazil",        label_en: "Brazil",        label_pt: "Brasil",       label_zh: "巴西",   icon: "🇧🇷", color: "#22C55E" },
  { id: "politics",      label_en: "Politics",      label_pt: "Política",     label_zh: "政治",   icon: "🏛",  color: "#818CF8" },
  { id: "sports",        label_en: "Sports",        label_pt: "Esportes",     label_zh: "体育",   icon: "⚽", color: "#60A5FA" },
  { id: "crypto",        label_en: "Crypto",        label_pt: "Cripto",       label_zh: "加密",   icon: "₿",  color: "#F7931A" },
  { id: "economy",       label_en: "Economy",       label_pt: "Economia",     label_zh: "经济",   icon: "📈", color: "#34D399" },
  { id: "geopolitics",   label_en: "World",         label_pt: "Geopolítica",  label_zh: "地缘",   icon: "🌍", color: "#FB923C" },
  { id: "entertainment", label_en: "Entertainment", label_pt: "Entretenimento", label_zh: "娱乐",  icon: "🎬", color: "#F472B6" },
  { id: "technology",    label_en: "Tech",          label_pt: "Tecnologia",   label_zh: "科技",   icon: "💻", color: "#A78BFA" },
  { id: "science",       label_en: "Science",       label_pt: "Ciência",      label_zh: "科学",   icon: "🔬", color: "#86EFAC" },
  { id: "music",         label_en: "Music",         label_pt: "Música",       label_zh: "音乐",   icon: "🎵", color: "#C084FC" },
  { id: "tv",            label_en: "TV",            label_pt: "TV",           label_zh: "电视",   icon: "📺", color: "#22D3EE" },
  { id: "weather",       label_en: "Weather",       label_pt: "Clima",        label_zh: "天气",   icon: "🌦",  color: "#7DD3FC" },
];

function catLabel(cat: typeof CATEGORIES[0], lang: string): string {
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
  /** Current active category (from parent). Scopes search results. */
  category?: string;
  /** Called when the user taps a category chip — mirrors CategoryTabs behaviour. */
  onCategorySelect?: (catId: string) => void;
}) {
  const router   = useRouter();
  const { t, language } = useLanguage();
  const [q,          setQ]          = useState("");
  const [focused,    setFocused]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [results,    setResults]    = useState<SearchResult[]>([]);

  const reqVersion  = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string) => {
    if (query.length < MIN_QUERY_LEN) {
      setResults([]);
      setLoading(false);
      return;
    }
    const myVersion = ++reqVersion.current;
    setLoading(true);
    try {
      const params: Record<string, string> = { q: query, lang: language };
      if (category && category !== "all") params.category = category;
      const res = await api.get("/events/search", { params });
      if (myVersion === reqVersion.current) {
        setResults((res.data || []).slice(0, 8));
      }
    } catch {
      if (myVersion === reqVersion.current) setResults([]);
    } finally {
      if (myVersion === reqVersion.current) setLoading(false);
    }
  }, [category, language]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q.trim()), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, runSearch]);

  const clearAndBlur = () => {
    setQ("");
    setResults([]);
    setFocused(false);
  };

  const handleCategoryChip = (catId: string) => {
    clearAndBlur();
    onCategorySelect?.(catId);
  };

  // Which panel to show beneath the input
  const showCategoryChips  = focused && q.trim().length === 0;
  const showSearchDropdown = focused && q.trim().length >= MIN_QUERY_LEN;

  return (
    <View style={[{ position: "relative", zIndex: 1000 }, style]}>
      {/* ── Input row ──────────────────────────────────────────────────── */}
      <View style={[styles.wrap, focused && styles.wrapFocused]}>
        <Text style={styles.icon}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={
            focused
              ? (language === "pt" ? "Buscar mercados…" : language === "zh" ? "搜索市场…" : "Search markets…")
              : (t.common?.searchPlaceholder ?? (language === "pt" ? "Buscar…" : language === "zh" ? "搜索…" : "Search…"))
          }
          placeholderTextColor={C.TEXT_MID}
          style={styles.input}
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t.common?.search ?? "Search"}
        />
        {loading ? (
          <ActivityIndicator size="small" color={C.PURPLE} style={{ marginRight: 8 }} />
        ) : q.length > 0 ? (
          <Pressable onPress={clearAndBlur} hitSlop={8} style={{ marginRight: 8 }}>
            <Text style={{ color: C.TEXT_MID, fontSize: 16 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Category chips (empty query) ───────────────────────────────── */}
      {showCategoryChips && (
        <View style={styles.dropdown}>
          <Text style={styles.chipHeading}>
            {language === "pt" ? "EXPLORAR POR CATEGORIA" : language === "zh" ? "按类别浏览" : "BROWSE BY CATEGORY"}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 14, gap: 8, flexDirection: "row" }}
          >
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => handleCategoryChip(cat.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: `${cat.color}40`, backgroundColor: isActive ? `${cat.color}25` : `${cat.color}12` },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={styles.chipIcon}>{cat.icon}</Text>
                  <Text style={[styles.chipLabel, { color: cat.color }]}>
                    {catLabel(cat, language)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Hint */}
          <Text style={styles.chipHint}>
            {language === "pt" ? "Ou comece a digitar para buscar…" : language === "zh" ? "或开始输入进行搜索…" : "Or start typing to search…"}
          </Text>
        </View>
      )}

      {/* ── Search result dropdown (query ≥ 2 chars) ──────────────────── */}
      {showSearchDropdown && (
        <View style={styles.dropdown}>
          {results.length === 0 && !loading ? (
            <Text style={styles.emptyText}>
              {language === "pt" ? "Nenhum mercado encontrado" : language === "zh" ? "未找到市场" : "No markets found"}
            </Text>
          ) : (
            results.map((r) => {
              const catMeta = CATEGORIES.find(c => c.id === r.category);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    clearAndBlur();
                    router.push({ pathname: "/market-detail", params: { eventId: String(r.id) } });
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: "rgba(124,92,252,0.08)" },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {catMeta && (
                      <Text style={{ fontSize: 14 }}>{catMeta.icon}</Text>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {pickTitle(r, language)}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <View style={{
                          backgroundColor: catMeta ? `${catMeta.color}20` : "rgba(255,255,255,0.06)",
                          borderRadius: 4,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                        }}>
                          <Text style={[styles.rowCat, { color: catMeta?.color ?? C.TEXT_MID }]}>
                            {catMeta ? catLabel(catMeta, language).toUpperCase() : r.category.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={{ color: C.TEXT_MID, fontSize: 14 }}>›</Text>
                  </View>
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
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.BORDER,
    paddingLeft: 12,
  },
  wrapFocused: {
    borderColor: "rgba(124,92,252,0.4)",
    backgroundColor: "rgba(17,22,32,1)",
  },
  icon: { color: C.TEXT_MID, fontSize: 16, marginRight: 8 },
  input: {
    flex: 1,
    color: C.TEXT,
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    paddingVertical: 11,
    paddingRight: 8,
  },

  // Shared dropdown shell
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    backgroundColor: C.CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(124,92,252,0.25)",
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },

  // Category chip panel
  chipHeading: {
    color: C.TEXT_MID,
    fontSize: 9,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 1.5,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipIcon: { fontSize: 14 },
  chipLabel: {
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
  },
  chipHint: {
    color: C.TEXT_MID,
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },

  // Search result rows
  row: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  rowTitle: {
    color: C.TEXT,
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  rowCat: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  emptyText: {
    padding: 16,
    color: C.TEXT_MID,
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
});
