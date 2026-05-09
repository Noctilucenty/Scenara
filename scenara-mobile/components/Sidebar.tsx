import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  View, Text, TouchableOpacity, Animated, Dimensions,
  SafeAreaView, Platform, Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTrading } from "@/src/session/TradingContext";
import { useLanguage } from "@/src/i18n";

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

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;
const SIDEBAR_W  = 280;

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

type Props = {
  visible: boolean;
  onClose(): void;
};

export function Sidebar({ visible, onClose }: Props) {
  const router = useRouter();
  const { isAuthenticated, logout, userId } = useTrading();
  const { language, setLanguage } = useLanguage();
  const [mounted, setMounted] = useState(false);

  // Mount on first open, stay mounted after
  useEffect(() => {
    if (visible && !mounted) setMounted(true);
  }, [visible]);

  const nav = useCallback((path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 150);
  }, [onClose, router]);

  if (!mounted) return null;

  const label = {
    markets:     language === "pt" ? "Mercados" : language === "zh" ? "市场" : "Markets",
    portfolio:   language === "pt" ? "Carteira" : language === "zh" ? "投资组合" : "Portfolio",
    rankings:    language === "pt" ? "Ranking" : language === "zh" ? "排行榜" : "Rankings",
    news:        language === "pt" ? "Notícias" : language === "zh" ? "新闻" : "News",
    settings:    language === "pt" ? "Ajustes" : language === "zh" ? "设置" : "Settings",
    insights:    language === "pt" ? "Insights" : language === "zh" ? "洞察" : "Insights",
    login:       language === "pt" ? "Entrar" : language === "zh" ? "登录" : "Log In",
    signup:      language === "pt" ? "Criar Conta" : language === "zh" ? "注册" : "Sign Up",
    logout:      language === "pt" ? "Sair" : language === "zh" ? "退出登录" : "Log Out",
    language:    language === "pt" ? "Idioma" : language === "zh" ? "语言" : "Language",
    simulation:  language === "pt" ? "Mercado Simulado" : language === "zh" ? "模拟市场" : "Simulated Market",
    howItWorks:  language === "pt" ? "Como Funciona" : language === "zh" ? "使用说明" : "How It Works",
    termsOfUse:  language === "pt" ? "Termos de Uso" : language === "zh" ? "使用条款" : "Terms of Use",
    daily:       language === "pt" ? "Desafio Diário" : language === "zh" ? "每日挑战" : "Daily Challenge",
    signalLab:   "Signal Lab",
  };

  // Web: use CSS transform for zero-jank animation
  if (Platform.OS === "web") {
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 1000,
        pointerEvents: visible ? "auto" : "none",
      }}>
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
        />
        {/* Panel */}
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: SIDEBAR_W,
          backgroundColor: CARD,
          borderRight: `1px solid ${BORDER_P}`,
          transform: `translateX(${visible ? 0 : -SIDEBAR_W}px)`,
          transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}>
          <SidebarContent
            isAuthenticated={isAuthenticated}
            userId={userId}
            language={language}
            setLanguage={setLanguage}
            logout={logout}
            onClose={onClose}
            nav={nav}
            label={label}
          />
        </div>
      </div>
    );
  }

  // Native: use Animated
  return (
    <NativeSidebar
      visible={visible}
      onClose={onClose}
      isAuthenticated={isAuthenticated}
      userId={userId}
      language={language}
      setLanguage={setLanguage}
      logout={logout}
      nav={nav}
      label={label}
    />
  );
}

