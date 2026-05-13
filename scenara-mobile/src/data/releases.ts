/**
 * src/data/releases.ts — typed release notes powering the in-app /releases route
 *
 * Mirrors CHANGELOG.md at the repo root.  Keep the two in sync — the markdown
 * file is what GitHub readers see, the array below is what the app renders.
 *
 * Convention:
 *   - newest release first
 *   - kind controls the bullet colour + emoji prefix in the UI
 *   - keep blurbs short and user-facing; technical detail belongs in the commit
 */

export type ChangeKind = "new" | "improved" | "fixed" | "removed" | "security" | "perf";

export type ChangeItem = {
  kind: ChangeKind;
  text: string;
};

export type Release = {
  version: string;          // e.g. "0.7.0"
  date: string;             // ISO 8601 (YYYY-MM-DD)
  headline: string;         // single-line marketing line
  summary?: string;         // optional 1-2 sentence paragraph below the headline
  changes: ChangeItem[];
};

export const RELEASES: Release[] = [
  // ── 0.7.0 ────────────────────────────────────────────────────────────────
  {
    version: "0.7.0",
    date: "2026-05-13",
    headline: "Polymarket migration",
    summary:
      "Scenara now sources real prediction markets from Polymarket instead of hand-crafted templates. Every market you see is something the world is actually betting on.",
    changes: [
      { kind: "new",      text: "Polymarket integration as Scenara's sole market source — public Gamma API, no auth, no real money. Scenara stays a simulation." },
      { kind: "new",      text: "/events/trending endpoint — top open markets sorted by Polymarket trading volume." },
      { kind: "new",      text: "Position-opened modal — centered overlay with spring-scaled checkmark after every successful prediction." },
      { kind: "new",      text: "Market hero images — image_url ingested from Polymarket on every sync." },
      { kind: "new",      text: "/admin/purge-legacy-events — manual trigger for the legacy event cleanup." },
      { kind: "improved", text: "Polymarket sync cadence dropped 60 → 20 minutes. Probabilities feel live without hammering the API." },
      { kind: "improved", text: "_expire_old_events now runs after every Polymarket sync, automatically refunding open predictions on past-due markets." },
      { kind: "fixed",    text: "Silent random-walk bug: the old snapshot loop was overwriting real Polymarket probabilities with Gaussian noise every 5 min. Removed." },
      { kind: "fixed",    text: "Legacy events showing in trending — /events/ and /events/trending now filter to Polymarket-sourced by default." },
      { kind: "fixed",    text: "Legacy-event purge safety gate — moved out of startup migrations into the sync loop so the gate works correctly." },
      { kind: "removed",  text: "2,360+ lines of event_generator.py — STATIC_EVENTS templates, crypto generator, snapshot nudger. Replaced by a thin compat shim." },
      { kind: "removed",  text: "news_market_generator.py (324 lines) — dead Groq-LLM market generator, never imported." },
    ],
  },

  // ── 0.6.5 ────────────────────────────────────────────────────────────────
  {
    version: "0.6.5",
    date: "2026-05-12",
    headline: "News revamp",
    summary:
      "The News tab is now pure breaking news. Worldwide coverage for every UI language, real images, zero clutter.",
    changes: [
      { kind: "new",      text: "News tab is news-only — markets removed entirely; they have their own tab. ~282 lines deleted from news.tsx." },
      { kind: "new",      text: "Image fallback chain: article image → category stock photo → source favicon → placeholder. Cards always show something meaningful." },
      { kind: "new",      text: "Source favicon overlay — every news card shows the publisher's logo (BBC, NBC, etc.) as a small badge over the hero." },
      { kind: "improved", text: "Worldwide queries for all UI languages — PT users no longer get Brazil-only news, ZH users no longer get China-only news." },
      { kind: "fixed",    text: "News tab showing markets when news loaded empty — old layout put markets above news, making slow news look like a markets list." },
    ],
  },

  // ── 0.6.4 ────────────────────────────────────────────────────────────────
  {
    version: "0.6.4",
    date: "2026-05-11",
    headline: "Translation overhaul",
    summary:
      "Swapped Google Cloud Translation for the keyless, free MyMemory API. No billing card, no quota anxiety, no log spam.",
    changes: [
      { kind: "new",      text: "MyMemory translation service — keyless, free up to 50K words/day with an optional contact email." },
      { kind: "new",      text: "Circuit breaker — after 5 translation failures in 60s, all calls pause for 10 minutes. Auto-recovers when service is healthy again." },
      { kind: "fixed",    text: "Infinite-loop bug in ZH backfill: when the API was down, the same 50 rows matched 'WHERE title_zh IS NULL' forever, generating 3 failed calls/sec indefinitely." },
      { kind: "fixed",    text: "Server crash on startup — missing Query import in predictions.py after the batch sentiment refactor." },
      { kind: "security", text: "API key leak scrubbed from error logs — httpx errors no longer include the request URL with ?key=… query params." },
    ],
  },

  // ── 0.6.3 ────────────────────────────────────────────────────────────────
  {
    version: "0.6.3",
    date: "2026-05-10",
    headline: "Performance round",
    summary:
      "Cut ~28 HTTP round-trips per page load by batching what used to be parallel-fanout requests. Free-tier hosting feels much snappier.",
    changes: [
      { kind: "perf",     text: "/events/history/batch?ids=… — single endpoint replaces up to 20 parallel history calls. 60s server-side cache." },
      { kind: "perf",     text: "/predictions/events/sentiment/batch?ids=… — same treatment for sentiment data." },
      { kind: "perf",     text: "Database egress cut ~70–80% — Polymarket events use less bandwidth than the LLM-summarized template events that came before." },
      { kind: "improved", text: "EventListOut slim schema — list responses omit long description fields (~40% smaller JSON). Detail endpoint still returns full payload." },
      { kind: "improved", text: "ZH translation gated by lang=zh — backfill no longer fires on English/Portuguese requests." },
    ],
  },

  // ── 0.6.2 ────────────────────────────────────────────────────────────────
  {
    version: "0.6.2",
    date: "2026-05-09",
    headline: "Cold-start resilience",
    summary:
      "Survived a real production incident (Neon data-transfer quota exceeded). Backend now starts gracefully even when the DB is unreachable.",
    changes: [
      { kind: "new",      text: "Resilient startup — DB migrations wrapped in try/except. Server boots even when the DB is down; only DB-backed endpoints return 503." },
      { kind: "new",      text: "3-attempt retry loop on markets load — shows 'Server waking up…' / 'Still warming up…' / 'One last try…' during retries. Total patience ≈ 60s." },
      { kind: "fixed",    text: "'Failed to load markets' on cold server — Render free-tier wakes in 30–60s, but the old retry waited only 12s." },
      { kind: "fixed",    text: "Two-round-trip window function replaced with a single ORDER BY query + Python-side round-robin interleaving." },
      { kind: "perf",     text: "Events cache TTL raised 30s → 120s. Warm-server repeat loads almost never touch the DB." },
    ],
  },

  // ── 0.6.1 ────────────────────────────────────────────────────────────────
  {
    version: "0.6.1",
    date: "2026-05-08",
    headline: "Charts & data integrity",
    summary:
      "Probability charts now render immediately on fresh databases — no more empty boxes for the first 10 minutes.",
    changes: [
      { kind: "new",      text: "History backfill on first sync — every scenario with <2 points gets 5 deterministic synthetic points spread over the past hour." },
      { kind: "fixed",    text: "Empty-array truthiness cache bug — once frontend cached 'no history' it never refetched. Now refetches whenever data is too sparse to render." },
      { kind: "fixed",    text: "Live stats bar showing $0 / 0 traders briefly — added localStorage cache + cold-start defaults." },
    ],
  },

  // ── 0.6.0 ────────────────────────────────────────────────────────────────
  {
    version: "0.6.0",
    date: "2026-05-07",
    headline: "Public launch",
    summary: "First version deployed at scenara.vercel.app with full simulation features.",
    changes: [
      { kind: "new",      text: "Time-of-day trader curve — simulated count peaks at 14:00 (1,800) and dips at ~02:00 (400) following a cosine envelope." },
      { kind: "new",      text: "Admin real-stats — admin accounts see real DB counts in the live-stats bar; everyone else sees simulated." },
      { kind: "new",      text: "Migrated to Render Postgres — replaced Neon (data-transfer quota issues) with Render's internal Postgres." },
      { kind: "improved", text: "Render-internal DATABASE_URL — backend talks to Postgres over the private network. Zero public-internet egress." },
      { kind: "new",      text: "120-user ghost pool — Reddit-style realistic handles populate leaderboards, activity ticker, sidebar comments." },
    ],
  },
];
