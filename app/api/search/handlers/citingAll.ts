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
import type { KeyPicker } from '../lib/keys';
import type { SearchContext } from '../context';

/**
 * Fetch the COMPLETE set of works that cite `workId`, via cursor
 * pagination. The old implementation took only the first 200 citing
 * works, which silently produced a wrong intersection for any
 * well-cited paper (very common in economics). We page through with a
 * cursor and `select=id` (id-only payload, far cheaper) up to a safety
 * cap so a hyper-cited paper can't trigger an unbounded fan-out.
 */
async function fetchAllCitingIds(
  workId: string,
  getKey: KeyPicker,
  maxResults = 4000,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = '*';

  while (cursor && ids.length < maxResults) {
    const url: string =
      `https://api.openalex.org/works?per-page=200` +
      `&filter=cites:${toFullId(workId)}` +
      `&select=id&cursor=${encodeURIComponent(cursor)}`;
    const data: OpenAlexResultsPage<OpenAlexWork> =
      await fetchOpenAlex<OpenAlexResultsPage<OpenAlexWork>>(url, getKey);
    const batch = (data.results || []).map((w: OpenAlexWork) =>
      normalizeId(w.id),
    );
    ids.push(...batch);
    // OpenAlex returns next_cursor=null once the walk is exhausted.
    cursor = data.meta?.next_cursor ?? null;
    if (batch.length === 0) break;
  }

  return ids;
}

export async function handleCitingAll(
  ctx: SearchContext,
  citingAll: string[],
) {
  const citingSets = await Promise.all(
    citingAll.map((id) => fetchAllCitingIds(id, ctx.getKey)),
  );

  // Set-based intersection: each citing set can hold up to 4000 ids, so
  // a plain `a.filter(id => b.includes(id))` would be O(|a|·|b|) per
  // pair — ~16M comparisons for two well-cited papers.
  const commonIds = citingSets.reduce((a, b) => {
    const bSet = new Set(b);
    return a.filter((id: string) => bSet.has(id));
  });

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
