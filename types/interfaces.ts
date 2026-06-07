export const MAX_PINS = 30;
export const RESULTS_PER_PAGE = 20;

export interface Journal {
  name: string;
  issn: string;
  domain: string;
  /**
   * Ranking tier — a free-form string key chosen by whichever RankingScheme
   * is active. The built-in CNRS scheme uses '1' | '2' | '3' | '4'; an
   * imported scheme might use 'Q1' | 'Q2' | 'A*' | 'A' | etc. Compared by
   * exact string equality, so keys must round-trip identically.
   */
  tier: string;
}

export interface SelectedJournal {
  issn: string;
  name?: string;
  domain?: string;
  tier?: string;
}

// ─── Ranking scheme ─────────────────────────────────────────────────
//
// A self-contained classification: the tier vocabulary, the domain
// vocabulary, the journals, and any built-in preset shortcuts the
// scheme wants to ship. The active scheme is either the baseline
// (built-in CNRS) or a user-customised version stored in localStorage.
//
// The shape doubles as the import/export wire format — `version` is the
// schema version, bump it when the shape changes (with a migration).

/** A single tier in a ranking — e.g. {key: '1', label: 'Cat 1'} or {key: 'Q1'}. */
export interface RankingTier {
  /** Stable identifier — the value stored on each journal's `tier` field. */
  key: string;
  /** Optional human label; UI falls back to `key` when missing. */
  label?: string;
}

/** A subject area / domain — e.g. {key: 'GEN', label: 'General'}. */
export interface RankingDomain {
  key: string;
  label?: string;
}

/**
 * Optional built-in shortcut preset shipped with a scheme. The CNRS
 * baseline ships 'all' and 'top5gen'; imported schemes can ship their
 * own equivalents (e.g. 'q1med' for medicine).
 */
export interface RankingPreset {
  id: string;
  name: string;
  /** Tier whitelist; empty/omitted = no filter on tier. */
  tiers?: string[];
  /** Domain whitelist; empty/omitted = no filter on domain. */
  domains?: string[];
  /** Explicit ISSN whitelist; overrides tiers+domains when set. */
  issns?: string[];
}

export interface RankingScheme {
  /** Schema version. Increment when the wire format changes. */
  version: 1;
  /** Stable id — 'cnrs' for the baseline; user-chosen otherwise. */
  id: string;
  /** Display name — appears in the UI and on import. */
  name: string;
  /** Free-form description — origin, year, notes. */
  description?: string;
  /** Tier keys, in display order (top to bottom of ranking). */
  tiers: RankingTier[];
  /** Subject-area domains, in display order. */
  domains: RankingDomain[];
  /** Journal entries — every tier/domain reference must use a key from above. */
  journals: Journal[];
  /** Optional shortcut presets. */
  presets?: RankingPreset[];
}

export interface SelectedAuthor {
  id: string;
  name?: string;
  orcid?: string;
  worksCount?: number;
  institution?: string;
}

export interface PinGroup {
  id: string;
  name: string;
  paperIds: string[];
}

// Add these to your existing interfaces.ts

export interface Topic {
  id: string;
  display_name: string;
  subfield?: {
    id: string;
    display_name: string;
  };
  field?: {
    id: string;
    display_name: string;
  };
  domain?: {
    id: string;
    display_name: string;
  };
}

export interface Institution {
  id: string;
  display_name: string;
  country_code?: string;
  type?: string;
  ror?: string;
}

export interface Filters {
  journals: SelectedJournal[];
  authors: SelectedAuthor[];
  institutions: Institution[];
  publicationType: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  citing?: string;
  citingAll?: string[];
  referencedBy?: string;
  referencesAll?: string[];
  econFilter?: {
    enabled: boolean;
    /**
     * Tier whitelist — keys from the active RankingScheme.tiers (e.g. ['1','2']
     * for CNRS or ['Q1'] for a JCR-style scheme). Empty = no tier filter.
     */
    tiers: string[];
    /** Domain whitelist — keys from the active RankingScheme.domains. Empty = no domain filter. */
    domains: string[];
    /** Id of an active built-in or saved preset, if any. */
    presetId?: string | null;
    /** Explicit ISSN whitelist (used for ISSN-based presets like Top 5). */
    issns?: string[];
  };
  // Which journal-filter source feeds the API. Both subsections retain their
  // state when inactive; only the active one is sent to /api/search.
  journalFilterMode?: 'wide' | 'specific' | 'off';
  /**
   * Working-paper filter — restricts results to a whitelist of econ
   * working-paper OpenAlex source ids (NBER, IMF, RePEc, SSRN, …). Sits
   * as its own top-level FilterPanel section, parallel to Journals.
   *
   * Mutually exclusive with the journal filter at the OpenAlex layer:
   * the journal filter narrows by `primary_location.source.issn` and the
   * WP filter narrows by `primary_location.source.id`, and OpenAlex ANDs
   * the two clauses — so combining them returns the empty intersection.
   * The UI enforces this by flipping `journalFilterMode` to 'off' when
   * the user enables WP (and vice versa). State is preserved, only the
   * active one fires.
   */
  /**
   * Working-paper filter — restricts results to a curated whitelist of
   * OpenAlex source ids that index working papers (RePEc, HAL, NBER,
   * IMF, …). See `data/econWorkingPapers.ts` for the catalogue. The
   * filter narrows by `primary_location.source.id` server-side and is
   * mutually exclusive with the journal-ISSN filter at the OpenAlex
   * layer — the FilterPanel enforces a soft mutex by parking Journals
   * when WP is active and vice versa.
   */
  workingPaperFilter?: {
    enabled: boolean;
    /** Selected OpenAlex source ids (e.g. ['S4306401271','S…HAL…']). */
    sourceIds: string[];
  };
}

// Snapshot of the Journals subsection state — saved by the user under
// 'journal-filter-presets' in localStorage.
export interface JournalFilterPreset {
  id: string;
  name: string;
  econFilter: NonNullable<Filters['econFilter']>;
  journals: SelectedJournal[];
  mode?: 'wide' | 'specific' | 'off';
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  publication_year: number;
  journal_name: string;
  doi?: string;
  pdf_url?: string;
  cited_by_count: number;
  referenced_works_count?: number;
  abstract: string;
  issns?: string[];
  // OpenAlex IDs of works this paper cites — needed to draw network edges
  // client-side without extra API calls.
  referenced_works?: string[];
  // User-authored, per-collection annotations. These are written by the
  // user (not OpenAlex) and only mean anything for pinned papers — but
  // they live on the Paper itself so they round-trip through every code
  // path (search results → pin → modal → export) without a parallel
  // store. Search-result Papers will simply have undefined here.
  comment?: string;
  keywords?: string[];
}

// Hard caps on user-authored fields. Kept here (next to MAX_PINS) so
// the same numbers are quoted by storage, UI, and import normalisation
// without drifting.
export const MAX_PAPER_COMMENT_LENGTH = 500;
export const MAX_PAPER_KEYWORDS = 6;
export const MAX_PAPER_KEYWORD_LENGTH = 24;
