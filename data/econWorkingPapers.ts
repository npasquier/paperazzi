// Curated catalogue of OpenAlex sources that index working papers.
//
// The Working Papers filter (FilterPanel → Working papers section) sends
// the selected `sourceId`s to the API as `wpSources=…`, which the server
// turns into a `primary_location.source.id:S1|S2|…` clause. Each entry
// must be a real OpenAlex source id that actually carries works (verified
// via direct OpenAlex API lookups; `works_count` quoted in `verifiedVia`).
//
// HAL and RePEc are the two big multi-discipline open archives of working
// papers — selecting them gives the broadest coverage. NBER, IMF, World
// Bank, OECD, SSRN are narrower individual outlets included for users who
// want to focus on one publisher.
//
// Why source id (not topics / concepts / JEL)
// ────────────────────────────────────────────
// OpenAlex topic classifications are noisy for econ-only filtering, and
// JEL codes aren't carried in OpenAlex's structured /works metadata. A
// curated source-id whitelist is precision-first: every match is
// unambiguously a paper deposited in a recognised working-paper outlet.

export interface EconWorkingPaperSeries {
  /** OpenAlex source id, used as the FilterPanel checkbox key. */
  sourceId: string;
  name: string;
  publisher?: string;
  /** ISSN — informational only, not used for filtering. */
  issn?: string;
  /** How the source id was verified. */
  verifiedVia: string;
  note?: string;
}

export const ECON_WORKING_PAPER_SERIES: readonly EconWorkingPaperSeries[] = [
  // ── Open archives (multi-discipline, high recall) ─────────────────
  {
    sourceId: 'S4306401271',
    name: 'RePEc',
    publisher: 'RePEc / FRB St. Louis',
    verifiedVia: '/sources/S4306401271 (1.3M works)',
    note:
      "Research Papers in Economics — the canonical economics working-paper " +
      'aggregator. Catches NBER, CEPR, IZA, ECB, central-bank, and most ' +
      'university WP series as their RePEc-indexed copy.',
  },
  {
    sourceId: 'S4306402512',
    name: 'HAL',
    publisher: 'CCSD / CNRS',
    verifiedVia:
      'Zucman QJE 2013 (doi:10.1093/qje/qjt012) has a locations[] entry with ' +
      'source.id = S4306402512, display_name = "HAL (Le Centre pour la ' +
      'Communication Scientifique Directe)", host_organization = CNRS.',
    note:
      'HAL — French national open archive (covers TSE, AMSE, PSE, GAEL, OFCE, ' +
      'and many other French labs as well as the broader humanities + sciences). ' +
      'High recall, lower precision than per-outlet sources below.',
  },

  // ── Per-outlet WP sources (narrower, precision-first) ────────────
  {
    sourceId: 'S2809516038',
    name: 'NBER Working Papers',
    publisher: 'NBER',
    verifiedVia: 'DOI 10.3386/w28011 → primary_location.source.id',
    note: 'National Bureau of Economic Research (US). Type "repository" in OpenAlex.',
  },
  {
    sourceId: 'S4210171147',
    name: 'IMF Working Papers',
    publisher: 'IMF',
    issn: '1018-5941',
    verifiedVia: '/sources/issn:1018-5941 (8.2k works)',
    note: 'International Monetary Fund — international macro, finance, development.',
  },
  {
    sourceId: 'S4210231086',
    name: 'World Bank Policy Research Working Papers',
    publisher: 'World Bank',
    issn: '1813-9450',
    verifiedVia: '/sources/issn:1813-9450 (1.3k works)',
    note: 'World Bank PRWP — development economics.',
  },
  {
    sourceId: 'S4210239538',
    name: 'OECD Economics Department Working Papers',
    publisher: 'OECD',
    issn: '1815-1973',
    verifiedVia: '/sources/issn:1815-1973 (1.9k works)',
    note: 'OECD — cross-country macro and policy.',
  },
  {
    sourceId: 'S4210172589',
    name: 'SSRN (all)',
    publisher: 'SSRN / RELX',
    issn: '1556-5068',
    verifiedVia: '/sources/issn:1556-5068 (1.6M works)',
    note:
      'SSRN Electronic Journal — repository, not econ-specific. Use as a ' +
      'coarse option; combine with a query term for precision.',
  },
];

/** Flat source-id list — the array the filter pipeline actually consumes. */
export const ECON_WORKING_PAPER_SOURCE_IDS: readonly string[] =
  ECON_WORKING_PAPER_SERIES.map((s) => s.sourceId);

/** O(1) lookup from source id → entry. */
export const ECON_WORKING_PAPER_BY_SOURCE_ID: ReadonlyMap<
  string,
  EconWorkingPaperSeries
> = new Map(ECON_WORKING_PAPER_SERIES.map((s) => [s.sourceId, s]));
