import { NextRequest, NextResponse } from 'next/server';
import buildAbstract from '@/utils/abstract';

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
    const topicFilter = params.topics.map((id) => toFullId(id)).join('|');
    filters.push(`topics.id:${topicFilter}`);
  }

  if (params.institutions.length) {
    const instFilter = params.institutions.map((id) => toFullId(id)).join('|');
    filters.push(`authorships.institutions.id:${instFilter}`);
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

      // Handle 503 with retry
      if (res.status === 503 && attempt < retries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(
          `OpenAlex 503 error, retrying in ${waitTime}ms (attempt ${attempt}/${retries})`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!res.ok) {
        console.error(`OpenAlex API error: ${res.status} ${res.statusText}`);
        console.error(`URL: ${url}`);

        // For 503, give a more user-friendly error
        if (res.status === 503) {
          throw new Error(
            'OpenAlex API is temporarily unavailable. Please try again in a moment.'
          );
        }

        throw new Error(`OpenAlex API returned ${res.status}`);
      }

      const text = await res.text();

      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON response');
        console.error('URL:', url);
        console.error('Response preview:', text.substring(0, 500));
        throw new Error('Invalid JSON response from OpenAlex');
      }
    } catch (error) {
      // If it's the last attempt or not a network error, throw
      if (attempt === retries || !(error instanceof TypeError)) {
        throw error;
      }

      // Network error, retry
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(
        `Network error, retrying in ${waitTime}ms (attempt ${attempt}/${retries})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Failed to fetch from OpenAlex after retries');
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
  mailTo: string
): Promise<{ results: any[]; count: number }> {
  if (workIds.length === 0) {
    return { results: [], count: 0 };
  }

  if (query) {
    const filters = buildFilters(filterParams);
    let searchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(
      query
    )}&per-page=200&mailto=${mailTo}`;

    if (filters.length) {
      searchUrl += `&filter=${filters.join(',')}`;
    }

    const searchData = await fetchOpenAlex(searchUrl);
    const searchIds = (searchData.results || []).map((w: any) =>
      normalizeId(w.id)
    );

    const intersectedIds = workIds.filter((id) => searchIds.includes(id));

    if (intersectedIds.length === 0) {
      return { results: [], count: 0 };
    }

    const totalCount = intersectedIds.length;
    const paginatedIds = intersectedIds.slice((page - 1) * 20, page * 20);

    if (paginatedIds.length === 0) {
      return { results: [], count: totalCount };
    }

    const idsFilter = paginatedIds.map(toFullId).join('|');
    let url = `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=20&mailto=${mailTo}`;
    url += buildSort(sort, true);

    const data = await fetchOpenAlex(url);

    return {
      results: data.results || [],
      count: totalCount,
    };
  }

  const filters = buildFilters({ ...filterParams, workIds });
  let url = `https://api.openalex.org/works?filter=${filters.join(
    ','
  )}&per-page=20&page=${page}&mailto=${mailTo}`;
  url += buildSort(sort, false);

  const data = await fetchOpenAlex(url);

  return {
    results: data.results || [],
    count: data.meta?.count || 0,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mailTo = process.env.MAIL_ID || '';

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

  const citing = searchParams.get('citing');
  const citingAll = (searchParams.get('citingAll') || '')
    .split(',')
    .filter(Boolean);
  const referencedBy = searchParams.get('referencedBy');
  const referencesAll = (searchParams.get('referencesAll') || '')
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

  try {
    // CASE 1: referencedBy
    if (referencedBy) {
      const cleanId = normalizeId(referencedBy);
      const paperData = await fetchOpenAlex(
        `https://api.openalex.org/works/${cleanId}?mailto=${mailTo}`
      );

      const referencedWorks = paperData.referenced_works || [];

      if (referencedWorks.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: 20 },
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
        mailTo
      );

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
          const cleanId = normalizeId(id);
          const data = await fetchOpenAlex(
            `https://api.openalex.org/works/${cleanId}?mailto=${mailTo}`
          );
          return (data.referenced_works || []).map(normalizeId);
        })
      );

      const commonIds = referenceSets.reduce((a, b) =>
        a.filter((id: string) => b.includes(id))
      );

      if (commonIds.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: 20 },
        });
      }

      const { results, count } = await searchWithinIds(
        commonIds,
        query,
        filterParams,
        sort,
        page,
        mailTo
      );

      return NextResponse.json({
        results: mapToPapers(results),
        meta: { count, page, per_page: 20 },
      });
    }

    // CASE 3: citingAll
    if (citingAll.length > 0) {
      const citingSets = await Promise.all(
        citingAll.map(async (id) => {
          const fullId = toFullId(id);
          const data = await fetchOpenAlex(
            `https://api.openalex.org/works?per-page=200&filter=cites:${fullId}&mailto=${mailTo}`
          );
          return (data.results || []).map((w: any) => normalizeId(w.id));
        })
      );

      const commonIds = citingSets.reduce((a, b) =>
        a.filter((id: string) => b.includes(id))
      );

      if (commonIds.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: 20 },
        });
      }

      const { results, count } = await searchWithinIds(
        commonIds,
        query,
        filterParams,
        sort,
        page,
        mailTo
      );

      return NextResponse.json({
        results: mapToPapers(results),
        meta: { count, page, per_page: 20 },
      });
    }

    // CASE 4: Regular search
    const filters = buildFilters({ ...filterParams, citing });
    let url = `https://api.openalex.org/works?per-page=20&page=${page}&mailto=${mailTo}`;

    if (filters.length) {
      url += `&filter=${filters.join(',')}`;
    }

    if (query) {
      url += `&search=${encodeURIComponent(query)}`;
    }

    url += buildSort(sort, !!query);

    const data = await fetchOpenAlex(url);

    return NextResponse.json(
      {
        results: mapToPapers(data.results || []),
        meta: { count: data.meta?.count || 0, page, per_page: 20 },
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error) {
    console.error('Search API error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const isServiceUnavailable = errorMessage.includes(
      'temporarily unavailable'
    );

    return NextResponse.json(
      {
        results: [],
        meta: { count: 0, page, per_page: 20 },
        error: errorMessage,
      },
      {
        status: isServiceUnavailable ? 503 : 500,
        headers: {
          'Cache-Control': 'no-store, must-revalidate',
        },
      }
    );
  }
}
