import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StatusBar, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Circle } from "react-native-svg";
import { router } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";

const IS_WEB   = Platform.OS === "web";
const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const BLUE     = "#4F8EF7";
const PURPLE   = "#7C5CFC";
const PINK     = "#F050AE";
const TEXT     = "#F1F5F9";
const TEXT_MID = "#64748B";
const TEXT_SUB = "#94A3B8";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.25)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";
const YELLOW   = "#F59E0B";

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

function ScenaraLogo({ size = 52 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 40 48">
      <Defs>
        <SvgGrad id="rg2" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={BLUE} />
          <Stop offset="0.5" stopColor={PURPLE} />
          <Stop offset="1" stopColor={PINK} />
        </SvgGrad>
      </Defs>
      <Path d="M4 4 L20 36 L36 4" stroke="url(#rg2)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 10 L20 30 L32 10" stroke="url(#rg2)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <Path d="M12 16 L20 28 L28 16" stroke="url(#rg2)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
    </Svg>
  );
}

function PasswordStrength({ password, isPt }: { password: string; isPt: boolean }) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 6)  score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const level = score <= 1 ? 0 : score <= 2 ? 1 : score <= 3 ? 2 : 3;
  const labels    = ["Weak", "Fair", "Good", "Strong"];
  const labels_pt = ["Fraca", "Razoável", "Boa", "Forte"];
  const colors    = [RED, YELLOW, BLUE, GREEN];
  const widths    = ["25%", "50%", "75%", "100%"] as const;

  return (
    <View style={{ marginTop: -8, marginBottom: 14 }}>
      <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <View style={{ height: "100%", width: widths[level], backgroundColor: colors[level], borderRadius: 2 }} />
      </View>
      <Text style={{ color: colors[level], fontSize: 10, fontFamily: "DMSans_500Medium", marginTop: 4 }}>
        {isPt ? labels_pt[level] : labels[level]}
      </Text>
    </View>
  );
}

