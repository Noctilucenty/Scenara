// src/theme.ts — Scenara brand tokens + shared utilities
// ─────────────────────────────────────────────────────────────────────────────
// REPLACES scattered color constants in index.tsx, market-detail.tsx,
// portfolio.tsx, leaderboard.tsx — import C.* from here instead.

// ── Color tokens ──────────────────────────────────────────────────────────────

export const C = {
  BG:      "#08090C",
  CARD:    "#0D1117",
  SURFACE: "#111620",

  BORDER:   "rgba(255,255,255,0.08)",
  BORDER_B: "rgba(79,142,247,0.2)",
  BORDER_P: "rgba(124,92,252,0.2)",

  // Brand gradient trio (matches logo)
  BLUE:   "#4F8EF7",
  PURPLE: "#7C5CFC",
  PINK:   "#F050AE",

  // Dimmed variants
  BLUE_DIM:   "#2A5CB8",
  PURPLE_DIM: "#4A3699",
  PINK_DIM:   "#8C2E67",

  // Text hierarchy
  TEXT:     "#F1F5F9",
  TEXT_SUB: "#94A3B8",
  TEXT_MID: "#64748B",

  // Status
  GREEN: "#22C55E",
  RED:   "#EF4444",
} as const;

// ── Gradient presets ──────────────────────────────────────────────────────────

export const GRAD = {
  BRAND: [C.BLUE, C.PURPLE, C.PINK]         as const,
  BP:    [C.BLUE, C.PURPLE]                  as const,
  PP:    [C.PURPLE, C.PINK]                  as const,
  GREEN: ["#15803D", C.GREEN]                as const,
  RED:   ["#991B1B", C.RED]                  as const,
  CARD:  ["rgba(79,142,247,0.07)", "rgba(124,92,252,0.03)"] as const,
};

// ── Scenario + category metadata ──────────────────────────────────────────────

export const SCENARIO_COLORS = [
  "#22C55E", // green  — YES / WIN
  "#EF4444", // red    — NO  / LOSE
  "#7C5CFC", // purple
  "#4F8EF7", // blue
  "#F7931A", // orange
  "#C084FC", // violet
] as const;

export const CATEGORY_META: Record<string, { icon: string; color: string; label: string; label_pt: string }> = {
  all:           { icon: "⚡", color: C.PURPLE,    label: "All",           label_pt: "Todos"         },
  brazil:        { icon: "🇧🇷", color: "#009C3B",   label: "Brazil",        label_pt: "Brasil"        },
  politics:      { icon: "🏛",  color: "#818CF8",   label: "Politics",      label_pt: "Política"      },
  economy:       { icon: "📈", color: "#34D399",   label: "Economy",       label_pt: "Economia"      },
  crypto:        { icon: "₿",  color: "#F7931A",   label: "Crypto",        label_pt: "Cripto"        },
  sports:        { icon: "⚽", color: "#60A5FA",   label: "Sports",        label_pt: "Esportes"      },
  technology:    { icon: "💻", color: "#A78BFA",   label: "Tech",          label_pt: "Tecnologia"    },
  geopolitics:   { icon: "🌍", color: "#FB923C",   label: "Global",        label_pt: "Geopolítica"   },
  entertainment: { icon: "🎬", color: "#F472B6",   label: "Entertainment", label_pt: "Entretenimento"},
  music:         { icon: "🎵", color: "#C084FC",   label: "Music",         label_pt: "Música"        },
  tv:            { icon: "📺", color: "#22D3EE",   label: "TV",            label_pt: "TV"            },
  science:       { icon: "🔬", color: "#86EFAC",   label: "Science",       label_pt: "Ciência"       },
  weather:       { icon: "🌦",  color: "#7DD3FC",   label: "Weather",       label_pt: "Clima"         },
};

export function catMeta(c: string) {
  return CATEGORY_META[c] ?? { icon: "◈", color: C.PURPLE, label: c, label_pt: c };
}

// ── CategoryCountBadge stub — actual JSX component lives in components/Badges.tsx
// This export satisfies imports from @/src/theme without JSX in a .ts file
export type CategoryCountBadgeProps = { count: number; color: string };

