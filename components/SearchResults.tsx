'use client';

// Search-page results pane. The data layer was extracted into hooks in
// the 2026-06 L2 decomposition — this component keeps the URL-driven
// props, the econ-filter resolution, and the (large) render branches:
//   • usePaperSearch      — the /api/search list fetch + loading UX
//   • useCitationBanners  — citing / refs / citingAll / referencesAll
//                           focal-paper metadata for the banners
//   • useNetworkView      — the citation-network data (focal + edges)
//   • useAuthorPanel      — the single-author summary card + report flow

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RESULTS_PER_PAGE } from '../types/interfaces';
import PaperCard from './ui/PaperCard';
import CitationsNetwork from './ui/CitationsNetwork';
import EmptyState, { PresetTileId } from './EmptyState';
import { emit } from '@/utils/eventBus';
import { on } from '@/utils/eventBus';
import { normalizeId } from '@/utils/normalizeId';
import {
  resolveIssns,
  useActiveRanking,
} from '@/utils/activeRanking';
import { usePaperSearch } from '@/hooks/usePaperSearch';
import { useCitationBanners } from '@/hooks/useCitationBanners';
import { useNetworkView } from '@/hooks/useNetworkView';
import { useAuthorPanel } from '@/hooks/useAuthorPanel';
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
  workingPaperFilter?: {
    enabled: boolean;
    sourceIds: string[];
  };
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
  workingPaperFilter,
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

  const isEconActive = econFilter?.enabled ?? false;

  // Resolve the wide-mode econ filter against the user's active ranking
  // scheme, on the client. The server stays scheme-agnostic — it only
  // ever sees the final `econIssns` list. When the user has an explicit
  // ISSN whitelist (e.g. Top 5 preset), we use that directly. Otherwise
  // we expand (tiers, domains) → ISSNs against the active scheme.
  //
  // Returns `null` while the scheme is still loading on first paint, OR
  // when the wide filter isn't engaged. usePaperSearch treats `null`
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

  // ── Data hooks (see module docstring) ────────────────────────────────
  const {
    results,
    totalCount,
    isPending,
    error,
    loadingMessage,
    showSlowLoadingHelp,
  } = usePaperSearch({
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
    workingPaperFilter,
    networkId,
  });

  const {
    citingPaper,
    loadingCitingPaper,
    citingAllPapers,
    loadingCitingAllPapers,
    referencedByPaper,
    loadingReferencedByPaper,
    referencesAllPapers,
    loadingReferencesAllPapers,
  } = useCitationBanners({ citing, citingAll, referencedBy, referencesAll });

  const {
    focal: networkFocal,
    refs: networkRefs,
    cites: networkCites,
    refsTotal: networkRefsTotal,
    citesTotal: networkCitesTotal,
    loading: networkLoading,
    error: networkError,
  } = useNetworkView({
    networkId,
    journals,
    econFilter,
    econResolvedIssns,
    journalFilterMode,
    workingPaperFilter,
  });

  const {
    authorInfo,
    isExpanded: isAuthorInfoExpanded,
    toggleExpanded: toggleAuthorInfo,
    isIdCopied: isAuthorIdCopied,
    copyId: copyAuthorId,
    openCorrectionForm: openAuthorCorrectionForm,
    isReported: isAuthorReported,
    handleReportedToggle: handleAuthorReportedToggle,
  } = useAuthorPanel(authors);

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
                  if (
                    workingPaperFilter?.enabled &&
                    workingPaperFilter.sourceIds.length
                  ) {
                    return (
                      <p className='text-[11px] text-warning mt-1.5'>
                        Filtered by {workingPaperFilter.sourceIds.length}{' '}
                        working-paper source
                        {workingPaperFilter.sourceIds.length === 1 ? '' : 's'}
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
