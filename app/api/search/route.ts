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

// Split ISSNs into batches of 100
function batchISSNs(issns: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < issns.length; i += 100) {
    batches.push(issns.slice(i, i + 100));
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
    filters.push(`openalex_id:${params.workIds.map(toFullId).join('|')}`);
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
    filters.push(`authorships.institutions.id:${params.institutions.map(toFullId).join('|')}`);
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
async function fetchOpenAlex(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 503 && attempt < retries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`OpenAlex 503, retrying in ${waitTime}ms (${attempt}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!res.ok) {
        console.error(`OpenAlex API error: ${res.status} ${res.statusText}`);
        if (res.status === 503) {
          throw new Error('OpenAlex API is temporarily unavailable. Please try again in a moment.');
        }
        throw new Error(`OpenAlex API returned ${res.status}`);
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
      console.log(`Network error, retrying in ${waitTime}ms (${attempt}/${retries})`);
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
  apiKey: string,
  issnBatches: string[][],
): Promise<{ results: any[]; count: number }> {
  // Step 1: Get count from each batch in parallel (cheap: per-page=1)
  const batchCounts = await Promise.all(
    issnBatches.map(async (batch) => {
      const batchFilters = [
        ...baseFilters,
        `primary_location.source.issn:${batch.join('|')}`,
      ];
      let url = `https://api.openalex.org/works?per-page=1&page=1&api_key=${apiKey}`;
      url += `&filter=${batchFilters.join(',')}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      const data = await fetchOpenAlex(url);
      return data.meta?.count || 0;
    }),
  );

  const totalCount = batchCounts.reduce((a, b) => a + b, 0);
  if (totalCount === 0) return { results: [], count: 0 };

  // Step 2: Walk batches to find which one(s) contain the requested page
  let skipRemaining = (page - 1) * 20;
  const resultsToReturn: any[] = [];

  for (let i = 0; i < issnBatches.length; i++) {
    const batchCount = batchCounts[i];
    if (batchCount === 0) continue;

    if (skipRemaining >= batchCount) {
      skipRemaining -= batchCount;
      continue;
    }

    const needed = 20 - resultsToReturn.length;
    const batchPage = Math.floor(skipRemaining / 20) + 1;
    const offsetInPage = skipRemaining % 20;

    const batchFilters = [
      ...baseFilters,
      `primary_location.source.issn:${issnBatches[i].join('|')}`,
    ];

    let url = `https://api.openalex.org/works?per-page=20&page=${batchPage}&api_key=${apiKey}`;
    url += `&filter=${batchFilters.join(',')}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    url += buildSort(sort, !!query);

    const data = await fetchOpenAlex(url);
    const batchResults = data.results || [];
    const sliced = batchResults.slice(offsetInPage, offsetInPage + needed);
    resultsToReturn.push(...sliced);

    skipRemaining = 0;
    if (resultsToReturn.length >= 20) break;
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
  apiKey: string,
  issnBatches: string[][] | null,
): Promise<{ results: any[]; count: number }> {
  if (workIds.length === 0) return { results: [], count: 0 };

  if (query) {
    const filters = buildFilters(filterParams);
    let searchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=200&api_key=${apiKey}`;
    if (filters.length) searchUrl += `&filter=${filters.join(',')}`;

    const searchData = await fetchOpenAlex(searchUrl);
    const searchIds = (searchData.results || []).map((w: any) => normalizeId(w.id));
    const intersectedIds = workIds.filter((id) => searchIds.includes(id));

    if (intersectedIds.length === 0) return { results: [], count: 0 };

    if (issnBatches) {
      const idsFilter = `openalex_id:${intersectedIds.map(toFullId).join('|')}`;
      return econBatchedSearch([idsFilter], '', sort, page, apiKey, issnBatches);
    }

    const totalCount = intersectedIds.length;
    const paginatedIds = intersectedIds.slice((page - 1) * 20, page * 20);
    if (paginatedIds.length === 0) return { results: [], count: totalCount };

    const idsFilter = paginatedIds.map(toFullId).join('|');
    let url = `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=20&api_key=${apiKey}`;
    url += buildSort(sort, true);
    const data = await fetchOpenAlex(url);
    return { results: data.results || [], count: totalCount };
  }

  // No query
  if (issnBatches) {
    const baseFilters = buildFilters({ ...filterParams, workIds });
    return econBatchedSearch(baseFilters, '', sort, page, apiKey, issnBatches);
  }

  const filters = buildFilters({ ...filterParams, workIds });
  let url = `https://api.openalex.org/works?filter=${filters.join(',')}&per-page=20&page=${page}&api_key=${apiKey}`;
  url += buildSort(sort, false);
  const data = await fetchOpenAlex(url);
  return { results: data.results || [], count: data.meta?.count || 0 };
}

