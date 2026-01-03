import { NextRequest, NextResponse } from 'next/server';
import buildAbstract from '@/utils/abstract';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

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
  const referencedBy = searchParams.get('referencedBy');
  const citingAll = (searchParams.get('citingAll') || '')
    .split(',')
    .filter(Boolean);
  const referencesAll = (searchParams.get('referencesAll') || '')
    .split(',')
    .filter(Boolean);

  // ---------------------------------------------------------------------------
  // referencedBy : backward references from one paper
  // ---------------------------------------------------------------------------
  if (referencedBy) {
    try {
      const cleanId = referencedBy.replace('https://openalex.org/', '');
      const paperRes = await fetch(
        `https://api.openalex.org/works/${cleanId}?mailto=${process.env.MAIL_ID}`
      );
      const paperData = await paperRes.json();

      if (
        !paperData.referenced_works ||
        paperData.referenced_works.length === 0
      ) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page: 1, per_page: 20 },
          referencedByTitle: paperData.title,
        });
      }

      const total = paperData.referenced_works.length;
      const start = (page - 1) * 20;
      const pageIds = paperData.referenced_works.slice(start, start + 20);

      const idsFilter = pageIds.join('|');
      let url = `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=20&mailto=${process.env.MAIL_ID}`;
      if (sort && sort !== 'relevance_score') url += `&sort=${sort}`;

      const res = await fetch(url);
      const data = await res.json();

      const papers = (data.results || []).map((w: any) => ({
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

      return NextResponse.json({
        results: papers,
        meta: { count: total, page, per_page: 20 },
        referencedByTitle: paperData.title,
      });
    } catch (e) {
      console.error('referencedBy error', e);
      return NextResponse.json({
        results: [],
        meta: { count: 0, page, per_page: 20 },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // citingAll : intersection of citing papers
  // ---------------------------------------------------------------------------
  let intersectionIds: string[] | null = null;

  if (citingAll.length > 0) {
    const sets: string[][] = await Promise.all(
      citingAll.map(async (id) => {
        const full = `https://openalex.org/${id.replace(
          'https://openalex.org/',
          ''
        )}`;
        const res = await fetch(
          `https://api.openalex.org/works?per-page=200&filter=cites:${full}&mailto=${process.env.MAIL_ID}`
        );
        const data = await res.json();
        return (data.results || []).map((w: any) =>
          w.id.replace('https://openalex.org/', '')
        );
      })
    );

    intersectionIds = sets.reduce((a: string[], b: string[]) =>
      a.filter((x: string) => b.includes(x))
    );

    if (!intersectionIds || intersectionIds.length === 0) {
      return NextResponse.json({
        results: [],
        meta: { count: 0, page, per_page: 20 },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // referencesAll : intersection of common references
  // ---------------------------------------------------------------------------
  let commonReferenceIds: string[] | null = null;

  if (referencesAll.length > 0) {
    const sets: string[][] = await Promise.all(
      referencesAll.map(async (id) => {
        const clean = id.replace('https://openalex.org/', '');
        const res = await fetch(
          `https://api.openalex.org/works/${clean}?mailto=${process.env.MAIL_ID}`
        );
        const data = await res.json();
        return (data.referenced_works || []).map((r: string) =>
          r.replace('https://openalex.org/', '')
        );
      })
    );

    commonReferenceIds = sets.reduce((a: string[], b: string[]) =>
      a.filter((x: string) => b.includes(x))
    );

    if (!commonReferenceIds || commonReferenceIds.length === 0) {
      return NextResponse.json({
        results: [],
        meta: { count: 0, page, per_page: 20 },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Build main OpenAlex query
  // ---------------------------------------------------------------------------
  let url = `https://api.openalex.org/works?per-page=20&page=${page}&mailto=${process.env.MAIL_ID}`;
  const filters: string[] = [];

  if (citing)
    filters.push(
      `cites:https://openalex.org/${citing.replace(
        'https://openalex.org/',
        ''
      )}`
    );

  if (intersectionIds)
    filters.push(
      `openalex_id:${intersectionIds
        .map((x) => `https://openalex.org/${x}`)
        .join('|')}`
    );

  if (commonReferenceIds)
    filters.push(
      `openalex_id:${commonReferenceIds
        .map((x) => `https://openalex.org/${x}`)
        .join('|')}`
    );

  if (filters.length) url += `&filter=${filters.join(',')}`;
  if (query) url += `&search=${encodeURIComponent(query)}`;
  if (sort !== 'relevance_score') url += `&sort=${sort}`;

  const res = await fetch(url);
  const data = await res.json();

  const papers = (data.results || []).map((w: any) => ({
    id: w.id,
    title: w.title,
    authors: w.authorships?.map((a: any) => a.author.display_name) || [],
    publication_year: w.publication_year,
    journal_name: w.primary_location?.source?.display_name || 'Unknown',
    doi: w.doi,
    pdf_url: w.primary_location?.pdf_url,
    cited_by_count: w.cited_by_count,
    abstract: buildAbstract(w.abstract_inverted_index),
  }));

  return NextResponse.json({
    results: papers,
    meta: { count: data.meta?.count || 0, page, per_page: 20 },
  });
}