// ── Performance grade (port from Claude's lib/utils.ts) ───────────────────────
// Used in portfolio screen to give players an identity label.
// This is the single most important retention feature — players return
// to improve their grade ("Elite Predictor" is the hook).

export type Grade = {
  label:    string;
  label_pt: string;
  color:    string;
  emoji:    string;
};

export function getGrade(accuracyScore: number): Grade {
  if (accuracyScore >= 80) return {
    label: "Elite Predictor", label_pt: "Preditor de Elite",
    color: "#F7931A", emoji: "👑",
  };
  if (accuracyScore >= 65) return {
    label: "Sharp",           label_pt: "Afiado",
    color: C.GREEN,  emoji: "⚡",
  };
  if (accuracyScore >= 50) return {
    label: "Average",         label_pt: "Mediano",
    color: C.BLUE,   emoji: "📈",
  };
  return {
    label: "Needs Work",      label_pt: "Precisa Melhorar",
    color: C.TEXT_MID, emoji: "🎯",
  };
}

// ── Time utilities ────────────────────────────────────────────────────────────

/**
 * timeUntil — "3d 2h left" / "Closed"
 * Use on market cards to show countdown urgency.
 * Countdown is one of the strongest conversion drivers on prediction platforms.
 */
export function timeUntil(dateStr?: string | null, lang: "en" | "pt" = "en"): string {
  if (!dateStr) return "";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return lang === "pt" ? "Encerrado" : "Closed";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return lang === "pt" ? `${d}d ${h}h restam` : `${d}d ${h}h left`;
  if (h > 0) return lang === "pt" ? `${h}h ${m}m restam` : `${h}h ${m}m left`;
  return lang === "pt" ? `${m}m restam` : `${m}m left`;
}

/**
 * timeAgo — "3m ago" / "2h ago"
 * Unified across all screens. Accepts optional t (i18n) object.
 */
export function timeAgo(dateStr?: string | null, t?: any): string {
  if (!dateStr) return "";
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (!t) {
    if (s < 60)    return "just now";
    if (s < 3_600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400)return `${Math.floor(s / 3_600)}h ago`;
    return `${Math.floor(s / 86_400)}d ago`;
  }
  if (s < 60)    return t.common.justNow;
  if (s < 3_600) return t.common.mAgo(Math.floor(s / 60));
  if (s < 86_400)return t.common.hAgo(Math.floor(s / 3_600));
  return t.common.dAgo(Math.floor(s / 86_400));
}

// ── Number formatters ─────────────────────────────────────────────────────────

/**
 * formatBalance — "$10,000"
 */
export function formatBalance(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("en-US", {
    style:                 "currency",
    currency:              "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * formatPnl — "+$1,234" / "-$456"
 * Always shows explicit sign. Use everywhere P&L is shown.
 * Centralizing this prevents sign display bugs scattered in JSX.
 */
export function formatPnl(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  const sign = num >= 0 ? "+" : "";
  return `${sign}${formatBalance(num)}`;
}

/**
 * formatMultiplier — "2.50x"
 */
export function formatMultiplier(prob: number): string {
  if (prob <= 0) return "∞x";
  return `${(100 / prob).toFixed(2)}x`;
}

/**
 * estimatedPayout — given amount + scenario probability
 */
export function estimatedPayout(amount: number, probability: number): number {
  if (probability <= 0) return 0;
  return amount * (100 / probability);
}

/**
 * estimatedProfit — payout minus stake
 */
export function estimatedProfit(amount: number, probability: number): number {
  return estimatedPayout(amount, probability) - amount;
}

// ── Streak helpers ────────────────────────────────────────────────────────────

export function streakEmoji(n: number): string {
  if (n >= 10) return "🔥🔥🔥";
  if (n >= 7)  return "🔥🔥";
  if (n >= 5)  return "🔥";
  if (n >= 3)  return "⚡";
  if (n >= 1)  return "✦";
  return "";
}

export function streakLabel(n: number, t: any): string {
  if (n >= 10) return t.portfolio.streak.unstoppable;
  if (n >= 7)  return t.portfolio.streak.onFire;
  if (n >= 5)  return t.portfolio.streak.hotStreak;
  if (n >= 3)  return t.portfolio.streak.streak;
  if (n >= 1)  return t.portfolio.streak.winning;
  return "";
}