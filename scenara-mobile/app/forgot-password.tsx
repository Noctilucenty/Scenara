/**
 * Forgot password — step 1: enter email, receive OTP.
 *
 * Routes: /forgot-password → /reset-password (carries email via params)
 *
 * Flow:
 *   User enters email → POST /auth/forgot-password (server always 200)
 *   → navigate to /reset-password?email=... where user enters code + new password
 *
 * We always show "Code sent" regardless of whether the email exists —
 * prevents enumeration of registered accounts.
 */
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StatusBar, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";

import { api } from "@/src/api/client";
import { useLanguage } from "@/src/i18n";

const BG      = "#08090C";
const CARD    = "#0D1117";
const SURFACE = "#111620";
const BLUE    = "#4F8EF7";
const PURPLE  = "#7C5CFC";
const PINK    = "#F050AE";
const TEXT    = "#F1F5F9";
const TEXT_MID = "#64748B";
const TEXT_SUB = "#94A3B8";
const BORDER  = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.25)";
const RED     = "#EF4444";

export default function ForgotPasswordScreen() {
  "use no memo";
  const { language } = useLanguage();
  useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold }); // trigger load; don't gate on it

  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [focused, setFocused] = useState(false);

  const isPt = language === "pt";
  const isZh = language === "zh";

  const copy = {
    title:       isPt ? "Esqueceu sua senha?" : isZh ? "忘记密码？" : "Forgot your password?",
    subtitle:    isPt ? "Digite seu e-mail e enviaremos um código de verificação." : isZh ? "输入您的邮箱，我们将发送验证码。" : "Enter your email and we'll send you a 6-digit code.",
    emailLabel:  isPt ? "E-MAIL" : isZh ? "邮箱" : "EMAIL",
    emailPh:     isPt ? "você@exemplo.com" : isZh ? "您@示例.com" : "you@example.com",
    sendCode:    isPt ? "Enviar código" : isZh ? "发送验证码" : "Send reset code",
    backToLogin: isPt ? "Voltar para o login" : isZh ? "返回登录" : "Back to sign in",
    emptyEmail:  isPt ? "Digite seu e-mail." : isZh ? "请输入邮箱。" : "Enter your email.",
  };

  const handleSend = async () => {
    if (!email.trim()) { setError(copy.emptyEmail); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      // Always navigate — server always returns 200 to prevent enumeration.
      router.push({ pathname: "/reset-password", params: { email: email.trim().toLowerCase() } });
    } catch {
      setError(isPt ? "Algo deu errado. Tente novamente." : isZh ? "出了点问题，请重试。" : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* Back */}
      <TouchableOpacity
        onPress={() => router.canGoBack() ? router.back() : router.replace("/login")}
        style={{ position: "absolute", top: Platform.OS === "ios" ? 56 : 24, left: 20, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ color: TEXT_SUB, fontSize: 22, lineHeight: 28 }}>‹</Text>
        <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_500Medium" }}>
          {copy.backToLogin}
        </Text>
      </TouchableOpacity>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 80 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ alignItems: "center", marginBottom: 36 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, overflow: "hidden", marginBottom: 18 }}>
              <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 28 }}>🔑</Text>
              </LinearGradient>
            </View>
            <Text style={{ color: TEXT, fontSize: 24, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, textAlign: "center", marginBottom: 8 }}>
              {copy.title}
            </Text>
            <Text style={{ color: TEXT_MID, fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 20 }}>
              {copy.subtitle}
            </Text>
          </View>

          {/* Card */}
          <View style={{ backgroundColor: CARD, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: BORDER_P }}>
            <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2, borderRadius: 1, marginBottom: 20, marginHorizontal: -24, marginTop: -24, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} />

            {!!error && (
              <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: RED, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{error}</Text>
              </View>
            )}

            <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>
              {copy.emailLabel}
            </Text>
            <View style={{ backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1.5, borderColor: focused ? PURPLE : BORDER, paddingHorizontal: 16, marginBottom: 20 }}>
              <TextInput
                value={email}
                onChangeText={v => { setEmail(v); setError(""); }}
                placeholder={copy.emailPh}
                placeholderTextColor={TEXT_MID}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={handleSend}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", paddingVertical: 14 }}
              />
            </View>

            <TouchableOpacity onPress={handleSend} disabled={loading} style={{ borderRadius: 14, overflow: "hidden" }}>
              <LinearGradient colors={loading ? ["#111", "#111"] : [BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                {loading
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>{copy.sendCode}</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
