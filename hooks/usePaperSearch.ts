'use client';

// Main results-list data hook for the search page, extracted from
// SearchResults (2026-06 audit, L2 decomposition). Owns the /api/search
// fetch, the useTransition pending state, and the progressive loading
// messages ("Searching…" → "Still loading…" → slow-search help).

import { useEffect, useState, useTransition } from 'react';
import type { Paper } from '@/types/interfaces';
import { cachedFetch } from '@/utils/searchCache';
import { normalizeId } from '@/utils/normalizeId';

export interface EconFilterInput {
  enabled: boolean;
  tiers: string[];
  domains: string[];
  presetId?: string | null;
  issns?: string[];
}

export interface WorkingPaperFilterInput {
  enabled: boolean;
  sourceIds: string[];
}

interface Options {
  query: string;
  journals: { issn: string; name?: string }[];
  authors: { id: string; name?: string }[];
  institutions: { id: string; display_name: string }[];
  publicationType?: string;
  from?: string;
  to?: string;
  sortBy: string;
  page: number;
  citing?: string;
  citingAll?: string[];
  referencedBy?: string;
  referencesAll?: string[];
  econFilter?: EconFilterInput;
  /** Resolved ISSN whitelist for wide mode; null = not engaged / still
   *  loading (don't send wide-mode params). */
  econResolvedIssns: string[] | null;
  journalFilterMode: 'wide' | 'specific' | 'off';
  workingPaperFilter?: WorkingPaperFilterInput;
  /** When set, the page renders the network view — skip the list fetch. */
  networkId?: string | null;
}

export function usePaperSearch({
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
}: Options) {
  const [results, setResults] = useState<Paper[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    'Searching OpenAlex...',
  );
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [showSlowLoadingHelp, setShowSlowLoadingHelp] = useState(false);

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

  // ─── Main search effect ───
  useEffect(() => {
    // Skip the regular search entirely while we're rendering a network — the
    // network fetch (useNetworkView) drives that view.
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
        // is scheme-agnostic — the caller resolves tiers/domains to ISSNs
        // locally using the active RankingScheme and passes only the
        // memoised `econResolvedIssns`.
        if (
          journalFilterMode === 'wide' &&
          econFilter?.enabled &&
          econResolvedIssns !== null
        ) {
          params.set('econEnabled', 'true');
          if (econResolvedIssns.length > 0)
            params.set('econIssns', econResolvedIssns.join(','));
        }

        // Working-paper filter — restricts to a whitelist of OpenAlex
        // source ids (RePEc, HAL, NBER, IMF, …). Server prefers this
        // over the journal-ISSN clause when both are present.
        if (workingPaperFilter?.enabled && workingPaperFilter.sourceIds.length) {
          params.set('wpEnabled', 'true');
          params.set('wpSources', workingPaperFilter.sourceIds.join(','));
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
    workingPaperFilter,
    networkId,
  ]);

  return {
    results,
    totalCount,
    isPending,
    error,
    loadingMessage,
    showSlowLoadingHelp,
  };
}
