// CASE 4 (and 4a): the default search path, used when no
// referencedBy / referencesAll / citingAll constraint is active.
//
// Branches:
//   • semantic && query  → CASE 4a, OpenAlex's `search.semantic=` endpoint
//                          (≤50 results, no pagination, no batched ECON
//                          path; ECON whitelist applied locally on the
//                          ≤50 result set).
//   • issnBatches set    → econBatchedSearch (multi-call fan-out).
//   • otherwise          → single /works call with filters.

import { NextResponse } from 'next/server';
import type {
  OpenAlexWork,
  OpenAlexResultsPage,
} from '@/types/openalex';
import { fetchOpenAlex } from '../lib/fetch';
import { buildFilters, buildSort, mapToPapers } from '../lib/format';
import { econBatchedSearch } from '../lib/searches';
import type { SearchContext } from '../context';

export async function handleRegular(
  ctx: SearchContext,
  citing: string | null,
) {
  const filters = buildFilters({ ...ctx.filterParams, citing });

  // CASE 4a: Semantic search (single call, ≤50 results, no batched paths).
  // Requires a query — fall through to keyword if absent.
  if (ctx.semantic && ctx.query) {
    const semPerPage = Math.min(50, ctx.perPage);

    let url = `https://api.openalex.org/works?per-page=${semPerPage}&search.semantic=${encodeURIComponent(ctx.query)}`;
    if (filters.length) url += `&filter=${filters.join(',')}`;
    // Don't override sort: semantic returns by similarity.

    const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
      url,
      ctx.getKey,
    );
    let results: OpenAlexWork[] = data.results || [];

    // Apply ECON ISSN whitelist locally — the wide list can exceed
    // OpenAlex's 100-OR-per-filter cap, but with ≤50 results to filter
    // it's trivial in memory and avoids the rate-limited batched path.
    if (ctx.issnBatches) {
      const allowedIssns = new Set(ctx.issnBatches.flat());
      results = results.filter((w) => {
        const issns = w.primary_location?.source?.issn || [];
        return issns.some((i: string) => allowedIssns.has(i));
      });
    }

    return NextResponse.json(
      {
        results: mapToPapers(results),
        meta: {
          count: results.length,
          page: 1,
          per_page: results.length,
          semantic: true,
          // Signal to the UI that pagination should be suppressed and
          // the result set is intrinsically capped by the upstream.
          capped: true,
        },
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  }

  if (ctx.issnBatches) {
    const { results, count } = await econBatchedSearch(
      filters,
      ctx.query,
      ctx.sort,
      ctx.page,
      ctx.issnBatches,
      ctx.perPage,
      ctx.getKey,
    );
    return NextResponse.json({
      results: mapToPapers(results),
      meta: { count, page: ctx.page, per_page: ctx.perPage },
    });
  }

  let url = `https://api.openalex.org/works?per-page=${ctx.perPage}&page=${ctx.page}`;
  if (filters.length) url += `&filter=${filters.join(',')}`;
  if (ctx.query) url += `&search=${encodeURIComponent(ctx.query)}`;
  url += buildSort(ctx.sort, !!ctx.query);

  const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
    url,
    ctx.getKey,
  );

  return NextResponse.json(
    {
      results: mapToPapers(data.results || []),
      meta: {
        count: data.meta?.count || 0,
        page: ctx.page,
        per_page: ctx.perPage,
      },
    },
    {
      headers: {
        'Cache-Control':
          'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
