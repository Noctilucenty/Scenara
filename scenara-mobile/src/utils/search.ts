/**
 * src/utils/search.ts — Market search & filter utility
 * ──────────────────────────────────────────────────────
 * Single implementation used across the markets tab, search overlay, and
 * any future screen that needs to filter markets.
 *
 * Filters by (case-insensitive, any field match):
 *   title, description, category, topic, country/region, tags
 */

type Searchable = {
  title: string;
  title_pt?: string | null;
  title_zh?: string | null;
  description?: string | null;
  description_pt?: string | null;
  description_zh?: string | null;
  category?: string | null;
  topic?: string | null;
  country?: string | null;
  region?: string | null;
  tags?: string[] | null;
};

/**
 * Returns true if `market` matches the given `query` string.
 * An empty query always matches.
 */
export function matchesQuery<T extends Searchable>(market: T, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const fields: (string | null | undefined)[] = [
    market.title,
    market.title_pt,
    market.title_zh,
    market.description,
    market.description_pt,
    market.description_zh,
    market.category,
    market.topic,
    market.country,
    market.region,
    ...(market.tags ?? []),
  ];

  return fields.some(f => f && f.toLowerCase().includes(q));
}

/**
 * Filter a list of markets by both search query and category.
 *
 * @param markets  - Full list of market objects
 * @param query    - Free-text search string (empty = no filter)
 * @param category - Category key string (e.g. "crypto") or "all" / "" = no filter
 */
export function filterMarkets<T extends Searchable & { category?: string | null }>(
  markets: T[],
  query: string,
  category: string
): T[] {
  const activeCategory = category && category !== "all" ? category.toLowerCase() : "";

  return markets.filter(m => {
    if (activeCategory && (m.category ?? "").toLowerCase() !== activeCategory) return false;
    return matchesQuery(m, query);
  });
}

/**
 * Highlight ranges within a string that match `query`.
 * Returns an array of { text, highlight } segments for rendering.
 * Useful for bolding matched text in result rows.
 */
export function highlightSegments(
  text: string,
  query: string
): Array<{ text: string; highlight: boolean }> {
  if (!query.trim()) return [{ text, highlight: false }];
  const q = query.trim().toLowerCase();
  const results: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  const lower = text.toLowerCase();
  let idx = lower.indexOf(q, cursor);
  while (idx !== -1) {
    if (idx > cursor) results.push({ text: text.slice(cursor, idx), highlight: false });
    results.push({ text: text.slice(idx, idx + q.length), highlight: true });
    cursor = idx + q.length;
    idx = lower.indexOf(q, cursor);
  }
  if (cursor < text.length) results.push({ text: text.slice(cursor), highlight: false });
  return results;
}
