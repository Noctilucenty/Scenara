/**
 * components/SearchBar.tsx — Polymarket-style search with Browse + Topics panels
 *
 * Overlay strategy (fixes the "transparent/bleed-through" bug):
 *   • Mobile:  Modal renders in a native layer above ALL content — no z-index
 *              wars with siblings.  measureInWindow gives the absolute screen
 *              position so the dropdown sits right below the input.
 *   • Web:     position:fixed backdrop + absolute dropdown (standard CSS).
 *
 * States:
 *   • Idle:                  plain input, collapsed
 *   • Focused + empty query: Browse pills + Topics 2-col grid
 *   • Focused + ≥2 chars:    debounced API search results
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useLanguage } from "@/src/i18n";
import { C } from "@/src/theme";

const DEBOUNCE_MS   = 220;
const MIN_QUERY_LEN = 2;

// ── Category definitions (no emojis — text codes only) ────────────────────
const CATEGORIES: {
  id: string; label_en: string; label_pt: string; label_zh: string;
  icon: string; color: string;
}[] = [
  { id: "brazil",        label_en: "Brazil",        label_pt: "Brasil",         label_zh: "巴西", icon: "BR",  color: "#22C55E" },
  { id: "politics",      label_en: "Politics",      label_pt: "Política",       label_zh: "政治", icon: "POL", color: "#818CF8" },
  { id: "sports",        label_en: "Sports",        label_pt: "Esportes",       label_zh: "体育", icon: "SPT", color: "#60A5FA" },
  { id: "crypto",        label_en: "Crypto",        label_pt: "Cripto",         label_zh: "加密", icon: "₿",   color: "#F7931A" },
  { id: "economy",       label_en: "Economy",       label_pt: "Economia",       label_zh: "经济", icon: "ECO", color: "#34D399" },
  { id: "geopolitics",   label_en: "World",         label_pt: "Geopolítica",    label_zh: "地缘", icon: "WLD", color: "#FB923C" },
  { id: "entertainment", label_en: "Entertainment", label_pt: "Entretenimento", label_zh: "娱乐", icon: "ENT", color: "#F472B6" },
  { id: "technology",    label_en: "Tech",          label_pt: "Tecnologia",     label_zh: "科技", icon: "TEC", color: "#A78BFA" },
  { id: "science",       label_en: "Science",       label_pt: "Ciência",        label_zh: "科学", icon: "SCI", color: "#86EFAC" },
  { id: "music",         label_en: "Music",         label_pt: "Música",         label_zh: "音乐", icon: "MUS", color: "#C084FC" },
  { id: "tv",            label_en: "TV",            label_pt: "TV",             label_zh: "电视", icon: "TV",  color: "#22D3EE" },
  { id: "weather",       label_en: "Weather",       label_pt: "Clima",          label_zh: "天气", icon: "WTH", color: "#7DD3FC" },
];

const BROWSE_SHORTCUTS = [
  { id: "all",         label_en: "All",      label_pt: "Tudo",     label_zh: "全部", icon: "ALL" },
  { id: "crypto",      label_en: "Crypto",   label_pt: "Cripto",   label_zh: "加密", icon: "₿"   },
  { id: "politics",    label_en: "Politics", label_pt: "Política", label_zh: "政治", icon: "POL" },
  { id: "sports",      label_en: "Sports",   label_pt: "Esportes", label_zh: "体育", icon: "SPT" },
  { id: "economy",     label_en: "Economy",  label_pt: "Economia", label_zh: "经济", icon: "ECO" },
  { id: "geopolitics", label_en: "World",    label_pt: "Mundo",    label_zh: "世界", icon: "WLD" },
];

function catLabel(
  cat: { label_en: string; label_pt: string; label_zh: string },
  lang: string,
): string {
  if (lang === "pt") return cat.label_pt;
  if (lang === "zh") return cat.label_zh;
  return cat.label_en;
}

// ── Types ──────────────────────────────────────────────────────────────────
export type SearchResult = {
  id: number; slug: string; title: string;
  title_pt?: string | null; title_zh?: string | null;
  category: string;
};

function pickTitle(r: SearchResult, lang: string): string {
  if (lang === "zh" && r.title_zh) return r.title_zh;
  if (lang === "pt" && r.title_pt) return r.title_pt;
  return r.title;
}

// ── SVG search icon (no emoji needed) ─────────────────────────────────────
function SearchIcon({ size = 16, color = C.TEXT_MID }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7.5" stroke={color} strokeWidth="2" />
      <Line x1="20" y1="20" x2="16.1" y2="16.1" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Shared dropdown body (used by both web and mobile Modal) ──────────────
function DropdownBody({
  showBrowse, showResults, results, loading,
  category, language, onShortcut, onResultPress,
}: {
  showBrowse: boolean; showResults: boolean;
  results: SearchResult[]; loading: boolean;
  category?: string; language: string;
  onShortcut(id: string): void;
  onResultPress(r: SearchResult): void;
}) {
  if (showBrowse) {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        style={{ maxHeight: 460 }}
      >
        {/* BROWSE row */}
        <Text style={S.sectionLabel}>
          {language === "pt" ? "EXPLORAR" : language === "zh" ? "浏览" : "BROWSE"}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.browseRow}
          keyboardShouldPersistTaps="always"
        >
          {BROWSE_SHORTCUTS.map(s => {
            const isActive = s.id === "all"
              ? (category === "all" || !category)
              : category === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => onShortcut(s.id)}
                style={({ pressed }) => [
                  S.browsePill,
                  isActive && S.browsePillActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[S.browsePillIcon, isActive && { color: C.PURPLE }]}>
                  {s.icon}
                </Text>
                <Text style={[S.browsePillLabel, isActive && { color: C.TEXT }]}>
                  {catLabel(s, language)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* TOPICS 2-col grid */}
        <Text style={[S.sectionLabel, { marginTop: 14 }]}>
          {language === "pt" ? "CATEGORIAS" : language === "zh" ? "分类" : "TOPICS"}
        </Text>
        <View style={S.topicsGrid}>
          {CATEGORIES.map(cat => {
            const isActive = category === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => onShortcut(cat.id)}
                style={({ pressed }) => [
                  S.topicCard,
                  isActive && {
                    borderColor: `${cat.color}55`,
                    backgroundColor: `${cat.color}18`,
                  },
                  pressed && { opacity: 0.72 },
                ]}
              >
                {/* Colored badge box with 2-3 char text code */}
                <View style={[S.topicIconBox, { backgroundColor: `${cat.color}22` }]}>
                  <Text style={[S.topicIconText, { color: cat.color }]}>{cat.icon}</Text>
                </View>
                <Text
                  style={[S.topicLabel, isActive && { color: cat.color }]}
                  numberOfLines={1}
                >
                  {catLabel(cat, language)}
                </Text>
                {isActive && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cat.color, marginLeft: "auto" as any }} />
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={S.hint}>
          {language === "pt"
            ? "Ou comece a digitar para buscar…"
            : language === "zh"
            ? "或开始输入进行搜索…"
            : "Or start typing to search…"}
        </Text>
      </ScrollView>
    );
  }

  if (showResults) {
    if (results.length === 0 && !loading) {
      return (
        <View style={{ padding: 20, alignItems: "center", gap: 8 }}>
          <Text style={S.emptyTitle}>
            {language === "pt" ? "Sem resultados" : language === "zh" ? "未找到" : "No results"}
          </Text>
          <Text style={S.emptySubtitle}>
            {language === "pt"
              ? "Tente outros termos ou explore por categoria"
              : language === "zh"
              ? "尝试其他词语或按分类浏览"
              : "Try different terms or browse by category"}
          </Text>
        </View>
      );
    }
    return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ maxHeight: 380 }}>
        {results.map(r => {
          const meta = CATEGORIES.find(c => c.id === r.category);
          return (
            <Pressable
              key={r.id}
              onPress={() => onResultPress(r)}
              style={({ pressed }) => [
                S.resultRow,
                pressed && { backgroundColor: "rgba(124,92,252,0.09)" },
              ]}
            >
              <View style={[S.resultIconBox, { backgroundColor: `${meta?.color ?? C.PURPLE}18` }]}>
                <Text style={[S.resultIconText, { color: meta?.color ?? C.PURPLE }]}>
                  {meta?.icon ?? "◈"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.resultTitle} numberOfLines={2}>
                  {pickTitle(r, language)}
                </Text>
                <Text style={[S.resultCat, { color: meta?.color ?? C.TEXT_MID }]}>
                  {meta ? catLabel(meta, language).toUpperCase() : r.category.toUpperCase()}
                </Text>
              </View>
              <Text style={{ color: C.TEXT_MID, fontSize: 16, paddingLeft: 8 }}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return null;
}

// ── Main component ─────────────────────────────────────────────────────────
export function SearchBar({
  style,
  category,
  onCategorySelect,
  onFocusChange,
}: {
  style?: ViewStyle;
  category?: string;
  onCategorySelect?: (catId: string) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const router   = useRouter();
  const { language } = useLanguage();
  const [q,       setQ]       = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  // Mobile Modal positioning — set by measureInWindow on focus
  const wrapRef   = useRef<View>(null);
  const [dropY,   setDropY]   = useState(0);
  const [dropL,   setDropL]   = useState(0);
  const [dropW,   setDropW]   = useState(Dimensions.get("window").width - 24);

  const reqVersion     = useRef(0);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isWeb = Platform.OS === "web";

  // Measure the wrapper position on screen so Modal dropdown lands below input
  const measureWrap = useCallback(() => {
    if (isWeb) return;
    wrapRef.current?.measureInWindow((x, y, w, h) => {
      setDropY(y + h + 6);
      setDropL(x);
      setDropW(w);
    });
  }, [isWeb]);

  useEffect(() => { setResults([]); }, [category, language]);

  const runSearch = useCallback(async (query: string) => {
    if (query.length < MIN_QUERY_LEN) { setResults([]); setLoading(false); return; }
    const myVer = ++reqVersion.current;
    setLoading(true);
    try {
      const params: Record<string, string> = { q: query, lang: language };
      if (category && category !== "all") params.category = category;
      const res = await api.get("/events/search", { params });
      if (myVer === reqVersion.current) setResults((res.data || []).slice(0, 8));
    } catch {
      if (myVer === reqVersion.current) setResults([]);
    } finally {
      if (myVer === reqVersion.current) setLoading(false);
    }
  }, [category, language]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q.trim()), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, runSearch]);

  // ESC closes on web
  useEffect(() => {
    if (!isWeb) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isWeb]);

  const setFocusState = useCallback((v: boolean) => {
    setFocused(v);
    onFocusChange?.(v);
    if (v) measureWrap();
  }, [onFocusChange, measureWrap]);

  const close = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setQ(""); setResults([]); setFocusState(false);
  };

  const handleShortcut = (id: string) => {
    close();
    onCategorySelect?.(id);
  };

  const handleResultPress = (r: SearchResult) => {
    close();
    router.push({ pathname: "/market-detail", params: { eventId: String(r.id) } });
  };

  const showBrowse   = focused && q.trim().length === 0;
  const showResults  = focused && q.trim().length >= MIN_QUERY_LEN;
  const showDropdown = showBrowse || showResults;

  const dropBody = (
    <DropdownBody
      showBrowse={showBrowse}
      showResults={showResults}
      results={results}
      loading={loading}
      category={category}
      language={language}
      onShortcut={handleShortcut}
      onResultPress={handleResultPress}
    />
  );

  return (
    <View
      ref={wrapRef}
      style={[isWeb ? { position: "relative" as any, zIndex: 1000 } : {}, style]}
      onLayout={() => { if (focused) measureWrap(); }}
    >
      {/* ── Input row ─────────────────────────────────────────────────── */}
      <View style={[S.inputWrap, focused && S.inputWrapFocused]}>
        <View style={{ marginRight: 8, opacity: focused ? 0.9 : 0.5 }}>
          <SearchIcon size={15} color={focused ? C.PURPLE : C.TEXT_MID} />
        </View>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={
            language === "pt" ? "Buscar mercados…"
            : language === "zh" ? "搜索市场…"
            : "Search markets…"
          }
          placeholderTextColor={C.TEXT_MID}
          style={S.input}
          returnKeyType="search"
          onFocus={() => setFocusState(true)}
          onBlur={() => {
            blurTimeoutRef.current = setTimeout(() => setFocusState(false), 160);
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading ? (
          <ActivityIndicator size="small" color={C.PURPLE} style={{ marginRight: 12 }} />
        ) : q.length > 0 ? (
          <Pressable onPress={close} hitSlop={8} style={{ marginRight: 10 }}>
            <View style={S.clearBtn}>
              <Text style={S.clearBtnText}>✕</Text>
            </View>
          </Pressable>
        ) : focused ? (
          <Pressable onPress={close} hitSlop={8} style={{ marginRight: 12 }}>
            <Text style={S.cancelText}>
              {language === "pt" ? "Cancelar" : language === "zh" ? "取消" : "Cancel"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Web: fixed backdrop + absolute dropdown ────────────────────── */}
      {isWeb && showDropdown && (
        <>
          {/* Backdrop — tapping it closes search */}
          <Pressable
            onPress={close}
            style={{
              position: "fixed" as any,
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(8,9,12,0.72)",
              zIndex: 997,
            }}
          />
          {/* Dropdown panel */}
          <View style={[S.dropdown, S.dropdownWeb, { zIndex: 998 }]}>
            {dropBody}
          </View>
        </>
      )}

      {/* ── Mobile: Modal puts dropdown above every sibling ───────────── */}
      {!isWeb && showDropdown && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={close}
        >
          {/* Dark scrim — tapping outside closes */}
          <TouchableWithoutFeedback onPress={close}>
            <View style={{ flex: 1, backgroundColor: "rgba(8,9,12,0.80)" }}>
              {/* Swallow touches inside dropdown so they don't close modal */}
              <TouchableWithoutFeedback>
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                  style={[
                    S.dropdown,
                    S.dropdownModal,
                    { top: dropY, left: dropL, width: dropW },
                  ] as any}
                >
                  {dropBody}
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Input
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.BORDER,
    paddingLeft: 14,
    minHeight: 46,
  },
  inputWrapFocused: {
    borderColor: "rgba(124,92,252,0.55)",
    backgroundColor: "#0D1117",
    shadowColor: "#7C5CFC",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  input: {
    flex: 1,
    color: C.TEXT,
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    paddingVertical: 12,
    paddingRight: 6,
  },
  clearBtn: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  clearBtnText: {
    color: C.TEXT_MID, fontSize: 9, fontFamily: "DMSans_700Bold",
    lineHeight: 14,
  },
  cancelText: {
    color: C.TEXT_MID, fontSize: 12, fontFamily: "DMSans_500Medium",
  },

  // Dropdown shell (shared base)
  dropdown: {
    backgroundColor: "#0D1117",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(124,92,252,0.22)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  // Web: sits right below input in document flow
  dropdownWeb: {
    position: "absolute",
    top: "100%" as any,
    left: 0,
    right: 0,
    marginTop: 6,
    maxWidth: 560,
  },
  // Mobile: positioned absolutely inside Modal
  dropdownModal: {
    position: "absolute",
    maxHeight: 500,
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

  // Browse pills
  browseRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    gap: 7,
    paddingBottom: 4,
  },
  browsePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  browsePillActive: {
    borderColor: "rgba(124,92,252,0.5)",
    backgroundColor: "rgba(124,92,252,0.14)",
  },
  browsePillIcon: {
    color: C.TEXT_MID,
    fontFamily: "DMSans_700Bold",
    fontSize: 11,
  },
  browsePillLabel: {
    color: C.TEXT_SUB,
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
  },

  // Topics grid
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
    padding: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  topicIconBox: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  topicIconText: {
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 0.3,
  },
  topicLabel: {
    color: C.TEXT_SUB,
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
    flex: 1,
  },

  // Hint at bottom of browse
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
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  resultIconText: {
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
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

  // Empty state
  emptyTitle: {
    color: C.TEXT_SUB,
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
  },
  emptySubtitle: {
    color: C.TEXT_MID,
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    textAlign: "center",
  },
});
