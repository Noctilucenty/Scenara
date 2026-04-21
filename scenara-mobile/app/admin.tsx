import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform,
} from "react-native";
import { router } from "expo-router";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useLanguage } from "@/src/i18n";

const BG      = "#08090C";
const CARD    = "#0D1117";
const SURFACE = "#111620";
const BLUE    = "#4F8EF7";
const PURPLE  = "#7C5CFC";
const PURPLE_D = "#4A3699";
const TEXT    = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER  = "rgba(255,255,255,0.08)";
const GREEN   = "#22C55E";
const RED     = "#EF4444";
const YELLOW  = "#F59E0B";
const SCENARIO_COLORS = [GREEN, RED, PURPLE, BLUE, YELLOW];

type Scenario = { id: number; title: string; title_pt: string | null; title_zh: string | null; probability: number; sort_order: number };
type PendingEvent = {
  id: number; title: string; title_pt: string | null; title_zh: string | null;
  category: string; closes_at: string | null; status: string; is_featured: boolean;
  scenarios: Scenario[];
};

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    brazil: "#22C55E", politics: "#F59E0B", sports: "#4F8EF7",
    entertainment: "#F050AE", science: "#7C5CFC", global: "#06B6D4",
    economy: "#F59E0B", tech: "#818CF8", music: "#EC4899",
    tv: "#10B981", weather: "#60A5FA",
  };
  return map[cat] ?? TEXT_MID;
}

