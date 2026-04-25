/**
 * Reset password — step 2: verify OTP + set new password.
 *
 * Phase 1: 6-box OTP input with auto-advance + countdown resend timer.
 * Phase 2: New password + confirm, revealed after code verifies.
 */
import { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StatusBar, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, Platform, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle } from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
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
const GREEN    = "#22C55E";

// ── Icons ────────────────────────────────────────────────────────────────────
function ArrowLeft({ color = "#94A3B8" }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 5l-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function LockIcon({ size = 28, color = "white" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z" stroke={color} strokeWidth={1.8} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx="12" cy="16" r="1.5" fill={color} />
    </Svg>
  );
}

function InboxIcon({ size = 28, color = "white" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 12h-6l-2 3H10l-2-3H2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 17 4H7a2 2 0 0 0-1.55.11z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={TEXT_MID} strokeWidth={1.8} />
      <Circle cx="12" cy="12" r="3" stroke={TEXT_MID} strokeWidth={1.8} />
    </Svg>
  ) : (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" stroke={TEXT_MID} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke={TEXT_MID} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M1 1l22 22" stroke={TEXT_MID} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// ── OTP Box Component ─────────────────────────────────────────────────────────
function OTPBoxes({
  value,
  onChange,
  focused,
  setFocused,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  focused: string | null;
  setFocused: (v: string | null) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const focusBox = (i: number) => refs.current[i]?.focus();

  const handleChange = (index: number, text: string) => {
    const clean = text.replace(/\D/g, "");

    // Paste: distribute digits starting from this box
    if (clean.length > 1) {
      const newDigits = [...digits];
      for (let j = 0; j < clean.length && index + j < 6; j++) {
        newDigits[index + j] = clean[j];
      }
      const newVal = newDigits.join("");
      onChange(newVal);
      const nextIdx = Math.min(index + clean.length, 5);
      setTimeout(() => refs.current[nextIdx]?.focus(), 10);
      return;
    }

    // Single digit — selectTextOnFocus ensures replacement
    const digit = clean.slice(0, 1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    onChange(newDigits.join(""));
    if (digit && index < 5) setTimeout(() => refs.current[index + 1]?.focus(), 0);
  };

  const handleKey = (index: number, key: string) => {
    if (key !== "Backspace") return;
    if (digits[index]) {
      const d = [...digits]; d[index] = ""; onChange(d.join(""));
    } else if (index > 0) {
      const d = [...digits]; d[index - 1] = ""; onChange(d.join(""));
      refs.current[index - 1]?.focus();
    }
  };

  // Build row: [0][1][2]  —  [3][4][5]
  const boxes = Array.from({ length: 6 }).map((_, i) => {
    const isFocused = focused === `otp-${i}`;
    const isFilled  = !!digits[i];
    return (
      <TouchableOpacity key={i} onPress={() => focusBox(i)} activeOpacity={0.7}>
        <View style={[
          {
            width: 46, height: 58, borderRadius: 14,
            backgroundColor: SURFACE, borderWidth: 1.5,
            alignItems: "center", justifyContent: "center",
          },
          isFocused ? {
            borderColor: PURPLE, backgroundColor: "rgba(124,92,252,0.07)",
            shadowColor: PURPLE, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
          } : isFilled ? {
            borderColor: "rgba(124,92,252,0.45)",
          } : { borderColor: BORDER },
        ]}>
          <TextInput
            ref={el => { refs.current[i] = el; }}
            value={digits[i]}
            onChangeText={t => handleChange(i, t)}
            onKeyPress={({ nativeEvent }) => handleKey(i, nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            editable={!disabled}
            onFocus={() => setFocused(`otp-${i}`)}
            onBlur={() => setFocused(null)}
            style={{
              color: TEXT, fontSize: 24, fontFamily: "DMSans_700Bold",
              textAlign: "center", width: 46, height: 58,
              opacity: disabled ? 0.4 : 1,
            }}
            caretHidden
          />
        </View>
      </TouchableOpacity>
    );
  });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {boxes.slice(0, 3)}
      <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.18)", marginHorizontal: 2 }} />
      {boxes.slice(3)}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function ResetPasswordScreen() {
  "use no memo";
  const { email = "" } = useLocalSearchParams<{ email: string }>();
  const { language } = useLanguage();
  useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 640;

  // Phase 1
  const [code, setCode]               = useState("");
  const [verifying, setVerifying]     = useState(false);
  const [resetToken, setResetToken]   = useState<string | null>(null);
  const [countdown, setCountdown]     = useState(60);

  // Phase 2
  const [newPass, setNewPass]         = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [saving, setSaving]           = useState(false);
  const [showPass, setShowPass]       = useState(false);

  const [error, setError]     = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const passRef = useRef<TextInput>(null);

  const isPt = language === "pt";
  const isZh = language === "zh";

  // Resend countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Auto-verify when all 6 digits filled
  useEffect(() => {
    if (code.length === 6 && !verifying && !resetToken) handleVerify();
  }, [code]);

  const copy = {
    title1:    isPt ? "Verifique seu e-mail" : isZh ? "查收验证码" : "Check your inbox",
    sub1:      isPt ? `Código enviado para ${email}` : isZh ? `验证码已发送至 ${email}` : `Code sent to ${email}`,
    title2:    isPt ? "Crie uma nova senha" : isZh ? "创建新密码" : "Create new password",
    sub2:      isPt ? "Código verificado com sucesso ✓" : isZh ? "验证码验证成功 ✓" : "Code verified successfully ✓",
    verified:  isPt ? "✓ Código verificado" : isZh ? "✓ 验证码已确认" : "✓ Code verified",
    verify:    isPt ? "Verificar código" : isZh ? "验证" : "Verify code",
    resend:    isPt ? "Reenviar código" : isZh ? "重新发送" : "Resend code",
    resendIn:  (s: number) => isPt ? `Reenviar em ${s}s` : isZh ? `${s}秒后重新发送` : `Resend in ${s}s`,
    newPass:   isPt ? "NOVA SENHA" : isZh ? "新密码" : "NEW PASSWORD",
    confPass:  isPt ? "CONFIRMAR SENHA" : isZh ? "确认新密码" : "CONFIRM PASSWORD",
    passMin:   isPt ? "Mín. 6 caracteres" : isZh ? "至少6个字符" : "Minimum 6 characters",
    setPass:   isPt ? "Definir nova senha" : isZh ? "设置新密码" : "Set new password",
    back:      isPt ? "Voltar" : isZh ? "返回" : "Back",
    resent:    isPt ? "Novo código enviado!" : isZh ? "新验证码已发送！" : "New code sent!",
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError(isPt ? "Digite os 6 dígitos." : isZh ? "请输入6位数字。" : "Enter all 6 digits.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await api.post<{ reset_token: string }>("/auth/verify-reset-code", {
        email: email.toLowerCase(), code: trimmed,
      });
      setResetToken(res.data.reset_token);
    } catch (e: any) {
      setError(e?.message ?? (isPt ? "Código inválido ou expirado." : isZh ? "验证码无效或已过期。" : "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = async () => {
    if (newPass.length < 6) {
      setError(isPt ? "Mín. 6 caracteres." : isZh ? "密码至少需要6个字符。" : "Password must be at least 6 characters.");
      return;
    }
    if (newPass !== confirmPass) {
      setError(isPt ? "As senhas não coincidem." : isZh ? "两次密码不一致。" : "Passwords don't match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { reset_token: resetToken, new_password: newPass });
      router.replace({ pathname: "/login", params: { reset: "1" } });
    } catch (e: any) {
      setError(e?.message ?? (isPt ? "Não foi possível redefinir. Tente novamente." : isZh ? "重置失败，请重试。" : "Couldn't reset. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
    try {
      await api.post("/auth/forgot-password", { email });
      setCode("");
      setError(copy.resent);
      setCountdown(60);
    } catch { /* silent */ }
  };

  const phase = resetToken ? 2 : 1;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* Ambient glow */}
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 } as any}>
        <View style={{
          position: "absolute", top: -80, left: -60,
          width: 300, height: 300, borderRadius: 150,
          backgroundColor: phase === 2 ? "rgba(34,197,94,0.06)" : "rgba(124,92,252,0.08)",
          ...(Platform.OS === "web" ? { filter: "blur(80px)" } as any : {}),
        }} />
        <View style={{
          position: "absolute", bottom: 20, right: -80,
          width: 260, height: 260, borderRadius: 130,
          backgroundColor: "rgba(79,142,247,0.05)",
          ...(Platform.OS === "web" ? { filter: "blur(60px)" } as any : {}),
        }} />
      </View>

      {/* Back */}
      <TouchableOpacity
        onPress={() => router.canGoBack() ? router.back() : router.replace("/forgot-password")}
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
        <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{copy.back}</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: "center",
            padding: 24, paddingTop: 100,
            ...(isWide ? { alignItems: "center" } : {}),
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: "100%", ...(isWide ? { maxWidth: 440 } : {}) }}>

            {/* ── Hero ── */}
            <View style={{ alignItems: "center", marginBottom: 32 }}>
              <View style={{ position: "relative", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <View style={{
                  position: "absolute",
                  width: 96, height: 96, borderRadius: 28,
                  backgroundColor: phase === 2
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(124,92,252,0.1)",
                  borderWidth: 1,
                  borderColor: phase === 2
                    ? "rgba(34,197,94,0.2)"
                    : "rgba(124,92,252,0.18)",
                }} />
                <View style={{ width: 72, height: 72, borderRadius: 22, overflow: "hidden" }}>
                  <LinearGradient
                    colors={phase === 2 ? [GREEN, "#16a34a"] : [BLUE, PURPLE, PINK]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                  >
                    {phase === 2 ? <LockIcon size={30} /> : <InboxIcon size={30} />}
                  </LinearGradient>
                </View>
              </View>

              <Text style={{
                color: TEXT, fontSize: 26, fontFamily: "DMSans_700Bold",
                letterSpacing: -0.5, textAlign: "center", marginBottom: 8,
              }}>
                {phase === 2 ? copy.title2 : copy.title1}
              </Text>
              <Text style={{
                color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular",
                textAlign: "center", lineHeight: 20, maxWidth: 300,
              }}>
                {phase === 2 ? copy.sub2 : copy.sub1}
              </Text>
            </View>

            {/* ── Card ── */}
            <View style={{
              backgroundColor: CARD, borderRadius: 24, padding: 24,
              borderWidth: 1,
              borderColor: phase === 2 ? "rgba(34,197,94,0.25)" : BORDER_P,
              shadowColor: phase === 2 ? GREEN : PURPLE,
              shadowOpacity: 0.12, shadowRadius: 32, shadowOffset: { width: 0, height: 8 },
            }}>
              {/* Top accent */}
              <LinearGradient
                colors={phase === 2 ? [GREEN, "#16a34a"] : [BLUE, PURPLE, PINK]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  height: 2, marginHorizontal: -24, marginTop: -24,
                  marginBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                }}
              />

              {/* Error / info banner */}
              {!!error && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  backgroundColor: error.includes("✓") || error.includes("!")
                    ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  borderWidth: 1,
                  borderColor: error.includes("✓") || error.includes("!")
                    ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                  borderRadius: 12, padding: 12, marginBottom: 20,
                }}>
                  <Text style={{ fontSize: 14 }}>
                    {error.includes("✓") || error.includes("!") ? "✅" : "⚠️"}
                  </Text>
                  <Text style={{
                    color: error.includes("✓") || error.includes("!") ? GREEN : RED,
                    fontFamily: "DMSans_500Medium", fontSize: 13, flex: 1,
                  }}>
                    {error}
                  </Text>
                </View>
              )}

              {/* ── Phase 1: OTP ── */}
              {phase === 1 && (
                <>
                  <Text style={{
                    color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_700Bold",
                    letterSpacing: 1.2, textAlign: "center",
                    marginBottom: 20, textTransform: "uppercase" as const,
                  }}>
                    {isPt ? "Seu código de 6 dígitos" : isZh ? "输入6位验证码" : "Enter your 6-digit code"}
                  </Text>

                  {/* OTP boxes */}
                  <OTPBoxes
                    value={code}
                    onChange={v => { setCode(v); setError(""); }}
                    focused={focused}
                    setFocused={setFocused}
                    disabled={verifying}
                  />

                  {/* Hint */}
                  <Text style={{
                    color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular",
                    textAlign: "center", marginTop: 12, marginBottom: 6,
                  }}>
                    {isPt ? "O código expira em 15 minutos" : isZh ? "验证码15分钟内有效" : "Code expires in 15 minutes"}
                  </Text>

                  {/* Resend */}
                  <View style={{ alignItems: "center", marginBottom: 24 }}>
                    <TouchableOpacity
                      onPress={handleResend}
                      disabled={countdown > 0}
                      style={{ paddingVertical: 6, paddingHorizontal: 12 }}
                    >
                      <Text style={{
                        color: countdown > 0 ? TEXT_MID : PURPLE,
                        fontSize: 13, fontFamily: "DMSans_500Medium",
                      }}>
                        {countdown > 0 ? copy.resendIn(countdown) : copy.resend}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Verify button */}
                  <TouchableOpacity
                    onPress={handleVerify}
                    disabled={verifying || code.length < 6}
                    style={{ borderRadius: 16, overflow: "hidden" }}
                  >
                    <LinearGradient
                      colors={verifying || code.length < 6 ? ["#111827", "#111827"] : [BLUE, PURPLE, PINK]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 17, alignItems: "center",
                        justifyContent: "center", flexDirection: "row", gap: 8,
                      }}
                    >
                      {verifying
                        ? <ActivityIndicator color="white" />
                        : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                            {copy.verify}
                          </Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}

              {/* ── Phase 2: New password ── */}
              {phase === 2 && (
                <>
                  {/* Verified badge */}
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 8,
                    backgroundColor: "rgba(34,197,94,0.08)",
                    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
                    borderRadius: 12, padding: 12, marginBottom: 22,
                  }}>
                    <Text style={{ fontSize: 15 }}>🔓</Text>
                    <Text style={{ color: GREEN, fontFamily: "DMSans_600Medium" ?? "DMSans_500Medium", fontSize: 13 }}>
                      {copy.verified}
                    </Text>
                  </View>

                  {/* New password */}
                  <Text style={{
                    color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_700Bold",
                    letterSpacing: 1.2, marginBottom: 9, textTransform: "uppercase" as const,
                  }}>
                    {copy.newPass}
                  </Text>
                  <View style={{
                    flexDirection: "row", alignItems: "center",
                    backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1.5,
                    borderColor: focused === "pass" ? PURPLE : BORDER,
                    paddingHorizontal: 14, marginBottom: 6,
                  }}>
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
                      style={{
                        color: TEXT, fontSize: 15,
                        fontFamily: "DMSans_400Regular",
                        flex: 1, paddingVertical: 16,
                      }}
                    />
                    <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <EyeIcon visible={showPass} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: TEXT_MID, fontSize: 11, marginBottom: 18, marginLeft: 4 }}>
                    {copy.passMin}
                  </Text>

                  {/* Confirm */}
                  <Text style={{
                    color: TEXT_SUB, fontSize: 10, fontFamily: "DMSans_700Bold",
                    letterSpacing: 1.2, marginBottom: 9, textTransform: "uppercase" as const,
                  }}>
                    {copy.confPass}
                  </Text>
                  <View style={{
                    flexDirection: "row", alignItems: "center",
                    backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1.5,
                    borderColor: focused === "confirm" ? PURPLE : BORDER,
                    paddingHorizontal: 14, marginBottom: 24,
                  }}>
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
                      style={{
                        color: TEXT, fontSize: 15,
                        fontFamily: "DMSans_400Regular",
                        flex: 1, paddingVertical: 16,
                      }}
                    />
                    <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <EyeIcon visible={showPass} />
                    </TouchableOpacity>
                  </View>

                  {/* Set password button */}
                  <TouchableOpacity onPress={handleReset} disabled={saving} style={{ borderRadius: 16, overflow: "hidden" }}>
                    <LinearGradient
                      colors={saving ? ["#111827", "#111827"] : [GREEN, "#16a34a"]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 17, alignItems: "center",
                        justifyContent: "center", flexDirection: "row", gap: 8,
                      }}
                    >
                      {saving
                        ? <ActivityIndicator color="white" />
                        : <>
                            <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                              {copy.setPass}
                            </Text>
                            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 17 }}>→</Text>
                          </>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
