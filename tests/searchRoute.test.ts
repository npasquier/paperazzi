// Integration-style tests for the /api/search dispatcher's input
// validation (2026-06 audit items H3, M1, L5). The upstream OpenAlex
// call is mocked at the global-fetch level, so these tests assert two
// things: (1) hostile/malformed params are rejected with a clear 400
// before any upstream call, and (2) the URL we DO send upstream
// contains only sanitized values.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/search/route';

let fetchedUrls: string[];

beforeEach(() => {
  fetchedUrls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      fetchedUrls.push(String(url));
      return new Response(
        JSON.stringify({ results: [], meta: { count: 0 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeRequest(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/search?${qs}`);
}

describe('work-id validation (L5)', () => {
  it('rejects a path-shaped referencedBy with 400, before any upstream call', async () => {
    const res = await GET(makeRequest('referencedBy=W1/../authors/A2'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid OpenAlex work id/);
    expect(fetchedUrls).toEqual([]);
  });

  it('rejects a non-work citing id', async () => {
    const res = await GET(makeRequest('citing=A123'));
    expect(res.status).toBe(400);
    expect(fetchedUrls).toEqual([]);
  });

  it('accepts bare and full-URL work ids', async () => {
    const res = await GET(makeRequest('citing=W5'));
    expect(res.status).toBe(200);
    const res2 = await GET(
      makeRequest(`citing=${encodeURIComponent('https://openalex.org/W5')}`),
    );
    expect(res2.status).toBe(200);
    expect(fetchedUrls.some((u) => u.includes('cites:'))).toBe(true);
  });
});

describe('fan-out cap (H3)', () => {
  it('rejects more than 50 citingAll ids with 400, before any upstream call', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `W${i + 1}`).join(',');
    const res = await GET(makeRequest(`citingAll=${ids}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at most 50/);
    expect(fetchedUrls).toEqual([]);
  });
});

describe('param sanitization (M1)', () => {
  it('drops filter values with unsafe characters, keeps clean ones', async () => {
    await GET(
      makeRequest(
        `journals=${encodeURIComponent('1234-5678,bad value|pipe,9999-0000')}`,
      ),
    );
    expect(fetchedUrls).toHaveLength(1);
    const url = fetchedUrls[0];
    // The clean values survive, OR-joined; the unsafe one is gone.
    expect(url).toContain('1234-5678|9999-0000');
    expect(url).not.toContain('bad');
    expect(url).not.toContain('pipe');
  });

  it('whitelists sort — an injection attempt falls back to the default', async () => {
    await GET(
      makeRequest(`query=x&sort=${encodeURIComponent('relevance_score&select=id')}`),
    );
    expect(fetchedUrls).toHaveLength(1);
    expect(fetchedUrls[0]).not.toContain('select=');
  });

  it('passes whitelisted sorts through', async () => {
    await GET(makeRequest('query=x&sort=cited_by_count:desc'));
    expect(fetchedUrls[0]).toContain('sort=cited_by_count:desc');
  });
});

describe('paging params', () => {
  it('clamps perPage to the OpenAlex max of 100', async () => {
    await GET(makeRequest('perPage=5000'));
    expect(fetchedUrls[0]).toContain('per-page=100');
  });

  it('falls back to defaults for non-numeric page/perPage', async () => {
    await GET(makeRequest('page=abc&perPage='));
    expect(fetchedUrls[0]).toContain('per-page=20');
    // '&page=1' — anchored on '&' so it can't accidentally match the
    // 'page=2' substring inside 'per-page=20'.
    expect(fetchedUrls[0]).toContain('&page=1');
  });
});

describe('response envelope', () => {
  it('returns the uniform results/meta shape on success', async () => {
    const res = await GET(makeRequest('query=labor'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      results: [],
      meta: { count: 0, page: 1, per_page: 20 },
    });
  });
});
