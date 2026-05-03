// CASE 2: ?referencesAll=<id1>,<id2>,…
//
// "Show me papers cited by ALL of these papers (the intersection of their
// reference lists)." Used for finding common citations across a set of
// papers the user has selected.

import { NextResponse } from 'next/server';
import type { OpenAlexWork } from '@/types/openalex';
import { fetchOpenAlex } from '../lib/fetch';
import { mapToPapers, normalizeId } from '../lib/format';
import { searchWithinIds } from '../lib/searches';
import type { SearchContext } from '../context';

export async function handleReferencesAll(
  ctx: SearchContext,
  referencesAll: string[],
) {
  const referenceSets = await Promise.all(
    referencesAll.map(async (id) => {
      const data = await fetchOpenAlex<OpenAlexWork>(
        `https://api.openalex.org/works/${normalizeId(id)}`,
        ctx.getKey,
      );
      return (data.referenced_works || []).map(normalizeId);
    }),
  );

  // Intersection: a reference must appear in every set to survive.
  const commonIds = referenceSets.reduce((a, b) =>
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
