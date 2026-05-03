// CASE 3: ?citingAll=<id1>,<id2>,…
//
// "Show me papers that cite ALL of these papers (intersection of their
// citing sets)." Mirror of referencesAll but in the other direction —
// useful for finding papers that build on multiple specific works.

import { NextResponse } from 'next/server';
import type {
  OpenAlexWork,
  OpenAlexResultsPage,
} from '@/types/openalex';
import { fetchOpenAlex } from '../lib/fetch';
import { mapToPapers, normalizeId, toFullId } from '../lib/format';
import { searchWithinIds } from '../lib/searches';
import type { SearchContext } from '../context';

export async function handleCitingAll(
  ctx: SearchContext,
  citingAll: string[],
) {
  const citingSets = await Promise.all(
    citingAll.map(async (id) => {
      const data = await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(
        `https://api.openalex.org/works?per-page=200&filter=cites:${toFullId(id)}`,
        ctx.getKey,
      );
      return (data.results || []).map((w) => normalizeId(w.id));
    }),
  );

  const commonIds = citingSets.reduce((a, b) =>
    a.filter((id: string) => b.includes(id)),
  );

  if (commonIds.length === 0) {
    return NextResponse.json({
      results: [],
      meta: { count: 0, page: ctx.page, per_page: ctx.perPage },
    });
  }

  const { results, count } = await searchWithinIds(
    commonIds,
    ctx.query,
    ctx.filterParams,
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
