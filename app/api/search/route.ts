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

    console.log(
    'Search API called with:',
    { query, journals, authors, from, to, sort, page, citing, citingAll }   
    )

  let intersectionIds: string[] | null = null;

  if (citingAll.length > 0) {
    // Fetch citing papers for each pinned paper
    const resultsPerId: string[][] = await Promise.all(
      citingAll.map(async (id) => {
        const res = await fetch(
          `https://api.openalex.org/works?per-page=200&filter=cites:${id}&mailto=${process.env.MAIL_ID}`
        );
        const data = await res.json();
        return data.results.map((w: any) => w.id);
      })
    );

    // Compute intersection of IDs
    intersectionIds = resultsPerId.reduce((a, b) =>
      a.filter((x) => b.includes(x))
    );
    if (intersectionIds.length === 0) {
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
    filters.push(`cites:${citing}`);
  }

  if (journals.length)
    filters.push(`primary_location.source.issn:${journals.join('|')}`);

  if (authors.length)
    filters.push(authors.map((id) => `authorships.author.id:${id}`).join(','));

  if (from || to) filters.push(`publication_year:${from || ''}-${to || ''}`);

  // Apply intersection filter if exists
  if (intersectionIds) {
    filters.push(`id:${intersectionIds.join('|')}`); // OR in OpenAlex, but we pre-intersected
  }

  if (filters.length) url += `&filter=${filters.join(',')}`;

  if (query) url += `&search=${encodeURIComponent(query)}`;

  // Add sort parameter
  if (sort && sort !== 'relevance_score') {
    url += `&sort=${sort}`;
  } else if (sort === 'relevance_score' && !query) {
    url += `&sort=publication_date:desc`;
  }

  console.log('OpenAlex API URL:', url);

  const res = await fetch(url);
  const data = await res.json();

  const papers = data.results.map((w: any) => ({
    id: w.id,
    title: w.title,
    authors: w.authorships.map((a: any) => a.author.display_name),
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
}
