# Changelog

All notable changes to **Scenara** — the zero-risk prediction-market simulation.

The format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/). Versions before `0.7.0` are reconstructed from git history.

---

## [0.7.0] — 2026-05-13 · Polymarket migration

> Scenara now sources real prediction markets from Polymarket instead of hand-crafted templates. Every market you see is something the world is actually betting on.

### ✨ New
- **Polymarket integration** as Scenara's sole market source. Public Gamma API, no auth required, no real money involved — Scenara stays a simulation.
- **`/events/trending` endpoint** — open markets sorted by Polymarket trading volume.
- **Position-opened modal** — centered overlay with spring-scaled checkmark appears after every successful prediction. Auto-dismisses after 2.5s or tap to dismiss.
- **Market hero images** — `image_url` field added to events; ingested from Polymarket on every sync.
- **`/admin/purge-legacy-events`** — manual trigger for the legacy event cleanup.

### 🛠 Improved
- **Polymarket sync cadence** dropped from 60 min → **20 min**. Probabilities feel live without hammering the public API.
- **`_expire_old_events`** moved into `polymarket_sync` and now runs on every sync pass, automatically refunding open predictions on past-due markets.

### 🐛 Fixed
- **Silent random-walk bug** — the deleted `_snapshot_open_events` was overwriting real Polymarket probabilities with Gaussian noise every 5 min. Removed entirely.
- **Legacy events showing in trending** — `/events/` and `/events/trending` now filter to `external_source = 'polymarket'` by default. An `?include_legacy=true` escape hatch exists for debugging.
- **Legacy purge safety gate** — moved out of startup migrations (where the Polymarket count was always 0) into the sync loop where the count is fresh.

### 🗑 Removed
- **2,360+ lines of `event_generator.py`** — `STATIC_EVENTS` templates, `_generate_crypto_events`, `_insert_event`, `_snapshot_open_events`, `run_event_generator`. Kept as a thin compat shim so old import paths keep working.
- **`news_market_generator.py`** — 324 lines of dead Groq-LLM market generator, never imported.

---

## [0.6.5] — 2026-05-12 · News revamp

> The News tab is now pure breaking news. Worldwide coverage for every UI language, real images, and zero clutter.

### ✨ New
- **News tab is news-only** — markets removed entirely; they live in their own tab. ~282 lines deleted from `news.tsx`.
- **Image fallback chain** — article image → category stock photo → source favicon → placeholder. Cards always show something meaningful.
- **Source favicon overlay** — each news card shows the publisher's logo (BBC, NBC, etc.) as a small badge over the hero image.

### 🛠 Improved
- **Worldwide queries for all languages** — PT users no longer get Brazil-only news, ZH users no longer get China-only news. Headline language stays per-locale, but the search keywords are globally scoped.

### 🐛 Fixed
- **News tab showing markets when news loaded empty** — the old conditional rendering put markets above news, making a slow news fetch look like the entire tab had turned into a markets list.

---

## [0.6.4] — 2026-05-11 · Translation overhaul

> Swapped Google Cloud Translation for the keyless, free MyMemory API. No billing card, no quota anxiety, no log spam.

### ✨ New
- **MyMemory translation service** (`translate.py`) — keyless, free up to 50K words/day with an optional contact email.
- **Circuit breaker** — after 5 translation failures in 60s, all calls pause for 10 minutes. Auto-recovers when service is healthy again.

### 🐛 Fixed
- **Infinite-loop bug in ZH backfill** — when the Translate API was down, the same 50 rows matched `WHERE title_zh IS NULL` forever, generating ~3 failed API calls per second indefinitely. Now detects two no-progress batches in a row and aborts cleanly with a clear error.
- **Server crash on startup** — missing `Query` import in `predictions.py` after the batch sentiment refactor. Container was crash-looping for several deploys.

### 🔒 Security
- **API key leak scrubbed from error logs** — `httpx.HTTPStatusError.__str__()` includes the request URL with `?key=...` query params. Error logging now records only the status code, never the URL.

---

## [0.6.3] — 2026-05-10 · Performance round

> Cut ~28 HTTP round-trips per page load by batching what used to be parallel-fanout requests. Free-tier hosting feels much snappier.

### ⚡ Performance
- **`/events/history/batch?ids=1,2,3`** — single endpoint replaces up to 20 parallel `/events/{id}/history` calls. 60s server-side cache.
- **`/predictions/events/sentiment/batch?ids=1,2,3`** — same treatment for sentiment data.
- **Database egress cut ~70–80%** — Polymarket events use less bandwidth than the LLM-summarized template events that came before, plus the new caches absorb repeat hits.

### 🛠 Improved
- **`EventListOut` slim schema** — `/events/` list responses omit long description fields (~40% smaller JSON). Detail endpoint still returns the full payload.
- **ZH translation gated by `lang=zh` requests** — backfill no longer fires on every English / Portuguese list response.

---

## [0.6.2] — 2026-05-09 · Cold-start resilience

> Survived a real production incident: Neon data-transfer quota exceeded. Backend now starts gracefully even when the DB is unreachable.

### ✨ New
- **Resilient startup** — DB migrations are wrapped in try/except. Server boots even when the database is down; only DB-backed endpoints return 503.
- **3-attempt retry loop on markets load** — replaces the single 12s retry. Shows "Server waking up…" / "Still warming up…" / "One last try…" messages during retries. Total patience ≈ 60s.

### 🐛 Fixed
- **"Failed to load markets" on cold server** — Render free-tier wakes in 30–60s, but the old retry waited only 12s. Now patient enough to cover the realistic cold-start window.
- **Two-round-trip window function** — `list_events` for "all" categories used `ROW_NUMBER() OVER (PARTITION BY category)` + a second query. Replaced with a single `ORDER BY` query + Python-side round-robin interleaving.

### ⚡ Performance
- **Events cache TTL raised** from 30s → 120s. Warm-server repeat loads almost never touch the DB.

---

## [0.6.1] — 2026-05-08 · Charts & data integrity

> Probability charts now render immediately on fresh databases, no more empty boxes for the first 10 minutes.

### ✨ New
- **History backfill on first sync** — every scenario with fewer than 2 history points gets 5 deterministic synthetic points spread over the past hour. Charts render the moment markets load.

### 🐛 Fixed
- **Empty-array truthiness cache bug** — `if (!cache[key])` returned `false` for cached empty arrays, so once the frontend cached "no history" it never refetched. Now refetches whenever cached data is too sparse to render a chart.
- **Live stats bar showing $0 / 0 traders briefly** — added localStorage cache + cold-start defaults.

---

## [0.6.0] — 2026-05-07 · Public launch

> First version deployed at scenara.vercel.app with full simulation features.

### ✨ New
- **Time-of-day trader curve** — simulated trader count peaks at 14:00 local (1,800) and dips at ~02:00 (400), following a cosine envelope.
- **Admin real-stats** — admin accounts see real DB counts in the live-stats bar; everyone else sees simulated.
- **Migrated to Render Postgres** — replaced Neon (data-transfer quota issues) with Render's internal Postgres.
- **Render-internal `DATABASE_URL`** — backend talks to Postgres over Render's private network. Zero public-internet egress.
- **120-user ghost pool** — Reddit-style realistic global handles populate leaderboards, activity ticker, and sidebar comments.
