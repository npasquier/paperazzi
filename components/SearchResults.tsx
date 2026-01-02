'use client';

import { useEffect, useState, useTransition } from 'react';
import { Paper, RESULTS_PER_PAGE } from '../types/interfaces';
import PaperCard from './ui/PaperCard';
import { usePins } from '@/contexts/PinContext';
import { X, Quote } from 'lucide-react';

interface Props {
  query: string;
  journals: { issn: string; name?: string }[];
  authors: { id: string; name?: string }[];
  from?: string;
  to?: string;
  sortBy?: string;
  page: number;
  citing?: string;
  citingAll?: string[];
  loadMore?: (page: number) => void;
  onClearCiting?: () => void; // New prop to clear the citing filter
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
  citingAll,
  loadMore,
  onClearCiting,
}: Props) {
  const [results, setResults] = useState<Paper[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [citingPaper, setCitingPaper] = useState<Paper | null>(null);
  const [loadingCitingPaper, setLoadingCitingPaper] = useState(false);
  const { pinnedIds } = usePins();

  // Fetch the paper being cited when `citing` changes
  useEffect(() => {
    if (!citing) {
      setCitingPaper(null);
      return;
    }

    setLoadingCitingPaper(true);
    fetch(`https://api.openalex.org/works/${citing}`)
      .then((res) => res.json())
      .then((data) => {
        setCitingPaper({
          id: data.id,
          title: data.title,
          authors: data.authorships?.map((a: any) => a.author.display_name) || [],
          publication_year: data.publication_year,
          journal_name: data.primary_location?.source?.display_name || 'Unknown',
          doi: data.doi,
          cited_by_count: data.cited_by_count,
          abstract: '',
        });
      })
      .catch((err) => {
        console.error('Failed to fetch citing paper:', err);
        setCitingPaper(null);
      })
      .finally(() => setLoadingCitingPaper(false));
  }, [citing]);

  useEffect(() => {
    if (
      !citing &&
      !citingAll?.length &&
      !query &&
      journals.length === 0 &&
      authors.length === 0
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const journalIssns = journals.map((j) => j.issn);
        const authorIds = authors.map((a) => a.id);

        const params = new URLSearchParams();

        if (query) params.set('query', query);
        if (journalIssns.length) params.set('journals', journalIssns.join(','));
        if (authorIds.length) params.set('authors', authorIds.join(','));
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (sortBy) params.set('sort', sortBy);
        params.set('page', page.toString());

        if (citing) params.set('citing', citing);
        if (citingAll?.length) params.set('citingAll', citingAll.join(','));

        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        setResults(data.results);
        setTotalCount(data.meta?.count || 0);
      } catch {
        setResults([]);
        setTotalCount(0);
      }
    });
  }, [query, journals, authors, from, to, sortBy, page, citing, citingAll]);

  const totalPages = Math.ceil(totalCount / RESULTS_PER_PAGE);

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

  const preserveParams =
    pinnedIds.length > 0 ? `pinned=${pinnedIds.join(',')}` : '';

  if (isPending) {
    return (
      <div className='flex items-center justify-center py-12'>
        <div className='text-stone-500 animate-pulse text-lg'>
          Searching papers…
        </div>
      </div>
    );
  }

  if (
    !citing &&
    !citingAll?.length &&
    !query &&
    journals.length === 0 &&
    authors.length === 0
  ) {
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
      {/* Citing Paper Banner */}
      {citing && (
        <div className='mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-2 flex-1 min-w-0'>
              <Quote
                size={16}
                className='text-amber-600 mt-0.5 flex-shrink-0'
              />
              <div className='min-w-0'>
                <p className='text-xs font-medium text-amber-800 mb-1'>
                  Showing papers that cite:
                </p>
                {loadingCitingPaper ? (
                  <p className='text-sm text-amber-700 animate-pulse'>
                    Loading paper info...
                  </p>
                ) : citingPaper ? (
                  <div>
                    <p className='text-sm font-medium text-stone-900 truncate'>
                      {citingPaper.title}
                    </p>
                    <p className='text-xs text-stone-600 truncate'>
                      {citingPaper.authors?.slice(0, 3).join(', ')}
                      {citingPaper.authors?.length > 3 && ' et al.'}
                      {citingPaper.publication_year &&
                        ` (${citingPaper.publication_year})`}
                    </p>
                  </div>
                ) : (
                  <p className='text-sm text-amber-700'>Paper ID: {citing}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClearCiting}
              className='p-1 hover:bg-amber-100 rounded transition flex-shrink-0'
              title='Clear citing filter'
            >
              <X size={16} className='text-amber-600' />
            </button>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className='text-sm text-stone-600 mb-4'>
        Showing {(page - 1) * RESULTS_PER_PAGE + 1}–
        {Math.min(page * RESULTS_PER_PAGE, totalCount)} of{' '}
        {totalCount.toLocaleString()} results
      </div>

      {/* Results list */}
      <div className='flex-1 overflow-y-auto space-y-3 mb-4'>
        {results.map((paper) => (
          <PaperCard
            key={paper.id}
            paper={paper}
            variant='default'
            showPinButton={true}
            showActions={true}
            preserveParams={preserveParams}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-1 py-4 border-t bg-white'>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className='px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded disabled:text-stone-400 disabled:hover:bg-transparent transition'
          >
            Previous
          </button>

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