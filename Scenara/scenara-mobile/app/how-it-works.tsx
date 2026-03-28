import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { useLanguage } from "@/src/i18n";

const BG       = "#08090C";
const CARD     = "#0D1117";
const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";
const BLUE     = "#4F8EF7";
const PINK     = "#F050AE";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const BORDER_P = "rgba(124,92,252,0.2)";
const GREEN    = "#22C55E";

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;

export default function HowItWorksScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  if (!fontsLoaded) return null;

  const ispt = language === "pt";

  const steps = ispt ? [
    { n: "1", icon: "◈", title: "Explore os Mercados", body: "Navegue por centenas de mercados de previsão em política, cripto, esportes, tecnologia e muito mais. Todos os mercados são baseados em eventos reais." },
    { n: "2", icon: "◉", title: "Escolha seu Resultado", body: "Cada mercado tem dois ou mais cenários possíveis. Escolha o que você acha mais provável — Sim ou Não, ou outras opções específicas." },
    { n: "3", icon: "₿", title: "Aposte com Saldo Simulado", body: "Você começa com $10.000 em saldo simulado. Não é dinheiro real — é uma simulação para você praticar previsões sem risco." },
    { n: "4", icon: "📈", title: "Acompanhe as Probabilidades", body: "Os preços mudam em tempo real com base nas apostas dos outros jogadores. Quanto mais gente aposta em um resultado, maior a probabilidade." },
    { n: "5", icon: "✓",  title: "Ganhe ou Perca", body: "Quando o evento é resolvido, quem apostou no resultado correto recebe o payout baseado na probabilidade de entrada. Previsões difíceis pagam mais." },
    { n: "6", icon: "◆", title: "Suba no Ranking", body: "Seu desempenho é medido por precisão (Brier Score), P&L e taxa de acerto. Compete com outros jogadores no ranking global." },
  ] : [
    { n: "1", icon: "◈", title: "Browse Markets", body: "Explore hundreds of prediction markets across politics, crypto, sports, technology and more. All markets are based on real-world events." },
    { n: "2", icon: "◉", title: "Choose Your Outcome", body: "Each market has two or more possible outcomes. Pick the one you think is most likely — Yes or No, or other specific options." },
    { n: "3", icon: "₿", title: "Bet with Simulated Balance", body: "You start with $10,000 in simulated balance. This is not real money — it's a simulation for you to practice forecasting without risk." },
    { n: "4", icon: "📈", title: "Track Live Probabilities", body: "Prices change in real time based on how other players are betting. The more people bet on an outcome, the higher the probability." },
    { n: "5", icon: "✓",  title: "Win or Lose", body: "When an event resolves, players who picked the correct outcome receive a payout based on their entry probability. Harder predictions pay more." },
    { n: "6", icon: "◆", title: "Climb the Rankings", body: "Your performance is measured by accuracy (Brier Score), P&L, and win rate. Compete against other players on the global leaderboard." },
  ];

  const faqs = ispt ? [
    { q: "É dinheiro real?", a: "Não. Scenara é 100% simulado. Você usa saldo virtual de $10.000 para fazer previsões. Nenhum dinheiro real é necessário ou pode ser ganho." },
    { q: "Como os mercados são resolvidos?", a: "Mercados de cripto são resolvidos automaticamente via preços ao vivo da CoinGecko. Outros mercados são resolvidos manualmente com base nos resultados reais dos eventos." },
    { q: "Como funciona a probabilidade?", a: "Cada cenário começa com uma probabilidade definida. Ela muda a cada 5 minutos com base em um modelo de random walk e nas apostas dos jogadores." },
    { q: "O que é o Brier Score?", a: "É uma métrica de precisão de previsão. Um score de 0 é perfeito, 100 é o pior possível. Quanto menor seu score, melhor sua calibração de probabilidades." },
    { q: "Posso perder meu saldo?", a: "Sim — dentro da simulação. Se você apostar em resultados errados, seu saldo diminui. Mas você sempre pode criar uma nova conta para recomeçar com $10.000." },
  ] : [
    { q: "Is this real money?", a: "No. Scenara is 100% simulated. You use a virtual $10,000 balance to make predictions. No real money is required or can be won." },
    { q: "How are markets resolved?", a: "Crypto markets are resolved automatically via live CoinGecko prices. Other markets are resolved manually based on real-world event outcomes." },
    { q: "How does probability work?", a: "Each scenario starts with a defined probability. It changes every 5 minutes based on a random walk model and player betting activity." },
    { q: "What is the Brier Score?", a: "It's a forecasting accuracy metric. A score of 0 is perfect, 100 is worst. The lower your score, the better your probability calibration." },
    { q: "Can I lose my balance?", a: "Yes — within the simulation. If you bet on wrong outcomes, your balance decreases. But you can always create a new account to restart with $10,000." },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(124,92,252,0.1)" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14, padding: 4 }}>
            <Text style={{ color: PURPLE_D, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: TEXT, fontSize: 17, fontFamily: "DMSans_700Bold" }}>
            {ispt ? "Como Funciona" : "How It Works"}
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2 }} />

          <View style={{ padding: 20 }}>

            {/* Hero */}
            <View style={{ alignItems: "center", paddingVertical: 28, marginBottom: 8 }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, overflow: "hidden", marginBottom: 16 }}>
                <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontSize: 28, fontFamily: "DMSans_700Bold" }}>S</Text>
                </LinearGradient>
              </View>
              <Text style={{ color: TEXT, fontSize: 24, fontFamily: "DMSans_700Bold", textAlign: "center", letterSpacing: -0.5, marginBottom: 8 }}>
                {ispt ? "Mercado de Previsões Simulado" : "Simulated Prediction Market"}
              </Text>
              <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 22, maxWidth: 340 }}>
                {ispt
                  ? "Teste suas habilidades de previsão em eventos reais do mundo todo — sem arriscar dinheiro real."
                  : "Test your forecasting skills on real-world events from around the globe — without risking real money."}
              </Text>
            </View>

            {/* Steps */}
            <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 14 }}>
              {ispt ? "COMO JOGAR" : "HOW TO PLAY"}
            </Text>
            {steps.map((step, i) => (
              <View key={step.n} style={{ flexDirection: "row", gap: 14, marginBottom: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(124,92,252,0.12)", borderWidth: 1, borderColor: BORDER_P, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Text style={{ color: PURPLE, fontSize: 16 }}>{step.icon}</Text>
                </View>
                <View style={{ flex: 1, paddingTop: 2 }}>
                  <Text style={{ color: TEXT, fontSize: 15, fontFamily: "DMSans_700Bold", marginBottom: 4 }}>{step.title}</Text>
                  <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 20 }}>{step.body}</Text>
                </View>
              </View>
            ))}

            {/* Simulation badge */}
            <View style={{ backgroundColor: "rgba(34,197,94,0.06)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(34,197,94,0.15)", padding: 16, marginVertical: 20 }}>
              <Text style={{ color: GREEN, fontSize: 12, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 6 }}>
                {ispt ? "100% SIMULADO" : "100% SIMULATED"}
              </Text>
              <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 20 }}>
                {ispt
                  ? "Scenara é exclusivamente uma plataforma de simulação educacional. Nenhum dinheiro real é usado, apostado ou ganho. É para aprendizado e entretenimento."
                  : "Scenara is exclusively an educational simulation platform. No real money is used, wagered, or won. It is for learning and entertainment purposes only."}
              </Text>
            </View>

            {/* FAQ */}
            <Text style={{ color: PURPLE_D, fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.5, marginBottom: 14 }}>FAQ</Text>
            {faqs.map((faq, i) => (
              <View key={i} style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" }}>
                <Text style={{ color: TEXT, fontSize: 14, fontFamily: "DMSans_700Bold", marginBottom: 6 }}>{faq.q}</Text>
                <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 20 }}>{faq.a}</Text>
              </View>
            ))}

            {/* CTA */}
            <TouchableOpacity onPress={() => router.back()} style={{ borderRadius: 14, overflow: "hidden", marginTop: 12, marginBottom: 40 }}>
              <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 15, alignItems: "center" }}>
                <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 15 }}>
                  {ispt ? "Começar a Prever →" : "Start Predicting →"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}