// src/theme.ts — Scenara brand tokens

export const C = {
  BG: "#08090C",
  CARD: "#0D1117",
  SURFACE: "#111620",
  BORDER: "rgba(255,255,255,0.08)",
  BORDER_B: "rgba(79,142,247,0.2)",
  BORDER_P: "rgba(124,92,252,0.2)",

  // Gradient trio (from logo)
  BLUE: "#4F8EF7",
  PURPLE: "#7C5CFC",
  PINK: "#F050AE",
  BLUE_DIM: "#2A5CB8",
  PURPLE_DIM: "#4A3699",
  PINK_DIM: "#8C2E67",

  // Text
  TEXT: "#F1F5F9",
  TEXT_SUB: "#94A3B8",
  TEXT_MID: "#64748B",

  // Status
  GREEN: "#22C55E",
  RED: "#EF4444",
};

export const SCENARIO_COLORS = ["#22C55E", "#EF4444", "#7C5CFC", "#4F8EF7"];

export const CATEGORY_META: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  all: { icon: "⚡", color: C.PURPLE, label: "All" },
  politics: { icon: "🏛", color: "#818CF8", label: "Politics" },
  economy: { icon: "📈", color: "#34D399", label: "Economy" },
  crypto: { icon: "₿", color: "#F7931A", label: "Crypto" },
  sports: { icon: "⚽", color: "#60A5FA", label: "Sports" },
  technology: { icon: "💻", color: "#A78BFA", label: "Tech" },
  geopolitics: { icon: "🌍", color: "#FB923C", label: "Global" },
};