// ────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const apiKey = process.env.OPEN_ALEX_API_KEY || '';

  const query = searchParams.get('query') || '';
  const journals = (searchParams.get('journals') || '').split(',').filter(Boolean);
  const authors = (searchParams.get('authors') || '').split(',').filter(Boolean);
  const topics = (searchParams.get('topics') || '').split(',').filter(Boolean);
  const institutions = (searchParams.get('institutions') || '').split(',').filter(Boolean);
  const publicationType = searchParams.get('type') || '';
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const sort = searchParams.get('sort') || 'relevance_score';
  const page = Number(searchParams.get('page') || 1);

  const citing = searchParams.get('citing');
  const citingAll = (searchParams.get('citingAll') || '').split(',').filter(Boolean);
  const referencedBy = searchParams.get('referencedBy');
  const referencesAll = (searchParams.get('referencesAll') || '').split(',').filter(Boolean);

  // Econ filter
  const econEnabled = searchParams.get('econEnabled') === 'true';
  const econCat = (searchParams.get('econCat') || '').split(',').filter(Boolean).map(Number);
  const econDom = (searchParams.get('econDom') || '').split(',').filter(Boolean);

  let issnBatches: string[][] | null = null;
  if (econEnabled) {
    const issns = getEconISSNs(econCat, econDom);
    if (issns.length > 0) {
      issnBatches = batchISSNs(issns);
    }
  }

  const filterParams = { journals, authors, topics, institutions, publicationType, from, to };

  try {
    // CASE 1: referencedBy
    if (referencedBy) {
      const cleanId = normalizeId(referencedBy);
      const paperData = await fetchOpenAlex(`https://api.openalex.org/works/${cleanId}?api_key=${apiKey}`);
      const referencedWorks = paperData.referenced_works || [];

      if (referencedWorks.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: 20 },
          referencedByTitle: cleanHtml(paperData.title),
        });
      }

      const referenceIds = referencedWorks.map(normalizeId);
      const { results, count } = await searchWithinIds(referenceIds, query, filterParams, sort, page, apiKey, issnBatches);

      return NextResponse.json({
        results: mapToPapers(results),
        meta: { count, page, per_page: 20 },
        referencedByTitle: cleanHtml(paperData.title),
      });
    }

    // CASE 2: referencesAll
    if (referencesAll.length > 0) {
      const referenceSets = await Promise.all(
        referencesAll.map(async (id) => {
          const data = await fetchOpenAlex(`https://api.openalex.org/works/${normalizeId(id)}?api_key=${apiKey}`);
          return (data.referenced_works || []).map(normalizeId);
        }),
      );
      const commonIds = referenceSets.reduce((a, b) => a.filter((id: string) => b.includes(id)));

      if (commonIds.length === 0) {
        return NextResponse.json({ results: [], meta: { count: 0, page, per_page: 20 } });
      }

      const { results, count } = await searchWithinIds(commonIds, query, filterParams, sort, page, apiKey, issnBatches);
      return NextResponse.json({ results: mapToPapers(results), meta: { count, page, per_page: 20 } });
    }

    // CASE 3: citingAll
    if (citingAll.length > 0) {
      const citingSets = await Promise.all(
        citingAll.map(async (id) => {
          const data = await fetchOpenAlex(`https://api.openalex.org/works?per-page=200&filter=cites:${toFullId(id)}&api_key=${apiKey}`);
          return (data.results || []).map((w: any) => normalizeId(w.id));
        }),
      );
      const commonIds = citingSets.reduce((a, b) => a.filter((id: string) => b.includes(id)));

      if (commonIds.length === 0) {
        return NextResponse.json({ results: [], meta: { count: 0, page, per_page: 20 } });
      }

      const { results, count } = await searchWithinIds(commonIds, query, filterParams, sort, page, apiKey, issnBatches);
      return NextResponse.json({ results: mapToPapers(results), meta: { count, page, per_page: 20 } });
    }

    // CASE 4: Regular search
    const filters = buildFilters({ ...filterParams, citing });

    if (issnBatches) {
      const { results, count } = await econBatchedSearch(filters, query, sort, page, apiKey, issnBatches);
      return NextResponse.json({ results: mapToPapers(results), meta: { count, page, per_page: 20 } });
    }

    let url = `https://api.openalex.org/works?per-page=20&page=${page}&api_key=${apiKey}`;
    if (filters.length) url += `&filter=${filters.join(',')}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    url += buildSort(sort, !!query);

    const data = await fetchOpenAlex(url);

    return NextResponse.json(
      { results: mapToPapers(data.results || []), meta: { count: data.meta?.count || 0, page, per_page: 20 } },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    console.error('Search API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isServiceUnavailable = errorMessage.includes('temporarily unavailable');

    return NextResponse.json(
      { results: [], meta: { count: 0, page, per_page: 20 }, error: errorMessage },
      { status: isServiceUnavailable ? 503 : 500, headers: { 'Cache-Control': 'no-store, must-revalidate' } },
    );
  }
}