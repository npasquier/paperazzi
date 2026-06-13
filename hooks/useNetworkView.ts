'use client';

// Citation-network data hook, extracted from SearchResults (2026-06
// audit, L2 decomposition). When a `networkId` is set, fire three calls
// in parallel:
//   1) the focal paper itself (OpenAlex direct, so we have referenced_works)
//   2) refs       — papers the focal cites
//   3) cites      — papers that cite the focal
// Both /api/search calls return papers with `referenced_works`, which is
// what CitationsNetwork needs to compute non-trivial edges.

import { useEffect, useState } from 'react';
import type { Paper } from '@/types/interfaces';
import { cachedFetch } from '@/utils/searchCache';
import { withMailto } from '@/utils/openAlexClient';
import { normalizeId } from '@/utils/normalizeId';
import cleanHtml from '@/utils/cleanHtml';
import type {
  EconFilterInput,
  WorkingPaperFilterInput,
} from './usePaperSearch';

interface Options {
  networkId?: string | null;
  journals: { issn: string; name?: string }[];
  econFilter?: EconFilterInput;
  econResolvedIssns: string[] | null;
  journalFilterMode: 'wide' | 'specific' | 'off';
  workingPaperFilter?: WorkingPaperFilterInput;
}

export function useNetworkView({
  networkId,
  journals,
  econFilter,
  econResolvedIssns,
  journalFilterMode,
  workingPaperFilter,
}: Options) {
  const [focal, setFocal] = useState<Paper | null>(null);
  const [refs, setRefs] = useState<Paper[]>([]);
  const [cites, setCites] = useState<Paper[]>([]);
  const [refsTotal, setRefsTotal] = useState<number | null>(null);
  const [citesTotal, setCitesTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear the network data the moment the network view is exited —
  // adjust-state-during-render (the React-sanctioned replacement for
  // synchronous setState-in-effect, which the React 19 compiler lint
  // flags). The effect below then only handles the fetch path.
  const [prevNetworkId, setPrevNetworkId] = useState(networkId);
  if (prevNetworkId !== networkId) {
    setPrevNetworkId(networkId);
    if (!networkId) {
      setFocal(null);
      setRefs([]);
      setCites([]);
      setRefsTotal(null);
      setCitesTotal(null);
      setError(null);
    }
  }

  useEffect(() => {
    if (!networkId) return;
    let aborted = false;
    // Standard fetch-effect loading flag (see React docs on data
    // fetching in effects) — the compiler lint can't tell it apart
    // from a derived-state reset, so opt out for these two lines.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

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
      if (workingPaperFilter?.enabled && workingPaperFilter.sourceIds.length) {
        p.set('wpEnabled', 'true');
        p.set('wpSources', workingPaperFilter.sourceIds.join(','));
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
          setError(refsResp.error || citesResp.error || null);
          return;
        }
        const focalPaper: Paper = {
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
        setFocal(focalPaper);
        setRefs(refsResp.results || []);
        setCites(citesResp.results || []);
        setRefsTotal(refsResp.meta?.count ?? null);
        setCitesTotal(citesResp.meta?.count ?? null);
      })
      .catch((err: unknown) => {
        if (aborted) return;
        const msg = err instanceof Error ? err.message : 'Network error';
        setError(msg);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [
    networkId,
    journalFilterMode,
    econFilter,
    econResolvedIssns,
    journals,
    workingPaperFilter,
  ]);

  return { focal, refs, cites, refsTotal, citesTotal, loading, error };
}
