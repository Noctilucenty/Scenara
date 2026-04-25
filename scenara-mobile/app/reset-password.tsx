/**
 * Reset password — step 2: enter OTP code + new password.
 *
 * Receives params: { email } from /forgot-password.
 *
 * Two-phase form (same screen):
 *   Phase 1 (code not yet verified):
 *     - Code input (6-digit OTP)
 *     - "Verify code" button → POST /auth/verify-reset-code
 *     - On success: stores reset_token, reveals password fields
 *   Phase 2 (code verified, reset_token in hand):
 *     - New password + confirm
 *     - "Set new password" → POST /auth/reset-password
 *     - On success: navigate to /login with a success param
 */
import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StatusBar, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
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
const GREEN   = "#22C55E";

export default function ResetPasswordScreen() {
  "use no memo";
  const { email = "" } = useLocalSearchParams<{ email: string }>();
  const { language } = useLanguage();
  useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold }); // trigger load; don't gate on it

  // Phase 1
  const [code, setCode]         = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Phase 2
  const [newPass, setNewPass]     = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [saving, setSaving]       = useState(false);
  const [showPass, setShowPass]   = useState(false);

  const [error, setError]   = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const passRef = useRef<TextInput>(null);

  const isPt = language === "pt";
  const isZh = language === "zh";

  const copy = {
    title:      isPt ? "Redefinir senha" : isZh ? "重置密码" : "Reset your password",
    codeLabel:  isPt ? "CÓDIGO DE VERIFICAÇÃO" : isZh ? "验证码" : "VERIFICATION CODE",
    codePh:     isPt ? "6 dígitos" : isZh ? "6位数字" : "6-digit code",
    verify:     isPt ? "Verificar código" : isZh ? "验证码校验" : "Verify code",
    newPass:    isPt ? "NOVA SENHA" : isZh ? "新密码" : "NEW PASSWORD",
    confirmPass: isPt ? "CONFIRMAR NOVA SENHA" : isZh ? "确认新密码" : "CONFIRM NEW PASSWORD",
    passMin:    isPt ? "Mín. 6 caracteres" : isZh ? "至少6个字符" : "Min. 6 characters",
    setPass:    isPt ? "Definir nova senha" : isZh ? "设置新密码" : "Set new password",
    backToLogin: isPt ? "Voltar ao login" : isZh ? "返回登录" : "Back to sign in",
    resend:     isPt ? "Reenviar código" : isZh ? "重新发送" : "Resend code",
    codeVerified: isPt ? "Código verificado!" : isZh ? "验证码已确认！" : "Code verified!",
    subtitle:   isPt ? "Verifique seu e-mail" : isZh ? "请查收邮件" : `Check your inbox for ${email}`,
  };

  // ── Phase 1: verify OTP ───────────────────────────────────────────────────

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError(isPt ? "Digite os 6 dígitos." : isZh ? "请输入6位数字。" : "Enter the 6-digit code.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await api.post<{ reset_token: string }>("/auth/verify-reset-code", {
        email: email.toLowerCase(),
        code: trimmed,
      });
      setResetToken(res.data.reset_token);
    } catch (e: any) {
      setError(e?.message ?? (isPt ? "Código inválido ou expirado." : isZh ? "验证码无效或已过期。" : "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  };

  // ── Phase 2: set new password ─────────────────────────────────────────────

  const handleReset = async () => {
    if (newPass.length < 6) {
      setError(isPt ? "A senha deve ter pelo menos 6 caracteres." : isZh ? "密码至少需要6个字符。" : "Password must be at least 6 characters.");
      return;
    }
    if (newPass !== confirmPass) {
      setError(isPt ? "As senhas não coincidem." : isZh ? "两次密码不一致。" : "Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { reset_token: resetToken, new_password: newPass });
      router.replace({ pathname: "/login", params: { reset: "1" } });
    } catch (e: any) {
      setError(e?.message ?? (isPt ? "Não foi possível redefinir. Tente novamente." : isZh ? "重置失败，请重试。" : "Couldn't reset. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  // ── Resend ────────────────────────────────────────────────────────────────

  const handleResend = async () => {
    try {
      await api.post("/auth/forgot-password", { email });
      setCode("");
      setError(isPt ? "Novo código enviado!" : isZh ? "新验证码已发送！" : "New code sent!");
    } catch {
      /* silent */
    }
  };


  const phase = resetToken ? 2 : 1;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* Back */}
      <TouchableOpacity
        onPress={() => router.canGoBack() ? router.back() : router.replace("/forgot-password")}
        style={{ position: "absolute", top: Platform.OS === "ios" ? 56 : 24, left: 20, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ color: TEXT_SUB, fontSize: 22, lineHeight: 28 }}>‹</Text>
        <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_500Medium" }}>{copy.backToLogin}</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 80 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, overflow: "hidden", marginBottom: 16 }}>
              <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 28 }}>{phase === 2 ? "🔐" : "📬"}</Text>
              </LinearGradient>
            </View>
            <Text style={{ color: TEXT, fontSize: 24, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, textAlign: "center", marginBottom: 6 }}>{copy.title}</Text>
            <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", textAlign: "center" }}>
              {phase === 2 ? copy.codeVerified : copy.subtitle}
            </Text>
          </View>

          {/* Card */}
          <View style={{ backgroundColor: CARD, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: phase === 2 ? "rgba(34,197,94,0.25)" : BORDER_P }}>
            <LinearGradient colors={phase === 2 ? [GREEN, "#16a34a"] : [BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2, borderRadius: 1, marginBottom: 20, marginHorizontal: -24, marginTop: -24, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} />

            {!!error && (
              <View style={{ backgroundColor: error.includes("!") ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: error.includes("!") ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: error.includes("!") ? GREEN : RED, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{error}</Text>
              </View>
            )}

            {/* ── Phase 1: OTP input ── */}
            {phase === 1 && (
              <>
                <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>{copy.codeLabel}</Text>
                <View style={{ backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1.5, borderColor: focused === "code" ? PURPLE : BORDER, paddingHorizontal: 16, marginBottom: 8 }}>
                  <TextInput
                    value={code}
                    onChangeText={v => { setCode(v.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                    placeholder={copy.codePh}
                    placeholderTextColor={TEXT_MID}
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={handleVerify}
                    onFocus={() => setFocused("code")}
                    onBlur={() => setFocused(null)}
                    style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", paddingVertical: 14, textAlign: "center", letterSpacing: 8 }}
                  />
                </View>

                <TouchableOpacity onPress={handleResend} style={{ alignSelf: "flex-end", marginBottom: 20 }}>
                  <Text style={{ color: PURPLE, fontSize: 12, fontFamily: "DMSans_500Medium" }}>{copy.resend}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleVerify} disabled={verifying} style={{ borderRadius: 14, overflow: "hidden" }}>
                  <LinearGradient colors={verifying ? ["#111", "#111"] : [BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center" }}>
                    {verifying ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>{copy.verify}</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* ── Phase 2: new password ── */}
            {phase === 2 && (
              <>
                <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>{copy.newPass}</Text>
                <View style={{ backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1.5, borderColor: focused === "pass" ? PURPLE : BORDER, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <TextInput
                    ref={passRef}
                    value={newPass}
                    onChangeText={v => { setNewPass(v); setError(""); }}
                    placeholder="••••••••"
                    placeholderTextColor={TEXT_MID}
                    secureTextEntry={!showPass}
                    returnKeyType="next"
                    onFocus={() => setFocused("pass")}
                    onBlur={() => setFocused(null)}
                    style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", flex: 1, paddingVertical: 14 }}
                  />
                  <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ color: TEXT_MID, fontSize: 13 }}>{showPass ? "🙈" : "👁"}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: TEXT_MID, fontSize: 11, marginBottom: 16, marginLeft: 4 }}>{copy.passMin}</Text>

                <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>{copy.confirmPass}</Text>
                <View style={{ backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1.5, borderColor: focused === "confirm" ? PURPLE : BORDER, paddingHorizontal: 16, marginBottom: 20 }}>
                  <TextInput
                    value={confirmPass}
                    onChangeText={v => { setConfirmPass(v); setError(""); }}
                    placeholder="••••••••"
                    placeholderTextColor={TEXT_MID}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleReset}
                    onFocus={() => setFocused("confirm")}
                    onBlur={() => setFocused(null)}
                    style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", paddingVertical: 14 }}
                  />
                </View>

                <TouchableOpacity onPress={handleReset} disabled={saving} style={{ borderRadius: 14, overflow: "hidden" }}>
                  <LinearGradient colors={saving ? ["#111", "#111"] : [GREEN, "#16a34a"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center" }}>
                    {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>{copy.setPass}</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
