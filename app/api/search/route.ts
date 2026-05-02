import { NextRequest, NextResponse } from 'next/server';
import buildAbstract from '@/utils/abstract';
import econJournalList from '@/data/journals';

// Build a filtered set of ISSNs based on category/domain selections
function getEconISSNs(categories: number[], domains: string[]): string[] {
  let filtered = econJournalList as any[];
  if (categories.length > 0) {
    filtered = filtered.filter((j) => categories.includes(j.category));
  }
  if (domains.length > 0) {
    filtered = filtered.filter((j) => domains.includes(j.domain));
  }
  return filtered.map((j) => j.issn);
}

const OPENALEX_KEYS = (process.env.OPENALEX_KEYS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// A KeyPicker is a per-request iterator over OPENALEX_KEYS. It starts at a
// random offset (so different cold-started serverless instances and different
// concurrent requests on the same instance don't all hammer KEYS[0] first)
// and then rotates round-robin from there. Each request calls
// `makeKeyPicker()` once at the top of the handler and threads the resulting
// `getKey` function through every helper that ends up calling fetchOpenAlex,
// so sub-calls within one request still spread evenly across the key pool.
type KeyPicker = () => string | null;

function makeKeyPicker(): KeyPicker {
  if (OPENALEX_KEYS.length === 0) return () => null;
  let i = Math.floor(Math.random() * OPENALEX_KEYS.length);
  return () => OPENALEX_KEYS[i++ % OPENALEX_KEYS.length];
}

// Split ISSNs into batches. OpenAlex has a URL length limit by filter of 100 (OR values per filter	is 100)

const ISSN_BATCH_SIZE = 100;
function batchISSNs(issns: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < issns.length; i += ISSN_BATCH_SIZE) {
    batches.push(issns.slice(i, i + ISSN_BATCH_SIZE));
  }
  return batches;
}

// Helper to clean HTML tags from text
function cleanHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to normalize OpenAlex IDs
function normalizeId(id: string): string {
  return id.replace('https://openalex.org/', '');
}

function toFullId(id: string): string {
  return id.startsWith('https://') ? id : `https://openalex.org/${id}`;
}

// Helper to build common filters
function buildFilters(params: {
  journals: string[];
  authors: string[];
  topics: string[];
  institutions: string[];
  publicationType: string;
  from: string | null;
  to: string | null;
  citing?: string | null;
  workIds?: string[];
}): string[] {
  const filters: string[] = [];

  if (params.workIds?.length) {
    filters.push(`openalex_id:${params.workIds.join('|')}`);
  }
  if (params.citing) {
    filters.push(`cites:${toFullId(params.citing)}`);
  }
  if (params.journals.length) {
    filters.push(`primary_location.source.issn:${params.journals.join('|')}`);
  }
  if (params.authors.length) {
    params.authors.forEach((id) => {
      filters.push(`authorships.author.id:${toFullId(id)}`);
    });
  }
  if (params.topics.length) {
    filters.push(`topics.id:${params.topics.map(toFullId).join('|')}`);
  }
  if (params.institutions.length) {
    filters.push(
      `authorships.institutions.id:${params.institutions.map(toFullId).join('|')}`,
    );
  }
  if (params.publicationType) {
    filters.push(`type:${params.publicationType}`);
  }
  if (params.from || params.to) {
    filters.push(`publication_year:${params.from || ''}-${params.to || ''}`);
  }

  return filters;
}

// Helper to map OpenAlex results to Paper objects
function mapToPapers(results: any[]): any[] {
  return results.map((w: any) => ({
    id: w.id,
    title: cleanHtml(w.title),
    authors: w.authorships?.map((a: any) => a.author.display_name) || [],
    publication_year: w.publication_year,
    journal_name: w.primary_location?.source?.display_name || 'Unknown',
    doi: w.doi,
    pdf_url: w.primary_location?.pdf_url,
    cited_by_count: w.cited_by_count,
    referenced_works_count: w.referenced_works_count || 0,
    abstract: buildAbstract(w.abstract_inverted_index),
    issns: w.primary_location?.source?.issn || [],
    // Normalised OpenAlex IDs (no URL prefix) so client-side edge lookups can
    // match against paper.id without per-call massaging.
    referenced_works: (w.referenced_works || []).map(normalizeId),
  }));
}

// Helper to build sort parameter
function buildSort(sort: string, hasQuery: boolean): string {
  if (sort && sort !== 'relevance_score') {
    return `&sort=${sort}`;
  } else if (!hasQuery) {
    return '&sort=publication_date:desc';
  }
  return '';
}

