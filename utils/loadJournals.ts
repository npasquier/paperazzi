// Backward-compatible journal loader.
//
// Originally this module owned the journal dataset directly (`data/journals.ts`).
// Now that journals come from a user-customisable RankingScheme — see
// `utils/activeRanking.ts` — every helper here is a thin wrapper that
// resolves through the active scheme. Existing callers (JournalModal,
// PaperazziApp, FilterPanel) keep working without churn; new code should
// reach for `useActiveRanking()` / `loadActiveRanking()` directly.
//
// The chunk-splitting we relied on (dynamic `import()` of the 5k-line
// dataset) still happens — it just lives in `data/cnrsScheme.ts` now.

import type { Journal } from '@/types/interfaces';
import {
  countIssns,
  loadActiveRanking,
  mapIssnsToJournals as mapIssnsToJournalsViaScheme,
} from '@/utils/activeRanking';

/**
 * Returns the journals from the currently-active ranking scheme.
 * First call triggers the dataset load; subsequent calls share the
 * memoised promise inside `activeRanking`.
 */
export async function loadJournals(): Promise<readonly Journal[]> {
  const scheme = await loadActiveRanking();
  return scheme.journals;
}

/** Lookup by ISSN against the active ranking. Returns undefined if absent. */
export async function getJournalByIssn(
  issn: string,
): Promise<Journal | undefined> {
  const scheme = await loadActiveRanking();
  return scheme.journals.find((j) => j.issn === issn);
}

/** Map a list of ISSNs to their full Journal records, dropping unknowns. */
export async function mapIssnsToJournalsAsync(
  issns: string[],
): Promise<Journal[]> {
  const scheme = await loadActiveRanking();
  return mapIssnsToJournalsViaScheme(scheme, issns);
}

/**
 * Count how many journals match a tier/domain selection in the active
 * ranking. Empty arrays = no filter on that axis (matches the previous
 * `(categories, domains)` semantics, just with string tier keys now).
 */
export async function countEconJournals(
  tiers: string[],
  domains: string[],
): Promise<number> {
  const scheme = await loadActiveRanking();
  return countIssns(scheme, tiers, domains);
}
