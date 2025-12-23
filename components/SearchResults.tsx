'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Filters, Paper } from '../types/interfaces';

interface Props {
  query: string;
  filters: Filters;
  trigger: number;
}

export default function SearchResults({ query, filters, trigger }: Props) {
  const [results, setResults] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        let url = `https://api.openalex.org/works?search=${encodeURIComponent(
          query
        )}&per-page=10`;

        const filterParts: string[] = [];

        // Journals
        if (filters.journals.length > 0) {
          filterParts.push(
            filters.journals
              .map((j) => `primary_location.source.issn:${j.issn}`)
              .join(',')
          );
        }

        // Authors
        if (filters.authors.length > 0) {
          filterParts.push(
            filters.authors
              .map((a) => `authorships.author.id:${a.id}`)
              .join(',')
          );
        }

        // Publication years
        if (filters.dateFrom && filters.dateTo) {
          filterParts.push(
            `publication_year:${filters.dateFrom}-${filters.dateTo}`
          );
        } else if (filters.dateFrom) {
          filterParts.push(`publication_year:${filters.dateFrom}-`);
        } else if (filters.dateTo) {
          filterParts.push(`publication_year:-${filters.dateTo}`);
        }

        // Combine all filters in one parameter
        if (filterParts.length > 0) {
          url += `&filter=${filterParts.join(',')}`;
        }

        const res = await axios.get(url);

        console.log('API Response:', res.data);

        const papers: Paper[] = res.data.results.map((w: any) => ({
          id: w.id,
          title: w.title,
          authors: w.authorships.map((a: any) => a.author.display_name),
          publication_year: w.publication_year,
          journal_name: w.primary_location?.source?.display_name || 'Unknown',
        }));

        setResults(papers);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [trigger]);

  if (!query) return <div>Enter a query and click Search</div>;
  if (loading) return <div>Loading...</div>;
  if (results.length === 0) return <div>No results</div>;

  return (
    <div>
      {results.map((p) => (
        <div key={p.id} className='border-b py-2'>
          <h4 className='font-semibold'>{p.title}</h4>
          <div>{p.authors.join(', ')}</div>
          <div>
            {p.journal_name} ({p.publication_year})
          </div>
        </div>
      ))}
    </div>
  );
}
