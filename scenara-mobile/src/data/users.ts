/**
 * src/data/users.ts — Shared synthetic user pool
 * ──────────────────────────────────────────────
 * Single source of truth for the 120-user ghost pool used across:
 *   • Leaderboard ghost entries (mirrors backend _GHOST_NAMED exactly)
 *   • Activity ticker player names
 *   • Sidebar live-comment names
 *
 * Names are realistic global handles — not trading-bot tropes.
 * All stats are deterministically derived from the display name so the
 * UI never flickers on re-render.  user_id is NEGATIVE (synthetic).
 */

export type PoolUser = {
  id: number;              // negative = synthetic
  displayName: string;
  balance: number;
  totalPnL: number;
  winRate: number;         // 0–100
  currentStreak: number;
  bestStreak: number;
  wonCount: number;
  lostCount: number;
  totalPredictions: number;
  level: number;
  xp: number;
  rankScore: number;
};

// ── Tiny deterministic LCG ───────────────────────────────────────────────────
function mkRng(seed: number) {
  let s = (seed ^ 0xDEADBEEF) & 0x7FFFFFFF;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) & 0x7FFFFFFF;
    return s / 0x7FFFFFFF;
  };
}
function nameHash(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i);
  return Math.abs(h);
}

// ── Named pool — mirrors backend accounts.py _GHOST_NAMED exactly ────────────
// [displayName, balance, totalPnL, winRate%, currentStreak]
// Rules: no two entries share the same base word; bases are disjoint from
// PROC_FIRST so the total pool never has more than 3 variants of any one name.
const NAMED_RAW: [string, number, number, number, number][] = [
  // North America
  ["luke_b",       14220,  4220, 70.0, 6],
  ["james_t",      11820,  1820, 61.2, 3],
  ["zack_m",        8910, -1090, 41.7, 0],
  ["haley.p",      11200,  1200, 58.9, 2],
  ["tyler.b",      10870,   870, 55.3, 1],
  // South America
  ["sofia_v",      13450,  3450, 68.5, 5],
  ["valentina97",  15780,  5780, 72.4, 7],
  ["gabo.r",       12100,  2100, 59.8, 2],
  ["fernanda_q",    9340,  -660, 44.1, 0],
  ["diogo_a",      13900,  3900, 66.7, 4],
  // Brazil
  ["beatriz_c",    12680,  2680, 63.0, 3],
  ["rodrigo77",    10540,   540, 52.4, 1],
  ["thais.o",      14050,  4050, 69.8, 5],
  ["caio88",        9720,  -280, 47.2, 0],
  ["isabela_m",     8430, -1570, 39.5, 0],
  // East Asia
  ["wei_y",        13100,  3100, 65.4, 4],
  ["xiu.l",        15600,  5600, 74.1, 8],
  ["yuna_j",       12340,  2340, 62.7, 3],
  ["kenji_h",      11490,  1490, 60.5, 2],
  ["ryo_k",        10050,    50, 50.8, 1],
  // Europe
  ["henrik_s",     11950,  1950, 59.2, 2],
  ["marco_g",      14510,  4510, 71.6, 6],
  ["britta.n",      9880,  -120, 48.9, 0],
  ["ulrika_e",     10660,   660, 54.0, 1],
  ["anya_f",       13670,  3670, 67.3, 5],
  // South & Southeast Asia
  ["priya_s",      14800,  4800, 71.0, 6],
  ["arjun_d",      13220,  3220, 66.0, 4],
  ["faisal_k",     12050,  2050, 61.5, 3],
  ["nadia.nz",     10780,   780, 54.8, 1],
  ["selin_r",       9560,  -440, 46.3, 0],
];

// ── Procedural pool ───────────────────────────────────────────────────────────
// Base-name pool: every entry is disjoint from the named-pool first-word bases,
// so no single base name ever appears more than 3 times in the full 120-user pool.
// Deliberately unusual — no common Western first-names (alex, jake, noah etc.).
// Mix of global, mythological, nature, and invented handles.
// Reddit-style adjective_noun handles — feel like real people picked the
// username themselves rather than synthetic firstname+suffix.
const PROC_FIRST = [
  "significant", "electric",  "midnight",   "careless",   "doomsday",
  "frozen",      "silent",    "velvet",     "crystal",    "neon",
  "coastal",     "glass",     "rust",       "amber",      "echo",
  "quiet",       "rapid",     "pixel",      "lunar",      "cosmic",
  "woven",       "paper",     "tangerine",  "ember",      "ivory",
  "twilight",    "marble",    "copper",     "sage",       "hollow",
];
const PROC_SUFFIX = [
  "_peach",     "_otter",     "_voyage",    "_whisper",   "_wallaby",
  "_pancake",   "_storm",     "_thunder",   "_horizon",   "_spider",
  "_drift",     "_helmet",    "_kingdom",   "_circuit",   "_pyramid",
  "_owl",       "_arrow",     "_harbor",    "_falcon",    "_parade",
  "_kettle",    "_garden",    "_glacier",   "_signal",    "_raven",
];

const PROC_COUNT = 90;

// Stride-7 interleave: consecutive indices pick different first-names AND
// varied suffixes.  gcd(7, 25) = 1 guarantees all 25 suffixes are visited
// before any repeats, so the 3 occurrences of each first-name use suffixes
// that are 10 and 20 positions apart — visually nothing alike.
// e.g. "alex" → alex_k / alex99 / alexpro across the full pool.
function procName(idx: number): string {
  const nFirst = PROC_FIRST.length;
  const nSuf   = PROC_SUFFIX.length;
  return `${PROC_FIRST[idx % nFirst]}${PROC_SUFFIX[(idx * 7) % nSuf]}`;
}

