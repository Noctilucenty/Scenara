import { View, Text } from "react-native";

/**
 * LevelBadge — tiny inline pill that shows a trader's level.
 *
 * Level is computed server-side from user.xp via a sqrt curve
 * (see scenara-backend/app/services/xp.py). Tier colors progress
 * so a L1 badge feels plain and a L20+ feels earned.
 *
 * Keep this tiny and dependency-free so it renders fast in long lists.
 */

type Size = "sm" | "md" | "lg";

function tierFor(level: number) {
  if (level >= 20) return { bg: "rgba(240,80,174,0.15)",  fg: "#F472B6", border: "rgba(240,80,174,0.35)" };  // pink — whale
  if (level >= 10) return { bg: "rgba(124,92,252,0.18)",  fg: "#7C5CFC", border: "rgba(124,92,252,0.2)"  };  // purple — elite
  if (level >= 5)  return { bg: "rgba(79,142,247,0.15)",  fg: "#4F8EF7", border: "rgba(79,142,247,0.3)"  };  // blue — active
  return                  { bg: "rgba(148,163,184,0.12)", fg: "#94A3B8", border: "rgba(255,255,255,0.08)" };  // grey — rookie
}

const SIZE_MAP = {
  sm: { px: 6,  py: 2, font: 9  },
  md: { px: 8,  py: 3, font: 11 },
  lg: { px: 10, py: 4, font: 13 },
} as const;

export function LevelBadge({ level, size = "sm" }: { level: number | undefined; size?: Size }) {
  const lvl = Math.max(1, level ?? 1);
  const tier = tierFor(lvl);
  const s = SIZE_MAP[size];
  return (
    <View style={{
      backgroundColor: tier.bg,
      paddingHorizontal: s.px,
      paddingVertical: s.py,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: tier.border,
    }}>
      <Text style={{ color: tier.fg, fontSize: s.font, fontFamily: "DMSans_700Bold", letterSpacing: 0.5 }}>
        L{lvl}
      </Text>
    </View>
  );
}