export default function RegisterScreen() {
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 700;
  const { register } = useTrading();
  const { language } = useLanguage();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focused, setFocused]         = useState<string | null>(null);

  const emailRef   = useRef<TextInput>(null);
  const passRef    = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  if (!fontsLoaded) return null;

  const isPt = language === "pt";

  const handleRegister = async () => {
    setError("");
    if (!displayName.trim()) {
      setError(isPt ? "Nome de usuário é obrigatório." : "Display name is required.");
      return;
    }
    if (!email.trim()) {
      setError(isPt ? "E-mail é obrigatório." : "Email is required.");
      return;
    }
    if (password.length < 6) {
      setError(isPt ? "Senha deve ter no mínimo 6 caracteres." : "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError(isPt ? "As senhas não coincidem." : "Passwords do not match.");
      return;
    }
    setLoading(true);
    const result = await register(email.trim().toLowerCase(), password, displayName.trim());
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? (isPt ? "Erro ao criar conta." : "Registration failed."));
      return;
    }
    router.replace("/(tabs)");
  };

  const inputStyle = (name: string) => ({
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: focused === name ? PURPLE : error ? "rgba(239,68,68,0.18)" : BORDER,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 14,
  });

  // ── FORM CONTENT (shared between web and mobile) ──────────────────────────
  const formContent = (
    <View style={{
      backgroundColor: CARD, borderRadius: 22, padding: 24,
      borderWidth: 1, borderColor: BORDER_P,
      ...(isWide ? { maxWidth: 480, width: "100%", alignSelf: "center" as const } : {}),
      shadowColor: PURPLE, shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 8 },
    }}>
      {/* Top gradient line */}
      <LinearGradient
        colors={[BLUE, PURPLE, PINK]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 2, borderRadius: 1, marginBottom: 20, marginHorizontal: -24, marginTop: -24, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}
      />

      <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", marginBottom: 4 }}>
        {isPt ? "Criar conta" : "Create account"}
      </Text>
      <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", marginBottom: 22 }}>
        {isPt ? "Grátis · Sem cartão · Sem dinheiro real" : "Free · No card · No real money"}
      </Text>

      {!!error && (
        <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Text style={{ fontSize: 14 }}>⚠️</Text>
          <Text style={{ color: RED, fontFamily: "DMSans_500Medium", fontSize: 13, flex: 1 }}>{error}</Text>
        </View>
      )}

      {/* Display Name */}
      <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>
        {isPt ? "NOME DE USUÁRIO" : "DISPLAY NAME"}
      </Text>
      <View style={inputStyle("name")}>
        <TextInput
          value={displayName}
          onChangeText={v => { setDisplayName(v); setError(""); }}
          placeholder={isPt ? "Como aparecerá no ranking" : "How you'll appear on the leaderboard"}
          placeholderTextColor={TEXT_MID}
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          onFocus={() => setFocused("name")} onBlur={() => setFocused(null)}
          style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", flex: 1, paddingVertical: 14 }}
        />
      </View>

      {/* Email */}
      <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>
        {isPt ? "E-MAIL" : "EMAIL"}
      </Text>
      <View style={inputStyle("email")}>
        <TextInput
          ref={emailRef}
          value={email}
          onChangeText={v => { setEmail(v); setError(""); }}
          placeholder="you@example.com"
          placeholderTextColor={TEXT_MID}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passRef.current?.focus()}
          onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
          style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", flex: 1, paddingVertical: 14 }}
        />
      </View>

      {/* Password */}
      <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>
        {isPt ? "SENHA" : "PASSWORD"}
      </Text>
      <View style={inputStyle("password")}>
        <TextInput
          ref={passRef}
          value={password}
          onChangeText={v => { setPassword(v); setError(""); }}
          placeholder="••••••••"
          placeholderTextColor={TEXT_MID}
          secureTextEntry={!showPass}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
          style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", flex: 1, paddingVertical: 14 }}
        />
        <TouchableOpacity onPress={() => setShowPass(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <EyeIcon visible={showPass} />
        </TouchableOpacity>
      </View>

      <PasswordStrength password={password} isPt={isPt} />

      {/* Confirm Password */}
      <Text style={{ color: TEXT_SUB, fontSize: 11, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>
        {isPt ? "CONFIRMAR SENHA" : "CONFIRM PASSWORD"}
      </Text>
      <View style={{
        ...inputStyle("confirm"),
        borderColor: confirm && password && confirm !== password
          ? "rgba(239,68,68,0.4)"
          : confirm && confirm === password
          ? "rgba(34,197,94,0.35)"
          : focused === "confirm" ? PURPLE : BORDER,
      }}>
        <TextInput
          ref={confirmRef}
          value={confirm}
          onChangeText={v => { setConfirm(v); setError(""); }}
          placeholder="••••••••"
          placeholderTextColor={TEXT_MID}
          secureTextEntry={!showConfirm}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
          onFocus={() => setFocused("confirm")} onBlur={() => setFocused(null)}
          style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", flex: 1, paddingVertical: 14 }}
        />
        <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <EyeIcon visible={showConfirm} />
        </TouchableOpacity>
      </View>

      {!!confirm && password !== confirm && (
        <Text style={{ color: RED, fontSize: 11, fontFamily: "DMSans_500Medium", marginTop: -10, marginBottom: 12 }}>
          {isPt ? "As senhas não coincidem" : "Passwords don't match"}
        </Text>
      )}
      {!!confirm && password === confirm && password.length >= 6 && (
        <Text style={{ color: GREEN, fontSize: 11, fontFamily: "DMSans_500Medium", marginTop: -10, marginBottom: 12 }}>
          {isPt ? "Senhas coincidem ✓" : "Passwords match ✓"}
        </Text>
      )}

      {/* Balance banner */}
      <View style={{ backgroundColor: "rgba(34,197,94,0.07)", borderWidth: 1, borderColor: "rgba(34,197,94,0.18)", borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ fontSize: 20 }}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 13 }}>
            {isPt ? "Saldo inicial de $10.000" : "$10,000 starting balance"}
          </Text>
          <Text style={{ color: TEXT_MID, fontFamily: "DMSans_400Regular", fontSize: 11, marginTop: 1 }}>
            {isPt ? "Dinheiro simulado, risco zero" : "Simulated money, zero risk"}
          </Text>
        </View>
      </View>

      {/* Submit */}
      <TouchableOpacity onPress={handleRegister} disabled={loading} style={{ borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        <LinearGradient
          colors={loading ? ["#111", "#111"] : [BLUE, PURPLE, PINK]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
        >
          {loading
            ? <ActivityIndicator color="white" />
            : <>
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                  {isPt ? "Criar conta" : "Create Account"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>→</Text>
              </>
          }
        </LinearGradient>
      </TouchableOpacity>

      {/* Divider */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
        <Text style={{ color: TEXT_MID, fontSize: 11 }}>{isPt ? "ou" : "or"}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
      </View>

      {/* Sign in link */}
      <TouchableOpacity
        onPress={() => router.push("/login")}
        style={{ alignItems: "center", paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: BORDER }}
      >
        <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_400Regular" }}>
          {isPt ? "Já tem conta? " : "Have an account? "}
          <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold" }}>
            {isPt ? "Entrar →" : "Sign in →"}
          </Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── DESKTOP / WEB LAYOUT ──────────────────────────────────────────────────
  if (isWide) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, flexDirection: "row" }}>
        <StatusBar barStyle="light-content" />

        {/* Left branding panel */}
        <View style={{
          width: 420, backgroundColor: "#090B10",
          borderRightWidth: 1, borderColor: BORDER,
          justifyContent: "center", alignItems: "flex-start",
          padding: 56,
        }}>
          {/* Logo */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 48 }}>
            <ScenaraLogo size={36} />
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>scenara</Text>
          </View>

          <Text style={{ color: TEXT, fontSize: 32, fontFamily: "DMSans_700Bold", letterSpacing: -0.8, lineHeight: 40, marginBottom: 14 }}>
            {isPt ? "Preveja o futuro.\nDomino o mercado." : "Predict the future.\nDominate the market."}
          </Text>
          <Text style={{ color: TEXT_MID, fontSize: 15, fontFamily: "DMSans_400Regular", lineHeight: 24, marginBottom: 48 }}>
            {isPt
              ? "Comece com $10.000 de saldo simulado. Zero risco, competição real."
              : "Start with $10,000 simulated balance. Zero risk, real competition."}
          </Text>

          {/* Feature list */}
          {[
            { icon: "💰", title: isPt ? "$10.000 grátis" : "$10,000 free", desc: isPt ? "Saldo de simulação imediato" : "Instant simulation balance" },
            { icon: "🏆", title: isPt ? "Placar global" : "Global leaderboard", desc: isPt ? "Compita com jogadores do mundo" : "Compete with players worldwide" },
            { icon: "📰", title: isPt ? "Notícias ao vivo" : "Live news feed", desc: isPt ? "Contexto em tempo real" : "Real-time market context" },
            { icon: "🔒", title: isPt ? "Sem risco" : "Zero risk", desc: isPt ? "Nunca perde dinheiro real" : "Never lose real money" },
          ].map((f, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 14, marginBottom: 20, alignItems: "flex-start" }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(124,92,252,0.12)", borderWidth: 1, borderColor: BORDER_P, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 16 }}>{f.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontSize: 13, fontFamily: "DMSans_700Bold", marginBottom: 2 }}>{f.title}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>{f.desc}</Text>
              </View>
            </View>
          ))}

          {/* Stats row */}
          <View style={{ flexDirection: "row", gap: 24, marginTop: 16, paddingTop: 24, borderTopWidth: 1, borderColor: BORDER }}>
            {[
              { value: "10K+", label: isPt ? "Jogadores" : "Players" },
              { value: "$10K", label: isPt ? "Saldo inicial" : "Start balance" },
              { value: "100%", label: isPt ? "Grátis" : "Free" },
            ].map((s, i) => (
              <View key={i}>
                <Text style={{ color: PURPLE, fontSize: 18, fontFamily: "DMSans_700Bold" }}>{s.value}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 11, fontFamily: "DMSans_400Regular" }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Right form panel */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back link */}
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 28 }}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke={TEXT_SUB} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_500Medium" }}>
              {isPt ? "Voltar ao app" : "Back to app"}
            </Text>
          </TouchableOpacity>

          {formContent}
        </ScrollView>
      </View>
    );
  }

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* Back button */}
      <TouchableOpacity
        onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
        style={{ position: "absolute", top: Platform.OS === "ios" ? 56 : 20, left: 20, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M19 12H5M12 5l-7 7 7 7" stroke={TEXT_SUB} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_500Medium" }}>
          {isPt ? "Voltar" : "Back"}
        </Text>
      </TouchableOpacity>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 90 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo + headline */}
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <View style={{ marginBottom: 14 }}>
              <ScenaraLogo size={52} />
            </View>
            <Text style={{ color: TEXT, fontSize: 30, fontFamily: "DMSans_700Bold", letterSpacing: -0.8 }}>scenara</Text>
            <Text style={{ color: TEXT_MID, fontSize: 14, fontFamily: "DMSans_400Regular", marginTop: 6 }}>
              {isPt ? "Comece sua jornada" : "Start your journey"}
            </Text>
          </View>

          {/* Stats strip */}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 0, marginBottom: 28 }}>
            {[
              { value: "$10K", label: isPt ? "Saldo Grátis" : "Free Balance" },
              { value: isPt ? "Grátis" : "Free", label: isPt ? "Para Sempre" : "Forever" },
              { value: "10K+", label: isPt ? "Jogadores" : "Players" },
            ].map((s, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
                {i > 0 && (
                  <View style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 1, backgroundColor: "rgba(255,255,255,0.07)" }} />
                )}
                <Text style={{ color: PURPLE, fontSize: 16, fontFamily: "DMSans_700Bold" }}>{s.value}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 10, fontFamily: "DMSans_400Regular" }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {formContent}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