// Helper to fetch with error handling and retry logic
async function fetchOpenAlex(
  url: string,
  getKey: KeyPicker,
  retries = 3,
): Promise<any> {
  const apiKey = getKey();
  if (apiKey) {
    url += (url.includes('?') ? '&' : '?') + `api_key=${apiKey}`;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise((r) => setTimeout(r, Math.random() * 40));
      const res = await fetch(url);

      if (res.status === 503 && attempt < retries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(
          `OpenAlex 503, retrying in ${waitTime}ms (${attempt}/${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!res.ok) {
        // Capture the response body — OpenAlex usually returns JSON with an
        // explanatory `error` / `message` field on 400/422. Without this the
        // generic "OpenAlex API returned 400" tells you nothing about cause.
        let bodyPreview = '';
        try {
          bodyPreview = (await res.text()).slice(0, 500);
        } catch {
          // ignore
        }
        console.error(
          `OpenAlex API error: ${res.status} ${res.statusText} — ${bodyPreview}`,
        );
        if (res.status === 503) {
          throw new Error(
            'OpenAlex API is temporarily unavailable. Please try again in a moment.',
          );
        }
        if (res.status === 400 && url.length > 6000) {
          // Most common cause when filtering a network view by a wide
          // category — the openalex_id list + ISSN whitelist exceeds the
          // upstream URL limit. Report it explicitly.
          throw new Error(
            `OpenAlex returned 400 (request URL too long: ${url.length} chars). Try narrowing the journal filter or use Specific mode with a smaller list.`,
          );
        }
        throw new Error(
          `OpenAlex API returned ${res.status}, ${res.statusText}, URL length: ${url.length}, body: ${bodyPreview}, URL: ${url}`,
        );
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        console.error('Failed to parse JSON. URL:', url);
        throw new Error('Invalid JSON response from OpenAlex');
      }
    } catch (error) {
      if (attempt === retries || !(error instanceof TypeError)) {
        throw error;
      }
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(
        `Network error, retrying in ${waitTime}ms (${attempt}/${retries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Failed to fetch from OpenAlex after retries');
}

// ────────────────────────────────────────────────────────────
// Batched econ search: exact count + paginated results
// ────────────────────────────────────────────────────────────

async function econBatchedSearch(
  baseFilters: string[],
  query: string,
  sort: string,
  page: number,
  issnBatches: string[][],
  perPage: number,
  getKey: KeyPicker,
): Promise<{ results: any[]; count: number }> {
  // Step 1: Get count from each batch in parallel (cheap: per-page=1)
  const batchCounts = await Promise.all(
    issnBatches.map(async (batch) => {
      const batchFilters = [
        ...baseFilters,
        `primary_location.source.issn:${batch.join('|')}`,
      ];
      let url = `https://api.openalex.org/works?per-page=1&page=1`;
      url += `&filter=${batchFilters.join(',')}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      const data = await fetchOpenAlex(url, getKey);
      return data.meta?.count || 0;
    }),
  );

  const totalCount = batchCounts.reduce((a, b) => a + b, 0);
  if (totalCount === 0) return { results: [], count: 0 };

  // Step 2: Walk batches to find which one(s) contain the requested page
  let skipRemaining = (page - 1) * perPage;
  const resultsToReturn: any[] = [];

  for (let i = 0; i < issnBatches.length; i++) {
    const batchCount = batchCounts[i];
    if (batchCount === 0) continue;

    if (skipRemaining >= batchCount) {
      skipRemaining -= batchCount;
      continue;
    }

    const needed = perPage - resultsToReturn.length;
    const batchPage = Math.floor(skipRemaining / perPage) + 1;
    const offsetInPage = skipRemaining % perPage;

    const batchFilters = [
      ...baseFilters,
      `primary_location.source.issn:${issnBatches[i].join('|')}`,
    ];

    let url = `https://api.openalex.org/works?per-page=${perPage}&page=${batchPage}`;
    url += `&filter=${batchFilters.join(',')}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    url += buildSort(sort, !!query);

    const data = await fetchOpenAlex(url, getKey);
    const batchResults = data.results || [];
    const sliced = batchResults.slice(offsetInPage, offsetInPage + needed);
    resultsToReturn.push(...sliced);

    skipRemaining = 0;
    if (resultsToReturn.length >= perPage) break;
  }

  return { results: resultsToReturn, count: totalCount };
}

// Helper to search within a set of IDs
async function searchWithinIds(
  workIds: string[],
  query: string,
  filterParams: {
    journals: string[];
    authors: string[];
    topics: string[];
    institutions: string[];
    publicationType: string;
    from: string | null;
    to: string | null;
  },
  sort: string,
  page: number,
  issnBatches: string[][] | null,
  perPage: number,
  getKey: KeyPicker,
): Promise<{ results: any[]; count: number }> {
  if (workIds.length === 0) return { results: [], count: 0 };

  if (query) {
    const filters = buildFilters(filterParams);
    let searchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=200`;
    if (filters.length) searchUrl += `&filter=${filters.join(',')}`;

    const searchData = await fetchOpenAlex(searchUrl, getKey);
    const searchIds = (searchData.results || []).map((w: any) =>
      normalizeId(w.id),
    );
    const intersectedIds = workIds.filter((id) => searchIds.includes(id));

    if (intersectedIds.length === 0) return { results: [], count: 0 };

    if (issnBatches) {
      const idsFilter = `openalex_id:${intersectedIds.map(toFullId).join('|')}`;
      return econBatchedSearch(
        [idsFilter],
        '',
        sort,
        page,
        issnBatches,
        perPage,
        getKey,
      );
    }

    const totalCount = intersectedIds.length;
    const paginatedIds = intersectedIds.slice(
      (page - 1) * perPage,
      page * perPage,
    );
    if (paginatedIds.length === 0) return { results: [], count: totalCount };

    const idsFilter = paginatedIds.map(toFullId).join('|');
    let url = `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=${perPage}`;
    url += buildSort(sort, true);
    const data = await fetchOpenAlex(url, getKey);

    return { results: data.results || [], count: totalCount };
  }

  // No query
  {
    const ID_BATCH_SIZE = 50;

    const idBatches: string[][] = [];
    for (let i = 0; i < workIds.length; i += ID_BATCH_SIZE) {
      idBatches.push(workIds.slice(i, i + ID_BATCH_SIZE));
    }

    // Build the regular filters (topics/authors/institutions/type/year)
    // so we can push them upstream rather than ignoring them.
    const extraFilters = buildFilters(filterParams);

    // STEP 1 — fetch ALL works in safe ID batches, with upstream filters applied
    const batchResults = await Promise.all(
      idBatches.map(async (batch) => {
        const filters = [
          `openalex_id:${batch.map(toFullId).join('|')}`,
          ...extraFilters,
        ];
        const url = `https://api.openalex.org/works?filter=${filters.join(',')}&per-page=200`;
        const data = await fetchOpenAlex(url, getKey);
        return data.results || [];
      }),
    );

    const allResults = batchResults.flat();

    // STEP 2 — ECON ISSN whitelist still has to be applied locally because
    // it can exceed the upstream filter's 100-value cap.
    const filtered = allResults.filter((w: any) => {
      if (!issnBatches) return true;
      const issns = w.primary_location?.source?.issn || [];
      const allowedIssns = issnBatches.flat();
      return issns.some((i: string) => allowedIssns.includes(i));
    });

    const totalCount = filtered.length;
    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    return { results: paginated, count: totalCount };
  }
}

// ────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // One key picker per request: starts at a random offset so concurrent users
  // (and concurrent serverless instances) don't all begin on the same key,
  // then rotates round-robin across this request's sub-calls.
  const getKey = makeKeyPicker();

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
  // perPage: 1..100, default 20. Used by graph mode (100) to fit more dots in
  // a single round-trip. Maxvalue by Open Alex is 100.
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
  // (referencedBy / citingAll / referencesAll / citing) keep the keyword path.
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
  // non-empty, so we only build issnBatches when there are no manual journals.
  let issnBatches: string[][] | null = null;
  if (econEnabled && filterParams.journals.length === 0) {
    const issns =
      econIssns.length > 0 ? econIssns : getEconISSNs(econCat, econDom);
    if (issns.length > 0) {
      // Small ISSN sets fit in a single OpenAlex filter — skip the batched
      // count/walk machinery and let the caller use the regular filter path.
      issnBatches =
        issns.length <= ISSN_BATCH_SIZE ? [issns] : batchISSNs(issns);
    }
  }

  try {
    // CASE 1: referencedBy
    if (referencedBy) {
      const cleanId = normalizeId(referencedBy);
      const paperData = await fetchOpenAlex(
        `https://api.openalex.org/works/${cleanId}`,
        getKey,
      );
      const referencedWorks = paperData.referenced_works || [];

      if (referencedWorks.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: perPage },
          referencedByTitle: cleanHtml(paperData.title),
        });
      }

      const referenceIds = referencedWorks.map(normalizeId);
      const { results, count } = await searchWithinIds(
        referenceIds,
        query,
        filterParams,
        sort,
        page,
        issnBatches,
        perPage,
        getKey,
      );

      return NextResponse.json({
        results: mapToPapers(results),
        meta: { count, page, per_page: perPage },
        referencedByTitle: cleanHtml(paperData.title),
      });
    }

    // CASE 2: referencesAll
    if (referencesAll.length > 0) {
      const referenceSets = await Promise.all(
        referencesAll.map(async (id) => {
          const data = await fetchOpenAlex(
            `https://api.openalex.org/works/${normalizeId(id)}`,
            getKey,
          );
          return (data.referenced_works || []).map(normalizeId);
        }),
      );
      const commonIds = referenceSets.reduce((a, b) =>
        a.filter((id: string) => b.includes(id)),
      );

      if (commonIds.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: perPage },
        });
      }

      const { results, count } = await searchWithinIds(
        commonIds,
        query,
        filterParams,
        sort,
        page,
        issnBatches,
        perPage,
        getKey,
      );
      return NextResponse.json({
        results: mapToPapers(results),
        meta: { count, page, per_page: perPage },
      });
    }

    // CASE 3: citingAll
    if (citingAll.length > 0) {
      const citingSets = await Promise.all(
        citingAll.map(async (id) => {
          const data = await fetchOpenAlex(
            `https://api.openalex.org/works?per-page=200&filter=cites:${toFullId(id)}`,
            getKey,
          );
          return (data.results || []).map((w: any) => normalizeId(w.id));
        }),
      );
      const commonIds = citingSets.reduce((a, b) =>
        a.filter((id: string) => b.includes(id)),
      );

      if (commonIds.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: perPage },
        });
      }

      const { results, count } = await searchWithinIds(
        commonIds,
        query,
        filterParams,
        sort,
        page,
        issnBatches,
        perPage,
        getKey,
      );
      return NextResponse.json({
        results: mapToPapers(results),
        meta: { count, page, per_page: perPage },
      });
    }

    // CASE 4: Regular search
    const filters = buildFilters({ ...filterParams, citing });

    // CASE 4a: Semantic search (single call, ≤50 results, no batched paths).
    // Requires a query — fall through to keyword if absent.
    if (semantic && query) {
      const semPerPage = Math.min(50, perPage);

      let url = `https://api.openalex.org/works?per-page=${semPerPage}&search.semantic=${encodeURIComponent(query)}`;
      if (filters.length) url += `&filter=${filters.join(',')}`;
      // Don't override sort: semantic returns by similarity.

      const data = await fetchOpenAlex(url, getKey);
      let results = data.results || [];

      // Apply ECON ISSN whitelist locally — the wide list can exceed
      // OpenAlex's 100-OR-per-filter cap, but with ≤50 results to filter
      // it's trivial in memory and avoids the rate-limited batched path.
      if (issnBatches) {
        const allowedIssns = new Set(issnBatches.flat());
        results = results.filter((w: any) => {
          const issns = w.primary_location?.source?.issn || [];
          return issns.some((i: string) => allowedIssns.has(i));
        });
      }

      return NextResponse.json(
        {
          results: mapToPapers(results),
          meta: {
            count: results.length,
            page: 1,
            per_page: results.length,
            semantic: true,
            // Signal to the UI that pagination should be suppressed and the
            // result set is intrinsically capped by the upstream endpoint.
            capped: true,
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

    if (issnBatches) {
      const { results, count } = await econBatchedSearch(
        filters,
        query,
        sort,
        page,
        issnBatches,
        perPage,
        getKey,
      );
      return NextResponse.json({
        results: mapToPapers(results),
        meta: { count, page, per_page: perPage },
      });
    }

    let url = `https://api.openalex.org/works?per-page=${perPage}&page=${page}`;
    if (filters.length) url += `&filter=${filters.join(',')}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    url += buildSort(sort, !!query);

    const data = await fetchOpenAlex(url, getKey);

    return NextResponse.json(
      {
        results: mapToPapers(data.results || []),
        meta: { count: data.meta?.count || 0, page, per_page: perPage },
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
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
        meta: { count: 0, page, per_page: 20 },
        error: errorMessage,
      },
      {
        status: isServiceUnavailable ? 503 : 500,
        headers: { 'Cache-Control': 'no-store, must-revalidate' },
      },
    );
  }
}
