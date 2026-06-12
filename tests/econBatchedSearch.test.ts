// Regression tests for the econ batched-search pagination walk.
//
// Guards the 2026-06 audit fix (H1): when the requested page started
// mid-batch (offsetInPage > 0, i.e. earlier batch counts weren't
// multiples of perPage), the old single-fetch-per-batch walk silently
// dropped items in [batchPage·perPage, batchPage·perPage + offsetInPage)
// of each batch — they never appeared on ANY page — and later pages
// could show duplicates. The fix walks pages WITHIN a batch until the
// requested page is filled or the batch is exhausted.
//
// Strategy: mock fetchOpenAlex with an in-memory "OpenAlex" whose works
// are partitioned into ISSN batches, then assert that concatenating
// every page of econBatchedSearch reproduces the ground-truth ordering
// exactly — no drops, no duplicates — across batch-size combinations
// chosen to hit the historical failure modes.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  batchISSNs,
  econBatchedSearch,
  ISSN_BATCH_SIZE,
} from '@/app/api/search/lib/searches';
import type { OpenAlexWork } from '@/types/openalex';

// ── Mock upstream ────────────────────────────────────────────────────
//
// fetchOpenAlex(url) is the only network touchpoint. The mock parses
// the per-page / page / filter params out of the URL the same way
// OpenAlex would and serves slices of the fake corpus.

let corpus: Map<string, OpenAlexWork[]>; // issn-batch key → works

function batchKeyFromUrl(url: string): string {
  const m = url.match(/primary_location\.source\.issn:([^&,]+)/);
  if (!m) throw new Error(`No ISSN filter in URL: ${url}`);
  return m[1];
}

vi.mock('@/app/api/search/lib/fetch', () => ({
  fetchOpenAlex: vi.fn(async (url: string) => {
    const u = new URL(url);
    const perPage = Number(u.searchParams.get('per-page') || '25');
    const page = Number(u.searchParams.get('page') || '1');
    const works = corpus.get(batchKeyFromUrl(url)) || [];
    return {
      results: works.slice((page - 1) * perPage, page * perPage),
      meta: { count: works.length, page, per_page: perPage },
    };
  }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────

function makeWork(id: number): OpenAlexWork {
  return { id: `W${id}` } as OpenAlexWork;
}

/**
 * Build issnBatches + corpus from a list of per-batch work counts.
 * Batch i is keyed by the joined ISSN list (`issn-i-a|issn-i-b`), which
 * is exactly what the production code embeds in the filter URL.
 */
function setUpBatches(counts: number[]): string[][] {
  corpus = new Map();
  let n = 0;
  const issnBatches: string[][] = [];
  counts.forEach((count, i) => {
    const issns = [`issn-${i}-a`, `issn-${i}-b`];
    issnBatches.push(issns);
    corpus.set(
      issns.join('|'),
      Array.from({ length: count }, () => makeWork(n++)),
    );
  });
  return issnBatches;
}

const getKey = () => null;

async function collectAllPages(
  issnBatches: string[][],
  perPage: number,
): Promise<{ ids: string[]; count: number }> {
  const first = await econBatchedSearch(
    [],
    '',
    'relevance_score',
    1,
    issnBatches,
    perPage,
    getKey,
  );
  const ids = first.results.map((w) => w.id);
  const totalPages = Math.ceil(first.count / perPage);
  for (let p = 2; p <= totalPages; p++) {
    const { results } = await econBatchedSearch(
      [],
      '',
      'relevance_score',
      p,
      issnBatches,
      perPage,
      getKey,
    );
    ids.push(...results.map((w) => w.id));
  }
  return { ids, count: first.count };
}

beforeEach(() => {
  corpus = new Map();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('econBatchedSearch pagination', () => {
  it('reports the summed count across batches', async () => {
    const batches = setUpBatches([15, 100, 7]);
    const { count } = await econBatchedSearch(
      [],
      '',
      'relevance_score',
      1,
      batches,
      20,
      getKey,
    );
    expect(count).toBe(122);
  });

  // The historical bug: batch counts not multiples of perPage forced
  // offsetInPage > 0 in the next batch, and one-fetch-per-batch dropped
  // the tail of that batch's page window. [15, 100] with perPage=20
  // permanently hid items 20–24 of batch 2 before the fix.
  it.each([
    [[15, 100], 20],
    [[15, 100, 7], 20],
    [[1, 1, 1, 99], 20],
    [[19, 19, 19, 19], 7],
    [[0, 5, 0, 33, 2], 20],
    [[250], 20],
    [[3], 100],
    [[15, 100, 7], 1],
  ])(
    'returns every work exactly once, in order (batches %j, perPage %i)',
    async (counts, perPage) => {
      const batches = setUpBatches(counts as number[]);
      const truth = [...corpus.values()].flat().map((w) => w.id);
      const { ids, count } = await collectAllPages(batches, perPage);
      expect(count).toBe(truth.length);
      expect(ids).toEqual(truth); // order preserved, no drops, no dups
    },
  );

  it('returns empty results when every batch is empty', async () => {
    const batches = setUpBatches([0, 0]);
    const { results, count } = await econBatchedSearch(
      [],
      '',
      'relevance_score',
      1,
      batches,
      20,
      getKey,
    );
    expect(results).toEqual([]);
    expect(count).toBe(0);
  });

  it('returns empty results for a page beyond the data', async () => {
    const batches = setUpBatches([5]);
    const { results, count } = await econBatchedSearch(
      [],
      '',
      'relevance_score',
      99,
      batches,
      20,
      getKey,
    );
    expect(results).toEqual([]);
    expect(count).toBe(5);
  });
});

describe('batchISSNs', () => {
  it('chunks at the OpenAlex 100-OR cap', () => {
    const issns = Array.from({ length: 250 }, (_, i) => `i${i}`);
    const batches = batchISSNs(issns);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(issns);
    expect(ISSN_BATCH_SIZE).toBe(100);
  });

  it('keeps a short list in one batch', () => {
    expect(batchISSNs(['a', 'b'])).toEqual([['a', 'b']]);
  });
});
