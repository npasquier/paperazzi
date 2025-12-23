import { Paper } from '../types/interfaces';

function cleanTitle(title: string) {
  return title.replace(/<\/?scp>/gi, '');
}

export default function parsePapers(data: any[]): Paper[] {
  return data.map((w: any) => ({
    id: w.id.split('/').pop(),
    title: cleanTitle(w.title),
    authors: w.authorships?.map((a: any) => a.author.display_name) || [],
    publication_year: w.publication_year,
    journal_name: w.primary_location?.source?.display_name || 'Unknown',
    cited_by_count: w.cited_by_count,
    doi: w.doi,
    pdf_url: w.primary_location?.pdf_url,
    abstract: w.abstract_inverted_index,
  }));
}
