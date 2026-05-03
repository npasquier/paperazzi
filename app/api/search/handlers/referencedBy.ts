// CASE 1: ?referencedBy=<workId>
//
// "Show me the papers cited by this paper, optionally filtered/searched
// further." We fetch the focal paper to get its referenced_works array,
// then run searchWithinIds against that subset with the user's
// query/filters layered on.

import { NextResponse } from 'next/server';
import type { OpenAlexWork } from '@/types/openalex';
import { fetchOpenAlex } from '../lib/fetch';
import { cleanHtml, mapToPapers, normalizeId } from '../lib/format';
import { searchWithinIds } from '../lib/searches';
import type { SearchContext } from '../context';

export async function handleReferencedBy(
  ctx: SearchContext,
  referencedBy: string,
) {
  const cleanId = normalizeId(referencedBy);
  const paperData = await fetchOpenAlex<OpenAlexWork>(
    `https://api.openalex.org/works/${cleanId}`,
    ctx.getKey,
  );
  const referencedWorks = paperData.referenced_works || [];

  if (referencedWorks.length === 0) {
    return NextResponse.json({
      results: [],
      meta: { count: 0, page: ctx.page, per_page: ctx.perPage },
      referencedByTitle: cleanHtml(paperData.title),
    });
  }

  const referenceIds = referencedWorks.map(normalizeId);
  const { results, count } = await searchWithinIds(
    referenceIds,
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
    referencedByTitle: cleanHtml(paperData.title),
  });
}
