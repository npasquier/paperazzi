'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterPanel from './FilterPanel';
import SearchResults from './SearchResults';
import JournalModal from './JournalModal';
import AuthorModal from './AuthorModal';
import TopicModal from './TopicModal';
import InstitutionModal from './InstitutionModal';
import { Filters, Topic, Institution } from '../types/interfaces';
import mapIssnsToJournals from '@/utils/issnToJournals';
import PinSidebar from './PinSidebar';
import CreateAlertButton from './CreateAlertButton';

function PaperazziAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Modal state ---
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showInstitutionModal, setShowInstitutionModal] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPinSidebarOpen, setIsPinSidebarOpen] = useState(false);

  // --- Local state for controlled inputs ---
  const [filters, setFilters] = useState<Filters>({
    journals: [],
    authors: [],
    topics: [],
    institutions: [],
    publicationType: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'relevance_score',
    citing: undefined,
    citingAll: undefined,
    referencedBy: undefined,
    referencesAll: undefined,
  });

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<Filters>({
    journals: [],
    authors: [],
    topics: [],
    institutions: [],
    publicationType: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'relevance_score',
    citing: undefined,
    citingAll: undefined,
    referencedBy: undefined,
    referencesAll: undefined,
  });
  const [page, setPage] = useState(1);

  // Sync state with URL parameters
  useEffect(() => {
    const syncFromURL = async () => {
      const q = searchParams.get('q') || '';
      const journalIssns =
        searchParams.get('journals')?.split(',').filter(Boolean) || [];
      const authorIds =
        searchParams.get('authors')?.split(',').filter(Boolean) || [];
      const topicIds =
        searchParams.get('topics')?.split(',').filter(Boolean) || [];
      const institutionIds =
        searchParams.get('institutions')?.split(',').filter(Boolean) || [];
      const pubType = searchParams.get('type') || '';
      const from = searchParams.get('from') || '';
      const to = searchParams.get('to') || '';
      const sort = searchParams.get('sort') || 'relevance_score';
      const p = Number(searchParams.get('page') || 1);
      const citing = searchParams.get('citing') || '';
      const citingAll =
        searchParams.get('citingAll')?.split(',').filter(Boolean) || [];
      const referencedBy = searchParams.get('referencedBy') || '';
      const referencesAll =
        searchParams.get('referencesAll')?.split(',').filter(Boolean) || [];

      const journals = mapIssnsToJournals(journalIssns);

      // Fetch authors
      const authors = await Promise.all(
        authorIds.map(async (id) => {
          try {
            const res = await fetch(`https://api.openalex.org/authors/${id}`);
            const data = await res.json();
            return { id, name: data.display_name || 'Unknown Author' };
          } catch {
            return { id, name: 'Unknown Author' };
          }
        })
      );

      // Fetch topics
      const topics: Topic[] = await Promise.all(
        topicIds.map(async (id) => {
          try {
            const res = await fetch(`https://api.openalex.org/topics/${id}`);
            const data = await res.json();
            return {
              id: data.id,
              display_name: data.display_name || 'Unknown Topic',
              subfield: data.subfield,
              field: data.field,
              domain: data.domain,
            };
          } catch {
            return { id, display_name: 'Unknown Topic' };
          }
        })
      );

      // Fetch institutions
      const institutions: Institution[] = await Promise.all(
        institutionIds.map(async (id) => {
          try {
            const res = await fetch(
              `https://api.openalex.org/institutions/${id}`
            );
            const data = await res.json();
            return {
              id: data.id,
              display_name: data.display_name || 'Unknown Institution',
              country_code: data.country_code,
              type: data.type,
            };
          } catch {
            return { id, display_name: 'Unknown Institution' };
          }
        })
      );

      const newFilters: Filters = {
        journals,
        authors,
        topics,
        institutions,
        publicationType: pubType,
        dateFrom: from,
        dateTo: to,
        sortBy: sort,
        citing,
        citingAll,
        referencedBy,
        referencesAll,
      };

      setFilters(newFilters);
      setSearchQuery(q);
      setSearchFilters(newFilters);
      setPage(p);
    };

    syncFromURL();
  }, [searchParams]);

  // Build URL params helper
  const buildURLParams = (
    overrides: Partial<Filters & { query?: string; page?: number }> = {}
  ) => {
    const params = new URLSearchParams();

    const q = overrides.query ?? (searchParams.get('q') || '');
    if (q) params.set('q', q);

    const journals = overrides.journals ?? filters.journals;
    if (journals.length) {
      params.set('journals', journals.map((j) => j.issn).join(','));
    }

    const authors = overrides.authors ?? filters.authors;
    if (authors.length) {
      params.set('authors', authors.map((a) => a.id).join(','));
    }

    const topics = overrides.topics ?? filters.topics;
    if (topics.length) {
      params.set(
        'topics',
        topics.map((t) => t.id.replace('https://openalex.org/', '')).join(',')
      );
    }

    const institutions = overrides.institutions ?? filters.institutions;
    if (institutions.length) {
      params.set(
        'institutions',
        institutions
          .map((i) => i.id.replace('https://openalex.org/', ''))
          .join(',')
      );
    }

    const pubType = overrides.publicationType ?? filters.publicationType;
    if (pubType) params.set('type', pubType);

    const dateFrom = overrides.dateFrom ?? filters.dateFrom;
    if (dateFrom) params.set('from', dateFrom);

    const dateTo = overrides.dateTo ?? filters.dateTo;
    if (dateTo) params.set('to', dateTo);

    const sortBy = overrides.sortBy ?? filters.sortBy;
    if (sortBy) params.set('sort', sortBy);

    const citing = overrides.citing ?? filters.citing;
    if (citing) params.set('citing', citing);

    const citingAll = overrides.citingAll ?? filters.citingAll;
    if (citingAll?.length) params.set('citingAll', citingAll.join(','));

    const referencedBy = overrides.referencedBy ?? filters.referencedBy;
    if (referencedBy) params.set('referencedBy', referencedBy);

    const referencesAll = overrides.referencesAll ?? filters.referencesAll;
    if (referencesAll?.length)
      params.set('referencesAll', referencesAll.join(','));

    params.set('page', (overrides.page ?? 1).toString());

    return params;
  };

  // Listen for navbar search events
  useEffect(() => {
    const handleNavbarSearch = (e: CustomEvent) => {
      const params = buildURLParams({ query: e.detail.query, page: 1 });
      router.push(`/search?${params.toString()}`);
    };

    window.addEventListener(
      'navbar-search',
      handleNavbarSearch as EventListener
    );
    return () =>
      window.removeEventListener(
        'navbar-search',
        handleNavbarSearch as EventListener
      );
  }, [filters, router, searchParams]);

  const handleSearch = (newPage = 1) => {
    const params = buildURLParams({ page: newPage });
    router.push(`/search?${params.toString()}`);
  };

  const handleSortChange = (newSort: string) => {
    const params = buildURLParams({ sortBy: newSort, page: 1 });
    router.push(`/search?${params.toString()}`);
  };

  const handleClearCiting = () => {
    const params = buildURLParams({ citing: undefined, page: 1 });
    params.delete('citing');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearCitingAll = () => {
    const params = buildURLParams({ citingAll: undefined, page: 1 });
    params.delete('citingAll');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearReferencedBy = () => {
    const params = buildURLParams({ referencedBy: undefined, page: 1 });
    params.delete('referencedBy');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearReferencesAll = () => {
    const params = buildURLParams({ referencesAll: undefined, page: 1 });
    params.delete('referencesAll');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearAuthor = () => {
    const params = buildURLParams({ authors: [], page: 1 });
    params.delete('authors');
    router.push(`/search?${params.toString()}`);
  };

  // Handle author click from PaperCard
  const handleAuthorSearch = async (authorName: string) => {
    try {
      // Search for the author in OpenAlex
      const response = await fetch(
        `https://api.openalex.org/authors?search=${encodeURIComponent(
          authorName
        )}`
      );
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        // Get the first (most relevant) author match
        const author = data.results[0];
        const authorId = author.id.replace('https://openalex.org/', '');

        // Reset ALL filters and navigate with only this author
        const params = new URLSearchParams();
        params.set('authors', authorId);
        params.set('page', '1');

        router.push(`/search?${params.toString()}`);
      }
    } catch (error) {
      console.error('Failed to search for author:', error);
    }
  };

  return (
    <div className='flex h-[calc(100vh-57px)] bg-stone-50'>
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        query={searchQuery}
        openJournalModal={() => setShowJournalModal(true)}
        openAuthorModal={() => setShowAuthorModal(true)}
        openTopicModal={() => setShowTopicModal(true)}
        openInstitutionModal={() => setShowInstitutionModal(true)}
        onSortChange={handleSortChange}
        isOpen={isFilterOpen}
        onToggle={() => setIsFilterOpen((v) => !v)}
        onPresetLoad={(preset) => {
          // Use the preset data directly to build URL params
          const params = buildURLParams({
            query: preset.query,
            journals: preset.filters.journals,
            authors: preset.filters.authors,
            topics: preset.filters.topics,
            institutions: preset.filters.institutions,
            publicationType: preset.filters.publicationType,
            dateFrom: preset.filters.dateFrom,
            dateTo: preset.filters.dateTo,
            sortBy: preset.filters.sortBy,
            page: 1,
          });
          router.push(`/search?${params.toString()}`);
        }}
      />

      <main className='flex-1 overflow-y-auto'>
        <div className='max-w-5xl mx-auto p-6'>
          <SearchResults
            query={searchQuery}
            journals={searchFilters.journals}
            authors={searchFilters.authors}
            topics={searchFilters.topics}
            institutions={searchFilters.institutions}
            publicationType={searchFilters.publicationType}
            from={searchFilters.dateFrom}
            to={searchFilters.dateTo}
            sortBy={searchFilters.sortBy}
            page={page}
            loadMore={(newPage) => handleSearch(newPage)}
            citing={searchFilters.citing}
            citingAll={searchFilters.citingAll}
            referencedBy={searchFilters.referencedBy}
            onClearCiting={handleClearCiting}
            onClearCitingAll={handleClearCitingAll}
            onClearReferencedBy={handleClearReferencedBy}
            referencesAll={searchFilters.referencesAll}
            onClearReferencesAll={handleClearReferencesAll}
            onAuthorSearch={handleAuthorSearch}
            onClearAuthor={handleClearAuthor}
          />
        </div>
      </main>

      <PinSidebar
        isOpen={isPinSidebarOpen}
        onToggle={() => setIsPinSidebarOpen((v) => !v)}
      />

      <CreateAlertButton filters={searchFilters} query={searchQuery} />

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

      <TopicModal
        isOpen={showTopicModal}
        selectedTopics={filters.topics}
        onClose={() => setShowTopicModal(false)}
        onApply={(selected) =>
          setFilters((prev) => ({ ...prev, topics: selected }))
        }
      />

      <InstitutionModal
        isOpen={showInstitutionModal}
        selectedInstitutions={filters.institutions}
        onClose={() => setShowInstitutionModal(false)}
        onApply={(selected) =>
          setFilters((prev) => ({ ...prev, institutions: selected }))
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