// Shared bag of args every per-case handler needs. Built once by route.ts
// from the URL params, then passed straight through. Keeps each handler
// signature short and lets the dispatcher route by key without each handler
// re-parsing query params.

import type { KeyPicker } from './lib/keys';

export interface FilterParams {
  journals: string[];
  authors: string[];
  topics: string[];
  institutions: string[];
  publicationType: string;
  from: string | null;
  to: string | null;
  /**
   * Working-paper source-id whitelist. Restricts results to
   * `primary_location.source.id IN (…)`. Mutually exclusive with the
   * journal-ISSN clause at the OpenAlex layer — when non-empty, the
   * journals list is zeroed upstream so the two clauses don't AND to
   * the empty intersection.
   */
  workingPaperSourceIds: string[];
}

export interface SearchContext {
  query: string;
  filterParams: FilterParams;
  sort: string;
  page: number;
  perPage: number;
  /**
   * Either the chunked ECON whitelist (when wide econ filter is active and
   * no manual journals override it), or `null` to mean "no econ batching".
   * Built upstream in route.ts so handlers don't re-derive it.
   */
  issnBatches: string[][] | null;
  /** Per-request key picker — see lib/keys.ts. */
  getKey: KeyPicker;
}
