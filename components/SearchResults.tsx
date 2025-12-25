'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Filters, Paper } from '../types/interfaces';
import Link from 'next/link';
import { FileText, ExternalLink, Download } from 'lucide-react';

interface Props {
  query: string;
  filters: Filters;
  trigger: number;
}

export default function SearchResults({ query, filters, trigger }: Props) {
  const [results, setResults] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;

    const fetchData = async () => {
      setLoading(true);

      try {
        let url = `https://api.openalex.org/works?per-page=10&mailto=${process.env.MAIL_ID}`;

        // Search looks through titles and abstracts but also fulltext when possible.
        // There is a filter for search only titles and abstracts: filter=title.title_and_abstract.search
        // Apparently OpenAlex also uses stemming to span word variations.

        // I think there should be way to filter only economics related research thanks to their domain categorization
        // There are displayed in their api we just need to add domains or fields.

        // I wonder also about topics: they have a topic classification that could be useful.

        // collect filter conditions
        const filterConditions: string[] = [];

        // journals
        if (filters.journals.length == 1) {
          filterConditions.push(
            `primary_location.source.issn:${filters.journals[0].issn}`
          );
        } else if (filters.journals.length > 1) {
          const journalFilter = filters.journals.map((j) => j.issn).join('|');
          filterConditions.push(
            `primary_location.source.issn:${journalFilter}`
          );
        }

        // authors
        if (filters.authors.length > 0) {
          filterConditions.push(
            filters.authors
              .map((a) => `authorships.author.id:${a.id}`)
              .join(',')
          );
        }

        // years
        if (filters.dateFrom && filters.dateTo) {
          filterConditions.push(
            `publication_year:${filters.dateFrom}-${filters.dateTo}`
          );
        } else if (filters.dateFrom) {
          filterConditions.push(`publication_year:${filters.dateFrom}-`);
        } else if (filters.dateTo) {
          filterConditions.push(`publication_year:-${filters.dateTo}`);
        }

        // append filters
        if (filterConditions.length > 0) {
          url += `&filter=${filterConditions.join(',')}`;
        }

        // append search query only if present
        if (query) {
          url += `&search=${encodeURIComponent(query)}`;
        }

        const res = await axios.get(url);
        console.log('API URL:', url);
        const papers: Paper[] = res.data.results.map((w: any) => ({
          id: w.id,
          title: w.title,
          authors: w.authorships.map((a: any) => a.author.display_name),
          publication_year: w.publication_year,
          journal_name: w.primary_location?.source?.display_name || 'Unknown',
          doi: w.doi,
          pdf_url: w.primary_location?.pdf_url,
          cited_by_count: w.cited_by_count,
          abstract: w.abstract_inverted_index,
        }));

        setResults(papers);
      } catch (err) {
        console.error(err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [trigger]);

  if (loading)
    return (
      <div className='text-slate-500 animate-pulse'>Searching papers…</div>
    );
  if (trigger === 0) return <div>Please fill in query or filters.</div>;
  if (results.length === 0)
    return <div className='text-slate-500'>No papers found.</div>;

  return (
    <div>
      {results.map((p) => {
        const paperId = p.id.split('/').pop();

        return (
          <div
            key={p.id}
            className='bg-white rounded-xl shadow-sm p-4 mb-3 hover:shadow-md transition border'
          >
            <div className='flex items-start gap-3'>
              <FileText className='w-5 h-5 text-blue-500 mt-1' />

              <div className='flex-1'>
                <Link
                  href={`/paper/${paperId}`}
                  className='font-semibold text-blue-700 hover:underline block'
                >
                  {p.title}
                </Link>

                <div className='text-sm text-slate-600'>
                  {p.authors.join(', ')}
                </div>

                <div className='text-xs text-slate-500 mt-1'>
                  {p.journal_name} • {p.publication_year}
                </div>

                <div className='text-xs text-slate-500 mt-1'>
                  Citations: {p.cited_by_count}
                </div>

                <div className='flex gap-4 mt-2 text-sm text-blue-600'>
                  {p.doi && (
                    <a
                      href={`https://doi.org/${p.doi}`}
                      target='_blank'
                      className='flex items-center gap-1 hover:underline'
                    >
                      <ExternalLink size={14} /> DOI
                    </a>
                  )}

                  {p.pdf_url && (
                    <a
                      href={p.pdf_url}
                      target='_blank'
                      className='flex items-center gap-1 hover:underline'
                    >
                      <Download size={14} /> PDF
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
