import { useState } from "react";
import { View, Text, Image, TouchableOpacity, Platform, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { router } from "expo-router";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

import { useLanguage } from "@/src/i18n";

const BG = "#08090C";
const CARD = "#0D1117";
const BLUE = "#4F8EF7";
const PURPLE = "#7C5CFC";
const PINK = "#F050AE";
const TEXT = "#F1F5F9";
const TEXT_MID = "#64748B";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_P = "rgba(124,92,252,0.25)";

export default function LanguageSelectScreen() {
  const { language, setLanguage } = useLanguage();
  const [selected, setSelected] = useState<"pt" | "en" | "zh" | null>(language ?? null);

  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  if (!fontsLoaded) return null;

  const confirm = () => {
    if (!selected) return;
    void setLanguage(selected);
    router.replace("/(tabs)");
  };

  const options = [
    { lang: "pt" as const, flagUri: "https://flagcdn.com/w80/br.png", label: "Portugu\u00EAs", sub: "Brasil" },
    { lang: "en" as const, flagUri: "https://flagcdn.com/w80/us.png", label: "English", sub: "United States" },
    { lang: "zh" as const, flagUri: "https://flagcdn.com/w80/cn.png", label: "\u4E2D\u6587", sub: "\u4E2D\u56FD\u5927\u9646" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 28 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: "rgba(124,92,252,0.1)", borderWidth: 1, borderColor: BORDER_P, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <Svg width={36} height={42} viewBox="0 0 40 48">
          <Defs>
            <SvgGrad id="ls" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={BLUE} />
              <Stop offset="0.5" stopColor={PURPLE} />
              <Stop offset="1" stopColor={PINK} />
            </SvgGrad>
          </Defs>
          <Path d="M4 4 L20 36 L36 4" stroke="url(#ls)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M8 10 L20 30 L32 10" stroke="url(#ls)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          <Path d="M12 16 L20 28 L28 16" stroke="url(#ls)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
        </Svg>
      </View>

      <Text style={{ color: TEXT, fontSize: 28, fontFamily: "DMSans_700Bold", letterSpacing: -0.5, marginBottom: 8 }}>scenara</Text>
      <Text style={{ color: TEXT_MID, fontSize: 14, fontFamily: "DMSans_400Regular", marginBottom: 48, textAlign: "center" }}>
        {"Choose your language \u00B7 Escolha seu idioma \u00B7 \u9009\u62E9\u8BED\u8A00"}
      </Text>

      <View style={{ width: "100%", maxWidth: 380, gap: 14, marginBottom: 32 }}>
        {options.map((opt) => {
          const isSelected = selected === opt.lang;
          return (
            <TouchableOpacity
              key={opt.lang}
              onPress={() => setSelected(opt.lang)}
              style={{ flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: isSelected ? "rgba(124,92,252,0.1)" : CARD, borderRadius: 16, padding: 18, borderWidth: 2, borderColor: isSelected ? PURPLE : BORDER }}
            >
              <Image source={{ uri: opt.flagUri }} style={{ width: 48, height: 32, borderRadius: 6 }} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontSize: 18, fontFamily: "DMSans_700Bold" }}>{opt.label}</Text>
                <Text style={{ color: TEXT_MID, fontSize: 13, fontFamily: "DMSans_400Regular", marginTop: 2 }}>{opt.sub}</Text>
              </View>
              {isSelected && (
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontSize: 12, fontFamily: "DMSans_700Bold" }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ width: "100%", maxWidth: 380 }}>
        <TouchableOpacity onPress={confirm} disabled={!selected} style={{ borderRadius: 16, overflow: "hidden", opacity: selected ? 1 : 0.4 }}>
          <LinearGradient colors={[BLUE, PURPLE, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 16 }}>
              {selected === "pt" ? "Continuar" : selected === "zh" ? "\u7EE7\u7EED" : "Continue"}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 15 }}>→</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
