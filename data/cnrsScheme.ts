// Baseline RankingScheme — wraps the historical CNRS-Economics data
// (`data/journals.ts` + `data/domains.ts`) into the generic shape every
// other module reads from. This file is the authoritative built-in: it's
// what users see before any customisation, and what "Reset to default"
// restores.
//
// The raw data file (`data/journals.ts`) still ships with `category: number`
// to keep its 5k-line body untouched; this module is the only place that
// converts numeric categories into the new string `tier` keys ('1'..'4').
// Every consumer outside this file works in the new shape.

import domains from './domains';
import type {
  Journal,
  RankingDomain,
  RankingScheme,
  RankingTier,
} from '@/types/interfaces';

/** Internal raw shape of `data/journals.ts` — kept private to this file. */
interface RawJournalRow {
  name: string;
  issn: string;
  domain: string;
  category: number;
}

/** Stable id for the baseline. Persisted in user-edited copies' `baseId`-like
 *  use cases (none yet) and shown in the UI as the "default" badge. */
export const CNRS_SCHEME_ID = 'cnrs';

const CNRS_TIERS: RankingTier[] = [
  { key: '1', label: 'Cat 1' },
  { key: '2', label: 'Cat 2' },
  { key: '3', label: 'Cat 3' },
  { key: '4', label: 'Cat 4' },
];

// Source the domain catalogue from `data/domains.ts` — same labels the
// JournalModal already shows. Drop the leading placeholder ({value: ''})
// that file uses for the dropdown UI.
const CNRS_DOMAINS: RankingDomain[] = domains
  .filter((d) => d.value)
  .map((d) => ({ key: d.value, label: d.translation || d.value }));

/** Top 5 — the canonical "top five" general-interest economics journals. */
export const CNRS_TOP5_ISSNS: readonly string[] = [
  '0002-8282', // American Economic Review
  '0012-9682', // Econometrica
  '0022-3808', // Journal of Political Economy
  '0033-5533', // Quarterly Journal of Economics
  '0034-6527', // Review of Economic Studies
];

let cached: Promise<RankingScheme> | null = null;

/**
 * Lazy-load the baseline CNRS scheme. The journal list is dynamically
 * imported so the ~150 KB dataset stays out of the initial JS bundle.
 * Memoised so repeat callers share a single fetch+transform pass.
 */
export function loadCnrsScheme(): Promise<RankingScheme> {
  if (!cached) {
    cached = import('@/data/journals').then((m) => {
      const raw = m.default as readonly RawJournalRow[];
      const journals: Journal[] = raw.map((j) => ({
        name: j.name,
        issn: j.issn,
        domain: j.domain,
        tier: String(j.category),
      }));
      const scheme: RankingScheme = {
        version: 1,
        id: CNRS_SCHEME_ID,
        name: 'CNRS Economics',
        description:
          'CNRS section 37 ranking of economics & management journals. ' +
          'Built-in baseline shipped with Paperazzi.',
        tiers: CNRS_TIERS,
        domains: CNRS_DOMAINS,
        journals,
        presets: [
          { id: 'all', name: 'All' },
          {
            id: 'top5gen',
            name: 'Top 5',
            issns: [...CNRS_TOP5_ISSNS],
          },
          // Working-papers filter is now its own top-level FilterPanel
          // section (parallel to Journals), not a preset pill here. See
          // `data/econWorkingPapers.ts` + the "Working papers" UI.
        ],
      };
      return scheme;
    });
  }
  return cached;
}
