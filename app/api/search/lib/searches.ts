// Multi-call search primitives — the parts of the API route that fan a
// single user query into several upstream OpenAlex calls and stitch the
// results back together. Two scenarios:
//
//   econBatchedSearch  — when the ECON ISSN whitelist exceeds OpenAlex's
//                        100-OR-per-filter cap, we chunk the ISSNs into
//                        batches, count each, then walk the right batch(es)
//                        for the requested page.
//
//   searchWithinIds    — when the user is drilling into a citation /
//                        reference subset, we restrict the search domain
//                        to a known set of work IDs (also chunked because
//                        of URL length limits) and apply optional extra
//                        filters on top.
//
// Both are pure async functions — they don't read process.env or any
// module-level state. The `getKey` picker is threaded in.

import econJournalList from '@/data/journals';
import type {
  OpenAlexWork,
  OpenAlexResultsPage,
} from '@/types/openalex';
import { fetchOpenAlex } from './fetch';
import type { KeyPicker } from './keys';
import { buildFilters, buildSort, normalizeId, toFullId } from './format';

interface JournalRow {
  name: string;
  issn: string;
  domain: string;
  category: number;
}

// ────────────────────────────────────────────────────────────────────
// ISSN batching
// ────────────────────────────────────────────────────────────────────

/** OpenAlex's hard cap: 100 OR'd values per filter. */
export const ISSN_BATCH_SIZE = 100;

export function batchISSNs(issns: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < issns.length; i += ISSN_BATCH_SIZE) {
    batches.push(issns.slice(i, i + ISSN_BATCH_SIZE));
  }
  return batches;
}

/** Build the ECON-whitelist ISSN list from category/domain selections. */
export function getEconISSNs(
  categories: number[],
  domains: string[],
): string[] {
  let filtered = econJournalList as JournalRow[];
  if (categories.length > 0) {
    filtered = filtered.filter((j) => categories.includes(j.category));
  }
  if (domains.length > 0) {
    filtered = filtered.filter((j) => domains.includes(j.domain));
  }
  return filtered.map((j) => j.issn);
}

// ────────────────────────────────────────────────────────────────────
// Batched econ search
// ────────────────────────────────────────────────────────────────────

export async function econBatchedSearch(
  baseFilters: string[],
  query: string,
  sort: string,
  page: number,
  issnBatches: string[][],
  perPage: number,
  getKey: KeyPicker,
): Promise<{ results: OpenAlexWork[]; count: number }> {
  // Step 1: Get count from each batch in parallel (cheap: per-page=1)
  const batchCounts = await Promise.all(
    issnBatches.map(async (batch) => {
      const batchFilters = [
        ...baseFilters,
        `primary_location.source.issn:${batch.join('|')}`,
      ];
      let url = `https://api.openalex.org/works?per-page=1&page=1`;
      url += `&filter=${batchFilters.join(',')}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
        url,
        getKey,
      );
      return data.meta?.count || 0;
    }),
  );

  const totalCount = batchCounts.reduce((a, b) => a + b, 0);
  if (totalCount === 0) return { results: [], count: 0 };

  // Step 2: Walk batches to find which one(s) contain the requested page
  let skipRemaining = (page - 1) * perPage;
  const resultsToReturn: OpenAlexWork[] = [];

  for (let i = 0; i < issnBatches.length; i++) {
    const batchCount = batchCounts[i];
    if (batchCount === 0) continue;

    if (skipRemaining >= batchCount) {
      skipRemaining -= batchCount;
      continue;
    }

    const needed = perPage - resultsToReturn.length;
    const batchPage = Math.floor(skipRemaining / perPage) + 1;
    const offsetInPage = skipRemaining % perPage;

    const batchFilters = [
      ...baseFilters,
      `primary_location.source.issn:${issnBatches[i].join('|')}`,
    ];

    let url = `https://api.openalex.org/works?per-page=${perPage}&page=${batchPage}`;
    url += `&filter=${batchFilters.join(',')}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    url += buildSort(sort, !!query);

    const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
      url,
      getKey,
    );
    const batchResults = data.results || [];
    const sliced = batchResults.slice(offsetInPage, offsetInPage + needed);
    resultsToReturn.push(...sliced);

    skipRemaining = 0;
    if (resultsToReturn.length >= perPage) break;
  }

  return { results: resultsToReturn, count: totalCount };
}

// ────────────────────────────────────────────────────────────────────
// Search within a fixed work-ID set
// ────────────────────────────────────────────────────────────────────

export async function searchWithinIds(
  workIds: string[],
  query: string,
  filterParams: {
    journals: string[];
    authors: string[];
    topics: string[];
    institutions: string[];
    publicationType: string;
    from: string | null;
    to: string | null;
  },
  sort: string,
  page: number,
  issnBatches: string[][] | null,
  perPage: number,
  getKey: KeyPicker,
): Promise<{ results: OpenAlexWork[]; count: number }> {
  if (workIds.length === 0) return { results: [], count: 0 };

  if (query) {
    const filters = buildFilters(filterParams);
    let searchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=200`;
    if (filters.length) searchUrl += `&filter=${filters.join(',')}`;

    const searchData = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
      searchUrl,
      getKey,
    );
    const searchIds = (searchData.results || []).map((w) =>
      normalizeId(w.id),
    );
    const intersectedIds = workIds.filter((id) => searchIds.includes(id));

    if (intersectedIds.length === 0) return { results: [], count: 0 };

    if (issnBatches) {
      const idsFilter = `openalex_id:${intersectedIds.map(toFullId).join('|')}`;
      return econBatchedSearch(
        [idsFilter],
        '',
        sort,
        page,
        issnBatches,
        perPage,
        getKey,
      );
    }

    const totalCount = intersectedIds.length;
    const paginatedIds = intersectedIds.slice(
      (page - 1) * perPage,
      page * perPage,
    );
    if (paginatedIds.length === 0) return { results: [], count: totalCount };

    const idsFilter = paginatedIds.map(toFullId).join('|');
    let url = `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=${perPage}`;
    url += buildSort(sort, true);
    const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
      url,
      getKey,
    );

    return { results: data.results || [], count: totalCount };
  }

  // No query
  {
    const ID_BATCH_SIZE = 50;

    const idBatches: string[][] = [];
    for (let i = 0; i < workIds.length; i += ID_BATCH_SIZE) {
      idBatches.push(workIds.slice(i, i + ID_BATCH_SIZE));
    }

    // Build the regular filters (topics/authors/institutions/type/year)
    // so we can push them upstream rather than ignoring them.
    const extraFilters = buildFilters(filterParams);

    // STEP 1 — fetch ALL works in safe ID batches, with upstream filters applied
    const batchResults = await Promise.all(
      idBatches.map(async (batch) => {
        const filters = [
          `openalex_id:${batch.map(toFullId).join('|')}`,
          ...extraFilters,
        ];
        const url = `https://api.openalex.org/works?filter=${filters.join(',')}&per-page=200`;
        const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
          url,
          getKey,
        );
        return data.results || [];
      }),
    );

    const allResults: OpenAlexWork[] = batchResults.flat();

    // STEP 2 — ECON ISSN whitelist still has to be applied locally because
    // it can exceed the upstream filter's 100-value cap.
    const filtered = allResults.filter((w) => {
      if (!issnBatches) return true;
      const issns = w.primary_location?.source?.issn || [];
      const allowedIssns = issnBatches.flat();
      return issns.some((i: string) => allowedIssns.includes(i));
    });

    const totalCount = filtered.length;
    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    return { results: paginated, count: totalCount };
  }
}
