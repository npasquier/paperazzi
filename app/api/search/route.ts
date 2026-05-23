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
import { ISSN_BATCH_SIZE, batchISSNs } from './lib/searches';
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
  // Parse a positive-integer query param, clamping to [min, max] and
  // falling back to `fallback` for anything non-finite (e.g. ?page=abc,
  // which Number() turns into NaN — that used to flow straight into the
  // OpenAlex URL and produce an opaque upstream 400).
  const clampInt = (
    raw: string | null,
    fallback: number,
    min: number,
    max: number,
  ): number => {
    // Absent / empty param → use the fallback. This guard matters because
    // Number(null) and Number('') are both 0 (not NaN), so without it an
    // omitted `perPage` would clamp up to `min` (1) instead of defaulting
    // to 20 — which silently capped the results list at one paper a page.
    if (raw === null || raw.trim() === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  };
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  // perPage: 1..100, default 20. Used by graph mode (100) to fit more dots
  // in a single round-trip. Max value by OpenAlex is 100.
  const perPage = clampInt(searchParams.get('perPage'), 20, 1, 100);

  const citing = searchParams.get('citing');
  const citingAll = (searchParams.get('citingAll') || '')
    .split(',')
    .filter(Boolean);
  const referencedBy = searchParams.get('referencedBy');
  const referencesAll = (searchParams.get('referencesAll') || '')
    .split(',')
    .filter(Boolean);

  // Econ filter — the wide-mode whitelist of allowed ISSNs. The client is
  // responsible for resolving whatever it has (tiers + domains, an
  // ISSN-based preset like Top 5, etc.) into this final ISSN list using
  // the user's active RankingScheme. The server stays scheme-agnostic.
  const econEnabled = searchParams.get('econEnabled') === 'true';
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
  // journals AND the client sent an ISSN whitelist.
  let issnBatches: string[][] | null = null;
  if (
    econEnabled &&
    filterParams.journals.length === 0 &&
    econIssns.length > 0
  ) {
    // Small ISSN sets fit in a single OpenAlex filter — skip the
    // batched count/walk machinery and let the caller use the regular
    // filter path.
    issnBatches =
      econIssns.length <= ISSN_BATCH_SIZE ? [econIssns] : batchISSNs(econIssns);
  }

  const ctx: SearchContext = {
    query,
    filterParams,
    sort,
    page,
    perPage,
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
    const rawMessage =
      error instanceof Error ? error.message : 'Unknown error';
    // Defense-in-depth: this message is returned to the client, so scrub
    // any api_key=… that a current or future code path might embed in an
    // error before it leaves the server. fetch.ts already keeps the key
    // off the URL it throws, but this guarantees the invariant at the
    // boundary regardless of upstream changes.
    const errorMessage = rawMessage.replace(
      /api_key=[^&\s]+/gi,
      'api_key=REDACTED',
    );
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
