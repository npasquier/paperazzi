// CASE 4: the default search path, used when no
// referencedBy / referencesAll / citingAll constraint is active.
//
// Branches:
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
