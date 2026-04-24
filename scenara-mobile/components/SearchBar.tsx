/**
 * components/SearchBar.tsx — debounced full-text search across markets.
 *
 * Why in-context search over a dedicated screen:
 *   Users don't hunt for markets — they remember part of the title. The bar
 *   lives inline in the markets tab header with an inline dropdown of up to
 *   8 matches. Tapping a result jumps straight to /market-detail. No routing
 *   detour, no throwaway screen.
 *
 * Design notes:
 *   - 220ms debounce: tuned so a two-word query fires once, not once per char.
 *     Lower feels laggy (too many roundtrips); higher feels unresponsive.
 *   - We request-version guard (`lastReqRef`) so a slow response for "a" can't
 *     stomp the fast response for "air fr". Classic search-box race.
 *   - Closes on blur with a short timeout so taps on results register before
 *     the dropdown unmounts (300ms mirrors iOS dropdown dismissal).
 *   - Uses axios from the shared client — inherits the 60s timeout for cold
 *     starts plus structured error shape.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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

const DEBOUNCE_MS = 220;
const MIN_QUERY_LEN = 2;

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

export function SearchBar({
  style,
  category,
}: {
  style?: ViewStyle;
  /** Optional filter: scope results to the current category tab. */
  category?: string;
}) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  // Race-condition guard: increment every request; only apply the response
  // if its version still matches the latest. Cheaper than AbortController and
  // works identically across native + web.
  const reqVersion = useRef(0);
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

  const showDropdown = focused && q.trim().length >= MIN_QUERY_LEN;

  return (
    <View style={[{ position: "relative", zIndex: 1000 }, style]}>
      <View style={styles.wrap}>
        <Text style={styles.icon}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t.common.searchPlaceholder}
          placeholderTextColor={C.TEXT_MID}
          style={styles.input}
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          // Delay blur so a result tap has time to register before the
          // dropdown unmounts. Without this, tapping a result clears the
          // focus first and the Pressable never fires.
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t.common.search}
        />
        {loading ? (
          <ActivityIndicator size="small" color={C.PURPLE} style={{ marginRight: 8 }} />
        ) : q.length > 0 ? (
          <Pressable onPress={clearAndBlur} hitSlop={8} style={{ marginRight: 8 }}>
            <Text style={{ color: C.TEXT_MID, fontSize: 16 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {results.length === 0 && !loading ? (
            <Text style={styles.emptyText}>{t.common.noResults}</Text>
          ) : (
            results.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  clearAndBlur();
                  router.push({ pathname: "/market-detail", params: { id: String(r.id) } });
                }}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: "rgba(124,92,252,0.08)" },
                ]}
              >
                <Text style={styles.rowTitle} numberOfLines={2}>{pickTitle(r, language)}</Text>
                <Text style={styles.rowCat}>{r.category.toUpperCase()}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.BORDER,
    paddingLeft: 12,
  },
  icon: { color: C.TEXT_MID, fontSize: 16, marginRight: 8 },
  input: {
    flex: 1,
    color: C.TEXT,
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    paddingVertical: 10,
    paddingRight: 8,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    backgroundColor: C.CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.BORDER_P,
    overflow: "hidden",
    // Elevation for Android; iOS uses shadow props.
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  rowTitle: {
    color: C.TEXT,
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
  },
  rowCat: {
    marginTop: 2,
    color: C.TEXT_MID,
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  emptyText: {
    padding: 14,
    color: C.TEXT_MID,
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
});
