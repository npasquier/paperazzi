'use client';
import { useEffect, useState, useTransition } from 'react';
import { Paper } from '../types/interfaces';
import Link from 'next/link';
import { ExternalLink, Download, Info } from 'lucide-react';

interface Props {
  query: string;
  journals: { issn: string; name?: string }[];
  authors: { id: string; name?: string }[];
  from?: string;
  to?: string;
  sortBy?: string;
  page: number;
  loadMore?: (page: number) => void;
}

export default function SearchResults({
  query,
  journals,
  authors,
  from,
  to,
  sortBy = 'relevance_score',
  page,
  loadMore,
}: Props) {
  const [results, setResults] = useState<Paper[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  
  const resultsPerPage = 20; // Increased from 10

  useEffect(() => {
    if (!query && journals.length === 0 && authors.length === 0) return;

    startTransition(async () => {
      try {
        const journalIssns = journals.map((j) => j.issn);
        const authorIds = authors.map((a) => a.id);

        const res = await fetch(
          `/api/search?query=${encodeURIComponent(
            query
          )}&journals=${journalIssns.join(',')}&authors=${authorIds.join(
            ','
          )}&from=${from || ''}&to=${to || ''}&sort=${sortBy}&page=${page}`
        );
        const data = await res.json();
        setResults(data.results);
        setTotalCount(data.meta?.count || 0); // Assuming API returns total count
      } catch {
        setResults([]);
        setTotalCount(0);
      }
    });
  }, [query, journals, authors, from, to, sortBy, page]);

  // Calculate total pages
  const totalPages = Math.ceil(totalCount / resultsPerPage);

  // Generate page numbers to display (like Google Scholar)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 10; // Show max 10 page numbers

    if (totalPages <= maxVisible) {
      // Show all pages if total is less than max
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);

      // Calculate range around current page
      let start = Math.max(2, page - 3);
      let end = Math.min(totalPages - 1, page + 3);

      // Add ellipsis after first page if needed
      if (start > 2) {
        pages.push('...');
      }

      // Add pages around current page
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      // Add ellipsis before last page if needed
      if (end < totalPages - 1) {
        pages.push('...');
      }

      // Show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handlePageChange = (newPage: number) => {
    if (loadMore) {
      loadMore(newPage); // Pass the new page number!
    }
  };

  if (isPending) {
    return (
      <div className='flex items-center justify-center py-12'>
        <div className='text-stone-500 animate-pulse text-lg'>Searching papers…</div>
      </div>
    );
  }

  if (!query && journals.length === 0 && authors.length === 0) {
    return (
      <div className='text-center py-12 text-stone-500'>
        Please enter a search query or select filters to begin.
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className='text-center py-12 text-stone-500'>
        No papers found. Try adjusting your search criteria.
      </div>
    );
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Results count */}
      <div className='text-sm text-stone-600 mb-4'>
        Showing {(page - 1) * resultsPerPage + 1}–{Math.min(page * resultsPerPage, totalCount)} of {totalCount.toLocaleString()} results
      </div>

      {/* Results list - more compact */}
      <div className='flex-1 overflow-y-auto space-y-3 mb-4'>
        {results.map((p) => (
          <div
            key={p.id}
            className='bg-white border border-stone-200 rounded-lg p-3 hover:border-stone-300 transition'
          >
            <div className='flex items-start justify-between gap-4'>
              {/* Left side: Paper info */}
              <div className='flex-1 min-w-0'>
                {/* Title */}
                <h3 className='font-semibold text-stone-900 text-base leading-snug mb-1'>
                  {p.title}
                </h3>

                {/* Authors - truncated if too long */}
                <div className='text-sm text-stone-600 mb-1 truncate'>
                  {p.authors.slice(0, 5).join(', ')}
                  {p.authors.length > 5 && `, +${p.authors.length - 5} more`}
                </div>

                {/* Journal and year */}
                <div className='text-xs text-stone-500'>
                  {p.journal_name} • {p.publication_year} • {p.cited_by_count} citations
                </div>
              </div>

              {/* Right side: Action buttons - horizontal compact */}
              <div className='flex flex-wrap gap-2 items-start flex-shrink-0'>
                <Link
                  href={`/paper/${p.id.split('/').pop()}`}
                  className='inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap'
                >
                  <Info size={12} /> Info
                </Link>
                
                {p.doi && (
                  <a
                    href={`https://doi.org/${p.doi}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap'
                  >
                    <ExternalLink size={12} /> DOI
                  </a>
                )}
                
                {p.pdf_url && (
                  <a
                    href={p.pdf_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap'
                  >
                    <Download size={12} /> PDF
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination - Google Scholar style */}
      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-1 py-4 border-t bg-white'>
          {/* Previous button */}
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className='px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded disabled:text-stone-400 disabled:hover:bg-transparent transition'
          >
            Previous
          </button>

          {/* Page numbers */}
          {getPageNumbers().map((pageNum, idx) => {
            if (pageNum === '...') {
              return (
                <span key={`ellipsis-${idx}`} className='px-2 text-stone-400'>
                  ...
                </span>
              );
            }

            const isCurrentPage = pageNum === page;
            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum as number)}
                className={`min-w-[40px] px-3 py-2 text-sm rounded transition ${
                  isCurrentPage
                    ? 'bg-stone-800 text-white font-semibold'
                    : 'text-stone-700 hover:bg-stone-50'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          {/* Next button */}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className='px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded disabled:text-stone-400 disabled:hover:bg-transparent transition'
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}