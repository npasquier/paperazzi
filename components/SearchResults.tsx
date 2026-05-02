'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Paper, RESULTS_PER_PAGE } from '../types/interfaces';
import PaperCard from './ui/PaperCard';
import CitationsNetwork from './ui/CitationsNetwork';
import { usePins } from '@/contexts/PinContext';
import {
  X,
  Quote,
  Library,
  BookOpen,
  User,
  Info,
  Copy,
  Check,
  ExternalLink,
  CheckCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react';

function cleanHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    categories: number[];
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
  onPresetTile?: (
    preset: 'climate-top5' | 'demo-network' | 'recent-qje',
  ) => void;
  loadMore?: (page: number) => void;
  onClearCiting?: () => void;
  onClearCitingAll?: () => void;
  onClearReferencedBy?: () => void;
  onClearReferencesAll?: () => void;
  onAuthorSearch?: (authorName: string) => void;
  onClearAuthor?: () => void;
  // Semantic search mode (OpenAlex `search.semantic=`). When true the API
  // returns ≤50 results sorted by similarity and pagination is suppressed.
  semantic?: boolean;
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
  semantic = false,
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
  const [authorInfo, setAuthorInfo] = useState<any>(null);
  const [loadingAuthorInfo, setLoadingAuthorInfo] = useState(false);
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

  const { pinnedIds } = usePins();

  const isEconActive = econFilter?.enabled ?? false;

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
    const handleCitingClick = (e: Event) => {
      const paper = (e as CustomEvent).detail.paper;
      const paperId = paper.id.replace('https://openalex.org/', '');
      const params = new URLSearchParams();
      params.set('citing', paperId);
      params.set('sort', 'cited_by_count:desc');
      params.set('page', '1');
      router.push(`/search?${params.toString()}`);
    };
    const handleRefsClick = (e: Event) => {
      const paper = (e as CustomEvent).detail.paper;
      const paperId = paper.id.replace('https://openalex.org/', '');
      const params = new URLSearchParams();
      params.set('referencedBy', paperId);
      params.set('sort', 'cited_by_count:desc');
      params.set('page', '1');
      router.push(`/search?${params.toString()}`);
    };
    const handleNetworkClick = (e: Event) => {
      const paper = (e as CustomEvent).detail.paper;
      const paperId = paper.id.replace('https://openalex.org/', '');
      const params = new URLSearchParams();
      params.set('network', paperId);
      router.push(`/search?${params.toString()}`);
    };
    window.addEventListener('paper-citing-click', handleCitingClick);
    window.addEventListener('paper-refs-click', handleRefsClick);
    window.addEventListener('paper-network-click', handleNetworkClick);
    return () => {
      window.removeEventListener('paper-citing-click', handleCitingClick);
      window.removeEventListener('paper-refs-click', handleRefsClick);
      window.removeEventListener('paper-network-click', handleNetworkClick);
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
    fetch(`https://api.openalex.org/authors/${authorId}`)
      .then((res) => res.json())
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

  // Fetch citing paper
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
          title: cleanHtml(data.title),
          authors:
            data.authorships?.map((a: any) => a.author.display_name) || [],
          publication_year: data.publication_year,
          journal_name:
            data.primary_location?.source?.display_name || 'Unknown',
          doi: data.doi,
          cited_by_count: data.cited_by_count,
          abstract: '',
        });
      })
      .catch(() => setCitingPaper(null))
      .finally(() => setLoadingCitingPaper(false));
  }, [citing]);

  // Fetch referencedBy paper
  useEffect(() => {
    if (!referencedBy) {
      setReferencedByPaper(null);
      return;
    }
    setLoadingReferencedByPaper(true);
    fetch(`https://api.openalex.org/works/${referencedBy}`)
      .then((res) => res.json())
      .then((data) => {
        setReferencedByPaper({
          id: data.id,
          title: cleanHtml(data.title),
          authors:
            data.authorships?.map((a: any) => a.author.display_name) || [],
          publication_year: data.publication_year,
          journal_name:
            data.primary_location?.source?.display_name || 'Unknown',
          doi: data.doi,
          cited_by_count: data.cited_by_count,
          abstract: '',
        });
      })
      .catch(() => setReferencedByPaper(null))
      .finally(() => setLoadingReferencedByPaper(false));
  }, [referencedBy]);

  // Fetch citingAll papers
  useEffect(() => {
    if (!citingAll || citingAll.length === 0) {
      setCitingAllPapers([]);
      return;
    }
    setLoadingCitingAllPapers(true);
    Promise.all(
      citingAll.map((id) =>
        fetch(`https://api.openalex.org/works/${id}`)
          .then((res) => res.json())
          .then(
            (data): Paper => ({
              id: data.id,
              title: cleanHtml(data.title),
              authors:
                data.authorships?.map((a: any) => a.author.display_name) || [],
              publication_year: data.publication_year,
              journal_name:
                data.primary_location?.source?.display_name || 'Unknown',
              doi: data.doi,
              cited_by_count: data.cited_by_count,
              abstract: '',
            }),
          )
          .catch(() => null),
      ),
    )
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
    Promise.all(
      referencesAll.map((id) =>
        fetch(`https://api.openalex.org/works/${id}`)
          .then((res) => res.json())
          .then(
            (data): Paper => ({
              id: data.id,
              title: cleanHtml(data.title),
              authors:
                data.authorships?.map((a: any) => a.author.display_name) || [],
              publication_year: data.publication_year,
              journal_name:
                data.primary_location?.source?.display_name || 'Unknown',
              doi: data.doi,
              cited_by_count: data.cited_by_count,
              abstract: '',
            }),
          )
          .catch(() => null),
      ),
    )
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
              .map((i) => i.id.replace('https://openalex.org/', ''))
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

        // Econ filter params (only when wide mode is active)
        if (journalFilterMode === 'wide' && econFilter?.enabled) {
          params.set('econEnabled', 'true');
          if (econFilter.categories.length)
            params.set('econCat', econFilter.categories.join(','));
          if (econFilter.domains.length)
            params.set('econDom', econFilter.domains.join(','));
          if (econFilter.issns?.length)
            params.set('econIssns', econFilter.issns.join(','));
        }

        // Semantic mode — server uses search.semantic= and caps at 50 results.
        if (semantic) params.set('semantic', 'true');

        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setResults([]);
          setTotalCount(0);
        } else {
          setResults(data.results);
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
    journalFilterMode,
    networkId,
    semantic,
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
      if (journalFilterMode === 'wide' && econFilter?.enabled) {
        p.set('econEnabled', 'true');
        if (econFilter.categories.length)
          p.set('econCat', econFilter.categories.join(','));
        if (econFilter.domains.length)
          p.set('econDom', econFilter.domains.join(','));
        if (econFilter.issns?.length)
          p.set('econIssns', econFilter.issns.join(','));
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

    Promise.all([
      fetch(`https://api.openalex.org/works/${networkId}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/search?${refsParams.toString()}`).then((r) => r.json()),
      fetch(`/api/search?${citesParams.toString()}`).then((r) => r.json()),
    ])
      .then(([focalRaw, refsResp, citesResp]) => {
        if (aborted) return;
        if (refsResp.error || citesResp.error) {
          setNetworkError(refsResp.error || citesResp.error);
          return;
        }
        const focal: Paper = {
          id: focalRaw.id,
          title: cleanHtml(focalRaw.title),
          authors: (focalRaw.authorships || []).map(
            (a: { author: { display_name: string } }) => a.author.display_name,
          ),
          publication_year: focalRaw.publication_year,
          journal_name:
            focalRaw.primary_location?.source?.display_name || 'Unknown',
          doi: focalRaw.doi,
          cited_by_count: focalRaw.cited_by_count || 0,
          referenced_works_count: focalRaw.referenced_works_count || 0,
          abstract: '',
          referenced_works: (focalRaw.referenced_works || []).map(
            (id: string) => id.replace('https://openalex.org/', ''),
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
  }, [networkId, journalFilterMode, econFilter, journals]);

  // Author helpers
  const toggleAuthorInfo = () => setIsAuthorInfoExpanded(!isAuthorInfoExpanded);
  const copyAuthorId = async () => {
    if (!authorInfo) return;
    const id = authorInfo.id.replace('https://openalex.org/', '');
    try {
      await navigator.clipboard.writeText(id);
      setIsAuthorIdCopied(true);
      setTimeout(() => setIsAuthorIdCopied(false), 2000);
    } catch {}
  };
  const openAuthorCorrectionForm = () => {
    window.open(
      'https://docs.google.com/forms/d/e/1FAIpQLSeHpt3yWbWoB5MK1K6wVWThI5fglZzk-GPniaih0JT_rCMdYA/viewform',
      '_blank',
    );
  };
  const authorReportedKey = authorInfo
    ? `reported-author-${authorInfo.id.replace('https://openalex.org/', '')}`
    : '';
  const isAuthorReportedStored =
    typeof window !== 'undefined' && authorReportedKey
      ? localStorage.getItem(authorReportedKey) === 'true'
      : false;
  const handleAuthorReportedToggle = () => {
    if (!hasAuthorReported && !isAuthorReportedStored) {
      setHasAuthorReported(true);
      localStorage.setItem(authorReportedKey, 'true');
      window.dispatchEvent(
        new CustomEvent('paper-reported', {
          detail: { authorId: authorReportedKey },
        }),
      );
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
    return (
      <div className='py-8'>
        <h2 className='text-lg font-semibold text-stone-800 mb-1'>
          Get started
        </h2>
        <p className='text-sm text-stone-500 mb-6'>
          Pick a use case example, or type a query in the navbar.
        </p>
        <div className='grid gap-3 md:grid-cols-3'>
          <button
            onClick={() => onPresetTile?.('climate-top5')}
            className='surface-card border border-app rounded-lg p-4 text-left hover:bg-stone-50 transition'
          >
            <h3 className='text-sm font-medium text-stone-900 mb-1 whitespace-nowrap overflow-hidden text-ellipsis'>
              Search &ldquo;climate change&rdquo; in Top&nbsp;5
            </h3>
            <p className='text-xs text-stone-500 leading-relaxed'>
              Search for &ldquo;climate change&rdquo; across the Top 5 econ
              journals (AER, Econometrica, JPE, QJE, REStud), ranked by
              relevance.
            </p>
          </button>
          <button
            onClick={() => onPresetTile?.('demo-network')}
            className='surface-card border border-app rounded-lg p-4 text-left hover:bg-stone-50 transition'
          >
            <h3 className='text-sm font-medium text-stone-900 mb-1'>
              Explore a citation network
            </h3>
            <p className='text-xs text-stone-500 leading-relaxed'>
              See how a single paper&apos;s references and citing papers cluster
              on year × log-citations axes. Click any node to trace a path.
            </p>
          </button>
          <button
            onClick={() => onPresetTile?.('recent-qje')}
            className='surface-card border border-app rounded-lg p-4 text-left hover:bg-stone-50 transition'
          >
            <h3 className='text-sm font-medium text-stone-900 mb-1'>
              Browse recent papers in QJE
            </h3>
            <p className='text-xs text-stone-500 leading-relaxed'>
              Switches to Specific mode + Most Recent sort. Save it as a journal
              filter to track monthly.
            </p>
          </button>
        </div>
        <p className='text-xs text-stone-400 mt-6'>
          New here?{' '}
          <a
            href='/help'
            className='text-stone-500 hover:text-stone-700 underline underline-offset-2'
          >
            See the Help page
          </a>{' '}
          for a full walkthrough.
        </p>
      </div>
    );
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
  const preserveParams =
    pinnedIds.length > 0 ? `pinned=${pinnedIds.join(',')}` : '';

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

  const authorId = authorInfo?.id?.replace('https://openalex.org/', '') || '';

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
                      window.dispatchEvent(
                        new CustomEvent('paper-citing-click', {
                          detail: { paper: networkFocal },
                        }),
                      );
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
                          window.dispatchEvent(
                            new CustomEvent('paper-refs-click', {
                              detail: { paper: networkFocal },
                            }),
                          );
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
                      const cats = econFilter.categories.length
                        ? `cats ${econFilter.categories.join(',')}`
                        : 'all cats';
                      const doms = econFilter.domains.length
                        ? `${econFilter.domains.length} domain${
                            econFilter.domains.length === 1 ? '' : 's'
                          }`
                        : 'all domains';
                      label = `${cats} · ${doms}`;
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
            onClick={() => router.push('/search')}
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
                      .map((aff: any) => aff.institution.display_name)
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
            className='absolute bottom-2 right-2 p-1 text-[var(--accent-border)] hover:text-accent hover:bg-[var(--surface-card)] rounded transition opacity-0 group-hover:opacity-100'
          >
            <Info
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
        ) : semantic ? (
          <span>
            Top {totalCount} by semantic similarity
            {isEconActive ? ' (economics journals)' : ''}
            <span className='text-app-soft'>
              {' '}
              · OpenAlex caps semantic search at 50 results
            </span>
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
              preserveParams={preserveParams}
              onAuthorClick={onAuthorSearch}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && !semantic && (
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
