// Async, memoized loader for the full journal dataset.
//
// Purpose: keep `data/journals.ts` (~5k lines, ~150kB raw) out of the
// initial JS bundle. Direct imports — `import journals from '@/data/journals'`
// — bake the dataset into whatever chunk imports it, and several client
// components were importing it eagerly. We now route every client access
// through this loader, which uses a dynamic `import()` so Next splits the
// dataset into its own chunk that downloads only when first used.
//
// Memoization: callers can fire many times; the promise is created once
// and reused. Subsequent calls resolve from the in-memory cache.

import type { Journal } from '@/types/interfaces';

let cached: Promise<readonly Journal[]> | null = null;

/**
 * Returns the full journal list. The first call triggers a dynamic import
 * (separate chunk). Subsequent calls share the same promise, so the data
 * is fetched at most once per page lifetime.
 */
export function loadJournals(): Promise<readonly Journal[]> {
  if (!cached) {
    cached = import('@/data/journals').then(
      (m) => m.default as readonly Journal[],
    );
  }
  return cached;
}

/**
 * Lookup by ISSN — async because the data fetch may not have happened yet.
 * Returns undefined if no journal with that ISSN exists in the dataset.
 */
export async function getJournalByIssn(
  issn: string,
): Promise<Journal | undefined> {
  const list = await loadJournals();
  return list.find((j) => j.issn === issn);
}

/**
 * Map a list of ISSNs to their full Journal records, dropping unknowns.
 * Replaces the previous synchronous `mapIssnsToJournals`.
 */
export async function mapIssnsToJournalsAsync(
  issns: string[],
): Promise<Journal[]> {
  const list = await loadJournals();
  const byIssn = new Map(list.map((j) => [j.issn, j]));
  return issns.map((i) => byIssn.get(i)).filter((j): j is Journal => !!j);
}

/**
 * Count how many journals match the given category / domain filter.
 * Empty filter arrays mean "no filter on that axis" — the original
 * FilterPanel.getEconJournalCount semantics.
 */
export async function countEconJournals(
  categories: number[],
  domains: string[],
): Promise<number> {
  const list = await loadJournals();
  return list.filter((j) => {
    if (categories.length > 0 && !categories.includes(j.category)) return false;
    if (domains.length > 0 && !domains.includes(j.domain)) return false;
    return true;
  }).length;
}
