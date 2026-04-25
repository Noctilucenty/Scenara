/**
 * Forgot password — step 1: enter email, receive OTP.
 */
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StatusBar, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, Platform, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Rect } from "react-native-svg";
import { router } from "expo-router";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useLanguage } from "@/src/i18n";

// ── Palette ──────────────────────────────────────────────────────────────────
const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const BLUE     = "#4F8EF7";
const PURPLE   = "#7C5CFC";
const PINK     = "#F050AE";
const TEXT     = "#F1F5F9";
const TEXT_MID = "#64748B";
const TEXT_SUB = "#94A3B8";
const BORDER   = "rgba(255,255,255,0.07)";
const BORDER_P = "rgba(124,92,252,0.28)";
const RED      = "#EF4444";

// ── Icons ────────────────────────────────────────────────────────────────────
function MailIcon({ size = 24, color = "white" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="20" height="16" rx="3" stroke={color} strokeWidth={1.8} />
      <Path d="M2 7.5l10 6.5 10-6.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ArrowLeft({ color = "#94A3B8" }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 5l-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function ForgotPasswordScreen() {
  "use no memo";
  const { language } = useLanguage();
  useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 640;

  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [focused, setFocused] = useState(false);

  const isPt = language === "pt";
  const isZh = language === "zh";

  const copy = {
    title:    isPt ? "Esqueceu a senha?" : isZh ? "忘记密码？" : "Forgot your password?",
    subtitle: isPt ? "Enviaremos um código de 6 dígitos para redefinir sua senha."
              : isZh ? "我们将向您的邮箱发送6位验证码。"
              : "We'll send a 6-digit code to reset your password.",
    label:    isPt ? "ENDEREÇO DE E-MAIL" : isZh ? "邮箱地址" : "EMAIL ADDRESS",
    ph:       isPt ? "você@exemplo.com" : isZh ? "您@示例.com" : "you@example.com",
    send:     isPt ? "Enviar código" : isZh ? "发送验证码" : "Send reset code",
    back:     isPt ? "Voltar para o login" : isZh ? "返回登录" : "Back to sign in",
    empty:    isPt ? "Digite seu e-mail." : isZh ? "请输入邮箱。" : "Please enter your email.",
    invalid:  isPt ? "E-mail inválido." : isZh ? "邮箱格式无效。" : "Enter a valid email address.",
    err:      isPt ? "Algo deu errado. Tente novamente." : isZh ? "出了点问题，请重试。" : "Something went wrong. Try again.",
  };

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError(copy.empty); return; }
    if (!trimmed.includes("@") || !trimmed.includes(".")) { setError(copy.invalid); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email: trimmed });
      router.push({ pathname: "/reset-password", params: { email: trimmed } });
    } catch {
      setError(copy.err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* Ambient glow orbs */}
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 } as any}>
        <View style={{
          position: "absolute", top: -100, right: -60,
          width: 320, height: 320, borderRadius: 160,
          backgroundColor: "rgba(124,92,252,0.08)",
          ...(Platform.OS === "web" ? { filter: "blur(80px)" } as any : {}),
        }} />
        <View style={{
          position: "absolute", bottom: 0, left: -80,
          width: 280, height: 280, borderRadius: 140,
          backgroundColor: "rgba(79,142,247,0.06)",
          ...(Platform.OS === "web" ? { filter: "blur(80px)" } as any : {}),
        }} />
      </View>

      {/* Back pill */}
      <TouchableOpacity
        onPress={() => router.canGoBack() ? router.back() : router.replace("/login")}
        style={{
          position: "absolute",
          top: Platform.OS === "ios" ? 56 : 24,
          left: 20, zIndex: 10,
          flexDirection: "row", alignItems: "center", gap: 8,
          backgroundColor: "rgba(255,255,255,0.05)",
          borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
          borderWidth: 1, borderColor: BORDER,
        }}
      >
        <ArrowLeft />
        <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>
          {copy.back}
        </Text>
      </TouchableOpacity>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
            paddingTop: 100,
            ...(isWide ? { alignItems: "center" } : {}),
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: "100%", ...(isWide ? { maxWidth: 440 } : {}) }}>

            {/* ── Hero ── */}
            <View style={{ alignItems: "center", marginBottom: 36 }}>
              {/* Icon with glow ring */}
              <View style={{ position: "relative", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
                <View style={{
                  position: "absolute",
                  width: 96, height: 96, borderRadius: 28,
                  backgroundColor: "rgba(124,92,252,0.1)",
                  borderWidth: 1, borderColor: "rgba(124,92,252,0.18)",
                }} />
                <View style={{ width: 72, height: 72, borderRadius: 22, overflow: "hidden" }}>
                  <LinearGradient
                    colors={[BLUE, PURPLE, PINK]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                  >
                    <MailIcon size={30} />
                  </LinearGradient>
                </View>
              </View>

              <Text style={{
                color: TEXT,
                fontSize: 26, fontFamily: "DMSans_700Bold",
                letterSpacing: -0.5, textAlign: "center",
                marginBottom: 10,
              }}>
                {copy.title}
              </Text>
              <Text style={{
                color: TEXT_MID, fontSize: 14, fontFamily: "DMSans_400Regular",
                textAlign: "center", lineHeight: 22, maxWidth: 300,
              }}>
                {copy.subtitle}
              </Text>
            </View>

            {/* ── Card ── */}
            <View style={{
              backgroundColor: CARD,
              borderRadius: 24, padding: 24,
              borderWidth: 1, borderColor: BORDER_P,
              shadowColor: PURPLE, shadowOpacity: 0.12,
              shadowRadius: 32, shadowOffset: { width: 0, height: 8 },
            }}>
              {/* Top accent */}
              <LinearGradient
                colors={[BLUE, PURPLE, PINK]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  height: 2, marginHorizontal: -24, marginTop: -24,
                  marginBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                }}
              />

              {/* Error */}
              {!!error && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  backgroundColor: "rgba(239,68,68,0.08)",
                  borderWidth: 1, borderColor: "rgba(239,68,68,0.2)",
                  borderRadius: 12, padding: 12, marginBottom: 18,
                }}>
                  <Text style={{ fontSize: 14 }}>⚠️</Text>
                  <Text style={{ color: RED, fontFamily: "DMSans_500Medium", fontSize: 13, flex: 1 }}>{error}</Text>
                </View>
              )}

              {/* Label */}
              <Text style={{
                color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_700Bold",
                letterSpacing: 1.2, marginBottom: 9, textTransform: "uppercase" as const,
              }}>
                {copy.label}
              </Text>

              {/* Input */}
              <View style={{
                flexDirection: "row", alignItems: "center",
                backgroundColor: SURFACE,
                borderRadius: 16, borderWidth: 1.5,
                borderColor: focused ? PURPLE : BORDER,
                paddingHorizontal: 14, marginBottom: 22,
                ...(focused ? {
                  shadowColor: PURPLE, shadowOpacity: 0.18,
                  shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
                } : {}),
              }}>
                <View style={{ opacity: focused ? 1 : 0.4, marginRight: 10 }}>
                  <MailIcon size={16} color={focused ? PURPLE : TEXT_SUB} />
                </View>
                <TextInput
                  value={email}
                  onChangeText={v => { setEmail(v); setError(""); }}
                  placeholder={copy.ph}
                  placeholderTextColor={TEXT_MID}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={{
                    color: TEXT, fontSize: 15,
                    fontFamily: "DMSans_400Regular",
                    flex: 1, paddingVertical: 16,
                  }}
                />
              </View>

              {/* CTA */}
              <TouchableOpacity onPress={handleSend} disabled={loading} style={{ borderRadius: 16, overflow: "hidden" }}>
                <LinearGradient
                  colors={loading ? ["#111827", "#111827"] : [BLUE, PURPLE, PINK]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    paddingVertical: 17, alignItems: "center", justifyContent: "center",
                    flexDirection: "row", gap: 8,
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="white" />
                    : <>
                        <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                          {copy.send}
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 17 }}>→</Text>
                      </>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