// ── Build the pool ───────────────────────────────────────────────────────────
const XP_BY_STREAK = [120, 200, 350, 500, 750, 900, 1100, 1400];

function buildUser(
  displayName: string, balance: number, totalPnL: number,
  winRate: number, currentStreak: number, id: number
): PoolUser {
  const rng = mkRng(nameHash(displayName));
  const bestStreak = currentStreak + Math.floor(rng() * 5);
  const totalPredictions = 20 + Math.floor(rng() * 120);
  const wonCount = Math.round(totalPredictions * (winRate / 100));
  const lostCount = totalPredictions - wonCount;
  const xpBase = XP_BY_STREAK[Math.min(currentStreak, XP_BY_STREAK.length - 1)];
  const xp = xpBase + Math.floor(rng() * 80);
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 50)));

  const volumeScore   = Math.min(totalPredictions * 8, 1000);
  const winRateScore  = winRate * 10;
  const activityScore = Math.min(currentStreak * 100, 1000);
  const streakScore   = Math.min(bestStreak * 50, 1000);
  const rankScore     = totalPnL * 0.45 + volumeScore * 0.20 + winRateScore * 0.20
                      + activityScore * 0.10 + streakScore * 0.05;

  return {
    id, displayName, balance, totalPnL, winRate, currentStreak, bestStreak,
    wonCount, lostCount, totalPredictions, level, xp, rankScore,
  };
}

function buildPool(): PoolUser[] {
  const users: PoolUser[] = [];

  NAMED_RAW.forEach(([name, bal, pnl, wr, streak], i) => {
    users.push(buildUser(name, bal, pnl, wr, streak, -(i + 1)));
  });

  for (let i = 0; i < PROC_COUNT; i++) {
    const name = procName(i);
    const rng  = mkRng(nameHash(name));
    const bal  = 7000 + Math.floor(rng() * 9000);
    const pnl  = Math.round((rng() * 2 - 0.5) * 4000);
    const wr   = 35 + Math.floor(rng() * 42);
    const str  = Math.floor(rng() * 8);
    users.push(buildUser(name, bal, pnl, wr, str, -(NAMED_RAW.length + i + 1)));
  }

  return users;
}

/** Full 120-user pool — sorted by rankScore descending. */
export const USER_POOL: PoolUser[] = buildPool().sort((a, b) => b.rankScore - a.rankScore);

export const USER_BY_NAME: ReadonlyMap<string, PoolUser> = new Map(
  USER_POOL.map(u => [u.displayName, u])
);

// ── Sidebar live-comment seed ─────────────────────────────────────────────────
const COMMENT_BODIES = [
  "just put $20 on Yes lol let's see",
  "been watching this one all week. finally moving",
  "nah the No side is way underpriced rn",
  "anyone else think the chart looks bullish?",
  "lost my last bet here but I still think Yes",
  "the market moved 12% in 2h... insane",
  "waiting for more info before I commit",
  "already up 40% this week on these markets",
  "is this safe to bet on? first time here",
  "people sleeping on the No side here imo",
  "this aged well lmao called it yesterday",
  "added more at 34%, feels like easy money",
  "honestly surprised how accurate these odds are",
  "anyone know when this resolves?",
  "diversifying across 5 markets today, no all-in",
  "chart says Yes but gut says No",
];

export const SIDEBAR_SEED: Array<{ uid: number; name: string; body: string }> = USER_POOL
  .slice(0, COMMENT_BODIES.length)
  .map((u, i) => ({ uid: -u.id, name: u.displayName, body: COMMENT_BODIES[i] }));

// ── Activity ticker fallback ─────────────────────────────────────────────────
export type FallbackActivity = {
  player: string; event_title: string; scenario_title: string;
  amount_label: string; seconds_ago: number;
};

const FALLBACK_EVENTS = [
  { event: "Bitcoin above $100k by June?",    scenario: "Yes" },
  { event: "Brazil wins Copa América?",         scenario: "Yes" },
  { event: "US rate cut this quarter?",         scenario: "No"  },
  { event: "ChatGPT retains top AI spot?",      scenario: "Yes" },
  { event: "USD/BRL above 5.80 by Dec?",        scenario: "No"  },
  { event: "Next iPhone release before Oct?",   scenario: "Yes" },
  { event: "Tesla stock above $300?",           scenario: "Yes" },
  { event: "EU recession confirmed?",           scenario: "No"  },
  { event: "Ethereum above $4k by Q3?",         scenario: "Yes" },
  { event: "Argentina inflation above 100%?",   scenario: "Yes" },
];

export const FALLBACK_ACTIVITY: FallbackActivity[] = USER_POOL.slice(0, 14).map((u, i) => {
  const ev  = FALLBACK_EVENTS[i % FALLBACK_EVENTS.length];
  const rng = mkRng(nameHash(u.displayName) ^ i);
  const amount = 10 + Math.floor(rng() * 190);
  return {
    player:         u.displayName,
    event_title:    ev.event,
    scenario_title: ev.scenario,
    amount_label:   `$${amount}`,
    seconds_ago:    30 + Math.floor(rng() * 3600),
  };
});
