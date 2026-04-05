import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { api } from "@/src/api/client";
import { useTrading } from "@/src/session/TradingContext";

const CARD     = "#0D1117";
const SURFACE  = "#111620";
const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.07)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

type Comment = {
  id: number;
  user_id: number;
  body: string;
  created_at: string;
  display_name: string | null;
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [PURPLE, "#4F8EF7", "#F050AE", "#22C55E", "#F7931A", "#22D3EE"];
function avatarColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}

// ── Seed comment pool ─────────────────────────────────────────────────────────
const SEED_POOL: Array<{
  uid: number; name: string;
  en: string; pt: string;
  hoursAgo: number;
}> = [
  { uid: 9001, name: "cryptohawk_",  en: "wild. didn't expect this today",                                 pt: "caramba. não esperava isso hoje",                      hoursAgo: 2  },
  { uid: 9002, name: "pedro.t",      en: "been following this for days, finally something moved",          pt: "acompanhando faz dias, finalmente saiu algo",           hoursAgo: 4  },
  { uid: 9003, name: "datanerdd",    en: "odds were already creeping up this morning tbh",                 pt: "as probabilidades já subiam desde cedo",                hoursAgo: 6  },
  { uid: 9004, name: "globalpulse",  en: "last time this happened things got crazy lol",                   pt: "da última vez que isso rolou foi bagunça",              hoursAgo: 1  },
  { uid: 9005, name: "markos_v",     en: "everyone acting surprised but this was obvious",                 pt: "todo mundo surpreso mas tava claro",                   hoursAgo: 8  },
  { uid: 9006, name: "newstrader",   en: "jumped in right when i saw it, already green",                   pt: "entrei assim que vi, já tô no positivo",               hoursAgo: 3  },
  { uid: 9007, name: "quietmike__",  en: "idk still not sure what to make of this one",                   pt: "não sei ainda o que acho disso",                       hoursAgo: 11 },
  { uid: 9008, name: "factcheck99",  en: "read more before betting, story's still developing",             pt: "leia mais antes de apostar, história ainda rolando",   hoursAgo: 5  },
  { uid: 9009, name: "samb",         en: "honestly surprised it took this long to go viral",               pt: "honestamente demorou pra virar notícia",               hoursAgo: 7  },
  { uid: 9010, name: "alpha_s",      en: "good read. No side still feels cheap imo",                       pt: "boa leitura. lado Não ainda parece barato",            hoursAgo: 13 },
  { uid: 9011, name: "nightowl_fx",  en: "this totally flipped my view on the whole thing",               pt: "isso mudou completamente minha visão",                 hoursAgo: 9  },
  { uid: 9012, name: "quietstorm",   en: "market's def underreacting rn, give it a day",                  pt: "mercado subreagindo claramente, espera um dia",        hoursAgo: 15 },
];

function seedComments(url: string, count = 3): typeof SEED_POOL {
  // Deterministic pick based on URL so same article always shows same comments
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  const shuffled = [...SEED_POOL].sort((a, b) =>
    (((hash ^ (a.uid * 1009)) >>> 0) % 100) - (((hash ^ (b.uid * 1009)) >>> 0) % 100)
  );
  return shuffled.slice(0, count);
}

type Props = {
  eventId?: number;
  newsUrl?: string;
  newsTitle?: string;
  language: string;
};

