'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterPanel from './FilterPanel';
import SearchResults from './SearchResults';
import JournalModal from './JournalModal';
import AuthorModal from './AuthorModal';
import InstitutionModal from './InstitutionModal';
import { Filters, Institution } from '../types/interfaces';
import { ECON_PRESETS } from '@/data/econDomains';
import mapIssnsToJournals from '@/utils/issnToJournals';
import { extractMentions, resolveMentions } from '@/utils/queryMentions';
import PinSidebar from './PinSidebar';
import CreateAlertButton from './CreateAlertButton';
import CelebrationOverlay from './ui/CelebrationOverlay';

function PaperazziAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Modal state ---
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [showInstitutionModal, setShowInstitutionModal] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [isPinSidebarOpen, setIsPinSidebarOpen] = useState(true);
  const [isSearchingAuthor, setIsSearchingAuthor] = useState(false);

  // --- Celebration state ---
  const [showCelebration, setShowCelebration] = useState(false);

  // Cache for author searches to avoid repeated API calls
  const authorCacheRef = useRef<Map<string, string>>(new Map());

  // --- Local state for controlled inputs ---
  const [filters, setFilters] = useState<Filters>({
    journals: [],
    authors: [],
    institutions: [],
    publicationType: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'relevance_score',
    citing: undefined,
    citingAll: undefined,
    referencedBy: undefined,
    referencesAll: undefined,
    econFilter: {
      enabled: false,
      categories: [],
      domains: [],
      presetId: null,
    },
    journalFilterMode: 'off',
  });

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<Filters>({
    journals: [],
    authors: [],
    institutions: [],
    publicationType: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'relevance_score',
    citing: undefined,
    citingAll: undefined,
    referencedBy: undefined,
    referencesAll: undefined,
    econFilter: {
      enabled: false,
      categories: [],
      domains: [],
      presetId: null,
    },
    journalFilterMode: 'off',
  });
  const [page, setPage] = useState(1);
  // Focal-paper id for the network view; null when not in network mode.
  const [networkId, setNetworkId] = useState<string | null>(null);
  // Semantic search mode (OpenAlex `search.semantic=`); URL-synced via
  // `?semantic=true`. Forwarded to /api/search and propagated to the navbar.
  const [semantic, setSemantic] = useState(false);

  // Listen for paper-reported events to show celebration
  useEffect(() => {
    const handlePaperReported = () => {
      setShowCelebration(true);
    };

    window.addEventListener('paper-reported', handlePaperReported);
    return () =>
      window.removeEventListener('paper-reported', handlePaperReported);
  }, []);

  // When the user opens a cite/refs/network view from any paper card (in the
  // results list OR the pinned sidebar), clear the persistent filters so they
  // see the full set first and can re-apply filters from there. The URL-synced
  // filters are already reset by the click handlers in SearchResults/PinSidebar
  // (they push a fresh URLSearchParams). What's left to clear is component
  // state that's not URL-synced — econFilter and journalFilterMode — which the
  // syncFromURL effect would otherwise preserve via the `prev` spread.
  useEffect(() => {
    const handleClearTransientFilters = () => {
      setFilters((prev) => ({
        ...prev,
        econFilter: {
          enabled: false,
          categories: [],
          domains: [],
          presetId: null,
          issns: undefined,
        },
        journalFilterMode: 'off',
      }));
    };
    window.addEventListener(
      'paper-citing-click',
      handleClearTransientFilters,
    );
    window.addEventListener('paper-refs-click', handleClearTransientFilters);
    window.addEventListener(
      'paper-network-click',
      handleClearTransientFilters,
    );
    return () => {
      window.removeEventListener(
        'paper-citing-click',
        handleClearTransientFilters,
      );
      window.removeEventListener(
        'paper-refs-click',
        handleClearTransientFilters,
      );
      window.removeEventListener(
        'paper-network-click',
        handleClearTransientFilters,
      );
    };
  }, []);

  // Broadcast econ-filter activeness for the navbar's semantic toggle.
  // The econ filter lives in component state (not URL-synced), so the navbar
  // can't detect it from useSearchParams alone — this event fills that gap.
  useEffect(() => {
    const econActive =
      filters.journalFilterMode === 'wide' &&
      filters.econFilter?.enabled === true;
    window.dispatchEvent(
      new CustomEvent('semantic-conflict-econ', {
        detail: { econActive },
      }),
    );
  }, [filters.journalFilterMode, filters.econFilter]);

  // Sync state with URL parameters
  useEffect(() => {
    const syncFromURL = async () => {
      const q = searchParams.get('q') || '';
      const journalIssns =
        searchParams.get('journals')?.split(',').filter(Boolean) || [];
      const authorIds =
        searchParams.get('authors')?.split(',').filter(Boolean) || [];
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
      const network = searchParams.get('network') || '';
      const isSemantic = searchParams.get('semantic') === 'true';

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
        }),
      );

      // Fetch institutions
      const institutions: Institution[] = await Promise.all(
        institutionIds.map(async (id) => {
          try {
            const res = await fetch(
              `https://api.openalex.org/institutions/${id}`,
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
        }),
      );

      const newFilters: Filters = {
        journals,
        authors,
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

      setFilters((prev) => ({
        ...newFilters,
        econFilter: prev.econFilter,
        journalFilterMode: prev.journalFilterMode,
      }));
      setSearchFilters((prev) => ({
        ...newFilters,
        econFilter: prev.econFilter,
        journalFilterMode: prev.journalFilterMode,
      }));
      setSearchQuery(q);
      setPage(p);
      setNetworkId(network || null);
      setSemantic(isSemantic);
    };

    syncFromURL();
  }, [searchParams]);

  // Build URL params helper
  const buildURLParams = (
    overrides: Partial<
      Filters & { query?: string; page?: number; semantic?: boolean }
    > = {},
  ) => {
    const params = new URLSearchParams();

    const q = overrides.query ?? (searchParams.get('q') || '');
    if (q) params.set('q', q);

    // Preserve semantic mode across re-searches unless explicitly overridden.
    const sem =
      overrides.semantic ??
      (searchParams.get('semantic') === 'true');
    if (sem) params.set('semantic', 'true');

    const journals = overrides.journals ?? filters.journals;
    if (journals.length) {
      params.set('journals', journals.map((j) => j.issn).join(','));
    }

    const authors = overrides.authors ?? filters.authors;
    if (authors.length) {
      params.set('authors', authors.map((a) => a.id).join(','));
    }

    const institutions = overrides.institutions ?? filters.institutions;
    if (institutions.length) {
      params.set(
        'institutions',
        institutions
          .map((i) => i.id.replace('https://openalex.org/', ''))
          .join(','),
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
    const handleNavbarSearch = async (e: CustomEvent) => {
      const rawQuery = (e.detail.query as string) || '';
      // The navbar maintains a per-session cache of explicit user picks from
      // its autocomplete dropdown (slug → {id, name}). It serializes that
      // cache as an array on the event so resolveMentions can prefer it
      // over the silent top-match fallback — which is the whole point of
      // the autocomplete (avoiding wrong matches on common surnames).
      const mentionCacheArr = (e.detail.mentionCache as Array<
        [string, { id: string; name?: string }]
      >) || [];
      const mentionCache = new Map(mentionCacheArr);

      // Pull `@author` mentions out of the query and resolve them to
      // OpenAlex author IDs. Resolved authors merge into the existing
      // author filter (de-duped) so a `@` mention layers on top of any
      // explicit panel selection rather than wiping it out.
      const { cleanQuery, mentions } = extractMentions(rawQuery);
      let mergedAuthors = filters.authors;
      if (mentions.length > 0) {
        const { resolved } = await resolveMentions(mentions, mentionCache);
        if (resolved.length > 0) {
          const seen = new Set(filters.authors.map((a) => a.id));
          mergedAuthors = [
            ...filters.authors,
            ...resolved.filter((a) => !seen.has(a.id)),
          ];
        }
      }

      const params = buildURLParams({
        query: cleanQuery,
        page: 1,
        // Honor an explicit semantic flag from the navbar (toggle pill).
        // If undefined, buildURLParams falls back to the URL's current value.
        semantic: e.detail.semantic,
        // Only override authors when we actually resolved something,
        // otherwise let buildURLParams use its default (current filters).
        authors: mentions.length > 0 ? mergedAuthors : undefined,
      });
      router.push(`/search?${params.toString()}`);
    };

    // EventListener must be sync-returning; the async handler is fire-and-
    // forget here (the inner router.push completes the navigation), so we
    // wrap it in a void thunk.
    const listener = (e: Event) => {
      void handleNavbarSearch(e as CustomEvent);
    };
    window.addEventListener('navbar-search', listener);
    return () => window.removeEventListener('navbar-search', listener);
  }, [filters, router, searchParams]);

  const handleSearch = (newPage = 1) => {
    const params = buildURLParams({ page: newPage });
    router.push(`/search?${params.toString()}`);
  };

  const handleSortChange = (newSort: string) => {
    const params = buildURLParams({ sortBy: newSort, page: 1 });
    router.push(`/search?${params.toString()}`);
  };

  // Citation/reference click handlers in SearchResults auto-apply
  // `sort=cited_by_count:desc` so the cite/refs view is useful by default.
  // When the user dismisses that view, the auto-applied sort should also
  // clear — otherwise it lingers as a "custom sort", which keeps semantic
  // search disabled (and is a non-obvious side effect in general).
  const handleClearCiting = () => {
    const params = buildURLParams({ citing: undefined, page: 1 });
    params.delete('citing');
    params.delete('sort');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearCitingAll = () => {
    const params = buildURLParams({ citingAll: undefined, page: 1 });
    params.delete('citingAll');
    params.delete('sort');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearReferencedBy = () => {
    const params = buildURLParams({ referencedBy: undefined, page: 1 });
    params.delete('referencedBy');
    params.delete('sort');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearReferencesAll = () => {
    const params = buildURLParams({ referencesAll: undefined, page: 1 });
    params.delete('referencesAll');
    params.delete('sort');
    router.push(`/search?${params.toString()}`);
  };

  const handleClearAuthor = () => {
    const params = buildURLParams({ authors: [], page: 1 });
    params.delete('authors');
    router.push(`/search?${params.toString()}`);
  };

  // Handle empty-state tile clicks. Each tile applies a starter filter set so
  // first-time visitors have something concrete to click. econFilter and
  // journalFilterMode aren't URL-synced, so we set them via setFilters first;
  // the URL push that follows preserves them via the `prev` spread in the
  // URL-sync effect.
  // Network-view "fullscreen" toggle: collapse / restore both side panels in
  // one click so the citations graph gets the full main column. Treats both
  // panels closed as the "collapsed" state; clicking when collapsed reopens
  // both. The individual panel toggles still work independently.
  const sidebarsCollapsed = !isFilterOpen && !isPinSidebarOpen;
  const handleToggleSidebars = () => {
    if (sidebarsCollapsed) {
      setIsFilterOpen(true);
      setIsPinSidebarOpen(true);
    } else {
      setIsFilterOpen(false);
      setIsPinSidebarOpen(false);
    }
  };

  const handlePresetTile = (
    preset: 'climate-top5' | 'demo-network' | 'recent-qje',
  ) => {
    if (preset === 'demo-network') {
      // Famous econ paper — Acemoglu, Johnson & Robinson (2001),
      // "The Colonial Origins of Comparative Development" in AER.
      // Replace with your preferred OpenAlex Work ID if needed.
      router.push('/search?network=W3124166904');
      return;
    }

    if (preset === 'climate-top5') {
      const top5 = ECON_PRESETS.find((p) => p.id === 'top5gen');
      setFilters((prev) => ({
        ...prev,
        journals: [],
        journalFilterMode: 'wide',
        econFilter: {
          enabled: true,
          categories: top5 ? [...top5.categories] : [],
          domains: top5 ? [...top5.domains] : [],
          presetId: 'top5gen',
          issns: top5?.issns ? [...top5.issns] : undefined,
        },
      }));
      const params = new URLSearchParams();
      params.set('q', 'climate change');
      // Sort omitted — defaults to relevance_score.
      params.set('page', '1');
      router.push(`/search?${params.toString()}`);
      return;
    }

    if (preset === 'recent-qje') {
      const QJE = { issn: '0033-5533', name: 'Quarterly Journal of Economics' };
      setFilters((prev) => ({
        ...prev,
        journals: [QJE],
        journalFilterMode: 'specific',
        econFilter: {
          ...(prev.econFilter || {
            enabled: false,
            categories: [],
            domains: [],
            presetId: null,
          }),
          enabled: false,
          presetId: null,
          issns: undefined,
        },
      }));
      const params = new URLSearchParams();
      params.set('journals', QJE.issn);
      params.set('sort', 'publication_date:desc');
      params.set('page', '1');
      router.push(`/search?${params.toString()}`);
      return;
    }
  };

  // Handle author click from PaperCard - optimized with caching
  const handleAuthorSearch = async (authorName: string) => {
    // Check cache first
    const cachedId = authorCacheRef.current.get(authorName);

    if (cachedId) {
      // Instant navigation with cached ID
      const params = new URLSearchParams();
      params.set('authors', cachedId);
      params.set('page', '1');
      router.push(`/search?${params.toString()}`);
      return;
    }

    // Show loading state
    setIsSearchingAuthor(true);

    try {
      const response = await fetch(
        `https://api.openalex.org/authors?search=${encodeURIComponent(
          authorName,
        )}`,
        { next: { revalidate: 3600 } }, // Cache for 1 hour
      );
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const author = data.results[0];
        const authorId = author.id.replace('https://openalex.org/', '');

        // Cache the result
        authorCacheRef.current.set(authorName, authorId);

        // Navigate with only this author
        const params = new URLSearchParams();
        params.set('authors', authorId);
        params.set('page', '1');

        router.push(`/search?${params.toString()}`);
      }
    } catch (error) {
      console.error('Failed to search for author:', error);
    } finally {
      setIsSearchingAuthor(false);
    }
  };

  return (
    <div className='flex h-full min-h-0 bg-[var(--background)] overflow-hidden'>
      {/* Celebration overlay - renders at top level for full-page effect */}
      <CelebrationOverlay
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />

      {/* Loading overlay for author search */}
      {isSearchingAuthor && (
        <div className='fixed inset-0 overlay-soft flex items-center justify-center z-50'>
          <div className='surface-card border border-app rounded-lg shadow-lg p-6 flex items-center gap-3'>
            <div className='animate-spin h-5 w-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full' />
            <span className='text-sm text-stone-700'>
              Searching for author...
            </span>
          </div>
        </div>
      )}

      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        query={searchQuery}
        openJournalModal={() => setShowJournalModal(true)}
        openAuthorModal={() => setShowAuthorModal(true)}
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

      <main className='flex-1 min-h-0 min-w-0 overflow-hidden'>
        <div
          className={`mx-auto flex h-full min-h-0 w-full flex-col pt-6 pb-0 ${
            networkId
              ? sidebarsCollapsed
                ? 'max-w-none px-2'
                : 'max-w-none px-6'
              : 'max-w-5xl px-6'
          }`}
        >
          <SearchResults
            query={searchQuery}
            // Use live filters.journals (not searchFilters.journals) so that
            // adding/removing manual journals in the panel takes effect
            // immediately — particularly important for the network view's
            // specific-mode filter, since the JournalModal doesn't push to
            // the URL.
            journals={filters.journals}
            authors={searchFilters.authors}
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
            econFilter={filters.econFilter}
            journalFilterMode={filters.journalFilterMode}
            networkId={networkId}
            onPresetTile={handlePresetTile}
            semantic={semantic}
            sidebarsCollapsed={sidebarsCollapsed}
            onToggleSidebars={handleToggleSidebars}
          />
        </div>
      </main>

      <PinSidebar
        isOpen={isPinSidebarOpen}
        onToggle={() => setIsPinSidebarOpen((v) => !v)}
        onAuthorSearch={handleAuthorSearch}
      />

      {/* <CreateAlertButton filters={searchFilters} query={searchQuery} /> */}

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
          setFilters((prev) => ({
            ...prev,
            journals: selected,
            // Adding any manual journal auto-switches to specific mode.
            journalFilterMode: selected.length > 0 ? 'specific' : prev.journalFilterMode,
          }))
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
        <div className='flex h-full min-h-0 bg-[var(--background)] overflow-hidden'>
          <aside className='w-80 surface-card border-r border-app p-4'>
            <div className='text-sm text-stone-600'>Loading filters...</div>
          </aside>
          <div className='flex-1 min-h-0 px-6 pt-6 pb-0'>
            <div className='text-stone-600'>Loading search...</div>
          </div>
        </div>
      }
    >
      <PaperazziAppContent />
    </Suspense>
  );
}
