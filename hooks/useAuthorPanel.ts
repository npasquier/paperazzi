'use client';

// Author summary-panel state, extracted from SearchResults (2026-06
// audit, L2 decomposition). When exactly one author filter is active,
// the page shows an author card built from OpenAlex /authors/{id};
// this hook owns that fetch plus the expand / copy-id / report-bad-data
// interactions.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { reportedAuthorKey } from '@/utils/storageKeys';
import { openAlexFetch } from '@/utils/openAlexClient';
import { AUTHOR_CORRECTION_FORM_URL } from '@/utils/correctionForms';
import { normalizeId } from '@/utils/normalizeId';
import { emit } from '@/utils/eventBus';

// "Author reported" flags live in localStorage (one key per author).
// Read through useSyncExternalStore so the flag is SSR-safe (server
// snapshot = false) and updates re-render every subscriber — the same
// external-store pattern as usePersistedBoolean.
const reportedListeners = new Set<() => void>();

function notifyReported() {
  for (const fn of [...reportedListeners]) fn();
}

function subscribeReported(fn: () => void): () => void {
  reportedListeners.add(fn);
  // Cross-tab sync via the native storage event.
  window.addEventListener('storage', fn);
  return () => {
    reportedListeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
}

/** In-memory fallback so the toggle still works when localStorage is
 *  unavailable (private mode etc.) — degrades to per-session. */
const memoryReported = new Set<string>();

function readReported(key: string): boolean {
  if (!key) return false;
  try {
    return localStorage.getItem(key) === 'true' || memoryReported.has(key);
  } catch {
    return memoryReported.has(key);
  }
}

// Shape of the author summary card built from OpenAlex /authors/{id}.
// Only the fields the panel actually reads — everything optional because
// OpenAlex omits stats for thinly-indexed authors.
export interface AuthorInfo {
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

export function useAuthorPanel(authors: { id: string; name?: string }[]) {
  const [authorInfo, setAuthorInfo] = useState<AuthorInfo | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isIdCopied, setIsIdCopied] = useState(false);

  // Clear the card the moment the author filter stops being a single
  // author — adjust-state-during-render (the React-sanctioned
  // replacement for synchronous setState-in-effect). The fetch effect
  // below then only handles the single-author path.
  const [prevAuthors, setPrevAuthors] = useState(authors);
  if (prevAuthors !== authors) {
    setPrevAuthors(authors);
    if (authors.length !== 1) {
      setAuthorInfo(null);
      setIsExpanded(false);
    }
  }

  // Fetch author info when exactly one author filter is active.
  useEffect(() => {
    if (authors.length !== 1) return;
    const authorId = authors[0].id;
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
      .catch(() => setAuthorInfo(null));
  }, [authors]);

  const toggleExpanded = () => setIsExpanded((v) => !v);

  const copyId = async () => {
    if (!authorInfo) return;
    const id = normalizeId(authorInfo.id);
    try {
      await navigator.clipboard.writeText(id);
      setIsIdCopied(true);
      setTimeout(() => setIsIdCopied(false), 2000);
    } catch {}
  };

  const openCorrectionForm = () => {
    window.open(AUTHOR_CORRECTION_FORM_URL, '_blank');
  };

  const reportedKey = authorInfo
    ? reportedAuthorKey(normalizeId(authorInfo.id))
    : '';
  // The flag comes straight from the external store (localStorage) —
  // SSR snapshot is false, and toggles notify every subscriber, so the
  // old two-state (in-session + stored) dance and its reseeding effect
  // are unnecessary.
  const isReported = useSyncExternalStore(
    subscribeReported,
    () => readReported(reportedKey),
    () => false,
  );

  const handleReportedToggle = () => {
    if (!reportedKey) return;
    if (!isReported) {
      memoryReported.add(reportedKey);
      try {
        localStorage.setItem(reportedKey, 'true');
      } catch {
        /* private mode etc. — degrade to the in-memory flag. */
      }
      emit('paper-reported', { authorId: reportedKey });
    } else {
      memoryReported.delete(reportedKey);
      try {
        localStorage.removeItem(reportedKey);
      } catch {
        /* ignore */
      }
    }
    notifyReported();
  };

  return {
    authorInfo,
    isExpanded,
    toggleExpanded,
    isIdCopied,
    copyId,
    openCorrectionForm,
    isReported,
    handleReportedToggle,
  };
}
