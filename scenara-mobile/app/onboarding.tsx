import { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  Dimensions, Animated, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Circle, Polyline } from "react-native-svg";
import { useLanguage } from "@/src/i18n";

const BG      = "#08090C";
const CARD    = "#0D1117";
const PURPLE  = "#7C5CFC";
const PURPLE_D = "#4A3699";
const BLUE    = "#4F8EF7";
const PINK    = "#F050AE";
const GREEN   = "#22C55E";
const TEXT    = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER_P = "rgba(124,92,252,0.25)";

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;
const GRAD_GREEN = ["#16a34a", "#22C55E"] as const;

const SLIDES = {
  en: [
    {
      icon: "logo",
      title: "Welcome to Scenara",
      body: "The simulated prediction market where you forecast real-world events and compete with other players.",
      highlight: "simulated prediction market",
      extra: "balance",
    },
    {
      icon: "chart",
      title: "How predictions work",
      body: "Follow three simple steps to start predicting",
      steps: [
        { n: "1", title: "Pick an event", desc: "Politics, crypto, sports, tech and more" },
        { n: "2", title: "Choose your outcome", desc: "Yes or No, with live probabilities" },
        { n: "3", title: "Set your amount", desc: "Bet from your $10,000 simulation balance" },
      ],
    },
    {
      icon: "star",
      title: "Win and climb the ranks",
      body: "Correct predictions earn real payouts. Build streaks and rise on the leaderboard.",
      wins: [
        { event: "Will BTC be above $70k?", choice: "Chose: Yes", pnl: "+$184" },
        { event: "Lula approval above 40%?", choice: "Chose: No", pnl: "+$92" },
      ],
    },
  ],
  pt: [
    {
      icon: "logo",
      title: "Bem-vindo ao Scenara",
      body: "O mercado de previsões simulado onde você prevê eventos reais e compete com outros jogadores.",
      highlight: "mercado de previsões simulado",
      extra: "balance",
    },
    {
      icon: "chart",
      title: "Como as previsões funcionam",
      body: "Siga três passos simples para começar",
      steps: [
        { n: "1", title: "Escolha um evento", desc: "Política, cripto, esportes, tecnologia e mais" },
        { n: "2", title: "Escolha o resultado", desc: "Sim ou Não, com probabilidades ao vivo" },
        { n: "3", title: "Defina o valor", desc: "Aposte com seu saldo de $10.000" },
      ],
    },
    {
      icon: "star",
      title: "Ganhe e suba no ranking",
      body: "Previsões corretas rendem pagamentos reais. Construa sequências e suba no ranking.",
      wins: [
        { event: "O BTC vai ficar acima de $70k?", choice: "Escolheu: Sim", pnl: "+$184" },
        { event: "Aprovação do Lula acima de 40%?", choice: "Escolheu: Não", pnl: "+$92" },
      ],
    },
  ],
};

