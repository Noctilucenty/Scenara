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
const BORDER   = "rgba(255,255,255,0.07)";

const GRAD_BRAND = [BLUE, PURPLE, PINK] as const;

export default function TermsScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  if (!fontsLoaded) return null;

  const ispt = language === "pt";

  const sections = ispt ? [
    {
      title: "1. Aceitação dos Termos",
      body: "Ao acessar ou usar o Scenara, você concorda em estar vinculado a estes Termos de Uso. Se você não concordar com estes termos, não use a plataforma.",
    },
    {
      title: "2. Natureza da Plataforma",
      body: "O Scenara é uma plataforma de simulação de mercado de previsões exclusivamente para fins educacionais e de entretenimento. Nenhum dinheiro real é envolvido em nenhuma transação. O saldo exibido ($10.000 e qualquer variação) é inteiramente virtual e não tem valor monetário real.",
    },
    {
      title: "3. Elegibilidade",
      body: "Você deve ter pelo menos 13 anos de idade para usar o Scenara. Ao criar uma conta, você declara que atende a este requisito de idade mínima.",
    },
    {
      title: "4. Conta do Usuário",
      body: "Você é responsável por manter a confidencialidade de suas credenciais de login. Você é responsável por todas as atividades que ocorrem em sua conta. Notifique-nos imediatamente sobre qualquer uso não autorizado de sua conta.",
    },
    {
      title: "5. Conduta Proibida",
      body: "Você concorda em não: (a) usar a plataforma para qualquer finalidade ilegal; (b) publicar conteúdo ofensivo, abusivo ou difamatório nos comentários; (c) tentar manipular mercados de forma não autorizada; (d) criar múltiplas contas para obter vantagem injusta; (e) fazer engenharia reversa ou descompilar qualquer parte da plataforma.",
    },
    {
      title: "6. Conteúdo do Usuário",
      body: "Ao publicar comentários ou outro conteúdo no Scenara, você nos concede uma licença não exclusiva para usar, exibir e distribuir esse conteúdo na plataforma. Você é o único responsável pelo conteúdo que publica.",
    },
    {
      title: "7. Isenção de Responsabilidade",
      body: "O Scenara é fornecido 'como está', sem garantias de qualquer tipo. Não garantimos a precisão das probabilidades ou previsões exibidas. A plataforma pode estar indisponível ocasionalmente para manutenção ou por razões técnicas.",
    },
    {
      title: "8. Limitação de Responsabilidade",
      body: "Na máxima extensão permitida por lei, o Scenara e seus operadores não serão responsáveis por quaisquer danos indiretos, incidentais ou consequenciais decorrentes do uso ou incapacidade de uso da plataforma.",
    },
    {
      title: "9. Privacidade",
      body: "Coletamos e processamos dados mínimos necessários para operar a plataforma: endereço de e-mail, nome de exibição e atividade de previsão. Não vendemos seus dados a terceiros. Seus comentários são públicos e visíveis para outros usuários.",
    },
    {
      title: "10. Modificações",
      body: "Reservamo-nos o direito de modificar estes termos a qualquer momento. O uso continuado da plataforma após as alterações constitui aceitação dos novos termos.",
    },
    {
      title: "11. Lei Aplicável",
      body: "Estes termos são regidos pelas leis do Brasil. Qualquer disputa será resolvida nos tribunais competentes do Brasil.",
    },
  ] : [
    {
      title: "1. Acceptance of Terms",
      body: "By accessing or using Scenara, you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the platform.",
    },
    {
      title: "2. Nature of the Platform",
      body: "Scenara is a prediction market simulation platform exclusively for educational and entertainment purposes. No real money is involved in any transaction. The balance displayed ($10,000 and any variation) is entirely virtual and has no real monetary value.",
    },
    {
      title: "3. Eligibility",
      body: "You must be at least 13 years of age to use Scenara. By creating an account, you represent that you meet this minimum age requirement.",
    },
    {
      title: "4. User Account",
      body: "You are responsible for maintaining the confidentiality of your login credentials. You are responsible for all activities that occur under your account. Notify us immediately of any unauthorized use of your account.",
    },
    {
      title: "5. Prohibited Conduct",
      body: "You agree not to: (a) use the platform for any illegal purpose; (b) post offensive, abusive, or defamatory content in comments; (c) attempt to manipulate markets in an unauthorized manner; (d) create multiple accounts to gain an unfair advantage; (e) reverse engineer or decompile any part of the platform.",
    },
    {
      title: "6. User Content",
      body: "By posting comments or other content on Scenara, you grant us a non-exclusive license to use, display, and distribute that content on the platform. You are solely responsible for the content you post.",
    },
    {
      title: "7. Disclaimer of Warranties",
      body: "Scenara is provided 'as is', without warranties of any kind. We do not guarantee the accuracy of probabilities or predictions displayed. The platform may be occasionally unavailable for maintenance or technical reasons.",
    },
    {
      title: "8. Limitation of Liability",
      body: "To the maximum extent permitted by law, Scenara and its operators shall not be liable for any indirect, incidental, or consequential damages arising from the use or inability to use the platform.",
    },
    {
      title: "9. Privacy",
      body: "We collect and process minimal data necessary to operate the platform: email address, display name, and prediction activity. We do not sell your data to third parties. Your comments are public and visible to other users.",
    },
    {
      title: "10. Modifications",
      body: "We reserve the right to modify these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.",
    },
    {
      title: "11. Governing Law",
      body: "These terms are governed by the laws of Brazil. Any dispute will be resolved in the competent courts of Brazil.",
    },
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
            {ispt ? "Termos de Uso" : "Terms of Use"}
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <LinearGradient colors={GRAD_BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2 }} />

          <View style={{ padding: 20 }}>

            {/* Header card */}
            <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: "rgba(124,92,252,0.2)" }}>
              <Text style={{ color: TEXT, fontSize: 18, fontFamily: "DMSans_700Bold", marginBottom: 6 }}>
                {ispt ? "Termos de Uso — Scenara" : "Terms of Use — Scenara"}
              </Text>
              <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular" }}>
                {ispt ? "Última atualização: março de 2026" : "Last updated: March 2026"}
              </Text>
            </View>

            {/* Sections */}
            {sections.map((section, i) => (
              <View key={i} style={{ marginBottom: 20 }}>
                <Text style={{ color: TEXT, fontSize: 14, fontFamily: "DMSans_700Bold", marginBottom: 6 }}>
                  {section.title}
                </Text>
                <Text style={{ color: TEXT_SUB, fontSize: 13, fontFamily: "DMSans_400Regular", lineHeight: 21 }}>
                  {section.body}
                </Text>
              </View>
            ))}

            {/* Footer */}
            <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 20, marginTop: 8, marginBottom: 40 }}>
              <Text style={{ color: TEXT_MID, fontSize: 12, fontFamily: "DMSans_400Regular", textAlign: "center", lineHeight: 18 }}>
                {ispt
                  ? "Se tiver dúvidas sobre estes termos, entre em contato através do app."
                  : "If you have questions about these terms, please reach out through the app."}
              </Text>
              <Text style={{ color: PURPLE_D, fontSize: 11, fontFamily: "DMSans_500Medium", textAlign: "center", marginTop: 8 }}>
                scenara.vercel.app · © 2026 Scenara
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}