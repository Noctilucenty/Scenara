/**
 * app/releases.tsx — Release notes ("what's new") screen
 *
 * Renders RELEASES from src/data/releases.ts as a chronological feed.
 * Newest version at the top, each release as a card with version badge,
 * date, headline, summary, and color-coded change bullets.
 *
 * Mirrors CHANGELOG.md at the repo root.  Keep both in sync.
 */
import React from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView, StatusBar, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useLanguage } from "@/src/i18n";
import { RELEASES, ChangeKind } from "@/src/data/releases";

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
const AMBER    = "#FB923C";
const CYAN     = "#22D3EE";

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;

// ── Visual style per change kind ──────────────────────────────────────────────
const KIND_STYLE: Record<ChangeKind, { color: string; emoji: string; label_en: string; label_pt: string; label_zh: string }> = {
  new:      { color: PURPLE, emoji: "✨", label_en: "New",       label_pt: "Novo",      label_zh: "新增" },
  improved: { color: BLUE,   emoji: "🛠",  label_en: "Improved",  label_pt: "Melhorado", label_zh: "改进" },
  fixed:    { color: GREEN,  emoji: "🐛", label_en: "Fixed",     label_pt: "Corrigido", label_zh: "修复" },
  removed:  { color: TEXT_MID, emoji: "🗑", label_en: "Removed",   label_pt: "Removido",  label_zh: "移除" },
  security: { color: RED,    emoji: "🔒", label_en: "Security",  label_pt: "Segurança", label_zh: "安全" },
  perf:     { color: AMBER,  emoji: "⚡", label_en: "Performance", label_pt: "Performance", label_zh: "性能" },
};

function kindLabel(kind: ChangeKind, language: string): string {
  const s = KIND_STYLE[kind];
  if (language === "pt") return s.label_pt;
  if (language === "zh") return s.label_zh;
  return s.label_en;
}

function formatDate(iso: string, language: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  // Locale-aware long date (e.g. "May 13, 2026" / "13 de mai. de 2026" / "2026年5月13日")
  try {
    return d.toLocaleDateString(
      language === "pt" ? "pt-BR" : language === "zh" ? "zh-CN" : "en-US",
      { year: "numeric", month: "short", day: "numeric" },
    );
  } catch {
    return iso;
  }
}

export default function ReleasesScreen() {
  const router = useRouter();
  const { language } = useLanguage();

  const heading =
    language === "pt" ? "Atualizações" :
    language === "zh" ? "更新日志"     :
    "Releases";

  const subheading =
    language === "pt" ? "Tudo o que mudou no Scenara, em ordem cronológica." :
    language === "zh" ? "Scenara 的所有更新，按时间顺序排列。"             :
    "Everything that's changed in Scenara, newest first.";

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)", flexDirection: "row", alignItems: "center", gap: 14 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Text style={{ color: TEXT_SUB, fontSize: 22, fontFamily: "DMSans_700Bold" }}>‹</Text>
          </TouchableOpacity>
          <View>
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>{heading}</Text>
            <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", marginTop: 2 }}>{subheading}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, maxWidth: 760, alignSelf: Platform.OS === "web" ? "center" : undefined, width: "100%" }}>
          {RELEASES.map((release, idx) => (
            <View
              key={release.version}
              style={{
                backgroundColor: CARD,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: idx === 0 ? BORDER_P : BORDER,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              {/* Version stripe — gradient for the latest, flat for older */}
              {idx === 0 ? (
                <LinearGradient
                  colors={GRAD_BRAND}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ height: 3 }}
                />
              ) : (
                <View style={{ height: 3, backgroundColor: "rgba(124,92,252,0.15)" }} />
              )}

              {/* Header row */}
              <View style={{ padding: 18 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: idx === 0 ? "rgba(124,92,252,0.18)" : SURFACE, borderWidth: 1, borderColor: idx === 0 ? BORDER_P : BORDER }}>
                    <Text style={{ color: idx === 0 ? PURPLE : TEXT_SUB, fontSize: 12, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>
                      v{release.version}
                    </Text>
                  </View>
                  {idx === 0 ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(34,197,94,0.12)", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" }}>
                      <Text style={{ color: GREEN, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8 }}>
                        {language === "pt" ? "MAIS RECENTE" : language === "zh" ? "最新" : "LATEST"}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}>
                    {formatDate(release.date, language)}
                  </Text>
                </View>

                {/* Headline */}
                <Text style={{ color: TEXT, fontSize: 19, fontFamily: "DMSans_700Bold", marginBottom: 4, letterSpacing: -0.3 }}>
                  {release.headline}
                </Text>

                {/* Summary (optional) */}
                {release.summary ? (
                  <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 19, marginBottom: 12 }}>
                    {release.summary}
                  </Text>
                ) : null}

                {/* Changes grouped by kind so e.g. all "New" appear together */}
                <View style={{ gap: 6, marginTop: 6 }}>
                  {(["new", "improved", "perf", "fixed", "security", "removed"] as ChangeKind[]).map(kind => {
                    const items = release.changes.filter(c => c.kind === kind);
                    if (items.length === 0) return null;
                    const style = KIND_STYLE[kind];
                    return (
                      <View key={kind} style={{ marginTop: 8 }}>
                        <Text style={{ color: style.color, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 6 }}>
                          {style.emoji}  {kindLabel(kind, language).toUpperCase()}
                        </Text>
                        {items.map((c, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
                            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: style.color, marginTop: 8 }} />
                            <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 20, flex: 1 }}>
                              {c.text}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          ))}

          {/* Footer */}
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular", textAlign: "center" }}>
              {language === "pt"
                ? "Veja o CHANGELOG.md no repositório para o histórico completo."
                : language === "zh"
                ? "查看仓库中的 CHANGELOG.md 获取完整历史。"
                : "See CHANGELOG.md in the repo for the full machine-readable history."}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