function NativeSidebar({ visible, onClose, isAuthenticated, userId, language, setLanguage, logout, nav, label }: any) {
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: visible ? 0 : -SIDEBAR_W, useNativeDriver: true, tension: 120, friction: 18 }),
      Animated.timing(fadeAnim, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, pointerEvents: visible ? "auto" : "none" } as any}>
      <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", opacity: fadeAnim }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: SIDEBAR_W, backgroundColor: CARD, borderRightWidth: 1, borderRightColor: BORDER_P, transform: [{ translateX: slideAnim }] }}>
        <SafeAreaView style={{ flex: 1 }}>
          <SidebarContent isAuthenticated={isAuthenticated} userId={userId} language={language} setLanguage={setLanguage} logout={logout} onClose={onClose} nav={nav} label={label} />
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const SidebarContent = memo(function SidebarContent({ isAuthenticated, userId, language, setLanguage, logout, onClose, nav, label }: any) {
  return (
    <View style={{ flex: 1, paddingTop: 20 }}>
      <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2, marginBottom: 20 }} />

      {/* Logo */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, overflow: "hidden" }}>
          <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontSize: 16, fontFamily: "DMSans_700Bold" }}>S</Text>
          </LinearGradient>
        </View>
        <View>
          <Text style={{ color: TEXT, fontSize: 18, fontFamily: "DMSans_700Bold", letterSpacing: -0.3 }}>scenara</Text>
          <Text style={{ color: TEXT_MID, fontSize: 9, fontFamily: "DMSans_400Regular" }}>{label.simulation}</Text>
        </View>
      </View>

      {/* User section */}
      {isAuthenticated ? (
        <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: SURFACE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER_P }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, overflow: "hidden" }}>
              <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "white", fontSize: 14, fontFamily: "DMSans_700Bold" }}>U</Text>
              </LinearGradient>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontSize: 14, fontFamily: "DMSans_700Bold" }}>{language === "pt" ? "Minha Conta" : language === "zh" ? "我的账户" : "My Account"}</Text>
              <Text style={{ color: TEXT_MID, fontSize: 11 }}>ID #{userId}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ marginHorizontal: 16, marginBottom: 16, gap: 8 }}>
          <TouchableOpacity onPress={() => nav("/register")} style={{ borderRadius: 12, overflow: "hidden" }}>
            <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 11, alignItems: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 13 }}>{label.signup}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => nav("/login")} style={{ paddingVertical: 10, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: BORDER_P }}>
            <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{label.login}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 1, backgroundColor: BORDER, marginHorizontal: 16, marginBottom: 8 }} />

      {/* Nav */}
      {[
        { icon: "◈", label: label.markets,   path: "/(tabs)" },
        { icon: "◉", label: label.portfolio,  path: "/(tabs)/portfolio" },
        { icon: "📰", label: label.news,      path: "/(tabs)/news" },
        { icon: "◆", label: label.rankings,   path: "/(tabs)/leaderboard" },
        { icon: "★", label: label.daily,     path: "/daily-challenge" },
        { icon: "▲", label: label.signalLab, path: "/signal-lab" },
        { icon: "⚙", label: label.settings,   path: "/(tabs)/settings" },
      ].map(item => (
        <TouchableOpacity key={item.path} onPress={() => nav(item.path)} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 12 }}>
          <Text style={{ fontSize: 16, width: 22, textAlign: "center" }}>{item.icon}</Text>
          <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_500Medium" }}>{item.label}</Text>
        </TouchableOpacity>
      ))}

      <View style={{ height: 1, backgroundColor: BORDER, marginHorizontal: 16, marginVertical: 8 }} />

      {/* Language */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 8 }}>
        <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_500Medium" }}>{label.language}</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["en", "pt", "zh"] as const).map(l => (
            <TouchableOpacity key={l} onPress={() => setLanguage(l)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: language === l ? PURPLE : BORDER, backgroundColor: language === l ? "rgba(124,92,252,0.15)" : "transparent" }}>
              <Text style={{ color: language === l ? PURPLE : TEXT_MID, fontSize: 12, fontFamily: "DMSans_700Bold" }}>{l === "en" ? "EN" : l === "pt" ? "PT" : "中文"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Bottom links */}
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <TouchableOpacity onPress={() => nav("/how-it-works")}>
          <Text style={{ color: TEXT_MID, fontSize: 12, paddingVertical: 8 }}>{label.howItWorks}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => nav("/terms")}>
          <Text style={{ color: TEXT_MID, fontSize: 12, paddingVertical: 8 }}>{label.termsOfUse}</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      {isAuthenticated && (
        <TouchableOpacity onPress={() => { logout(); onClose(); }} style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 20, paddingVertical: 11, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", backgroundColor: "rgba(239,68,68,0.06)" }}>
          <Text style={{ color: RED, fontFamily: "DMSans_700Bold", fontSize: 13 }}>{label.logout}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});
