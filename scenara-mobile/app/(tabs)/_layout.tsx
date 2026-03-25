import { Tabs } from "expo-router";
import React from "react";
import { View, Text } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { useLanguage } from "@/src/i18n";

const PURPLE = "#7C5CFC";

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 17, opacity: focused ? 1 : 0.3 }}>{emoji}</Text>
    </View>
  );
}

export default function TabLayout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { t } = useLanguage();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: "#0A0B10",
          borderTopColor: "rgba(124,92,252,0.15)",
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 10,
          paddingTop: 4,
        },
        tabBarActiveTintColor: PURPLE,
        tabBarInactiveTintColor: "rgba(255,255,255,0.25)",
        tabBarLabelStyle: {
          fontSize: 9,
          fontFamily: fontsLoaded ? "DMSans_700Bold" : undefined,
          letterSpacing: 1.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.markets,
          tabBarIcon: ({ focused }) => <TabIcon emoji="◈" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: t.tabs.portfolio,
          tabBarIcon: ({ focused }) => <TabIcon emoji="◉" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t.tabs.insights,
          tabBarIcon: ({ focused }) => <TabIcon emoji="◎" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: t.tabs.rankings,
          tabBarIcon: ({ focused }) => <TabIcon emoji="◆" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙" focused={focused} />,
        }}
      />
      <Tabs.Screen name="kyc"     options={{ href: null }} />
      <Tabs.Screen name="funding" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}