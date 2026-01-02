// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';

function decodeAbstract(inv: any) {
  if (!inv) return '';
  const words: string[] = [];
  Object.entries(inv).forEach(([word, positions]: any) => {
    positions.forEach((p: number) => (words[p] = word));
  });
  return words.join(' ');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const query = searchParams.get('query') || '';
  const journals = (searchParams.get('journals') || '')
    .split(',')
    .filter(Boolean);
  const authors = (searchParams.get('authors') || '')
    .split(',')
    .filter(Boolean);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const sort = searchParams.get('sort') || 'relevance_score';
  const page = Number(searchParams.get('page') || 1);
  const citing = searchParams.get('citing');
  const citingAll = (searchParams.get('citingAll') || '')
    .split(',')
    .filter(Boolean);

  let intersectionIds: string[] | null = null;

  if (citingAll.length > 0) {
    try {
      // Fetch papers that cite each pinned paper
      const resultsPerId: string[][] = await Promise.all(
        citingAll.map(async (id) => {
          // Ensure we have proper ID format for the API
          const fullId = id.startsWith('https://')
            ? id
            : `https://openalex.org/${id}`;
          const apiUrl = `https://api.openalex.org/works?per-page=200&filter=cites:${fullId}&mailto=${process.env.MAIL_ID}`;

          console.log('Fetching citations for:', apiUrl);

          const res = await fetch(apiUrl);
          const data = await res.json();

          if (!data.results) {
            console.error('No results for citing query:', data);
            return [];
          }

          // Return just the short ID (e.g., "W3129025814")
          return data.results.map((w: any) => {
            const id = w.id as string;
            return id.replace('https://openalex.org/', '');
          });
        })
      );

      console.log(
        'Results per pinned paper:',
        resultsPerId.map((r) => r.length)
      );

      // Compute intersection of IDs (papers that cite ALL pinned papers)
      if (resultsPerId.length > 0 && resultsPerId.every((r) => r.length > 0)) {
        intersectionIds = resultsPerId.reduce((a, b) =>
          a.filter((x) => b.includes(x))
        );
      } else {
        intersectionIds = [];
      }

      console.log('Intersection count:', intersectionIds?.length);

      if (!intersectionIds || intersectionIds.length === 0) {
        return NextResponse.json({
          results: [],
          meta: { count: 0, page, per_page: 20 },
        });
      }
    } catch (error) {
      console.error('Error computing citingAll intersection:', error);
      return NextResponse.json({
        results: [],
        meta: { count: 0, page, per_page: 20 },
      });
    }
  }

  // === Build OpenAlex API URL ===
  let url = `https://api.openalex.org/works?per-page=20&page=${page}&mailto=${process.env.MAIL_ID}`;

  const filters: string[] = [];

  if (citing) {
    // Ensure proper format for citing filter
    const fullCitingId = citing.startsWith('https://')
      ? citing
      : `https://openalex.org/${citing}`;
    filters.push(`cites:${fullCitingId}`);
  }

  if (journals.length)
    filters.push(`primary_location.source.issn:${journals.join('|')}`);

  if (authors.length)
    filters.push(authors.map((id) => `authorships.author.id:${id}`).join(','));

  if (from || to) filters.push(`publication_year:${from || ''}-${to || ''}`);

  // Apply intersection filter if exists - these are papers that cite ALL pinned papers
  if (intersectionIds && intersectionIds.length > 0) {
    // Use short IDs with pipe separator for OR filter
    const idsFilter = intersectionIds
      .map((id) => `https://openalex.org/${id}`)
      .join('|');
    filters.push(`openalex_id:${idsFilter}`);
  }

  if (filters.length) url += `&filter=${filters.join(',')}`;

  if (query) url += `&search=${encodeURIComponent(query)}`;

  // Add sort parameter
  if (sort && sort !== 'relevance_score') {
    url += `&sort=${sort}`;
  } else if (sort === 'relevance_score' && !query) {
    url += `&sort=publication_date:desc`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results) {
      console.error('OpenAlex API error:', data);
      return NextResponse.json({
        results: [],
        meta: { count: 0, page, per_page: 20 },
      });
    }

    const papers = data.results.map((w: any) => ({
      id: w.id,
      title: w.title,
      authors: w.authorships?.map((a: any) => a.author.display_name) || [],
      publication_year: w.publication_year,
      journal_name: w.primary_location?.source?.display_name || 'Unknown',
      doi: w.doi,
      pdf_url: w.primary_location?.pdf_url,
      cited_by_count: w.cited_by_count,
      abstract: decodeAbstract(w.abstract_inverted_index),
    }));

    return NextResponse.json({
      results: papers,
      meta: {
        count: data.meta?.count || 0,
        page: page,
        per_page: 20,
      },
    });
  } catch (error) {
    console.error('Error fetching from OpenAlex:', error);
    return NextResponse.json({
      results: [],
      meta: { count: 0, page, per_page: 20 },
    });
  }
}
