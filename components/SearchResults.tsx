'use client';

import { useEffect, useState, useTransition } from 'react';
import { Paper, RESULTS_PER_PAGE } from '../types/interfaces';
import PaperCard from './ui/PaperCard';
import { usePins } from '@/contexts/PinContext';

interface Props {
  query: string;
  journals: { issn: string; name?: string }[];
  authors: { id: string; name?: string }[];
  from?: string;
  to?: string;
  sortBy?: string;
  page: number;
  citing?: string; // Paper ID to find papers citing
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
  citing,
  loadMore,
}: Props) {
  const [results, setResults] = useState<Paper[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const { pinnedIds } = usePins();

  useEffect(() => {
    // If citing is set, search for papers citing that paper
    if (citing) {
      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/search?citing=${citing}&sort=${sortBy}&page=${page}`
          );
          const data = await res.json();
          setResults(data.results);
          setTotalCount(data.meta?.count || 0);
        } catch {
          setResults([]);
          setTotalCount(0);
        }
      });
      return;
    }

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
        setTotalCount(data.meta?.count || 0);
      } catch {
        setResults([]);
        setTotalCount(0);
      }
    });
  }, [query, journals, authors, from, to, sortBy, page, citing]);

  // Calculate total pages
  const totalPages = Math.ceil(totalCount / RESULTS_PER_PAGE);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 10;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      let start = Math.max(2, page - 3);
      let end = Math.min(totalPages - 1, page + 3);

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      if (totalPages > 1) pages.push(totalPages);
    }

    return pages;
  };

  const handlePageChange = (newPage: number) => {
    if (loadMore) loadMore(newPage);
  };

  // Build preserve params string for links
  const preserveParams = pinnedIds.length > 0 ? `pinned=${pinnedIds.join(',')}` : '';

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-stone-500 animate-pulse text-lg">Searching papers…</div>
      </div>
    );
  }

  if (!citing && !query && journals.length === 0 && authors.length === 0) {
    return (
      <div className="text-center py-12 text-stone-500">
        Please enter a search query or select filters to begin.
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-stone-500">
        No papers found. Try adjusting your search criteria.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Results count */}
      <div className="text-sm text-stone-600 mb-4">
        {citing ? (
          <span>Papers citing the selected paper: </span>
        ) : null}
        Showing {(page - 1) * RESULTS_PER_PAGE + 1}–
        {Math.min(page * RESULTS_PER_PAGE, totalCount)} of {totalCount.toLocaleString()} results
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {results.map((paper) => (
          <PaperCard
            key={paper.id}
            paper={paper}
            variant="default"
            showPinButton={true}
            showActions={true}
            preserveParams={preserveParams}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-4 border-t bg-white">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded disabled:text-stone-400 disabled:hover:bg-transparent transition"
          >
            Previous
          </button>

          {getPageNumbers().map((pageNum, idx) => {
            if (pageNum === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 text-stone-400">
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

          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded disabled:text-stone-400 disabled:hover:bg-transparent transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}