'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Paper, RESULTS_PER_PAGE } from '../types/interfaces';
import PaperCard from './ui/PaperCard';
import CitationsNetwork from './ui/CitationsNetwork';
import EmptyState, { PresetTileId } from './EmptyState';
import { reportedAuthorKey } from '@/utils/storageKeys';
import { cachedFetch } from '@/utils/searchCache';
import { emit, on } from '@/utils/eventBus';
import { normalizeId } from '@/utils/normalizeId';
import cleanHtml from '@/utils/cleanHtml';
import {
  openAlexFetch,
  withMailto,
  fetchWorkAsPaper,
} from '@/utils/openAlexClient';
import { AUTHOR_CORRECTION_FORM_URL } from '@/utils/correctionForms';
import {
  resolveIssns,
  useActiveRanking,
} from '@/utils/activeRanking';
import {
  X,
  Quote,
  Library,
  BookOpen,
  User,
  Copy,
  Check,
  ExternalLink,
  CheckCircle,
  Maximize2,
  Minimize2,
  Flag,
} from 'lucide-react';

// Shape of the author summary card built from OpenAlex /authors/{id}.
// Only the fields the panel actually reads — everything optional because
// OpenAlex omits stats for thinly-indexed authors.
interface AuthorInfo {
  id: string;
  display_name: string;
  orcid?: string;
  works_count?: number;
  cited_by_count?: number;
  h_index?: number;
  i10_index?: number;
  last_known_institution?: string;
  last_known_institution_country?: string;
  affiliations: Array<{ institution?: { display_name?: string } }>;
}

interface Props {
  query: string;
  journals: { issn: string; name?: string }[];
  authors: { id: string; name?: string }[];
  institutions: { id: string; display_name: string }[];
  publicationType?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  page: number;
  citing?: string;
  citingAll?: string[];
  referencedBy?: string;
  referencesAll?: string[];
  econFilter?: {
    enabled: boolean;
    tiers: string[];
    domains: string[];
    presetId?: string | null;
    issns?: string[];
  };
  // Which journal-filter source feeds the API: 'wide' uses econFilter and
  // ignores `journals`; 'specific' does the inverse; 'off' sends neither.
  journalFilterMode?: 'wide' | 'specific' | 'off';
  // When set, the main area renders the citation network for this OpenAlex
  // work id instead of the regular results list.
  networkId?: string | null;
  // Empty-state tile click — handled by parent (PaperazziApp), which sets
  // econFilter / journalFilterMode and pushes URL params accordingly.
  onPresetTile?: (preset: PresetTileId) => void;
  loadMore?: (page: number) => void;
  onClearCiting?: () => void;
  onClearCitingAll?: () => void;
  onClearReferencedBy?: () => void;
  onClearReferencesAll?: () => void;
  onAuthorSearch?: (authorName: string) => void;
  onClearAuthor?: () => void;
  // Network exit (the X next to the "Network for: …" banner). Same
  // behavior as the citing/refs banner X's — full reset to bare /search.
  // Wired by PaperazziApp; we accept it as a prop instead of calling
  // router.push directly so the reset side-effects (paperazzi-reset-search)
  // live with the rest of the navigation logic.
  onExitNetwork?: () => void;
  // Network-view fullscreen toggle: collapses both side panels to give the
  // graph the full main column. Wired by PaperazziApp.
  sidebarsCollapsed?: boolean;
  onToggleSidebars?: () => void;
}

