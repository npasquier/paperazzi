'use client';

/**
 * All @author / #journal / ~institution autocomplete state and logic for the
 * NavBar search input. Extracted from NavBarContent to keep that component
 * focused on layout and search submission.
 *
 * The hook owns the `inputRef` (so `selectMention` can refocus after a pick)
 * and the per-row `mentionItemRefs` (so arrow-key navigation can scroll the
 * active item into view inside the dropdown).
 */

import { useState, useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction, UIEvent } from 'react';
import type { Institution, SelectedAuthor, SelectedJournal } from '@/types/interfaces';
import { searchJournalShortcuts } from '@/data/journalAbbreviations';
import { normalizeId } from '@/utils/normalizeId';
import { openAlexFetch } from '@/utils/openAlexClient';

// Trailing shortcut pattern: matches `@xxx` (author), `#xxx` (journal) or
// `~xxx` (institution) at the end of the query, where xxx starts with a
// letter and is at least 2 chars. We only suggest while the user is
// actively typing the *last* token, which keeps the dropdown out of the
// way for everything else.
//
// `+` is allowed inside `@` and `~` tokens as a word-joiner so the user can
// narrow results with multiple terms, e.g. `@crosetto+paolo`. The `+` is
// replaced with a space before the OpenAlex search call — so
// `@crosetto+paolo` fetches `search=crosetto paolo` and the API's full-text
// author search returns only "Paolo Crosetto" instead of all Crosettos.
// `#` journal lookups are static so `+` is accepted by the regex but won't
// match anything in the catalog, which is harmless.
const TRAILING_SHORTCUT_RE = /(?:^|\s)([@#~])([A-Za-z][A-Za-z0-9+\-]{1,})$/;

export type Suggestion =
  | {
      kind: 'author';
      id: string; // OpenAlex ID, normalized (no URL prefix)
      display_name: string;
      works_count: number;
      hint?: string; // last-known institution, when available
    }
  | {
      kind: 'journal';
      issn: string;
      display_name: string;
      abbrev: string;
    }
  | {
      kind: 'institution';
      id: string; // OpenAlex ID, normalized
      display_name: string;
      works_count: number;
      hint?: string; // country code · type
    };

// Page size — kept as a constant so the pagination arithmetic and URL builder agree.
export const MENTION_PAGE_SIZE = 25;

interface Params {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setChips: Dispatch<SetStateAction<SelectedAuthor[]>>;
  setJournalChips: Dispatch<SetStateAction<SelectedJournal[]>>;
  setInstitutionChips: Dispatch<SetStateAction<Institution[]>>;
}

interface Return {
  mentionOpen: boolean;
  mentionSuggestions: Suggestion[];
  mentionIdx: number;
  mentionLoading: boolean;
  mentionLoadingMore: boolean;
  mentionHasMore: boolean;
  mentionItemRefs: RefObject<Array<HTMLButtonElement | null>>;
  inputRef: RefObject<HTMLInputElement | null>;
  setMentionIdx: Dispatch<SetStateAction<number>>;
  setMentionOpen: Dispatch<SetStateAction<boolean>>;
  handleMentionListScroll: (e: UIEvent<HTMLDivElement>) => void;
  handleInputBlur: () => void;
  selectMention: (idx: number) => void;
}

export function useNavBarAutocomplete({
  query,
  setQuery,
  setChips,
  setJournalChips,
  setInstitutionChips,
}: Params): Return {
  const [mentionSuggestions, setMentionSuggestions] = useState<Suggestion[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  // Pagination state for the @author / ~institution dropdowns. #journal
  // lookups are synchronous (static map) so they don't participate.
  const [mentionPartial, setMentionPartial] = useState('');
  const [mentionPage, setMentionPage] = useState(1);
  const [mentionKind, setMentionKind] = useState<'author' | 'institution' | null>(null);
  const [mentionHasMore, setMentionHasMore] = useState(false);
  const [mentionLoadingMore, setMentionLoadingMore] = useState(false);

  // Latest-partial mirror — used inside the async load-more callback
  // to detect "the user is now typing something different, this
  // page's results are stale" without depending on a React state closure.
  const mentionPartialRef = useRef('');
  useEffect(() => {
    mentionPartialRef.current = mentionPartial;
  }, [mentionPartial]);

  const inputRef = useRef<HTMLInputElement>(null);
  const mentionItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // ── Fetch one page of mention suggestions ─────────────────────────────
  // Handles both /authors (kind='author') and /institutions (kind='institution')
  // because they share an identical paged-response shape. Returns null on
  // HTTP / parse error so callers can decide what to render.
  const fetchMentionPage = async (
    kind: 'author' | 'institution',
    partial: string,
    page: number,
  ): Promise<{ results: Suggestion[]; totalCount: number } | null> => {
    try {
      const endpoint = kind === 'author' ? 'authors' : 'institutions';
      // Replace `+` word-joiners with spaces before sending to OpenAlex so
      // `@crosetto+paolo` becomes `search=crosetto paolo`.
      const searchTerm = partial.replace(/\+/g, ' ').trim();
      const url =
        `https://api.openalex.org/${endpoint}?search=${encodeURIComponent(searchTerm)}` +
        `&per-page=${MENTION_PAGE_SIZE}&page=${page}`;
      const res = await openAlexFetch(url);
      if (!res.ok) return null;

      if (kind === 'author') {
        const data: {
          results?: Array<{
            id: string;
            display_name: string;
            works_count?: number;
            last_known_institution?: { display_name?: string };
            affiliations?: { institution?: { display_name?: string } }[];
          }>;
          meta?: { count?: number };
        } = await res.json();
        const results: Suggestion[] = (data.results || []).map((a) => ({
          kind: 'author' as const,
          id: normalizeId(a.id),
          display_name: a.display_name,
          works_count: a.works_count || 0,
          hint:
            a.last_known_institution?.display_name ||
            a.affiliations?.[0]?.institution?.display_name ||
            undefined,
        }));
        return { results, totalCount: data.meta?.count ?? 0 };
      } else {
        // Institution mapper. Hint is country code + type (e.g. "FR · education")
        // so the dropdown row carries enough to disambiguate same-named institutions.
        const data: {
          results?: Array<{
            id: string;
            display_name: string;
            works_count?: number;
            country_code?: string;
            type?: string;
          }>;
          meta?: { count?: number };
        } = await res.json();
        const results: Suggestion[] = (data.results || []).map((i) => {
          const country = i.country_code?.toUpperCase();
          const type = i.type;
          const hint = [country, type].filter(Boolean).join(' · ') || undefined;
          return {
            kind: 'institution' as const,
            id: normalizeId(i.id),
            display_name: i.display_name,
            works_count: i.works_count || 0,
            hint,
          };
        });
        return { results, totalCount: data.meta?.count ?? 0 };
      }
    } catch {
      return null;
    }
  };

  // ── Debounced suggestion update ────────────────────────────────────────
  // Fires only when query ends in @xxx / #xxx / ~xxx (≥2 chars).
  //   # → synchronous static lookup (no debounce, no network)
  //   @ / ~ → 300ms debounced OpenAlex fetch, page 1
  useEffect(() => {
    let cancelled = false;

    const resetAll = () => {
      setMentionOpen(false);
      setMentionSuggestions([]);
      setMentionLoading(false);
      setMentionLoadingMore(false);
      setMentionHasMore(false);
      setMentionPage(1);
      setMentionPartial('');
      setMentionKind(null);
    };

    const m = query.match(TRAILING_SHORTCUT_RE);
    if (!m) {
      resetAll();
      return;
    }
    const prefix = m[1];
    const partial = m[2];

    // Journal: synchronous static lookup — no debounce needed.
    // The set-state-in-effect lint rule fires on these direct writes; the
    // cleaner alternative would be a separate useMemo derived from `query`,
    // but `mentionSuggestions` is shared with the async author path which
    // can't be expressed as a memo. Suppress.
    if (prefix === '#') {
      const hits = searchJournalShortcuts(partial, 25);
      const results: Suggestion[] = hits.map((j) => ({
        kind: 'journal' as const,
        issn: j.issn,
        display_name: j.name,
        abbrev: j.abbrev,
      }));
      /* eslint-disable react-hooks/set-state-in-effect */
      setMentionSuggestions(results);
      setMentionOpen(results.length > 0);
      setMentionIdx(0);
      setMentionLoading(false);
      setMentionHasMore(false);
      setMentionPage(1);
      setMentionPartial('');
      setMentionKind(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    // Author (@) or institution (~): debounced network call, page 1.
    const kind: 'author' | 'institution' = prefix === '~' ? 'institution' : 'author';
    setMentionLoading(true);
    setMentionPartial(partial);
    setMentionPage(1);
    setMentionKind(kind);

    const handle = setTimeout(async () => {
      const page = await fetchMentionPage(kind, partial, 1);
      if (cancelled) return;
      if (!page) {
        setMentionSuggestions([]);
        setMentionOpen(false);
        setMentionHasMore(false);
        setMentionLoading(false);
        return;
      }
      setMentionSuggestions(page.results);
      setMentionOpen(page.results.length > 0);
      setMentionIdx(0);
      setMentionHasMore(
        page.results.length > 0 && MENTION_PAGE_SIZE < page.totalCount,
      );
      setMentionLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // ── Infinite scroll: load next page ───────────────────────────────────
  const loadMoreMention = async () => {
    if (mentionLoadingMore || !mentionHasMore || !mentionPartial || !mentionKind)
      return;
    const partialAtStart = mentionPartial;
    const kindAtStart = mentionKind;
    setMentionLoadingMore(true);
    const nextPage = mentionPage + 1;
    const page = await fetchMentionPage(kindAtStart, partialAtStart, nextPage);
    // Race guard: user kept typing while this page was in flight.
    if (mentionPartialRef.current !== partialAtStart) return;
    if (!page) {
      setMentionHasMore(false);
      setMentionLoadingMore(false);
      return;
    }
    setMentionSuggestions((prev) => [...prev, ...page.results]);
    setMentionPage(nextPage);
    setMentionHasMore(nextPage * MENTION_PAGE_SIZE < page.totalCount);
    setMentionLoadingMore(false);
  };

  // Trigger load-more when the user scrolls near the bottom (60px lead time).
  const handleMentionListScroll = (e: UIEvent<HTMLDivElement>) => {
    const t = e.currentTarget;
    if (t.scrollHeight - t.scrollTop - t.clientHeight < 60) {
      void loadMoreMention();
    }
  };

  // Scroll the highlighted suggestion into view on arrow-key navigation.
  useEffect(() => {
    if (!mentionOpen) return;
    const el = mentionItemRefs.current[mentionIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [mentionIdx, mentionOpen]);

  // ── Apply a suggestion ─────────────────────────────────────────────────
  // Strips the trailing @/# token from the query and adds the appropriate chip.
  // De-dup per kind: picking the same author / journal / institution twice is a no-op.
  const selectMention = (idx: number) => {
    const sug = mentionSuggestions[idx];
    if (!sug) return;
    const newQuery = query
      .replace(TRAILING_SHORTCUT_RE, (match) => (match.startsWith(' ') ? ' ' : ''))
      .trimEnd();
    setQuery(newQuery);

    if (sug.kind === 'author') {
      setChips((prev) =>
        prev.find((c) => c.id === sug.id)
          ? prev
          : [...prev, { id: sug.id, name: sug.display_name }],
      );
    } else if (sug.kind === 'journal') {
      setJournalChips((prev) =>
        prev.find((j) => j.issn === sug.issn)
          ? prev
          : [...prev, { issn: sug.issn, name: sug.display_name }],
      );
    } else {
      setInstitutionChips((prev) =>
        prev.find((c) => c.id === sug.id)
          ? prev
          : [...prev, { id: sug.id, display_name: sug.display_name }],
      );
    }

    setMentionOpen(false);
    setMentionSuggestions([]);
    setMentionPartial('');
    setMentionPage(1);
    setMentionHasMore(false);
    setMentionLoadingMore(false);
    setMentionKind(null);
    // Keep focus in the input so the user can keep typing without clicking back.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Close dropdown on blur, with a small delay so a mouse click on a
  // suggestion item still registers before we hide it.
  const handleInputBlur = () => {
    setTimeout(() => setMentionOpen(false), 150);
  };

  return {
    mentionOpen,
    mentionSuggestions,
    mentionIdx,
    mentionLoading,
    mentionLoadingMore,
    mentionHasMore,
    mentionItemRefs,
    inputRef,
    setMentionIdx,
    setMentionOpen,
    handleMentionListScroll,
    handleInputBlur,
    selectMention,
  };
}
