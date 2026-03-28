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

type Props = {
  eventId?: number;
  newsUrl?: string;
  language: string;
};

export function CommentSection({ eventId, newsUrl, language }: Props) {
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
      ) : comments.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular" }}>{label.noComments}</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {comments.map(c => {
            const isOwn = c.user_id === userId;
            const color = avatarColor(c.user_id);
            const name = c.display_name ?? `User ${c.user_id}`;
            return (
              <View key={c.id} style={{ backgroundColor: CARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: isOwn ? "rgba(124,92,252,0.15)" : BORDER }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  {/* Avatar */}
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
        </View>
      )}
    </View>
  );
}