export function CommentSection({ eventId, newsUrl, newsTitle, language }: Props) {
  const { userId } = useTrading();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      let res;
      if (eventId) {
        res = await api.get(`/comments/event/${eventId}`);
      } else if (newsUrl) {
        res = await api.get("/comments/news", { params: { url: newsUrl } });
      }
      setComments(res?.data ?? []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, newsUrl]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const postComment = async () => {
    if (!text.trim()) return;
    if (!userId) { setError(language === "pt" ? "Faça login para comentar" : "Log in to comment"); return; }
    try {
      setPosting(true); setError("");
      await api.post("/comments/", {
        user_id: userId,
        body: text.trim(),
        event_id: eventId ?? null,
        news_url: newsUrl ?? null,
      });
      setText("");
      await fetchComments();
    } catch {
      setError(language === "pt" ? "Erro ao postar comentário" : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (commentId: number) => {
    try {
      await api.delete(`/comments/${commentId}`, { params: { user_id: userId } });
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {}
  };

  const label = {
    title:       language === "pt" ? "Comentários" : "Comments",
    placeholder: language === "pt" ? "O que você acha?" : "What do you think?",
    post:        language === "pt" ? "Publicar" : "Post",
    noComments:  language === "pt" ? "Seja o primeiro a comentar" : "Be the first to comment",
    you:         language === "pt" ? "Você" : "You",
    delete:      language === "pt" ? "Excluir" : "Delete",
  };

  return (
    <View style={{ marginTop: 8 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5 }}>
          {label.title.toUpperCase()}
        </Text>
        {comments.length > 0 && (
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: "rgba(124,92,252,0.12)" }}>
            <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold" }}>{comments.length}</Text>
          </View>
        )}
      </View>

      {/* Input */}
      <View style={{ backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER_P, padding: 12, marginBottom: 14 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={label.placeholder}
          placeholderTextColor={TEXT_MID}
          multiline
          style={{ color: TEXT, fontFamily: "DMSans_400Regular", fontSize: 14, minHeight: 60, textAlignVertical: "top" }}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          {error ? (
            <Text style={{ color: RED, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{error}</Text>
          ) : (
            <Text style={{ color: TEXT_MID, fontSize: 11 }}>{text.length}/280</Text>
          )}
          <TouchableOpacity
            onPress={postComment}
            disabled={posting || !text.trim()}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: text.trim() ? "rgba(124,92,252,0.15)" : "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: text.trim() ? BORDER_P : BORDER }}
          >
            {posting ? (
              <ActivityIndicator size="small" color={PURPLE} />
            ) : (
              <Text style={{ color: text.trim() ? PURPLE : TEXT_MID, fontFamily: "DMSans_700Bold", fontSize: 12 }}>{label.post}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Comments list */}
      {loading ? (
        <ActivityIndicator color={PURPLE} size="small" style={{ marginVertical: 20 }} />
      ) : (
        <View style={{ gap: 10 }}>
          {/* Real comments */}
          {comments.map(c => {
            const isOwn = c.user_id === userId;
            const color = avatarColor(c.user_id);
            const name = c.display_name ?? `User ${c.user_id}`;
            return (
              <View key={c.id} style={{ backgroundColor: CARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: isOwn ? "rgba(124,92,252,0.15)" : BORDER }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color + "20", borderWidth: 1, borderColor: color + "40", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: color, fontSize: 11, fontFamily: "DMSans_700Bold" }}>{initials(c.display_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ color: TEXT, fontSize: 12, fontFamily: "DMSans_700Bold" }}>{isOwn ? label.you : name}</Text>
                      {isOwn && (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "rgba(124,92,252,0.1)" }}>
                          <Text style={{ color: PURPLE_D, fontSize: 8, fontFamily: "DMSans_700Bold" }}>YOU</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>{timeAgo(c.created_at)}</Text>
                  </View>
                  {isOwn && (
                    <TouchableOpacity onPress={() => deleteComment(c.id)}>
                      <Text style={{ color: RED, fontSize: 11, fontFamily: "DMSans_500Medium" }}>{label.delete}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 20 }}>{c.body}</Text>
              </View>
            );
          })}

          {/* Seed comments — shown when no real comments yet (news articles only) */}
          {comments.length === 0 && newsUrl && (() => {
            const seeds = seedComments(newsUrl, 3);
            const fakeAgo = (h: number) =>
              language === "pt" ? (h < 24 ? `${h}h atrás` : `${Math.floor(h / 24)}d atrás`) : (h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`);
            return seeds.map(s => {
              const color = avatarColor(s.uid);
              return (
                <View key={s.uid} style={{ backgroundColor: CARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color + "20", borderWidth: 1, borderColor: color + "40", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: color, fontSize: 11, fontFamily: "DMSans_700Bold" }}>{initials(s.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontSize: 12, fontFamily: "DMSans_700Bold" }}>{s.name}</Text>
                      <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>{fakeAgo(s.hoursAgo)}</Text>
                    </View>
                  </View>
                  <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 20 }}>
                    {language === "pt" ? s.pt : s.en}
                  </Text>
                </View>
              );
            });
          })()}

          {/* Join prompt when no real comments */}
          {comments.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>
                {language === "pt" ? "💬 Seja o primeiro a comentar de verdade" : "💬 Be the first to leave a real comment"}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}