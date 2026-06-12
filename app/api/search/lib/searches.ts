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
//
// NB: this module no longer imports the journal dataset. Tier/domain
// resolution moved client-side (see `utils/activeRanking.ts`) so users
// who customise the ranking get their custom scheme applied — the server
// only ever receives a fully-resolved ISSN list via `econIssns`.

import type {
  OpenAlexWork,
  OpenAlexResultsPage,
} from '@/types/openalex';
import { fetchOpenAlex } from './fetch';
import type { KeyPicker } from './keys';
import { buildFilters, buildSort, normalizeId, toFullId } from './format';

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

    const batchFilters = [
      ...baseFilters,
      `primary_location.source.issn:${issnBatches[i].join('|')}`,
    ];

    // Walk pages WITHIN this batch until the requested page is filled or
    // the batch is exhausted. A single-fetch-per-batch shortcut here used
    // to drop items: when `localOffset` wasn't page-aligned (i.e. earlier
    // batch counts weren't multiples of perPage), the slice of one
    // upstream page could only yield `perPage - offsetInPage` items, and
    // the rest of the batch's items for this page were silently skipped —
    // they then never appeared on ANY page (and later pages could show
    // duplicates pulled early from the next batch).
    let localOffset = skipRemaining; // index of next unconsumed item in batch
    while (resultsToReturn.length < perPage && localOffset < batchCount) {
      const needed = perPage - resultsToReturn.length;
      const batchPage = Math.floor(localOffset / perPage) + 1;
      const offsetInPage = localOffset % perPage;

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
      localOffset += sliced.length;
      // Upstream returned fewer items than its own count promised (eventual
      // consistency) — bail on this batch rather than loop forever.
      if (sliced.length === 0) break;
    }

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
    // Search WITHIN the work-id subset, batched, rather than running one
    // global keyword search and intersecting its top-200 results. The old
    // approach silently dropped any matching paper that ranked beyond the
    // 200th global keyword hit — so a query over a large reference /
    // citation set could miss valid matches. Pushing the ids into the
    // filter (≤50 per batch, the OR-cap-safe size) lets OpenAlex match
    // across the whole subset; within a 50-id batch at most 50 can match,
    // so per-page=200 never truncates.
    const extraFilters = buildFilters(filterParams);

    const ID_BATCH_SIZE = 50;
    const idBatches: string[][] = [];
    for (let i = 0; i < workIds.length; i += ID_BATCH_SIZE) {
      idBatches.push(workIds.slice(i, i + ID_BATCH_SIZE));
    }

    const matchedSets = await Promise.all(
      idBatches.map(async (batch) => {
        const filters = [
          `openalex_id:${batch.map(toFullId).join('|')}`,
          ...extraFilters,
        ];
        const url =
          `https://api.openalex.org/works?search=${encodeURIComponent(query)}` +
          `&filter=${filters.join(',')}&per-page=200&select=id`;
        const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
          url,
          getKey,
        );
        return (data.results || []).map((w) => normalizeId(w.id));
      }),
    );

    // Preserve the caller's id order (keeps the user's manual reference
    // ordering meaningful and matches the no-query path's behaviour).
    const matched = new Set(matchedSets.flat());
    const intersectedIds = workIds.filter((id) => matched.has(id));

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
    // it can exceed the upstream filter's 100-value cap. Build the
    // allowed-ISSN Set ONCE outside the filter callback — the old version
    // re-flattened the batches and did a linear `includes` per work,
    // O(works × whitelist), which adds up at 4000-work scale.
    const allowedIssns = issnBatches ? new Set(issnBatches.flat()) : null;
    const filtered = allResults.filter((w) => {
      if (!allowedIssns) return true;
      const issns = w.primary_location?.source?.issn || [];
      return issns.some((i: string) => allowedIssns.has(i));
    });

    const totalCount = filtered.length;
    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    return { results: paginated, count: totalCount };
  }
}
