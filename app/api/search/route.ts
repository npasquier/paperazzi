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
  //
  // Every list/scalar param below (except `query`, which is always
  // encodeURIComponent'd downstream) is interpolated RAW into the
  // upstream OpenAlex `&filter=` / `&sort=` strings. OpenAlex's filter
  // grammar uses `,` (AND), `|` (OR) and `:` (key/value), so a value
  // containing grammar characters or URL metacharacters (`&`, spaces…)
  // could inject extra clauses or extra query params. None of that is
  // exploitable against a trusted system — OpenAlex is public and
  // read-only — but it produces confusing upstream 400s and reshaped
  // responses. Safelist each value: legit inputs are ISSNs, OpenAlex
  // ids (bare or full-URL), type slugs and years, all of which match.
  const SAFE_VALUE = /^[\w:./()-]+$/;
  const safeList = (raw: string | null): string[] =>
    (raw || '')
      .split(',')
      .filter(Boolean)
      .filter((v) => SAFE_VALUE.test(v));
  const safeScalar = (raw: string | null): string => {
    const v = raw || '';
    return SAFE_VALUE.test(v) ? v : '';
  };

  const query = searchParams.get('query') || '';
  const journals = safeList(searchParams.get('journals'));
  const authors = safeList(searchParams.get('authors'));
  const topics = safeList(searchParams.get('topics'));
  const institutions = safeList(searchParams.get('institutions'));
  const publicationType = safeScalar(searchParams.get('type'));
  const from = safeScalar(searchParams.get('from')) || null;
  const to = safeScalar(searchParams.get('to')) || null;
  // `sort` is appended to the upstream URL verbatim (`&sort=…`), so it
  // gets a strict whitelist rather than just a character check —
  // otherwise `sort=x&select=id` would inject params and reshape the
  // response. Unknown values fall back to the default.
  const ALLOWED_SORTS = new Set([
    'relevance_score',
    'relevance_score:desc',
    'publication_date',
    'publication_date:desc',
    'cited_by_count',
    'cited_by_count:desc',
  ]);
  const rawSort = searchParams.get('sort') || 'relevance_score';
  const sort = ALLOWED_SORTS.has(rawSort) ? rawSort : 'relevance_score';
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
  const citingAll = safeList(searchParams.get('citingAll'));
  const referencedBy = searchParams.get('referencedBy');
  const referencesAll = safeList(searchParams.get('referencesAll'));

  // Work-id params must be OpenAlex work ids (bare "W123…" or the full
  // https://openalex.org/W123… URL). `referencedBy` in particular is
  // interpolated into the upstream PATH (/works/<id>), so failing fast
  // with a clear 400 beats forwarding garbage and surfacing an opaque
  // upstream 404 — and it closes the door on path-shaped values
  // ("W1/../authors/A2") reaching the upstream URL at all.
  const WORK_ID_RE = /^(https:\/\/openalex\.org\/)?W\d+$/i;
  const invalidWorkId = [citing, referencedBy, ...citingAll, ...referencesAll]
    .filter((id): id is string => Boolean(id))
    .find((id) => !WORK_ID_RE.test(id));
  if (invalidWorkId) {
    return NextResponse.json(
      {
        results: [],
        meta: { count: 0, page: 1, per_page: 0 },
        error: `Invalid OpenAlex work id: "${invalidWorkId}". Expected "W…" or "https://openalex.org/W…".`,
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, must-revalidate' },
      },
    );
  }

  // Fan-out cap. Each citingAll id triggers up to ~20 cursor-paginated
  // upstream calls (4000 ids @ 200/page in handlers/citingAll.ts), so an
  // unbounded list is a cost-amplification vector on an open endpoint —
  // 100 ids ≈ 2000 OpenAlex calls billed to our keys. 50 is far beyond
  // any legitimate UI flow (the intersection of >50 citation sets is
  // almost always empty anyway). referencesAll is 1 call per id but gets
  // the same cap for symmetry.
  const MAX_INTERSECTION_IDS = 50;
  if (
    citingAll.length > MAX_INTERSECTION_IDS ||
    referencesAll.length > MAX_INTERSECTION_IDS
  ) {
    return NextResponse.json(
      {
        results: [],
        meta: { count: 0, page: 1, per_page: 0 },
        error: `Too many ids: citingAll/referencesAll accept at most ${MAX_INTERSECTION_IDS} ids per request.`,
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, must-revalidate' },
      },
    );
  }

  // Econ filter — the wide-mode whitelist of allowed ISSNs. The client is
  // responsible for resolving whatever it has (tiers + domains, an
  // ISSN-based preset like Top 5, etc.) into this final ISSN list using
  // the user's active RankingScheme. The server stays scheme-agnostic.
  const econEnabled = searchParams.get('econEnabled') === 'true';
  const econIssns = safeList(searchParams.get('econIssns'));

  // Working-paper filter — whitelist of OpenAlex source ids (RePEc,
  // HAL, NBER, IMF, …). Mapped to a primary_location.source.id:
  // clause. Mutually exclusive with the journal ISSN filter
  // (different clauses, ANDed upstream, empty intersection) — when
  // wpEnabled is true we zero out manual journals so a stale
  // ?journals= URL param doesn't degenerate into empty results.
  const wpEnabled = searchParams.get('wpEnabled') === 'true';
  const wpSources = safeList(searchParams.get('wpSources'));

  const filterParams = {
    journals: wpEnabled && wpSources.length > 0 ? [] : journals,
    authors,
    topics,
    institutions,
    publicationType,
    from,
    to,
    workingPaperSourceIds: wpEnabled ? wpSources : [],
  };

  // Decide whether the wide econ filter applies for this request.
  // Manual journals (filterParams.journals) override the wide filter when
  // non-empty, so we only build issnBatches when there are no manual
  // journals AND the client sent an ISSN whitelist. The working-paper
  // filter also wins — its source-id whitelist is a different filter
  // clause and the two can't usefully co-fire.
  let issnBatches: string[][] | null = null;
  if (
    econEnabled &&
    filterParams.journals.length === 0 &&
    !filterParams.workingPaperSourceIds.length &&
    econIssns.length > 0
  ) {
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
