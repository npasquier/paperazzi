import { NextRequest, NextResponse } from 'next/server';
import buildAbstract from '@/utils/abstract';

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
    const authorFilter = params.authors.map((id) => toFullId(id)).join('|');
    filters.push(`authorships.author.id:${authorFilter}`);
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
    title: w.title,
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

  // If there's a query, we need to:
  // 1. Search with the query + filters
  // 2. Intersect results with our workIds
  if (query) {
    // First, get all works matching the query (up to a reasonable limit)
    const filters = buildFilters(filterParams);
    let searchUrl = `https://api.openalex.org/works?search=${encodeURIComponent(
      query
    )}&per-page=200&mailto=${mailTo}`;
    if (filters.length) {
      searchUrl += `&filter=${filters.join(',')}`;
    }

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const searchIds = (searchData.results || []).map((w: any) =>
      normalizeId(w.id)
    );

    // Intersect with our workIds
    const intersectedIds = workIds.filter((id) => searchIds.includes(id));

    if (intersectedIds.length === 0) {
      return { results: [], count: 0 };
    }

    // Now fetch the intersected works with pagination and sort
    const totalCount = intersectedIds.length;
    const paginatedIds = intersectedIds.slice((page - 1) * 20, page * 20);

    if (paginatedIds.length === 0) {
      return { results: [], count: totalCount };
    }

    const idsFilter = paginatedIds.map(toFullId).join('|');
    let url = `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=20&mailto=${mailTo}`;
    url += buildSort(sort, true);

    const res = await fetch(url);
    const data = await res.json();

    return {
      results: data.results || [],
      count: totalCount,
    };
  }

  // No query - just filter by IDs and other filters
  const filters = buildFilters({ ...filterParams, workIds });

  let url = `https://api.openalex.org/works?filter=${filters.join(
    ','
  )}&per-page=20&page=${page}&mailto=${mailTo}`;
  url += buildSort(sort, false);

  const res = await fetch(url);
  const data = await res.json();

  return {
    results: data.results || [],
    count: data.meta?.count || 0,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mailTo = process.env.MAIL_ID || '';

  // Parse query params
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

  // Common filter params
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
    // ============================================
    // CASE 1: referencedBy (papers cited by a given paper)
    // ============================================
    if (referencedBy) {
      const cleanId = normalizeId(referencedBy);
      const paperRes = await fetch(
        `https://api.openalex.org/works/${cleanId}?mailto=${mailTo}`
      );
      const paperData = await paperRes.json();

      const referencedWorks = paperData.referenced_works || [];
      if (referencedWorks.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: 20 },
          referencedByTitle: paperData.title,
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
        referencedByTitle: paperData.title,
      });
    }

    // ============================================
    // CASE 2: referencesAll (common references across multiple papers)
    // ============================================
    if (referencesAll.length > 0) {
      // Fetch referenced_works for each paper
      const referenceSets = await Promise.all(
        referencesAll.map(async (id) => {
          const cleanId = normalizeId(id);
          const res = await fetch(
            `https://api.openalex.org/works/${cleanId}?mailto=${mailTo}`
          );
          const data = await res.json();
          return (data.referenced_works || []).map(normalizeId);
        })
      );

      // Find intersection
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

    // ============================================
    // CASE 3: citingAll (papers citing ALL specified papers)
    // ============================================
    if (citingAll.length > 0) {
      // Fetch citing papers for each pinned paper
      const citingSets = await Promise.all(
        citingAll.map(async (id) => {
          const fullId = toFullId(id);
          const res = await fetch(
            `https://api.openalex.org/works?per-page=200&filter=cites:${fullId}&mailto=${mailTo}`
          );
          const data = await res.json();
          return (data.results || []).map((w: any) => normalizeId(w.id));
        })
      );

      // Find intersection
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

    // ============================================
    // CASE 4: Regular search (with optional citing filter)
    // ============================================
    const filters = buildFilters({ ...filterParams, citing });

    let url = `https://api.openalex.org/works?per-page=20&page=${page}&mailto=${mailTo}`;

    if (filters.length) {
      url += `&filter=${filters.join(',')}`;
    }

    if (query) {
      url += `&search=${encodeURIComponent(query)}`;
    }

    url += buildSort(sort, !!query);

    const res = await fetch(url);
    const data = await res.json();

    return NextResponse.json({
      results: mapToPapers(data.results || []),
      meta: { count: data.meta?.count || 0, page, per_page: 20 },
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({
      results: [],
      meta: { count: 0, page, per_page: 20 },
    });
  }
}