export default function SearchResults({
  query,
  journals,
  authors,
  institutions,
  publicationType,
  from,
  to,
  sortBy = 'relevance_score',
  page,
  citing,
  citingAll,
  referencedBy,
  referencesAll,
  econFilter,
  journalFilterMode = 'wide',
  networkId,
  onPresetTile,
  loadMore,
  onClearCiting,
  onClearCitingAll,
  onClearReferencedBy,
  onClearReferencesAll,
  onAuthorSearch,
  onClearAuthor,
  onExitNetwork,
  sidebarsCollapsed = false,
  onToggleSidebars,
}: Props) {
  const router = useRouter();
  const [results, setResults] = useState<Paper[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [citingPaper, setCitingPaper] = useState<Paper | null>(null);
  const [citingAllPapers, setCitingAllPapers] = useState<Paper[]>([]);
  const [loadingCitingPaper, setLoadingCitingPaper] = useState(false);
  const [loadingCitingAllPapers, setLoadingCitingAllPapers] = useState(false);
  const [referencedByPaper, setReferencedByPaper] = useState<Paper | null>(
    null,
  );
  const [loadingReferencedByPaper, setLoadingReferencedByPaper] =
    useState(false);
  const [referencesAllPapers, setReferencesAllPapers] = useState<Paper[]>([]);
  const [loadingReferencesAllPapers, setLoadingReferencesAllPapers] =
    useState(false);
  const [authorInfo, setAuthorInfo] = useState<AuthorInfo | null>(null);
  // Only the setter is used (the loading value isn't surfaced in the UI).
  const [, setLoadingAuthorInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    'Searching OpenAlex...',
  );
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [showSlowLoadingHelp, setShowSlowLoadingHelp] = useState(false);

  const [isAuthorInfoExpanded, setIsAuthorInfoExpanded] = useState(false);
  const [isAuthorIdCopied, setIsAuthorIdCopied] = useState(false);

  // ── Network view state ─────────────────────────────────────────────
  const [networkFocal, setNetworkFocal] = useState<Paper | null>(null);
  const [networkRefs, setNetworkRefs] = useState<Paper[]>([]);
  const [networkCites, setNetworkCites] = useState<Paper[]>([]);
  const [networkRefsTotal, setNetworkRefsTotal] = useState<number | null>(null);
  const [networkCitesTotal, setNetworkCitesTotal] = useState<number | null>(
    null,
  );
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [hasAuthorReported, setHasAuthorReported] = useState(false);

  const isEconActive = econFilter?.enabled ?? false;

  // Resolve the wide-mode econ filter against the user's active ranking
  // scheme, on the client. The server stays scheme-agnostic — it only
  // ever sees the final `econIssns` list. When the user has an explicit
  // ISSN whitelist (e.g. Top 5 preset), we use that directly. Otherwise
  // we expand (tiers, domains) → ISSNs against the active scheme.
  //
  // Returns `null` while the scheme is still loading on first paint, OR
  // when the wide filter isn't engaged. The fetch effect treats `null`
  // as "don't push wide-mode params" (vs. an empty array, which means
  // "scheme matches no journals — short-circuit").
  const activeRanking = useActiveRanking();
  const econResolvedIssns: string[] | null = useMemo(() => {
    if (!econFilter?.enabled) return null;
    if (econFilter.issns && econFilter.issns.length > 0) {
      return [...econFilter.issns];
    }
    if (!activeRanking) return null;
    return resolveIssns(
      activeRanking,
      econFilter.tiers,
      econFilter.domains,
    );
  }, [activeRanking, econFilter]);

  // Progressive loading messages
  useEffect(() => {
    if (!isPending || !loadingStartTime) return;
    const updateLoadingMessage = () => {
      const elapsed = Date.now() - loadingStartTime;
      if (elapsed < 3000) {
        setLoadingMessage('Searching OpenAlex...');
        setShowSlowLoadingHelp(false);
      } else if (elapsed < 6000) {
        setLoadingMessage('Processing results...');
        setShowSlowLoadingHelp(false);
      } else if (elapsed < 10000) {
        setLoadingMessage('Still loading... OpenAlex is busy');
        setShowSlowLoadingHelp(false);
      } else {
        setLoadingMessage('Taking longer than usual...');
        setShowSlowLoadingHelp(true);
      }
    };
    updateLoadingMessage();
    const interval = setInterval(updateLoadingMessage, 1000);
    return () => clearInterval(interval);
  }, [isPending, loadingStartTime]);

  // Citation click events
  useEffect(() => {
    const offs = [
      on('paper-citing-click', ({ paper }) => {
        const paperId = normalizeId(paper.id);
        const params = new URLSearchParams();
        params.set('citing', paperId);
        params.set('sort', 'cited_by_count:desc');
        params.set('page', '1');
        router.push(`/search?${params.toString()}`);
      }),
      on('paper-refs-click', ({ paper }) => {
        const paperId = normalizeId(paper.id);
        const params = new URLSearchParams();
        params.set('referencedBy', paperId);
        params.set('sort', 'cited_by_count:desc');
        params.set('page', '1');
        router.push(`/search?${params.toString()}`);
      }),
      on('paper-network-click', ({ paper }) => {
        const paperId = normalizeId(paper.id);
        const params = new URLSearchParams();
        params.set('network', paperId);
        router.push(`/search?${params.toString()}`);
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [router]);

  // Fetch author info
  useEffect(() => {
    if (authors.length !== 1) {
      setAuthorInfo(null);
      setIsAuthorInfoExpanded(false);
      return;
    }
    const authorId = authors[0].id;
    setLoadingAuthorInfo(true);
    openAlexFetch(`https://api.openalex.org/authors/${authorId}`)
      .then((res) => {
        // Guard res.ok: a 429/5xx returns an error body without these
        // fields, which would otherwise paint the author panel with
        // undefined name / stats. Throw so the .catch clears it instead.
        if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setAuthorInfo({
          id: data.id,
          display_name: data.display_name,
          orcid: data.orcid,
          works_count: data.works_count,
          cited_by_count: data.cited_by_count,
          h_index: data.summary_stats?.h_index,
          i10_index: data.summary_stats?.i10_index,
          last_known_institution: data.last_known_institution?.display_name,
          last_known_institution_country:
            data.last_known_institution?.country_code,
          affiliations: data.affiliations?.slice(0, 3) || [],
        });
      })
      .catch(() => setAuthorInfo(null))
      .finally(() => setLoadingAuthorInfo(false));
  }, [authors]);

  // Fetch citing paper. fetchWorkAsPaper folds in the OpenAlex→Paper
  // mapping and per-call error handling that all four of these citation
  // banner effects used to repeat inline.
  useEffect(() => {
    if (!citing) {
      setCitingPaper(null);
      return;
    }
    setLoadingCitingPaper(true);
    fetchWorkAsPaper(citing)
      .then(setCitingPaper)
      .finally(() => setLoadingCitingPaper(false));
  }, [citing]);

  // Fetch referencedBy paper
  useEffect(() => {
    if (!referencedBy) {
      setReferencedByPaper(null);
      return;
    }
    setLoadingReferencedByPaper(true);
    fetchWorkAsPaper(referencedBy)
      .then(setReferencedByPaper)
      .finally(() => setLoadingReferencedByPaper(false));
  }, [referencedBy]);

  // Fetch citingAll papers
  useEffect(() => {
    if (!citingAll || citingAll.length === 0) {
      setCitingAllPapers([]);
      return;
    }
    setLoadingCitingAllPapers(true);
    Promise.all(citingAll.map((id) => fetchWorkAsPaper(id)))
      .then((papers) =>
        setCitingAllPapers(papers.filter((p): p is Paper => p !== null)),
      )
      .finally(() => setLoadingCitingAllPapers(false));
  }, [citingAll]);

  // Fetch referencesAll papers
  useEffect(() => {
    if (!referencesAll || referencesAll.length === 0) {
      setReferencesAllPapers([]);
      return;
    }
    setLoadingReferencesAllPapers(true);
    Promise.all(referencesAll.map((id) => fetchWorkAsPaper(id)))
      .then((papers) =>
        setReferencesAllPapers(papers.filter((p): p is Paper => p !== null)),
      )
      .finally(() => setLoadingReferencesAllPapers(false));
  }, [referencesAll]);

  // ─── Main search effect ───
  useEffect(() => {
    // Skip the regular search entirely while we're rendering a network — the
    // network fetch (below) drives that view.
    if (networkId) return;
    // Wide econ filter is a meaningful constraint on its own — the API can
    // browse all econ journals without a query. Only short-circuit when no
    // filter at all is active (otherwise wide-mode-without-query returned
    // empty because `journals` is empty in wide mode).
    const isWideEconActive =
      journalFilterMode === 'wide' && (econFilter?.enabled ?? false);
    if (
      !citing &&
      !citingAll?.length &&
      !referencedBy &&
      !referencesAll?.length &&
      !query &&
      journals.length === 0 &&
      authors.length === 0 &&
      institutions.length === 0 &&
      !isWideEconActive
    ) {
      setResults([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        setLoadingStartTime(Date.now());
        setShowSlowLoadingHelp(false);

        const params = new URLSearchParams();
        if (query) params.set('query', query);
        // Journal filter source is gated by mode — only the active subsection
        // sends params, so the two never compete on the API side.
        if (journalFilterMode === 'specific' && journals.length) {
          params.set('journals', journals.map((j) => j.issn).join(','));
        }
        if (authors.length)
          params.set('authors', authors.map((a) => a.id).join(','));
        if (institutions.length)
          params.set(
            'institutions',
            institutions
              .map((i) => normalizeId(i.id))
              .join(','),
          );
        if (publicationType) params.set('type', publicationType);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (sortBy) params.set('sort', sortBy);
        params.set('page', page.toString());
        if (citing) params.set('citing', citing);
        if (citingAll?.length) params.set('citingAll', citingAll.join(','));
        if (referencedBy) params.set('referencedBy', referencedBy);
        if (referencesAll?.length)
          params.set('referencesAll', referencesAll.join(','));

        // Econ filter params (only when wide mode is active). The server
        // is scheme-agnostic — we resolve tiers/domains to ISSNs locally
        // using the active RankingScheme and send only `econIssns`. The
        // resolution is memoised in `econResolvedIssns` above.
        if (
          journalFilterMode === 'wide' &&
          econFilter?.enabled &&
          econResolvedIssns !== null
        ) {
          params.set('econEnabled', 'true');
          if (econResolvedIssns.length > 0)
            params.set('econIssns', econResolvedIssns.join(','));
        }

        // cachedFetch: in-session memo of identical URLs (page-flip,
        // chip-toggle round-trips, browser back/forward) come back without
        // a network round-trip. Error envelopes (5xx) are returned but
        // not cached, so transient failures don't stick.
        const data = (await cachedFetch(
          `/api/search?${params.toString()}`,
        )) as {
          results?: Paper[];
          meta?: { count?: number };
          error?: string;
        };

        if (data.error) {
          setError(data.error);
          setResults([]);
          setTotalCount(0);
        } else {
          setResults(data.results || []);
          setTotalCount(data.meta?.count || 0);
        }
      } catch (err) {
        console.error('Search error:', err);
        setError('An error occurred while searching. Please try again.');
        setResults([]);
        setTotalCount(0);
      } finally {
        setLoadingStartTime(null);
        setShowSlowLoadingHelp(false);
      }
    });
  }, [
    query,
    journals,
    authors,
    institutions,
    publicationType,
    from,
    to,
    sortBy,
    page,
    citing,
    citingAll,
    referencedBy,
    referencesAll,
    econFilter,
    econResolvedIssns,
    journalFilterMode,
    networkId,
  ]);

  // ── Network view fetch ───────────────────────────────────────────
  // When a `networkId` is set, fire three calls in parallel:
  //   1) the focal paper itself (OpenAlex direct, so we have referenced_works)
  //   2) refs       — papers the focal cites
  //   3) cites      — papers that cite the focal
  // Both /api/search calls return papers with `referenced_works`, which is
  // what CitationsNetwork needs to compute non-trivial edges.
  useEffect(() => {
    if (!networkId) {
      setNetworkFocal(null);
      setNetworkRefs([]);
      setNetworkCites([]);
      setNetworkRefsTotal(null);
      setNetworkCitesTotal(null);
      setNetworkError(null);
      return;
    }
    let aborted = false;
    setNetworkLoading(true);
    setNetworkError(null);

    // Mirror the regular-search journal-filter logic: only the active mode's
    // params get sent, so toggling Wide/Specific/Off in the side panel
    // narrows (or opens up) the network just like it narrows the list.
    const buildFilterParams = (): URLSearchParams => {
      const p = new URLSearchParams();
      if (journalFilterMode === 'specific' && journals.length) {
        p.set('journals', journals.map((j) => j.issn).join(','));
      }
      if (
        journalFilterMode === 'wide' &&
        econFilter?.enabled &&
        econResolvedIssns !== null
      ) {
        p.set('econEnabled', 'true');
        if (econResolvedIssns.length > 0)
          p.set('econIssns', econResolvedIssns.join(','));
      }
      return p;
    };

    const refsParams = buildFilterParams();
    refsParams.set('referencedBy', networkId);
    refsParams.set('perPage', '200');
    refsParams.set('sort', 'cited_by_count:desc');

    const citesParams = buildFilterParams();
    citesParams.set('citing', networkId);
    citesParams.set('perPage', '200');
    citesParams.set('sort', 'cited_by_count:desc');

    // All three calls go through cachedFetch so toggling between two
    // networks the user has already opened (e.g. clicking back into a
    // graph node they explored earlier) is instant. The OpenAlex
    // /works/<id> call is the slowest and most cache-friendly — its
    // payload is invariant across page reloads within a session.
    type FocalRaw = {
      id: string;
      title?: string | null;
      authorships?: { author: { display_name: string } }[];
      publication_year?: number;
      primary_location?: { source?: { display_name?: string } };
      doi?: string | null;
      cited_by_count?: number;
      referenced_works_count?: number;
      referenced_works?: string[];
    };
    type SearchResp = {
      results?: Paper[];
      meta?: { count?: number };
      error?: string;
    };
    Promise.all([
      cachedFetch<FocalRaw>(
        withMailto(`https://api.openalex.org/works/${networkId}`),
      ),
      cachedFetch<SearchResp>(`/api/search?${refsParams.toString()}`),
      cachedFetch<SearchResp>(`/api/search?${citesParams.toString()}`),
    ])
      .then(([focalRaw, refsResp, citesResp]) => {
        if (aborted) return;
        if (refsResp.error || citesResp.error) {
          setNetworkError(refsResp.error || citesResp.error || null);
          return;
        }
        const focal: Paper = {
          id: focalRaw.id,
          title: cleanHtml(focalRaw.title),
          authors: (focalRaw.authorships || []).map(
            (a) => a.author.display_name,
          ),
          publication_year: focalRaw.publication_year ?? 0,
          journal_name:
            focalRaw.primary_location?.source?.display_name || 'Unknown',
          doi: focalRaw.doi ?? undefined,
          cited_by_count: focalRaw.cited_by_count || 0,
          referenced_works_count: focalRaw.referenced_works_count || 0,
          abstract: '',
          referenced_works: (focalRaw.referenced_works || []).map((id) =>
            normalizeId(id),
          ),
        };
        setNetworkFocal(focal);
        setNetworkRefs(refsResp.results || []);
        setNetworkCites(citesResp.results || []);
        setNetworkRefsTotal(refsResp.meta?.count ?? null);
        setNetworkCitesTotal(citesResp.meta?.count ?? null);
      })
      .catch((err: unknown) => {
        if (aborted) return;
        const msg = err instanceof Error ? err.message : 'Network error';
        setNetworkError(msg);
      })
      .finally(() => {
        if (!aborted) setNetworkLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [networkId, journalFilterMode, econFilter, econResolvedIssns, journals]);

  // Author helpers
  const toggleAuthorInfo = () => setIsAuthorInfoExpanded(!isAuthorInfoExpanded);
  const copyAuthorId = async () => {
    if (!authorInfo) return;
    const id = normalizeId(authorInfo.id);
    try {
      await navigator.clipboard.writeText(id);
      setIsAuthorIdCopied(true);
      setTimeout(() => setIsAuthorIdCopied(false), 2000);
    } catch {}
  };
  const openAuthorCorrectionForm = () => {
    window.open(AUTHOR_CORRECTION_FORM_URL, '_blank');
  };
  const authorReportedKey = authorInfo
    ? reportedAuthorKey(normalizeId(authorInfo.id))
    : '';
  // Seed the "already reported" flag from localStorage in an effect rather
  // than reading storage during render — a render-phase read risks an
  // SSR/client hydration mismatch and re-runs on every render. Reseeding
  // when the focused author changes also clears the in-session toggle so a
  // report on one author doesn't visually bleed onto the next.
  const [isAuthorReportedStored, setIsAuthorReportedStored] = useState(false);
  useEffect(() => {
    setHasAuthorReported(false);
    if (typeof window === 'undefined' || !authorReportedKey) {
      setIsAuthorReportedStored(false);
      return;
    }
    setIsAuthorReportedStored(
      localStorage.getItem(authorReportedKey) === 'true',
    );
  }, [authorReportedKey]);
  const handleAuthorReportedToggle = () => {
    if (!hasAuthorReported && !isAuthorReportedStored) {
      setHasAuthorReported(true);
      localStorage.setItem(authorReportedKey, 'true');
      emit('paper-reported', { authorId: authorReportedKey });
    } else {
      setHasAuthorReported(false);
      localStorage.removeItem(authorReportedKey);
    }
  };
  const isAuthorReported = hasAuthorReported || isAuthorReportedStored;

  // Empty state — but only when we're not in network mode AND no journal
  // filter is active (a wide filter alone is a meaningful constraint and
  // should run a search, even without a typed query).
  const hasActiveJournalFilter =
    (journalFilterMode === 'wide' && econFilter?.enabled) ||
    (journalFilterMode === 'specific' && journals.length > 0);
  if (
    !networkId &&
    !citing &&
    !citingAll?.length &&
    !referencedBy &&
    !referencesAll?.length &&
    !query &&
    !hasActiveJournalFilter &&
    authors.length === 0 &&
    institutions.length === 0
  ) {
    return <EmptyState onPresetTile={onPresetTile} />;
  }

  const totalPages = Math.ceil(totalCount / RESULTS_PER_PAGE);
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 10) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      const start = Math.max(2, page - 3);
      const end = Math.min(totalPages - 1, page + 3);
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
  if (isPending) {
    return (
      <div className='space-y-3'>
        <div className='text-center py-4'>
          <div className='inline-flex items-center gap-2 text-sm text-stone-600'>
            <div className='animate-spin h-4 w-4 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full' />
            <span>{loadingMessage}</span>
          </div>
        </div>
        {showSlowLoadingHelp && (
          <div className='mb-4 p-4 banner-warning rounded-lg'>
            <p className='text-sm font-medium text-warning mb-2'>
              Taking longer than expected
            </p>
            <p className='text-xs text-warning mb-3'>
              This usually means your search is very broad or OpenAlex is
              experiencing high traffic.
            </p>
            <div className='flex gap-2 text-xs'>
              <button
                onClick={() => window.location.reload()}
                className='px-3 py-1.5 rounded transition surface-card border border-[var(--warning-border)] text-warning'
              >
                Retry Search
              </button>
              <span className='text-warning'>
                or try adding more filters to narrow results
              </span>
            </div>
          </div>
        )}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className='surface-subtle h-24 rounded-lg animate-pulse'
          />
        ))}
      </div>
    );
  }

  const authorId = authorInfo?.id ? normalizeId(authorInfo.id) : '';

  // ── Network view short-circuits the rest of the page ────────────
  if (networkId) {
    return (
      <div className='flex h-full min-h-0 w-full flex-col overflow-hidden pb-3'>
        {/* Header banner with focal info + clear button */}
        <div className='mb-3 p-3 surface-card border border-app rounded-lg flex items-start gap-3'>
          <div className='flex-1 min-w-0'>
            <p className='text-xs font-medium text-stone-600 mb-1'>
              Network for:
            </p>
            {networkFocal ? (
              <>
                <p className='text-sm font-semibold text-stone-900 line-clamp-2 leading-snug'>
                  {networkFocal.title}
                </p>
                <p className='text-xs text-stone-500 mt-0.5 flex flex-wrap items-center gap-x-1.5'>
                  <span>
                    {networkFocal.authors?.slice(0, 3).join(', ')}
                    {networkFocal.authors && networkFocal.authors.length > 3
                      ? ' et al.'
                      : ''}
                  </span>
                  <span>·</span>
                  <span>{networkFocal.publication_year}</span>
                  <span>·</span>
                  {/* Same dispatch pattern as PaperCard so SearchResults'
                      existing window listener routes to the citing view
                      (and PaperazziApp's listener clears transient filters). */}
                  <button
                    onClick={() => {
                      emit('paper-citing-click', { paper: networkFocal });
                    }}
                    className='hover:text-stone-700 hover:underline transition cursor-pointer'
                    title='Find papers that cite this paper'
                  >
                    {networkFocal.cited_by_count?.toLocaleString() || 0}{' '}
                    citations
                  </button>
                  {networkFocal.referenced_works_count !== undefined && (
                    <>
                      <span>·</span>
                      <button
                        onClick={() => {
                          emit('paper-refs-click', { paper: networkFocal });
                        }}
                        className='hover:text-stone-700 hover:underline transition cursor-pointer'
                        title='Find papers cited by this paper'
                      >
                        {networkFocal.referenced_works_count} references
                      </button>
                    </>
                  )}
                </p>
                {/* Filter chip — when an active journal filter is narrowing
                    the refs/cites shown in the graph. */}
                {(() => {
                  if (journalFilterMode === 'specific' && journals.length) {
                    return (
                      <p className='text-[11px] text-warning mt-1.5'>
                        Filtered by {journals.length} manual journal
                        {journals.length === 1 ? '' : 's'}
                      </p>
                    );
                  }
                  if (journalFilterMode === 'wide' && econFilter?.enabled) {
                    let label: string;
                    if (econFilter.presetId === 'top5gen') label = 'Top 5';
                    else if (econFilter.presetId === 'all')
                      label = 'All economics journals';
                    else if (econFilter.issns?.length) {
                      label = `whitelist of ${econFilter.issns.length} journals`;
                    } else {
                      const tiers = econFilter.tiers.length
                        ? `tiers ${econFilter.tiers.join(',')}`
                        : 'all tiers';
                      const doms = econFilter.domains.length
                        ? `${econFilter.domains.length} domain${
                            econFilter.domains.length === 1 ? '' : 's'
                          }`
                        : 'all domains';
                      label = `${tiers} · ${doms}`;
                    }
                    return (
                      <p className='text-[11px] text-warning mt-1.5'>
                        Filtered by {label}
                      </p>
                    );
                  }
                  return null;
                })()}
              </>
            ) : networkLoading ? (
              <p className='text-sm text-stone-500'>Loading focal paper…</p>
            ) : (
              <p className='text-sm text-stone-500'>Paper ID: {networkId}</p>
            )}
          </div>
          {onToggleSidebars && (
            <button
              onClick={onToggleSidebars}
              className='p-1 hover:bg-[var(--surface-muted)] rounded transition flex-shrink-0'
              title={
                sidebarsCollapsed
                  ? 'Show side panels'
                  : 'Hide side panels for a wider graph'
              }
              aria-label={
                sidebarsCollapsed ? 'Show side panels' : 'Hide side panels'
              }
            >
              {sidebarsCollapsed ? (
                <Minimize2 size={16} className='text-stone-600' />
              ) : (
                <Maximize2 size={16} className='text-stone-600' />
              )}
            </button>
          )}
          <button
            onClick={() => (onExitNetwork ? onExitNetwork() : router.push('/search'))}
            className='p-1 hover:bg-[var(--surface-muted)] rounded transition flex-shrink-0'
            title='Exit network view'
          >
            <X size={16} className='text-stone-600' />
          </button>
        </div>

        {/* Body */}
        {networkLoading ? (
          <div className='flex items-center justify-center py-16 gap-3'>
            <div className='animate-spin h-5 w-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full' />
            <span className='text-sm text-stone-600'>
              Building network — fetching references and citing papers…
            </span>
          </div>
        ) : networkError ? (
          <div className='p-4 banner-danger rounded text-sm text-danger'>
            Failed to build network: {networkError}
          </div>
        ) : networkFocal ? (
          <>
            {((networkRefsTotal !== null &&
              networkRefsTotal > networkRefs.length) ||
              (networkCitesTotal !== null &&
                networkCitesTotal > networkCites.length)) && (
              <p className='text-[11px] text-stone-500 mb-2'>
                Capped at top 100 by Most cited per direction.
                {networkRefsTotal !== null &&
                  networkRefsTotal > networkRefs.length &&
                  ` Showing ${networkRefs.length} of ${networkRefsTotal.toLocaleString()} references.`}
                {networkCitesTotal !== null &&
                  networkCitesTotal > networkCites.length &&
                  ` Showing ${networkCites.length} of ${networkCitesTotal.toLocaleString()} citing papers.`}
              </p>
            )}
            {/* overflow-hidden is required because CitationsNetwork's SVG
                uses w-full h-auto with a fixed viewBox aspect ratio (1400×640).
                On wide layouts (panels collapsed), the SVG's natural height
                can exceed the flex-allocated space and visually spill past
                the wrapper, hiding the caption and the bottom margin. */}
            <div className='flex-1 min-h-0 overflow-hidden'>
              <CitationsNetwork
                focal={networkFocal}
                refs={networkRefs}
                cites={networkCites}
              />
            </div>
            <p className='text-[11px] text-app-soft mt-2'>
              Hover a node to highlight its edges (references/backward = green,
              citing/forward = blue). Click a node to open the paper.
            </p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className='flex h-full min-h-0 w-full flex-col overflow-hidden'>
      {/* Author Info Banner */}
      {authorInfo && (
        <div className='mb-4 p-4 banner-info rounded-lg relative group'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-3 flex-1 min-w-0'>
              <User size={20} className='text-accent mt-1 flex-shrink-0' />
              <div className='flex-1 min-w-0'>
                <p className='text-xs font-medium text-accent-strong mb-2'>
                  Filtering by author:
                </p>
                <div className='flex items-center gap-2 mb-2'>
                  <h3 className='text-lg font-semibold text-stone-900'>
                    {authorInfo.display_name}
                  </h3>
                  {authorInfo.orcid && (
                    <a
                      href={authorInfo.orcid}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-xs text-accent hover:underline'
                    >
                      ORCID
                    </a>
                  )}
                </div>
                {authorInfo.last_known_institution && (
                  <p className='text-sm text-stone-700 mb-1'>
                    <span className='text-stone-500'>Institution:</span>{' '}
                    {authorInfo.last_known_institution}
                    {authorInfo.last_known_institution_country && (
                      <span className='text-stone-400 ml-1'>
                        ({authorInfo.last_known_institution_country})
                      </span>
                    )}
                  </p>
                )}
                {authorInfo.affiliations?.length > 0 && (
                  <p className='text-xs text-stone-600 mb-2'>
                    <span className='text-stone-500'>
                      Also affiliated with:
                    </span>{' '}
                    {authorInfo.affiliations
                      .map((aff) => aff.institution?.display_name)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                <div className='flex flex-wrap gap-4 text-xs text-stone-600'>
                  {authorInfo.works_count !== undefined && (
                    <span>
                      <span className='font-medium text-stone-700'>
                        {authorInfo.works_count.toLocaleString()}
                      </span>{' '}
                      works
                    </span>
                  )}
                  {authorInfo.cited_by_count !== undefined && (
                    <span>
                      <span className='font-medium text-stone-700'>
                        {authorInfo.cited_by_count.toLocaleString()}
                      </span>{' '}
                      citations
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClearAuthor}
              className='p-1 hover:bg-[var(--surface-card)] rounded transition flex-shrink-0'
              title='Clear author filter'
            >
              <X size={16} className='text-accent' />
            </button>
          </div>
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${isAuthorInfoExpanded ? 'max-h-32 opacity-100 mt-3' : 'max-h-0 opacity-0'}`}
          >
            <div className='pt-3 border-t border-[var(--accent-border)] space-y-2'>
              <p className='text-xs text-stone-500'>
                Report errors or missing data to OpenAlex
              </p>
              <div className='flex items-center gap-2 text-xs'>
                <span className='text-stone-500'>ID:</span>
                <code className='px-1.5 py-0.5 surface-card rounded text-stone-600 font-mono text-[11px]'>
                  {authorId}
                </code>
                <button
                  onClick={copyAuthorId}
                  className='p-0.5 text-stone-400 hover:text-stone-600 transition'
                  title='Copy Author ID'
                >
                  {isAuthorIdCopied ? (
                    <Check size={12} className='text-success' />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>
              <div className='flex items-center gap-3 pt-1'>
                <button
                  onClick={openAuthorCorrectionForm}
                  className='inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 hover:underline transition'
                >
                  <ExternalLink size={11} /> Submit correction
                </button>
                <button
                  onClick={handleAuthorReportedToggle}
                  className={`inline-flex items-center gap-1 text-xs transition ${isAuthorReported ? 'text-success' : 'text-stone-400 hover:text-stone-600'}`}
                >
                  <CheckCircle
                    size={12}
                    className={
                      isAuthorReported
                        ? 'fill-[var(--success-foreground)] text-[var(--foreground-inverse)]'
                        : ''
                    }
                  />
                  <span>
                    {isAuthorReported ? 'Reported' : 'Mark as reported'}
                  </span>
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={toggleAuthorInfo}
            className='absolute bottom-2 right-2 p-1 text-[var(--accent-border)] hover:text-accent hover:bg-[var(--surface-card)] rounded transition  group-hover:opacity-100'
          >
            <Flag
              size={16}
              className={`transition-colors ${isAuthorInfoExpanded ? 'text-accent' : ''}`}
            />
          </button>
        </div>
      )}

      {/* Citing banner */}
      {citing && (
        <div className='mb-4 p-3 banner-warning rounded-lg'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-2 flex-1 min-w-0'>
              <Quote size={16} className='text-warning mt-0.5 flex-shrink-0' />
              <div className='min-w-0'>
                <p className='text-xs font-medium text-warning mb-1'>
                  Showing papers that cite:
                </p>
                {loadingCitingPaper ? (
                  <p className='text-sm text-warning animate-pulse'>
                    Loading...
                  </p>
                ) : citingPaper ? (
                  <div>
                    <p className='text-sm font-medium text-stone-900 line-clamp-2'>
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
                  <p className='text-sm text-warning'>Paper ID: {citing}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClearCiting}
              className='p-1 hover:bg-[var(--surface-card)] rounded transition flex-shrink-0'
            >
              <X size={16} className='text-warning' />
            </button>
          </div>
        </div>
      )}

      {/* CitingAll banner */}
      {citingAll && citingAll.length > 0 && (
        <div className='mb-4 p-3 banner-analysis rounded-lg'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-2 flex-1 min-w-0'>
              <Library
                size={16}
                className='text-analysis mt-0.5 flex-shrink-0'
              />
              <div className='min-w-0 flex-1'>
                <p className='text-xs font-medium text-analysis mb-2'>
                  Showing papers that cite ALL {citingAll.length} papers:
                </p>
                {loadingCitingAllPapers ? (
                  <p className='text-sm text-analysis animate-pulse'>
                    Loading...
                  </p>
                ) : citingAllPapers.length > 0 ? (
                  <div className='space-y-2'>
                    {citingAllPapers.map((paper, i) => (
                      <div
                        key={paper.id}
                        className='text-sm surface-card rounded p-2 border border-[var(--analysis-border)]'
                      >
                        <p className='font-medium text-stone-900 line-clamp-1'>
                          {i + 1}. {paper.title}
                        </p>
                        <p className='text-xs text-stone-600 truncate'>
                          {paper.authors?.slice(0, 2).join(', ')}
                          {paper.authors?.length > 2 && ' et al.'}
                          {paper.publication_year &&
                            ` (${paper.publication_year})`}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-analysis'>
                    {citingAll.length} papers selected
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClearCitingAll}
              className='p-1 hover:bg-[var(--surface-card)] rounded transition flex-shrink-0'
            >
              <X size={16} className='text-analysis' />
            </button>
          </div>
        </div>
      )}

      {/* ReferencedBy banner */}
      {referencedBy && (
        <div className='mb-4 p-3 banner-success rounded-lg'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-2 flex-1 min-w-0'>
              <BookOpen
                size={16}
                className='text-success mt-0.5 flex-shrink-0'
              />
              <div className='min-w-0'>
                <p className='text-xs font-medium text-success mb-1'>
                  Showing references from:
                </p>
                {loadingReferencedByPaper ? (
                  <p className='text-sm text-success animate-pulse'>
                    Loading...
                  </p>
                ) : referencedByPaper ? (
                  <div>
                    <p className='text-sm font-medium text-stone-900 line-clamp-2'>
                      {referencedByPaper.title}
                    </p>
                    <p className='text-xs text-stone-600 truncate'>
                      {referencedByPaper.authors?.slice(0, 3).join(', ')}
                      {referencedByPaper.authors?.length > 3 && ' et al.'}
                      {referencedByPaper.publication_year &&
                        ` (${referencedByPaper.publication_year})`}
                    </p>
                  </div>
                ) : (
                  <p className='text-sm text-success'>
                    Paper ID: {referencedBy}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClearReferencedBy}
              className='p-1 hover:bg-[var(--surface-card)] rounded transition flex-shrink-0'
            >
              <X size={16} className='text-success' />
            </button>
          </div>
        </div>
      )}

      {/* ReferencesAll banner */}
      {referencesAll && referencesAll.length > 0 && (
        <div className='mb-4 p-3 banner-success rounded-lg'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-2 flex-1 min-w-0'>
              <Library
                size={16}
                className='text-success mt-0.5 flex-shrink-0'
              />
              <div className='min-w-0 flex-1'>
                <p className='text-xs font-medium text-success mb-2'>
                  Showing common references from {referencesAll.length} papers:
                </p>
                {loadingReferencesAllPapers ? (
                  <p className='text-sm text-success animate-pulse'>
                    Loading...
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {referencesAllPapers.map((paper, i) => (
                      <div
                        key={paper.id}
                        className='text-sm surface-card rounded p-2 border border-[var(--success-border)]'
                      >
                        <p className='font-medium text-stone-900 line-clamp-1'>
                          {i + 1}. {paper.title}
                        </p>
                        <p className='text-xs text-stone-600 truncate'>
                          {paper.authors?.slice(0, 2).join(', ')}
                          {paper.authors?.length > 2 && ' et al.'}
                          {paper.publication_year &&
                            ` (${paper.publication_year})`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClearReferencesAll}
              className='p-1 hover:bg-[var(--surface-card)] rounded transition flex-shrink-0'
            >
              <X size={16} className='text-success' />
            </button>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className='text-sm text-stone-600 mb-4'>
        {totalCount === 0 ? (
          <span>
            No results found{isEconActive ? ' in economics journals' : ''}
          </span>
        ) : (
          <span>
            Showing {(page - 1) * RESULTS_PER_PAGE + 1}–
            {Math.min(page * RESULTS_PER_PAGE, totalCount)} of{' '}
            {totalCount.toLocaleString()}
            {isEconActive ? ' economics' : ''} results
          </span>
        )}
      </div>

      {error && (
        <div className='mb-4 p-4 banner-danger rounded-lg'>
          <div className='flex items-start gap-2'>
            <div className='flex-1'>
              <p className='text-sm font-medium text-danger mb-1'>
                Search Error
              </p>
              <p className='text-sm text-danger'>{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className='text-xs text-danger hover:opacity-80 underline'
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {results.length === 0 && !isPending && (
        <div className='text-center py-12 text-stone-500'>
          <p>No papers found.</p>
          <p className='text-sm mt-2'>Try adjusting your filters.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className='app-scrollbar flex-1 min-h-0 overflow-y-auto space-y-3 mb-4 pr-1'>
          {results.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              variant='default'
              showPinButton={true}
              showActions={true}
              onAuthorClick={onAuthorSearch}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-1 pt-4 pb-3 border-t border-app surface-card'>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className='px-3 py-2 text-sm text-stone-700 hover:bg-[var(--surface-muted)] rounded disabled:text-stone-400 transition'
          >
            Previous
          </button>
          {getPageNumbers().map((pageNum, idx) => {
            if (pageNum === '...')
              return (
                <span key={`ellipsis-${idx}`} className='px-2 text-stone-400'>
                  ...
                </span>
              );
            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum as number)}
                className={`min-w-[40px] px-3 py-2 text-sm rounded transition ${pageNum === page ? 'button-primary font-semibold' : 'text-stone-700 hover:bg-[var(--surface-muted)]'}`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className='px-3 py-2 text-sm text-stone-700 hover:bg-[var(--surface-muted)] rounded disabled:text-stone-400 transition'
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
