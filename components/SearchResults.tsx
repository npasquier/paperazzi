'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Filters, Paper } from '../types/interfaces';
import Link from 'next/link';

interface Props {
  query: string;
  filters: Filters;
  trigger: number;
}

export default function SearchResults({ query, filters, trigger }: Props) {
  const [results, setResults] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);

  useEffect(() => {
    if (trigger === 0) return;

    const fetchData = async () => {
      setLoading(true);

      try {
        let url = `https://api.openalex.org/works?per-page=10`;

        // collect filter conditions
        const filterConditions: string[] = [];

        // journals
        if (filters.journals.length == 1) {
          filterConditions.push(
            `primary_location.source.issn:${filters.journals[0].issn}`
          );
        } else if (filters.journals.length > 1) {
          const journalFilter = filters.journals.map((j) => j.issn).join('||');
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

  if (loading) return <div>Loading...</div>;
  if (trigger === 0) return <div>Please fill in query or filters.</div>;
  if (results.length === 0) return <div>No results found</div>;

  return (
    <div>
      {results.map((p) => {
        const paperId = p.id.split('/').pop();

        return (
          <div key={p.id} className='border-b py-2 hover:bg-gray-50'>
            {/* TITLE NAVIGATION */}
            <Link
              href={`/paper/${paperId}`}
              className='font-semibold text-blue-600 block'
            >
              {p.title}
            </Link>

            <div>{p.authors.join(', ')}</div>
            <div>
              {p.journal_name} ({p.publication_year})
            </div>

            <div className='text-sm text-gray-600'>
              Citations: {p.cited_by_count}
            </div>

            {/* EXTERNAL LINKS */}
            <div className='flex gap-3 text-sm text-blue-600'>
              {p.doi && (
                <a
                  href={`https://doi.org/${p.doi}`}
                  target='_blank'
                  onClick={(e) => e.stopPropagation()}
                  className='underline'
                >
                  DOI
                </a>
              )}

              {p.pdf_url && (
                <a
                  href={p.pdf_url}
                  target='_blank'
                  onClick={(e) => e.stopPropagation()}
                  className='underline'
                >
                  PDF
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
