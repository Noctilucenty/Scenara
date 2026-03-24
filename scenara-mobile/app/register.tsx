import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StatusBar, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { router } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { useTrading } from "@/src/session/TradingContext";

const BG       = "#08090C";
const CARD     = "#0D1117";
const SURFACE  = "#111620";
const BLUE     = "#4F8EF7";
const PURPLE   = "#7C5CFC";
const PINK     = "#F050AE";
const PURPLE_D = "#4A3699";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER   = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";

export default function RegisterScreen() {
  const { register } = useTrading();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  if (!fontsLoaded) return null;

  const handleRegister = async () => {
    setError("");
    if (!displayName.trim()) { setError("Display name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }

    setLoading(true);
    const result = await register(email.trim().toLowerCase(), password, displayName.trim());
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Registration failed");
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: 40 }}>
            <Svg width={48} height={56} viewBox="0 0 40 48" style={{ marginBottom: 16 }}>
              <Defs>
                <SvgGrad id="rg" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={BLUE} />
                  <Stop offset="0.5" stopColor={PURPLE} />
                  <Stop offset="1" stopColor={PINK} />
                </SvgGrad>
              </Defs>
              <Path d="M4 4 L20 36 L36 4" stroke="url(#rg)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M8 10 L20 30 L32 10" stroke="url(#rg)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
              <Path d="M12 16 L20 28 L28 16" stroke="url(#rg)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            </Svg>
            <Text style={{ color: TEXT, fontSize: 28, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 }}>
              scenara
            </Text>
            <Text style={{ color: TEXT_MID, fontSize: 14, fontFamily: "DMSans_400Regular", marginTop: 6 }}>
              Start with $10,000 simulation balance
            </Text>
          </View>

          {/* Card */}
          <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: BORDER_P, maxWidth: 440, width: "100%", alignSelf: "center" }}>
            <Text style={{ color: TEXT, fontSize: 22, fontFamily: "DMSans_700Bold", marginBottom: 6 }}>
              Create account
            </Text>
            <Text style={{ color: TEXT_MID, fontSize: 14, fontFamily: "DMSans_400Regular", marginBottom: 24 }}>
              Free · No credit card · No real money
            </Text>

            {/* Error */}
            {error ? (
              <View style={{ backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: RED, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}

            {/* Display name */}
            <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 8 }}>DISPLAY NAME</Text>
            <View style={{ backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, marginBottom: 16 }}>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="How you'll appear on the leaderboard"
                placeholderTextColor={TEXT_MID}
                autoCorrect={false}
                style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", paddingVertical: 14 }}
              />
            </View>

            {/* Email */}
            <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 8 }}>EMAIL</Text>
            <View style={{ backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, marginBottom: 16 }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={TEXT_MID}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", paddingVertical: 14 }}
              />
            </View>

            {/* Password */}
            <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 8 }}>PASSWORD</Text>
            <View style={{ backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, marginBottom: 16 }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor={TEXT_MID}
                secureTextEntry
                style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", paddingVertical: 14 }}
              />
            </View>

            {/* Confirm password */}
            <Text style={{ color: TEXT_SUB, fontSize: 12, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 8 }}>CONFIRM PASSWORD</Text>
            <View style={{ backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, marginBottom: 24 }}>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repeat password"
                placeholderTextColor={TEXT_MID}
                secureTextEntry
                style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_400Regular", paddingVertical: 14 }}
                onSubmitEditing={handleRegister}
              />
            </View>

            {/* Starting balance badge */}
            <View style={{ backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.2)", borderRadius: 10, padding: 12, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16 }}>🎉</Text>
              <Text style={{ color: GREEN, fontFamily: "DMSans_500Medium", fontSize: 13 }}>
                You'll start with $10,000 simulation balance
              </Text>
            </View>

            {/* Register button */}
            <TouchableOpacity onPress={handleRegister} disabled={loading} style={{ borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
              <LinearGradient
                colors={loading ? ["#1a1a2e", "#1a1a2e"] : [BLUE, PURPLE, PINK]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 15, alignItems: "center" }}
              >
                {loading
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>Create Account</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            {/* Login link */}
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 }}>
              <Text style={{ color: TEXT_MID, fontFamily: "DMSans_400Regular", fontSize: 14 }}>
                Already have an account?
              </Text>
              <TouchableOpacity onPress={() => router.push("/login")}>
                <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 14 }}>
                  Sign In
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}