'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterPanel from './FilterPanel';
import SearchResults from './SearchResults';
import JournalModal from './JournalModal';
import AuthorModal from './AuthorModal';
import { Filters } from '../types/interfaces';
import mapIssnsToJournals from '@/utils/issnToJournals';
import PinSidebar from './PinSidebar';

function PaperazziAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Modal state ---
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [isPinSidebarOpen, setIsPinSidebarOpen] = useState(false);

  // --- Local state for controlled inputs (updates as user types, no API calls) ---
  const [filters, setFilters] = useState<Filters>({
    journals: [],
    authors: [],
    dateFrom: '',
    dateTo: '',
    sortBy: 'relevance_score',
    citing: undefined,
    citingAll: undefined,
  });

  // --- Search state (only updates when URL changes, triggers API calls) ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<Filters>({
    journals: [],
    authors: [],
    dateFrom: '',
    dateTo: '',
    sortBy: 'relevance_score',
    citing: undefined,
    citingAll: undefined,
  });
  const [page, setPage] = useState(1);

  // Sync state with URL parameters whenever URL changes
  useEffect(() => {
    const syncFromURL = async () => {
      // Extract params from URL
      const q = searchParams.get('q') || '';
      const journalIssns =
        searchParams.get('journals')?.split(',').filter(Boolean) || [];
      const authorIds =
        searchParams.get('authors')?.split(',').filter(Boolean) || [];
      const from = searchParams.get('from') || '';
      const to = searchParams.get('to') || '';
      const sort = searchParams.get('sort') || 'relevance_score';
      const p = Number(searchParams.get('page') || 1);
      const citing = searchParams.get('citing') || '';
      const citingAll =
        searchParams.get('citingAll')?.split(',').filter(Boolean) || [];

      // If citing is set, we skip syncing other filters

      // Map ISSNs to full journal objects
      const journals = mapIssnsToJournals(journalIssns);

      // Fetch author names from OpenAlex API
      const authors = await Promise.all(
        authorIds.map(async (id) => {
          try {
            const res = await fetch(`https://api.openalex.org/authors/${id}`);
            const data = await res.json();
            return {
              id,
              name: data.display_name || 'Unknown Author',
            };
          } catch (error) {
            console.error(`Failed to fetch author ${id}:`, error);
            return { id, name: 'Unknown Author' };
          }
        })
      );

      // Update controlled inputs (what user sees in the form)
      setFilters({
        journals,
        authors,
        dateFrom: from,
        dateTo: to,
        sortBy: sort,
        citing: citing,
        citingAll: citingAll,
      });

      // Update search state (triggers API call in SearchResults)
      setSearchQuery(q);
      setSearchFilters({
        journals,
        authors,
        dateFrom: from,
        dateTo: to,
        sortBy: sort,
        citing: citing,
        citingAll: citingAll,
      });
      setPage(p);
    };

    syncFromURL();
  }, [searchParams]);

  // Listen for navbar search events
  useEffect(() => {
    const handleNavbarSearch = (e: CustomEvent) => {
      const newQuery = e.detail.query;

      // Build URL with query from navbar + current filters
      const params = new URLSearchParams();

      if (newQuery) params.set('q', newQuery);

      if (filters.journals.length) {
        params.set('journals', filters.journals.map((j) => j.issn).join(','));
      }

      if (filters.authors.length) {
        params.set('authors', filters.authors.map((a) => a.id).join(','));
      }

      if (filters.dateFrom) params.set('from', filters.dateFrom);
      if (filters.dateTo) params.set('to', filters.dateTo);
      if (filters.sortBy) params.set('sort', filters.sortBy);
      if (filters.citing) params.set('citing', filters.citing);
      if (filters.citingAll)
        params.set('citingAll', filters.citingAll.join(','));

      params.set('page', '1');

      router.push(`/search?${params.toString()}`);
    };

    window.addEventListener(
      'navbar-search',
      handleNavbarSearch as EventListener
    );
    return () => {
      window.removeEventListener(
        'navbar-search',
        handleNavbarSearch as EventListener
      );
    };
  }, [filters, router]);

  // Update URL and trigger search (only called on explicit user action)
  const handleSearch = (newPage = 1) => {
    const params = new URLSearchParams();

    // Get query from URL (navbar updates this)
    const currentQuery = searchParams.get('q') || '';
    if (currentQuery) params.set('q', currentQuery);

    if (filters.journals.length) {
      const journalIssns = filters.journals.map((j) => j.issn).join(',');
      params.set('journals', journalIssns);
    }

    if (filters.authors.length) {
      params.set('authors', filters.authors.map((a) => a.id).join(','));
    }

    if (filters.dateFrom) params.set('from', filters.dateFrom);
    if (filters.dateTo) params.set('to', filters.dateTo);
    if (filters.sortBy) params.set('sort', filters.sortBy);

    if (filters.citing) params.set('citing', filters.citing);
    if (filters.citingAll) params.set('citingAll', filters.citingAll.join(','));

    params.set('page', newPage.toString());

    router.push(`/search?${params.toString()}`);
  };

  // Handle sort change - triggers immediate search
  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams();

    const currentQuery = searchParams.get('q') || '';
    if (currentQuery) params.set('q', currentQuery);

    if (filters.journals.length) {
      params.set('journals', filters.journals.map((j) => j.issn).join(','));
    }

    if (filters.authors.length) {
      params.set('authors', filters.authors.map((a) => a.id).join(','));
    }

    if (filters.dateFrom) params.set('from', filters.dateFrom);
    if (filters.dateTo) params.set('to', filters.dateTo);
    if (filters.citing) params.set('citing', filters.citing);
    if (filters.citingAll) params.set('citingAll', filters.citingAll.join(','));

    params.set('sort', newSort);
    params.set('page', '1');

    router.push(`/search?${params.toString()}`);
  };

  const handleFindCites = (paperId: string) => {
    const params = new URLSearchParams();

    if (searchQuery) params.set('q', searchQuery);

    if (filters.journals.length)
      params.set('journals', filters.journals.map((j) => j.issn).join(','));

    if (filters.authors.length)
      params.set('authors', filters.authors.map((a) => a.id).join(','));

    if (filters.dateFrom) params.set('from', filters.dateFrom);
    if (filters.dateTo) params.set('to', filters.dateTo);
    if (filters.sortBy) params.set('sort', filters.sortBy);

    params.set('citing', paperId);
    params.set('page', '1');

    router.push(`/search?${params.toString()}`);
  };

  // Add this function in PaperazziAppContent
  const handleClearCiting = () => {
    const params = new URLSearchParams();

    const currentQuery = searchParams.get('q') || '';
    if (currentQuery) params.set('q', currentQuery);

    if (filters.journals.length) {
      params.set('journals', filters.journals.map((j) => j.issn).join(','));
    }

    if (filters.authors.length) {
      params.set('authors', filters.authors.map((a) => a.id).join(','));
    }

    if (filters.dateFrom) params.set('from', filters.dateFrom);
    if (filters.dateTo) params.set('to', filters.dateTo);
    if (filters.sortBy) params.set('sort', filters.sortBy);

    // Don't include 'citing' - that's the point!
    // Keep citingAll if you want, or remove it too:
    // if (filters.citingAll?.length) params.set('citingAll', filters.citingAll.join(','));

    params.set('page', '1');

    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className='flex h-[calc(100vh-57px)] bg-stone-50'>
      {/* Left sidebar with filters - fixed width, scrollable */}
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        openJournalModal={() => setShowJournalModal(true)}
        openAuthorModal={() => setShowAuthorModal(true)}
        onSortChange={handleSortChange}
        isOpen={isFilterOpen}
        onToggle={() => setIsFilterOpen((v) => !v)}
      />

      {/* Main results area - scrollable */}
      <main className='flex-1 overflow-y-auto'>
        <div className='max-w-5xl mx-auto p-6'>
          <SearchResults
            query={searchQuery}
            journals={searchFilters.journals}
            authors={searchFilters.authors}
            from={searchFilters.dateFrom}
            to={searchFilters.dateTo}
            sortBy={searchFilters.sortBy}
            page={page}
            loadMore={(newPage) => handleSearch(newPage)}
            citing={searchFilters.citing}
            citingAll={searchFilters.citingAll}
            onClearCiting={handleClearCiting}
          />
        </div>
      </main>

      <PinSidebar
        isOpen={isPinSidebarOpen}
        onToggle={() => setIsPinSidebarOpen((v) => !v)}
        onFindingCites={handleFindCites}
      />

      {/* Modals */}
      <AuthorModal
        isOpen={showAuthorModal}
        selectedAuthors={filters.authors}
        onClose={() => setShowAuthorModal(false)}
        onAddAuthor={(author) =>
          setFilters((prev) => ({
            ...prev,
            authors: [
              ...prev.authors.filter((a) => a.id !== author.id),
              author,
            ],
          }))
        }
      />

      <JournalModal
        isOpen={showJournalModal}
        selectedJournals={filters.journals}
        onClose={() => setShowJournalModal(false)}
        onApply={(selected) =>
          setFilters((prev) => ({ ...prev, journals: selected }))
        }
      />
    </div>
  );
}

export default function PaperazziApp() {
  return (
    <Suspense
      fallback={
        <div className='flex h-[calc(100vh-57px)] bg-stone-50'>
          <aside className='w-80 bg-white border-r border-stone-200 p-4'>
            <div className='text-sm text-stone-600'>Loading filters...</div>
          </aside>
          <div className='flex-1 p-6'>
            <div className='text-stone-600'>Loading search...</div>
          </div>
        </div>
      }
    >
      <PaperazziAppContent />
    </Suspense>
  );
}