function ScenaraLogo() {
  return (
    <Svg width="36" height="44" viewBox="0 0 40 48">
      <Defs>
        <SvgGrad id="lg" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={BLUE} />
          <Stop offset="0.5" stopColor={PURPLE} />
          <Stop offset="1" stopColor={PINK} />
        </SvgGrad>
      </Defs>
      <Path d="M4 4 L20 36 L36 4" stroke="url(#lg)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 10 L20 30 L32 10" stroke="url(#lg)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      <Path d="M12 16 L20 28 L28 16" stroke="url(#lg)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
    </Svg>
  );
}

export function hasSeenOnboarding(): boolean {
  try {
    if (Platform.OS === "web") return localStorage.getItem("scenara_onboarded") === "1";
    return false;
  } catch { return false; }
}

export function markOnboardingDone(): void {
  try {
    if (Platform.OS === "web") localStorage.setItem("scenara_onboarded", "1");
  } catch {}
}

export default function OnboardingScreen() {
  const { language } = useLanguage();
  const router = useRouter();
  const [cur, setCur] = useState(0);
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { width } = Dimensions.get("window");
  const maxW = Math.min(width, 420);

  const slides = SLIDES[language as "en" | "pt"] ?? SLIDES.en;
  const slide = slides[cur];
  const isLast = cur === slides.length - 1;

  const next = () => {
    if (isLast) {
      markOnboardingDone();
      router.replace("/(tabs)");
    } else {
      setCur(c => c + 1);
    }
  };

  const skip = () => {
    markOnboardingDone();
    router.replace("/(tabs)");
  };

  if (!fontsLoaded) return null;

  const nextLabel = language === "pt"
    ? (isLast ? "Começar" : "Próximo")
    : (isLast ? "Get started" : "Next");

  return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
      {/* Top gradient line */}
      <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }} />

      <View style={{ width: maxW, flex: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40, justifyContent: "space-between" }}>

        {/* Skip button */}
        {!isLast && (
          <TouchableOpacity onPress={skip} style={{ alignSelf: "flex-end" }}>
            <Text style={{ color: TEXT_MID, fontFamily: "DMSans_500Medium", fontSize: 14 }}>
              {language === "pt" ? "Pular" : "Skip"}
            </Text>
          </TouchableOpacity>
        )}
        {isLast && <View style={{ height: 20 }} />}

        {/* Main content */}
        <View style={{ flex: 1, justifyContent: "center" }}>

          {/* Icon */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            {slide.icon === "logo" && (
              <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: "rgba(124,92,252,0.1)", borderWidth: 1, borderColor: BORDER_P, alignItems: "center", justifyContent: "center" }}>
                <ScenaraLogo />
              </View>
            )}
            {slide.icon === "chart" && (
              <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: "rgba(79,142,247,0.1)", borderWidth: 1, borderColor: "rgba(79,142,247,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Svg width="40" height="40" viewBox="0 0 24 24">
                  <Polyline points="3,17 7,9 11,13 15,7 19,10" stroke={BLUE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Circle cx="19" cy="10" r="2" fill={PINK} />
                </Svg>
              </View>
            )}
            {slide.icon === "star" && (
              <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: "rgba(34,197,94,0.1)", borderWidth: 1, borderColor: "rgba(34,197,94,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Svg width="40" height="40" viewBox="0 0 24 24">
                  <Path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" stroke={GREEN} strokeWidth="1.8" strokeLinejoin="round" fill="rgba(34,197,94,0.15)" />
                </Svg>
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={{ color: TEXT, fontSize: 26, fontFamily: "DMSans_700Bold", textAlign: "center", lineHeight: 34, letterSpacing: -0.5, marginBottom: 12 }}>
            {slide.title}
          </Text>

          {/* Body */}
          <Text style={{ color: TEXT_SUB, fontSize: 15, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 24, marginBottom: 32 }}>
            {slide.body}
          </Text>

          {/* Slide 1 extra — balance badge */}
          {slide.extra === "balance" && (
            <View style={{ backgroundColor: "rgba(124,92,252,0.08)", borderWidth: 1, borderColor: BORDER_P, borderRadius: 16, padding: 20, alignItems: "center" }}>
              <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 8 }}>
                {language === "pt" ? "SEU SALDO INICIAL" : "YOUR STARTING BALANCE"}
              </Text>
              <Text style={{ color: TEXT, fontSize: 40, fontFamily: "DMSans_700Bold", letterSpacing: -1 }}>$10,000</Text>
              <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", marginTop: 6 }}>
                {language === "pt" ? "Sem dinheiro real envolvido" : "No real money involved"}
              </Text>
            </View>
          )}

          {/* Slide 2 — steps */}
          {"steps" in slide && slide.steps && (
            <View style={{ gap: 12 }}>
              {slide.steps.map((step) => (
                <View key={step.n} style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 14 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(124,92,252,0.15)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Text style={{ color: PURPLE, fontFamily: "DMSans_700Bold", fontSize: 12 }}>{step.n}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 14, marginBottom: 2 }}>{step.title}</Text>
                    <Text style={{ color: TEXT_MID, fontFamily: "DMSans_400Regular", fontSize: 13 }}>{step.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Slide 3 — wins */}
          {"wins" in slide && slide.wins && (
            <View style={{ gap: 10 }}>
              {slide.wins.map((win, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(34,197,94,0.05)", borderWidth: 1, borderColor: "rgba(34,197,94,0.15)", borderRadius: 12, padding: 14 }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold", fontSize: 13, marginBottom: 2 }}>{win.event}</Text>
                    <Text style={{ color: TEXT_MID, fontFamily: "DMSans_400Regular", fontSize: 12 }}>{win.choice}</Text>
                  </View>
                  <Text style={{ color: GREEN, fontFamily: "DMSans_700Bold", fontSize: 18 }}>{win.pnl}</Text>
                </View>
              ))}
              <View style={{ backgroundColor: "rgba(124,92,252,0.06)", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER_P }}>
                <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center" }}>
                  {language === "pt"
                    ? "Suba no ranking e compare com outros jogadores"
                    : "Rise on the leaderboard and compete with others"}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Bottom — dots + button */}
        <View>
          {/* Dots */}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 24 }}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={{
                  height: 6, borderRadius: 3,
                  width: i === cur ? 20 : 6,
                  backgroundColor: i === cur ? PURPLE : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </View>

          {/* Next button */}
          <TouchableOpacity onPress={next} style={{ borderRadius: 16, overflow: "hidden" }}>
            <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 16, letterSpacing: 0.3 }}>{nextLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}