import { Tabs } from "expo-router";
import React, { useState } from "react";
import { View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { useLanguage } from "@/src/i18n";
import { Sidebar as AppSidebar } from "@/components/Sidebar";
import Svg, { Path, Circle, Polyline, Rect } from "react-native-svg";

const PURPLE   = "#7C5CFC";
const INACTIVE = "rgba(255,255,255,0.32)";

// ── Tab icon wrapper — pill indicator + soft glow background ─────────────────
function TabIcon({ icon, focused }: { icon: React.ReactNode; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 44, height: 32 }}>
      {/* Pill bar at top */}
      {focused && (
        <View style={{
          position: "absolute", top: 0, width: 28, height: 2.5, borderRadius: 2,
          backgroundColor: PURPLE,
          // glow — web shadow syntax works on RN web; ignored on native (handled by elevation)
          shadowColor: PURPLE, shadowOpacity: 0.9, shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }} />
      )}
      {/* Soft glow pill behind icon */}
      {focused && (
        <View style={{
          position: "absolute",
          width: 40, height: 30, borderRadius: 10,
          backgroundColor: "rgba(124,92,252,0.12)",
        }} />
      )}
      {icon}
    </View>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconMarkets({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <TabIcon focused={focused} icon={
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Polyline points="3,18 8,10 13,13 18,6" stroke={c} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx="18" cy="6" r="2.2" fill={c} />
        <Path d="M3 21h18" stroke={c} strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
      </Svg>
    } />
  );
}

function IconPortfolio({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <TabIcon focused={focused} icon={
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Rect x="2" y="8" width="20" height="13" rx="2" stroke={c} strokeWidth={2} fill={focused ? `${PURPLE}15` : "none"} />
        <Path d="M16 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke={c} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M12 13v3M10.5 14.5h3" stroke={c} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    } />
  );
}

function IconNews({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <TabIcon focused={focused} icon={
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Rect x="3" y="3" width="18" height="18" rx="2.5" stroke={c} strokeWidth={2} fill={focused ? `${PURPLE}12` : "none"} />
        <Path d="M7 8h10M7 12h7M7 16h4" stroke={c} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    } />
  );
}

function IconLeaderboard({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <TabIcon focused={focused} icon={
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Rect x="9" y="2" width="6" height="20" rx="1.5" stroke={c} strokeWidth={2} fill={focused ? `${PURPLE}18` : "none"} />
        <Rect x="2" y="8" width="6" height="14" rx="1.5" stroke={c} strokeWidth={1.8} fill="none" />
        <Rect x="16" y="5" width="6" height="17" rx="1.5" stroke={c} strokeWidth={1.8} fill="none" />
      </Svg>
    } />
  );
}

function IconSettings({ focused }: { focused: boolean }) {
  const c = focused ? PURPLE : INACTIVE;
  return (
    <TabIcon focused={focused} icon={
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="3.2" stroke={c} strokeWidth={2} fill={focused ? `${PURPLE}20` : "none"} />
        <Path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          stroke={c} strokeWidth={1.6} fill="none"
        />
      </Svg>
    } />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export const SidebarContext = React.createContext<{ open(): void }>({ open: () => {} });

export default function TabLayout() {
  const { t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // On iOS the home indicator sits below the tab bar — we must add that space
  const bottomInset  = Platform.OS === "web" ? 0 : insets.bottom;
  const tabBarHeight = 56 + bottomInset;
  const tabBarPB     = Math.max(bottomInset, 6);

  return (
    <SidebarContext.Provider value={{ open: () => setSidebarOpen(true) }}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarStyle: {
              backgroundColor: "#080910",
              borderTopColor: "rgba(124,92,252,0.18)",
              borderTopWidth: 1,
              height: tabBarHeight,
              paddingBottom: tabBarPB,
              paddingTop: 6,
              // Remove Android elevation shadow (we have our own top border)
              elevation: 0,
            },
            tabBarActiveTintColor: PURPLE,
            tabBarInactiveTintColor: INACTIVE,
            tabBarLabelStyle: {
              fontSize: 10,
              fontFamily: "DMSans_700Bold",
              letterSpacing: 0.5,
              marginTop: 1,
            },
            tabBarItemStyle: {
              paddingTop: 4,
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
