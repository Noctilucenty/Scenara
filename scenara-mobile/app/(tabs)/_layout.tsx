import { Tabs } from "expo-router";
import React, { useState } from "react";
import { View, Text } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import {
  useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { useLanguage } from "@/src/i18n";
import { Sidebar as AppSidebar } from "@/components/Sidebar";
import Svg, { Path, Circle, Polyline, Rect } from "react-native-svg";

const PURPLE = "#7C5CFC";
const INACTIVE = "rgba(255,255,255,0.28)";

// Clean SVG icons — consistent stroke style
function IconMarkets({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3h18v18H3z" stroke={c} strokeWidth={1.6} strokeLinejoin="round" fill="none" opacity={focused ? 0.15 : 0} />
      <Polyline points="3,17 8,10 13,13 18,6" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx="18" cy="6" r="1.8" fill={c} />
    </Svg>
  );
}

function IconPortfolio({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="7" width="20" height="15" rx="2" stroke={c} strokeWidth={1.6} fill={focused ? `${PURPLE}18` : "none"} />
      <Path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke={c} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M12 12v4M10 14h4" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function IconNews({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4h16v16H4z" stroke={c} strokeWidth={1.5} strokeLinejoin="round" fill={focused ? `${PURPLE}15` : "none"} />
      <Path d="M8 9h8M8 13h5M8 17h3" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function IconLeaderboard({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="3" width="6" height="18" rx="1" stroke={c} strokeWidth={1.5} fill={focused ? `${PURPLE}18` : "none"} />
      <Rect x="2" y="9" width="6" height="12" rx="1" stroke={c} strokeWidth={1.5} fill="none" />
      <Rect x="16" y="6" width="6" height="15" rx="1" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

function IconSettings({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={c} strokeWidth={1.6} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

export const SidebarContext = React.createContext<{ open(): void }>({ open: () => {} });

export default function TabLayout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ open: () => setSidebarOpen(true) }}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarStyle: {
              backgroundColor: "#0A0B10",
              borderTopColor: "rgba(124,92,252,0.15)",
              borderTopWidth: 1,
              height: 64,
              paddingBottom: 10,
              paddingTop: 6,
            },
            tabBarActiveTintColor: PURPLE,
            tabBarInactiveTintColor: INACTIVE,
            tabBarLabelStyle: {
              fontSize: 9,
              fontFamily: fontsLoaded ? "DMSans_700Bold" : undefined,
              letterSpacing: 0.8,
              marginTop: 2,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t.tabs.markets,
              tabBarIcon: ({ focused }) => <IconMarkets focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="portfolio"
            options={{
              title: t.tabs.portfolio,
              tabBarIcon: ({ focused }) => <IconPortfolio focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="news"
            options={{
              title: t.tabs.news,
              tabBarIcon: ({ focused }) => <IconNews focused={focused} />,
            }}
          />
          <Tabs.Screen name="insights" options={{ href: null }} />
          <Tabs.Screen
            name="leaderboard"
            options={{
              title: t.tabs.rankings,
              tabBarIcon: ({ focused }) => <IconLeaderboard focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: t.tabs.settings,
              tabBarIcon: ({ focused }) => <IconSettings focused={focused} />,
            }}
          />
          <Tabs.Screen name="kyc"     options={{ href: null }} />
          <Tabs.Screen name="funding" options={{ href: null }} />
        </Tabs>
        <AppSidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </View>
    </SidebarContext.Provider>
  );
}