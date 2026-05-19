// src/theme.ts â€” Scenara brand tokens + shared utilities
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// REPLACES scattered color constants in index.tsx, market-detail.tsx,
// portfolio.tsx, leaderboard.tsx â€” import C.* from here instead.

// â”€â”€ Color tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Gradient presets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const GRAD = {
  BRAND: [C.BLUE, C.PURPLE, C.PINK]         as const,
  BP:    [C.BLUE, C.PURPLE]                  as const,
  PP:    [C.PURPLE, C.PINK]                  as const,
  GREEN: ["#15803D", C.GREEN]                as const,
  RED:   ["#991B1B", C.RED]                  as const,
  CARD:  ["rgba(79,142,247,0.07)", "rgba(124,92,252,0.03)"] as const,
};

// â”€â”€ Scenario + category metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const SCENARIO_COLORS = [
  "#22C55E", // green  â€” YES / WIN
  "#EF4444", // red    â€” NO  / LOSE
  "#7C5CFC", // purple
  "#4F8EF7", // blue
  "#F7931A", // orange
  "#C084FC", // violet
] as const;

export const CATEGORY_META: Record<string, { icon: string; color: string; label: string; label_pt: string; label_zh: string }> = {
  all:           { icon: "ALL", color: C.PURPLE,  label: "All",           label_pt: "Todos",          label_zh: "全部" },
  brazil:        { icon: "BR",  color: "#009C3B", label: "Brazil",        label_pt: "Brasil",         label_zh: "巴西" },
  politics:      { icon: "POL", color: "#818CF8", label: "Politics",      label_pt: "Política",       label_zh: "政治" },
  economy:       { icon: "ECO", color: "#34D399", label: "Economy",       label_pt: "Economia",       label_zh: "经济" },
  crypto:        { icon: "₿",   color: "#F7931A", label: "Crypto",        label_pt: "Cripto",         label_zh: "加密" },
  sports:        { icon: "SPT", color: "#60A5FA", label: "Sports",        label_pt: "Esportes",       label_zh: "体育" },
  technology:    { icon: "TEC", color: "#A78BFA", label: "Tech",          label_pt: "Tecnologia",     label_zh: "科技" },
  geopolitics:   { icon: "WLD", color: "#FB923C", label: "Global",        label_pt: "Geopolítica",    label_zh: "全球" },
  entertainment: { icon: "ENT", color: "#F472B6", label: "Entertainment", label_pt: "Entretenimento", label_zh: "娱乐" },
  music:         { icon: "MUS", color: "#C084FC", label: "Music",         label_pt: "Música",        label_zh: "音乐" },
  tv:            { icon: "TV",  color: "#22D3EE", label: "TV",            label_pt: "TV",             label_zh: "电视" },
  science:       { icon: "SCI", color: "#86EFAC", label: "Science",       label_pt: "Ciência",        label_zh: "科学" },
  weather:       { icon: "WTH", color: "#7DD3FC", label: "Weather",       label_pt: "Clima",          label_zh: "天气" },
  elections:     { icon: "ELE", color: "#6366F1", label: "Elections",     label_pt: "Eleições",       label_zh: "选举" },
  finance:       { icon: "FIN", color: "#10B981", label: "Finance",       label_pt: "Finanças",       label_zh: "金融" },
  esports:       { icon: "ESP", color: "#2DD4BF", label: "Esports",       label_pt: "Esports",        label_zh: "电竞" },
  culture:       { icon: "CUL", color: "#FB7185", label: "Culture",       label_pt: "Cultura",        label_zh: "文化" },
  mentions:      { icon: "MEN", color: "#FBBF24", label: "Mentions",      label_pt: "Menções",        label_zh: "言论" },
};

export function catMeta(c: string) {
  return CATEGORY_META[c] ?? { icon: "◈", color: C.PURPLE, label: c, label_pt: c, label_zh: c };
}

// â”€â”€ CategoryCountBadge stub â€” actual JSX component lives in components/Badges.tsx
// This export satisfies imports from @/src/theme without JSX in a .ts file
export type CategoryCountBadgeProps = { count: number; color: string };

// â”€â”€ Performance grade (port from Claude's lib/utils.ts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Used in portfolio screen to give players an identity label.
// This is the single most important retention feature â€” players return
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
    color: "#F7931A", emoji: "★",
  };
  if (accuracyScore >= 65) return {
    label: "Sharp",           label_pt: "Afiado",
    color: C.GREEN,  emoji: "◆",
  };
  if (accuracyScore >= 50) return {
    label: "Average",         label_pt: "Mediano",
    color: C.BLUE,   emoji: "▲",
  };
  return {
    label: "Needs Work",      label_pt: "Precisa Melhorar",
    color: C.TEXT_MID, emoji: "●",
  };
}

// â”€â”€ Time utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * timeUntil â€” "3d 2h left" / "Closed"
 * Use on market cards to show countdown urgency.
 * Countdown is one of the strongest conversion drivers on prediction platforms.
 */
export function timeUntil(dateStr?: string | null, lang: "en" | "pt" | "zh" = "en"): string {
  if (!dateStr) return "";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return lang === "pt" ? "Encerrado" : lang === "zh" ? "已结束" : "Closed";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return lang === "pt" ? `${d}d ${h}h restam` : lang === "zh" ? `剩余 ${d}天 ${h}小时` : `${d}d ${h}h left`;
  if (h > 0) return lang === "pt" ? `${h}h ${m}m restam` : lang === "zh" ? `剩余 ${h}小时 ${m}分钟` : `${h}h ${m}m left`;
  return lang === "pt" ? `${m}m restam` : lang === "zh" ? `剩余 ${m}分钟` : `${m}m left`;
}

/**
 * timeAgo â€” "3m ago" / "2h ago"
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

// â”€â”€ Number formatters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * formatBalance â€” "$10,000"
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
 * formatPnl â€” "+$1,234" / "-$456"
 * Always shows explicit sign. Use everywhere P&L is shown.
 * Centralizing this prevents sign display bugs scattered in JSX.
 */
export function formatPnl(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  const sign = num >= 0 ? "+" : "";
  return `${sign}${formatBalance(num)}`;
}

/**
 * formatMultiplier â€” "2.50x"
 */
export function formatMultiplier(prob: number): string {
  if (prob <= 0) return "âˆžx";
  return `${(100 / prob).toFixed(2)}x`;
}

/**
 * estimatedPayout â€” given amount + scenario probability
 */
export function estimatedPayout(amount: number, probability: number): number {
  if (probability <= 0) return 0;
  return amount * (100 / probability);
}

/**
 * estimatedProfit â€” payout minus stake
 */
export function estimatedProfit(amount: number, probability: number): number {
  return estimatedPayout(amount, probability) - amount;
}

// â”€â”€ Streak helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function streakEmoji(n: number): string {
  if (n >= 10) return "★★★";
  if (n >= 7)  return "★★";
  if (n >= 5)  return "★";
  if (n >= 3)  return "◆";
  if (n >= 1)  return "▲";
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