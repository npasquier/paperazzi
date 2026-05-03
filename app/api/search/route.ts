// /api/search dispatcher.
//
// All real work lives in:
//   ./lib/keys.ts        — key rotation, env validation, per-key counters
//   ./lib/fetch.ts       — fetchOpenAlex (retry + backoff)
//   ./lib/format.ts      — pure formatting helpers (filters, mapToPapers, …)
//   ./lib/searches.ts    — econBatchedSearch, searchWithinIds, ISSN batching
//   ./handlers/*.ts      — one file per query "case"
//
// This file:
//   1. Parses URL params into a typed SearchContext.
//   2. Decides whether the wide-econ ISSN whitelist applies and chunks it.
//   3. Routes to the right handler based on which constraint was passed.
//   4. Wraps the whole thing in a uniform error envelope.

import { NextRequest, NextResponse } from 'next/server';
import { makeKeyPicker } from './lib/keys';
import {
  ISSN_BATCH_SIZE,
  batchISSNs,
  getEconISSNs,
} from './lib/searches';
import { handleReferencedBy } from './handlers/referencedBy';
import { handleReferencesAll } from './handlers/referencesAll';
import { handleCitingAll } from './handlers/citingAll';
import { handleRegular } from './handlers/regular';
import type { SearchContext } from './context';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // One key picker per request: starts at a random offset so concurrent
  // users (and concurrent serverless instances) don't all begin on the
  // same key, then rotates round-robin across this request's sub-calls.
  const getKey = makeKeyPicker();

  // ── URL → typed inputs ────────────────────────────────────────────
  const query = searchParams.get('query') || '';
  const journals = (searchParams.get('journals') || '')
    .split(',')
    .filter(Boolean);
  const authors = (searchParams.get('authors') || '')
    .split(',')
    .filter(Boolean);
  const topics = (searchParams.get('topics') || '').split(',').filter(Boolean);
  const institutions = (searchParams.get('institutions') || '')
    .split(',')
    .filter(Boolean);
  const publicationType = searchParams.get('type') || '';
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const sort = searchParams.get('sort') || 'relevance_score';
  const page = Number(searchParams.get('page') || 1);
  // perPage: 1..100, default 20. Used by graph mode (100) to fit more dots
  // in a single round-trip. Maxvalue by OpenAlex is 100.
  const perPage = Math.min(
    100,
    Math.max(1, Number(searchParams.get('perPage') || 20)),
  );

  const citing = searchParams.get('citing');
  const citingAll = (searchParams.get('citingAll') || '')
    .split(',')
    .filter(Boolean);
  const referencedBy = searchParams.get('referencedBy');
  const referencesAll = (searchParams.get('referencesAll') || '')
    .split(',')
    .filter(Boolean);

  // Semantic mode (OpenAlex `search.semantic=` beta endpoint).
  // Constraints: max 50 results per query, 1 req/s rate limit, single call.
  // Only applies to the plain "find papers about X" path; graph traversals
  // (referencedBy / citingAll / referencesAll / citing) keep the keyword
  // path.
  const semantic = searchParams.get('semantic') === 'true';

  // Econ filter
  const econEnabled = searchParams.get('econEnabled') === 'true';
  const econCat = (searchParams.get('econCat') || '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const econDom = (searchParams.get('econDom') || '')
    .split(',')
    .filter(Boolean);
  // Explicit ISSN whitelist (used by ISSN-based presets like Top 5).
  // When provided, overrides econCat/econDom server-side.
  const econIssns = (searchParams.get('econIssns') || '')
    .split(',')
    .filter(Boolean);

  const filterParams = {
    journals,
    authors,
    topics,
    institutions,
    publicationType,
    from,
    to,
  };

  // Decide whether the wide econ filter applies for this request.
  // Manual journals (filterParams.journals) override the wide filter when
  // non-empty, so we only build issnBatches when there are no manual
  // journals.
  let issnBatches: string[][] | null = null;
  if (econEnabled && filterParams.journals.length === 0) {
    const issns =
      econIssns.length > 0 ? econIssns : getEconISSNs(econCat, econDom);
    if (issns.length > 0) {
      // Small ISSN sets fit in a single OpenAlex filter — skip the
      // batched count/walk machinery and let the caller use the regular
      // filter path.
      issnBatches =
        issns.length <= ISSN_BATCH_SIZE ? [issns] : batchISSNs(issns);
    }
  }

  const ctx: SearchContext = {
    query,
    filterParams,
    sort,
    page,
    perPage,
    semantic,
    issnBatches,
    getKey,
  };

  try {
    if (referencedBy) return await handleReferencedBy(ctx, referencedBy);
    if (referencesAll.length > 0)
      return await handleReferencesAll(ctx, referencesAll);
    if (citingAll.length > 0) return await handleCitingAll(ctx, citingAll);
    return await handleRegular(ctx, citing);
  } catch (error) {
    console.error('Search API error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const isServiceUnavailable = errorMessage.includes(
      'temporarily unavailable',
    );

    return NextResponse.json(
      {
        results: [],
        meta: { count: 0, page, per_page: perPage },
        error: errorMessage,
      },
      {
        status: isServiceUnavailable ? 503 : 500,
        headers: { 'Cache-Control': 'no-store, must-revalidate' },
      },
    );
  }
}