function timeLeft(closes_at: string | null) {
  if (!closes_at) return "No deadline";
  const diff = new Date(closes_at).getTime() - Date.now();
  if (diff < 0) return "EXPIRED";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d left`;
  if (h > 0) return `${h}h left`;
  return `${Math.floor(diff / 60000)}m left`;
}

export default function AdminScreen() {
  const { language } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const [events, setEvents] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/pending-events");
      setEvents(res.data ?? []);
    } catch (e: any) {
      if (e?.status === 403) {
        Alert.alert("Access Denied", "Admin access required.");
        router.back();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = (event: PendingEvent, scenarioId: number) => {
    const scenario = event.scenarios.find(s => s.id === scenarioId);
    const note = noteText[event.id] || "";
    const title = language === "zh" ? (event.title_zh || event.title) : language === "pt" ? (event.title_pt || event.title) : event.title;
    const scenarioLabel = language === "zh" ? (scenario?.title_zh || scenario?.title) : language === "pt" ? (scenario?.title_pt || scenario?.title) : scenario?.title;

    const confirm = () => {
      setResolving(event.id);
      api.post(`/admin/events/${event.id}/resolve`, {
        winning_scenario_id: scenarioId,
        resolution_note: note || undefined,
      })
        .then(() => {
          setEvents(prev => prev.filter(e => e.id !== event.id));
          setExpandedId(null);
        })
        .catch(err => {
          Alert.alert("Error", err?.message ?? "Resolution failed");
        })
        .finally(() => setResolving(null));
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Resolve "${title.slice(0, 60)}" → Winner: "${scenarioLabel}"?`)) {
        confirm();
      }
    } else {
      Alert.alert(
        "Resolve Event",
        `"${title.slice(0, 60)}"\n\nWinner: "${scenarioLabel}"`,
        [{ text: "Cancel", style: "cancel" }, { text: "Confirm", style: "destructive", onPress: confirm }]
      );
    }
  };

  const voidEvent = (event: PendingEvent) => {
    const title = language === "zh" ? (event.title_zh || event.title) : language === "pt" ? (event.title_pt || event.title) : event.title;
    const confirm = () => {
      setResolving(event.id);
      api.post(`/admin/events/${event.id}/void`, { note: "Voided by admin" })
        .then(() => setEvents(prev => prev.filter(e => e.id !== event.id)))
        .catch(err => Alert.alert("Error", err?.message ?? "Void failed"))
        .finally(() => setResolving(null));
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Void and refund all bets for "${title.slice(0, 60)}"?`)) confirm();
    } else {
      Alert.alert("Void Event", `Refund all bets for "${title.slice(0, 60)}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Void & Refund", style: "destructive", onPress: confirm },
      ]);
    }
  };

  if (!fontsLoaded) return null;

  const filtered = filter.trim()
    ? events.filter(e =>
        e.title.toLowerCase().includes(filter.toLowerCase()) ||
        e.category.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  const expired = filtered.filter(e => e.closes_at && new Date(e.closes_at) < new Date());
  const pending = filtered.filter(e => !e.closes_at || new Date(e.closes_at) >= new Date());

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
            <Text style={{ color: PURPLE, fontSize: 22, fontFamily: "DMSans_700Bold" }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: PURPLE_D, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 2 }}>SCENARA</Text>
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>Admin Panel</Text>
          </View>
          <TouchableOpacity onPress={load} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(124,92,252,0.1)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(124,92,252,0.2)" }}>
            <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 12 }}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search events..."
            placeholderTextColor={TEXT_MID}
            style={{ backgroundColor: CARD, color: TEXT, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "DMSans_400Regular", fontSize: 14, borderWidth: 1, borderColor: BORDER }}
          />
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={PURPLE} size="large" />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

            {/* Stats bar */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total Open", value: filtered.length, color: PURPLE },
                { label: "Expired", value: expired.length, color: RED },
                { label: "Pending", value: pending.length, color: YELLOW },
              ].map(stat => (
                <View key={stat.label} style={{ flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER, alignItems: "center" }}>
                  <Text style={{ color: stat.color, fontSize: 22, fontFamily: "DMSans_700Bold" }}>{stat.value}</Text>
                  <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_500Medium", marginTop: 2 }}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {/* Expired events first */}
            {expired.length > 0 && (
              <>
                <Text style={{ color: RED, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 10 }}>EXPIRED — NEEDS RESOLUTION</Text>
                {expired.map(event => <EventCard key={event.id} event={event} language={language} expanded={expandedId === event.id} onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)} onResolve={resolve} onVoid={voidEvent} resolving={resolving === event.id} noteText={noteText[event.id] ?? ""} onNoteChange={t => setNoteText(prev => ({ ...prev, [event.id]: t }))} />)}
              </>
            )}

            {/* Open/upcoming events */}
            {pending.length > 0 && (
              <>
                <Text style={{ color: YELLOW, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 10, marginTop: expired.length > 0 ? 20 : 0 }}>OPEN — RESOLVE EARLY</Text>
                {pending.map(event => <EventCard key={event.id} event={event} language={language} expanded={expandedId === event.id} onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)} onResolve={resolve} onVoid={voidEvent} resolving={resolving === event.id} noteText={noteText[event.id] ?? ""} onNoteChange={t => setNoteText(prev => ({ ...prev, [event.id]: t }))} />)}
              </>
            )}

            {filtered.length === 0 && (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <Text style={{ color: GREEN, fontSize: 42, marginBottom: 12 }}>✓</Text>
                <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 16 }}>No events to resolve</Text>
                <Text style={{ color: TEXT_MID, fontSize: 13, marginTop: 6 }}>All caught up!</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function EventCard({
  event, language, expanded, onToggle, onResolve, onVoid, resolving, noteText, onNoteChange,
}: {
  event: PendingEvent; language: string; expanded: boolean;
  onToggle(): void; onResolve(e: PendingEvent, sid: number): void;
  onVoid(e: PendingEvent): void; resolving: boolean;
  noteText: string; onNoteChange(t: string): void;
}) {
  const title = language === "zh" ? (event.title_zh || event.title) : language === "pt" ? (event.title_pt || event.title) : event.title;
  const tl = timeLeft(event.closes_at);
  const isExpired = !!(event.closes_at && new Date(event.closes_at) < new Date());
  const catColor = categoryColor(event.category);

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: isExpired ? "rgba(239,68,68,0.25)" : BORDER, marginBottom: 10, overflow: "hidden" }}
    >
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <View style={{ backgroundColor: `${catColor}18`, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ color: catColor, fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.4 }}>{event.category.toUpperCase()}</Text>
            </View>
            <Text style={{ color: isExpired ? RED : YELLOW, fontSize: 9, fontFamily: "DMSans_700Bold" }}>{tl}</Text>
            {event.is_featured && <Text style={{ color: PURPLE, fontSize: 9, fontFamily: "DMSans_700Bold" }}>✦ FEATURED</Text>}
          </View>
          <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", lineHeight: 18 }} numberOfLines={expanded ? undefined : 2}>
            {title}
          </Text>
        </View>
        <Text style={{ color: TEXT_MID, fontSize: 16 }}>{expanded ? "▲" : "▼"}</Text>
      </View>

      {/* Expanded: scenario buttons */}
      {expanded && (
        <View style={{ borderTopWidth: 1, borderTopColor: BORDER, padding: 14, gap: 8 }}>
          <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, marginBottom: 4 }}>SELECT WINNER</Text>

          {event.scenarios.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              disabled={resolving}
              onPress={() => onResolve(event, s.id)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${SCENARIO_COLORS[i % SCENARIO_COLORS.length]}12`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${SCENARIO_COLORS[i % SCENARIO_COLORS.length]}30` }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }} />
                <Text style={{ color: TEXT, fontFamily: "DMSans_600Medium" ?? "DMSans_500Medium", fontSize: 13 }}>
                  {language === "zh" ? (s.title_zh || s.title) : language === "pt" ? (s.title_pt || s.title) : s.title}
                </Text>
              </View>
              <Text style={{ color: SCENARIO_COLORS[i % SCENARIO_COLORS.length], fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                {s.probability.toFixed(0)}%
              </Text>
            </TouchableOpacity>
          ))}

          {/* Optional note */}
          <TextInput
            value={noteText}
            onChangeText={onNoteChange}
            placeholder="Resolution note (optional)"
            placeholderTextColor={TEXT_MID}
            style={{ backgroundColor: SURFACE, color: TEXT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontFamily: "DMSans_400Regular", borderWidth: 1, borderColor: BORDER, marginTop: 4 }}
          />

          {/* Void button */}
          <TouchableOpacity
            disabled={resolving}
            onPress={() => onVoid(event)}
            style={{ paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.06)", marginTop: 4 }}
          >
            {resolving
              ? <ActivityIndicator color={RED} size="small" />
              : <Text style={{ color: RED, fontFamily: "DMSans_700Bold", fontSize: 13 }}>Void & Refund All</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}
