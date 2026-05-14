'use client';

import { useCallback, useEffect, useMemo, useState, Suspense, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterPanel from './FilterPanel';
import SearchResults from './SearchResults';
// (AuthorModal and InstitutionModal were dropped along with the
// FilterPanel sections that triggered them — see the Modal block at
// the bottom of this file for the rationale.)

// JournalModal carries the heaviest deps in the modal trio (the full
// journals dataset is fetched on mount, plus react-select). Loading it
// dynamically removes its component code from the initial /search bundle;
// it streams in only when the user first opens the journal picker.
// ssr: false because this is purely user-interactive UI — no SEO value
// from server-rendering an empty closed modal.
const JournalModal = dynamic(() => import('./JournalModal'), {
  ssr: false,
});
import { Filters, Institution, SelectedAuthor } from '../types/interfaces';
import { loadActiveRanking } from '@/utils/activeRanking';
import { mapIssnsToJournalsAsync as mapIssnsToJournals } from '@/utils/loadJournals';
import { usePersistedBoolean } from '@/utils/usePersistedBoolean';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { PresetTileId } from './EmptyState';
import {
  extractMentions,
  resolveMentions,
  resolveJournalShortcuts,
} from '@/utils/queryMentions';
import PinSidebar from './PinSidebar';
import CelebrationOverlay from './ui/CelebrationOverlay';
import { emit, on } from '@/utils/eventBus';
import { filtersEqual } from '@/utils/filtersEqual';
import CollectionImportDropzone from './CollectionImportDropzone';

function PaperazziAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Modal state ---
  const [showJournalModal, setShowJournalModal] = useState(false);
  // (showAuthorModal / showInstitutionModal removed — modals were
  // dropped when their FilterPanel triggers went away.)
  // Panel open/closed preferences — persisted to localStorage so the layout
  // a user left with is the layout they come back to. Default to open on
  // first visit (no persisted value yet).
  const [isFilterOpen, setIsFilterOpen] = usePersistedBoolean(
    STORAGE_KEYS.filterPanelOpen,
    true,
  );
  const [isPinSidebarOpen, setIsPinSidebarOpen] = usePersistedBoolean(
    STORAGE_KEYS.pinSidebarOpen,
    true,
  );
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
      tiers: [],
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
      tiers: [],
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
  useEffect(
    () => on('paper-reported', () => setShowCelebration(true)),
    [],
  );

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
          tiers: [],
          domains: [],
          presetId: null,
          issns: undefined,
        },
        journalFilterMode: 'off',
      }));
    };
    // Navbar's "clear search" button hits the same reset as a citation
    // drill-down — both mean "wipe everything that isn't in the URL".
    const offs = [
      on('paper-citing-click', handleClearTransientFilters),
      on('paper-refs-click', handleClearTransientFilters),
      on('paper-network-click', handleClearTransientFilters),
      on('paperazzi-reset-search', handleClearTransientFilters),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);

  // Broadcast econ-filter activeness for the navbar's semantic toggle.
  // The econ filter lives in component state (not URL-synced), so the navbar
  // can't detect it from useSearchParams alone — this event fills that gap.
  useEffect(() => {
    const econActive =
      filters.journalFilterMode === 'wide' &&
      filters.econFilter?.enabled === true;
    emit('semantic-conflict-econ', { econActive });
  }, [filters.journalFilterMode, filters.econFilter]);

  // Keep the navbar's chip facade in sync with filters.authors /
  // filters.journals. syncFromURL already broadcasts these when URL params
  // change, but the FilterPanel modals (AuthorModal / JournalModal) and the
  // per-section "remove" buttons mutate `filters.*` directly without
  // touching the URL — so without these effects, the navbar's chip list
  // goes stale. A subsequent search then submits stale `chipAuthors` /
  // `chipJournals` (which the navbar-search handler treats as
  // authoritative), wiping the author/journal filters the user had set
  // via the panel.
  useEffect(() => {
    emit('paperazzi-authors-changed', { authors: filters.authors });
  }, [filters.authors]);
  useEffect(() => {
    // Institution chips are now the only entry point for the
    // institutions filter (the FilterPanel section was removed). Same
    // mirror-on-state-change pattern as authors — URL-driven changes
    // also trip this effect because syncFromURL writes to
    // filters.institutions.
    emit('paperazzi-institutions-changed', {
      institutions: filters.institutions,
    });
  }, [filters.institutions]);
  useEffect(() => {
    // Only surface journal chips in the navbar when the panel is in
    // 'specific' mode — otherwise the wide-econ filter (or 'off') is what
    // determines results, and showing a `#ms` chip falsely suggests a
    // manual journal filter is active. `filters.journals` itself is
    // preserved in component state so toggling back to 'specific' from
    // the FilterPanel re-displays the chip — the navbar mirror reacts
    // because this effect also re-runs on `journalFilterMode` changes.
    const mode = filters.journalFilterMode || 'wide';
    emit('paperazzi-journals-changed', {
      journals: mode === 'specific' ? filters.journals : [],
    });
  }, [filters.journals, filters.journalFilterMode]);

  // Mirror of the live `filters` accessible synchronously from outside
  // the render cycle. `syncFromURL` (below) uses this to commit the
  // user's live econFilter / journalFilterMode onto `searchFilters` at
  // commit time — its functional-update closure only has access to the
  // previous searchFilters, not the live filters, so without this ref
  // the user's wide-mode tier/domain edits would silently fail to apply
  // when they hit Enter.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // `searchFilters` is the *committed* filter state — the snapshot that
  // SearchResults' fetch effect depends on. `filters` is the live state
  // the FilterPanel edits. The two diverge as the user composes filter
  // changes; pressing Enter (or any other URL push) re-runs syncFromURL,
  // which sets both back in sync. This memo drives the "press Enter to
  // apply" hint in the navbar. We use a typed field-by-field comparator
  // (`filtersEqual`) instead of JSON.stringify because the latter is
  // order-sensitive (two objects with the same keys but different
  // insertion order would falsely register as dirty) and conflates
  // `undefined` with missing keys.
  const isDirty = useMemo(
    () => !filtersEqual(filters, searchFilters),
    [filters, searchFilters],
  );
  useEffect(() => {
    emit('paperazzi-filters-dirty', { isDirty });
  }, [isDirty]);

  // Discard pending changes — wired to the navbar's discard button via
  // the event bus. Reverts the live `filters` back to `searchFilters`
  // so the FilterPanel snaps back to whatever the API is currently
  // showing. No URL push: the committed state didn't change, only the
  // user's draft did.
  useEffect(
    () =>
      on('paperazzi-filters-discard', () => {
        setFilters(searchFilters);
      }),
    [searchFilters],
  );

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

      const journals = await mapIssnsToJournals(journalIssns);

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

      // Reconcile journalFilterMode with the URL's `journals=` param.
      //   - URL has journals → promote to 'specific'. Fixes both the
      //     navbar `#abbrev` chip path and direct deep-link navigation
      //     with a journals param.
      //   - URL has no journals AND prev mode was 'specific' → drop to
      //     'off'. Catches the "user removed the last navbar chip" case;
      //     specific-mode-with-zero-journals is dead state otherwise.
      //   - URL has no journals AND prev mode was 'wide'/'off' → keep
      //     prev. Preserves the wide-econ tile/preset path (which sets
      //     mode='wide' via setFilters before pushing a journals-less
      //     URL) and the user who deliberately chose 'off'.
      const reconcileMode = (
        prevMode: Filters['journalFilterMode'],
      ): Filters['journalFilterMode'] => {
        if (journals.length > 0) return 'specific';
        if (prevMode === 'specific') return 'off';
        return prevMode;
      };

      // Commit: both `filters` and `searchFilters` are set from the live
      // `filters` snapshot (via filtersRef) for the non-URL fields
      // (econFilter, journalFilterMode). The previous version pulled
      // `prev.econFilter` / `prev.journalFilterMode` from each setter's
      // own previous state — so setSearchFilters preserved the previous
      // *committed* econFilter, silently dropping any wide-mode edits
      // the user had made in the panel before pressing Enter. Reading
      // from filtersRef.current makes Enter behave as "apply my pending
      // panel changes", which is what `isDirty` advertises.
      const liveFilters = filtersRef.current;
      const committedNonUrl = {
        econFilter: liveFilters.econFilter,
        journalFilterMode: reconcileMode(liveFilters.journalFilterMode),
      };
      setFilters({ ...newFilters, ...committedNonUrl });
      setSearchFilters({ ...newFilters, ...committedNonUrl });
      setSearchQuery(q);
      setPage(p);
      setNetworkId(network || null);
      setSemantic(isSemantic);

      // Broadcast the resolved author list (with display names) so the
      // navbar's chip facade can render the same authors that are actually
      // filtering the results — without having to refetch the names itself.
      emit('paperazzi-authors-changed', { authors });
      // Same idea for journals — the navbar's #journal chips mirror the
      // current journal filter (including manual picks from the panel).
      emit('paperazzi-journals-changed', { journals });
    };

    syncFromURL();
  }, [searchParams]);

  // Build URL params helper. Memoised so the navbar-search useEffect can
  // list it as a dependency without re-subscribing on every render — the
  // identity only changes when `filters` or `searchParams` actually move.
  const buildURLParams = useCallback((
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
  }, [filters, searchParams]);

  // Listen for navbar search events
  useEffect(() => {
    // chipAuthors / chipJournals (in the event payload) are the *complete*
    // lists the navbar is currently showing as chips. Both mirror
    // filters.{authors,journals} via paperazzi-{authors,journals}-changed,
    // so they already include panel-added entries + any user picks from
    // the autocomplete dropdowns and reflect any chips the user removed.
    // We treat them as the authoritative filter for this search instead
    // of merging on top of the existing filters.
    const handleNavbarSearch = async ({
      query: rawQuery,
      semantic: isSemantic,
      chipAuthors,
      chipJournals,
      chipInstitutions,
    }: {
      query: string;
      semantic: boolean;
      chipAuthors: Array<{ id: string; name?: string }>;
      chipJournals: Array<{ issn: string; name?: string }>;
      chipInstitutions: Array<{ id: string; display_name: string }>;
    }) => {
      // In semantic mode the @/# shortcuts are inert — OpenAlex's semantic
      // endpoint expects a bare concept query, so we skip extraction and
      // resolution and let the raw text through. NavBar already sends
      // empty chip arrays in this case; this guard is the server-side
      // mirror so the literal `@tirole` tokens remain part of the query.
      const { cleanQuery, mentions, journalAbbrevs } = isSemantic
        ? { cleanQuery: rawQuery, mentions: [], journalAbbrevs: [] }
        : extractMentions(rawQuery);

      const seenAuthors = new Set(chipAuthors.map((a) => a.id));
      const finalAuthors: SelectedAuthor[] = chipAuthors.map((a) => ({
        id: a.id,
        name: a.name,
      }));
      if (mentions.length > 0) {
        const { resolved } = await resolveMentions(mentions);
        for (const a of resolved) {
          if (!seenAuthors.has(a.id)) {
            seenAuthors.add(a.id);
            finalAuthors.push(a);
          }
        }
      }

      const seenJournals = new Set(chipJournals.map((j) => j.issn));
      const finalJournals = chipJournals.map((j) => ({
        issn: j.issn,
        name: j.name,
      }));
      if (journalAbbrevs.length > 0) {
        const { resolved } = resolveJournalShortcuts(journalAbbrevs);
        for (const j of resolved) {
          if (!seenJournals.has(j.issn)) {
            seenJournals.add(j.issn);
            finalJournals.push({ issn: j.issn, name: j.name });
          }
        }
      }

      // Institutions: no text-token resolver yet (the dropdown is the
      // only entry point), so the chip list is the whole picture.
      // Mapped onto the Filters shape — country_code / type aren't in
      // the chip payload, but syncFromURL refetches the full Institution
      // record from OpenAlex by id afterwards, so the URL push only
      // needs the id.
      const finalInstitutions: Institution[] = chipInstitutions.map((i) => ({
        id: i.id,
        display_name: i.display_name,
      }));

      const params = buildURLParams({
        query: cleanQuery,
        page: 1,
        // Honor the explicit semantic flag from the navbar (toggle pill).
        semantic: isSemantic,
        // Chips are always authoritative — even when empty (the user may
        // have just removed all of them).
        authors: finalAuthors,
        journals: finalJournals,
        institutions: finalInstitutions,
      });
      router.push(`/search?${params.toString()}`);
    };

    // The bus dispatch is synchronous; the async handler is fire-and-
    // forget here (the inner router.push completes the navigation), so we
    // wrap it in a void thunk.
    return on('navbar-search', (detail) => {
      void handleNavbarSearch(detail);
    });
  }, [filters, router, searchParams, buildURLParams]);

  // (Previously `handleSearch(page)` lived here as the "commit via URL
  // push" path. It was the source of the auto-commit-on-pagination bug
  // because `buildURLParams` falls back to live `filters` for any
  // missing override. The navbar submit-glass now goes straight through
  // the `navbar-search` event listener, and pagination/sort use their
  // own single-field URL nudges below — so this function had no callers
  // left and was removed. Resurrect it if a new "commit live filters"
  // path appears.)

  // Pagination — single-field URL nudge. Critically *not* a commit:
  // it preserves the current URL params (which reflect `searchFilters`,
  // the committed state) and only bumps `page=`. The previous version
  // routed through `handleSearch` → `buildURLParams`, which falls back
  // to live `filters` for missing overrides — so paginating with
  // pending FilterPanel edits silently committed those edits. Now the
  // user's draft is preserved across page-flips; they apply it
  // deliberately via Enter / Search.
  const handlePaginate = (newPage: number) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('page', newPage.toString());
    router.push(`/search?${params.toString()}`);
  };

  // Sort change — same "single-field URL nudge" pattern as pagination
  // for the same reason: a sort tweak shouldn't sneak in any pending
  // panel edits. Reset to page 1 because the previous offset isn't
  // meaningful under a different order.
  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (newSort) params.set('sort', newSort);
    else params.delete('sort');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
  };

  // Dismissing a transient view (citing / citingAll / referencedBy /
  // referencesAll / network) is treated as "go home" — same effect as
  // clicking the Paperazzi logo. The X next to a citation banner used
  // to keep q/journals/authors/sort and only strip the citing param,
  // but in practice users want a clean slate when they back out of a
  // drill-down. `paperazzi-reset-search` clears non-URL state
  // (econFilter, journalFilterMode) via the listener; router.push to
  // bare /search lets syncFromURL wipe URL-synced filters and
  // broadcasts empty author/journal lists so navbar chips clear too.
  const handleResetAll = () => {
    emit('paperazzi-reset-search');
    router.push('/search');
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

  const handlePresetTile = async (preset: PresetTileId) => {
    if (preset === 'demo-network') {
      // Famous econ paper — Acemoglu, Johnson & Robinson (2001),
      // "The Colonial Origins of Comparative Development" in AER.
      // Replace with your preferred OpenAlex Work ID if needed.
      router.push('/search?network=W3124166904');
      return;
    }

    if (preset === 'climate-top5') {
      // Look up the Top 5 preset from the user's active ranking scheme —
      // the built-in CNRS scheme ships with `top5gen`, but a user who's
      // imported a different ranking (e.g. medicine) might not have it.
      // Fall back to a bare wide-filter activation in that case so the
      // tile still does *something* meaningful.
      const scheme = await loadActiveRanking();
      const top5 = scheme.presets?.find((p) => p.id === 'top5gen');
      setFilters((prev) => ({
        ...prev,
        journals: [],
        journalFilterMode: 'wide',
        econFilter: {
          enabled: true,
          tiers: top5?.tiers ? [...top5.tiers] : [],
          domains: top5?.domains ? [...top5.domains] : [],
          presetId: top5 ? 'top5gen' : null,
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
            tiers: [],
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
      <CollectionImportDropzone />

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
        onSortChange={handleSortChange}
        isOpen={isFilterOpen}
        onToggle={() => setIsFilterOpen((v) => !v)}
        onPresetLoad={(preset) => {
          // econFilter and journalFilterMode are NOT URL-synced, so the
          // syncFromURL effect that runs after router.push can't restore
          // them on its own — it can only fall back to `prev.*`. Set them
          // here first so `prev.*` reflects the preset by the time the
          // sync runs. Same pattern as handlePresetTile uses for the
          // built-in tiles below. URL-synced fields are pushed via
          // buildURLParams and overwritten by the sync; that's intended.
          setFilters((prevState) => ({
            ...prevState,
            econFilter: preset.filters.econFilter ?? prevState.econFilter,
            journalFilterMode:
              preset.filters.journalFilterMode ?? prevState.journalFilterMode,
          }));
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
            // Every dimension here reads from `searchFilters` — the
            // *committed* snapshot. Live edits in the FilterPanel update
            // `filters` and surface via the navbar hint ("Press Enter to
            // apply") but don't fire the OpenAlex API until the user
            // commits via Enter / Search / a URL push. journals,
            // econFilter and journalFilterMode used to read from live
            // `filters` (so the panel auto-refetched on each click);
            // this was the main source of redundant API traffic, and
            // the deferred-commit flow now treats them like every other
            // filter dimension.
            journals={searchFilters.journals}
            authors={searchFilters.authors}
            institutions={searchFilters.institutions}
            publicationType={searchFilters.publicationType}
            from={searchFilters.dateFrom}
            to={searchFilters.dateTo}
            sortBy={searchFilters.sortBy}
            page={page}
            loadMore={(newPage) => handlePaginate(newPage)}
            citing={searchFilters.citing}
            citingAll={searchFilters.citingAll}
            referencedBy={searchFilters.referencedBy}
            onClearCiting={handleResetAll}
            onClearCitingAll={handleResetAll}
            onClearReferencedBy={handleResetAll}
            referencesAll={searchFilters.referencesAll}
            onClearReferencesAll={handleResetAll}
            onAuthorSearch={handleAuthorSearch}
            onClearAuthor={handleClearAuthor}
            onExitNetwork={handleResetAll}
            econFilter={searchFilters.econFilter}
            journalFilterMode={searchFilters.journalFilterMode}
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

      {/* Modals */}
      {/* Modal apply / add semantics.
            Authors and institutions *queue* — adding via the modal
            just updates `filters`, leaving the user to commit via the
            navbar's submit-glass (which turns green to flag the
            pending change). JournalModal keeps its eager commit
            because picking journals usually means "show me papers in
            these journals now" — a single click of Apply should
            re-run the search. If you want journals to also queue, the
            change is local: drop the buildURLParams + router.push
            calls below and leave only setFilters. */}
      {/* AuthorModal and InstitutionModal used to live here as
          triggers for the FilterPanel's Authors / Institutions
          sections. Both sections were dropped — authors are picked
          via @autocomplete in the navbar, institutions via
          ~autocomplete — so the modals lost their only triggers and
          were removed along with their state. Component files are
          left in the repo in case the modal flow is desired again. */}

      <JournalModal
        isOpen={showJournalModal}
        selectedJournals={filters.journals}
        onClose={() => setShowJournalModal(false)}
        onApply={(selected) => {
          // Adding any manual journal auto-switches to specific mode.
          const nextMode: NonNullable<Filters['journalFilterMode']> =
            selected.length > 0 ? 'specific' : filters.journalFilterMode || 'off';
          setFilters((prev) => ({
            ...prev,
            journals: selected,
            journalFilterMode: nextMode,
          }));
          const params = buildURLParams({ journals: selected, page: 1 });
          router.push(`/search?${params.toString()}`);
        }}
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
