'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Database, CircleQuestionMark } from 'lucide-react';
import { useState, useEffect, useRef, Suspense } from 'react';
import StorageModal from './StorageModal';
import OpenAlexUsageModal from './OpenAlexUsageModal';
import {
  extractMentions,
  resolveMentions,
  resolveJournalShortcuts,
} from '@/utils/queryMentions';
import {
  Institution,
  SelectedAuthor,
  SelectedJournal,
} from '@/types/interfaces';
import {
  searchJournalShortcuts,
  abbrevForIssn,
} from '@/data/journalAbbreviations';
import { emit, on } from '@/utils/eventBus';
import { normalizeId } from '@/utils/normalizeId';
import { openAlexFetch } from '@/utils/openAlexClient';

// Trailing shortcut pattern: matches `@xxx` (author), `#xxx` (journal) or
// `~xxx` (institution) at the end of the query, where xxx starts with a
// letter and is at least 2 chars. We only suggest while the user is
// actively typing the *last* token, which keeps the dropdown out of the
// way for everything else. The `~` prefix is the institution equivalent
// of `@` for authors — single character, visually distinct, rare in
// research-query text so it doesn't collide with literal content.
const TRAILING_SHORTCUT_RE = /(?:^|\s)([@#~])([A-Za-z][A-Za-z0-9-]{1,})$/;
// (The SHORTCUT_ANYWHERE_RE companion regex used to detect "shortcut
// typed while semantic mode is on" so we could show a hint. The
// Semantic toggle no longer has a UI affordance, so that hint and its
// regex went away.)

type Suggestion =
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
      hint?: string; // country name / type, when available
    };

function NavBarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSearchPage = pathname?.startsWith('/search') || false;

  // Local search query state (only for search page)
  const [query, setQuery] = useState('');
  // Semantic search mode (OpenAlex `search.semantic=`).
  const [semantic, setSemantic] = useState(false);
  // Econ-filter activeness, broadcast by PaperazziApp (lives in component
  // state, not URL params — see `semantic-conflict-econ` event).
  const [econActive, setEconActive] = useState(false);
  // Stored-data viewer modal — direct trigger in the navbar.
  const [showStorage, setShowStorage] = useState(false);

  // OpenAlex API key usage dashboard — admin-only affordance, no
  // visible trigger. Open it with Cmd+Shift+U (Mac) / Ctrl+Shift+U
  // (Windows/Linux). The modal stays mounted so the shortcut just
  // flips the boolean; closing returns to normal navbar state. If
  // someone needs this UI surfaced later, give it back a button —
  // the modal component and its state slot here are unchanged.
  const [showOpenAlexUsage, setShowOpenAlexUsage] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `e.metaKey` covers Cmd on Mac; `e.ctrlKey` covers Ctrl on
      // Windows/Linux. We accept either so the same shortcut works
      // cross-platform without forking. Skip when the user is typing
      // in an input/textarea — let those owners handle Ctrl/Cmd
      // combos for their own UX (e.g. select-all).
      if (e.key.toLowerCase() !== 'u' || !e.shiftKey) return;
      if (!e.metaKey && !e.ctrlKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      setShowOpenAlexUsage((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── @author / #journal autocomplete ─────────────────────────────────
  // Suggestions for the trailing @partial or #partial token. Open only
  // while the user is typing inside a shortcut; closes on selection, blur,
  // or Esc. The suggestion union carries enough info that the dropdown UI
  // can switch on `.kind` to render the right secondary line.
  const [mentionSuggestions, setMentionSuggestions] = useState<Suggestion[]>(
    [],
  );
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  // Pagination state for the @author dropdown. OpenAlex returns 25
  // results per page; we keep loading subsequent pages as the user
  // scrolls to the bottom of the suggestion list. `mentionPartial` is
  // the search string the current pages were fetched for — it's both
  // the load-more API input and the race-condition guard (if the user
  // is still typing when a page resolves, we discard if partial moved
  // on). #journal lookups are synchronous against a static map so
  // they don't participate in any of this.
  const [mentionPartial, setMentionPartial] = useState('');
  const [mentionPage, setMentionPage] = useState(1);
  // Which paged kind is currently active in the dropdown — drives
  // which OpenAlex endpoint `loadMoreMention` hits. `null` outside
  // the paged kinds (e.g. when journals are showing — those are
  // static and not paged).
  const [mentionKind, setMentionKind] = useState<
    'author' | 'institution' | null
  >(null);
  const [mentionHasMore, setMentionHasMore] = useState(false);
  const [mentionLoadingMore, setMentionLoadingMore] = useState(false);
  // Latest-partial mirror — used inside the async load-more callback
  // to detect "the user is now typing something different, this
  // page's results are stale" without depending on the React state
  // closure (which would capture the value at definition time).
  const mentionPartialRef = useRef('');
  useEffect(() => {
    mentionPartialRef.current = mentionPartial;
  }, [mentionPartial]);
  const inputRef = useRef<HTMLInputElement>(null);
  // One ref per suggestion row so arrow-key navigation can scroll the
  // highlighted item into view inside the (overflow-y-auto) dropdown.
  const mentionItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Page size — kept as a constant so the pagination arithmetic
  // (`page * pageSize < totalCount`) and the URL builder agree.
  const MENTION_PAGE_SIZE = 25;

  // ── In-bar chips (authors + journals) ───────────────────────────────
  // Visual representation of the currently active author + journal filters,
  // rendered as pills inside the search-bar facade. Single source of truth:
  // PaperazziApp's syncFromURL broadcasts `paperazzi-authors-changed` and
  // `paperazzi-journals-changed` whenever it resolves the URL params; we
  // mirror those into local state. On submit, the current chip lists are
  // sent back (chipAuthors / chipJournals) and become the next URL's filter
  // — so removing a chip propagates on the next search, and explicit picks
  // from the autocomplete stack additively until submit.
  const [chips, setChips] = useState<SelectedAuthor[]>([]);
  const [journalChips, setJournalChips] = useState<SelectedJournal[]>([]);
  // Institution chips — third pill type in the bar, picked via `~`
  // autocomplete. Same mirror-from-PaperazziApp pattern as authors
  // and journals; the chip palette uses --warning-* (amber) so the
  // three chip types stay visually distinct.
  const [institutionChips, setInstitutionChips] = useState<Institution[]>([]);

  // True iff the user has edited filters in the panel without committing
  // (pressing Enter / clicking Search). Drives the "Press Enter to apply"
  // hint below the search bar — the deferred-commit flow now waits for an
  // explicit commit before re-querying OpenAlex, and this hint is the
  // user-visible signal that there are pending changes.
  const [filtersDirty, setFiltersDirty] = useState(false);

  // True iff the input text differs from the URL's currently-applied
  // `q=` param. The query input is owned by the navbar (not
  // PaperazziApp), so we can't piggy-back on the filters event — we
  // derive it locally. Combined with `filtersDirty` below, this is what
  // turns the submit-glass green: any uncommitted change (text *or*
  // panel) should give the user one place to look.
  const queryDirty = isSearchPage && query !== (searchParams.get('q') || '');

  // True iff the navbar's chip lists differ from the URL's currently-
  // committed `authors=` / `journals=` / `institutions=` params. We
  // can't reuse `filtersDirty` for chip-only edits: PaperazziApp's
  // `paperazzi-filters-dirty` event only fires on transitions of
  // `filters !== searchFilters`, but chip-only edits never enter
  // PaperazziApp's `filters` (the chip state lives in the navbar
  // until commit, then both `filters` and `searchFilters` are set
  // in sync via syncFromURL — so the transition never happens and
  // the event never fires to reset the flag). Deriving from the URL
  // mirrors the `queryDirty` pattern and self-resets after each
  // commit. Without this, adding/removing a chip would leave the
  // submit-glass stuck on green after a search by chip alone.
  const chipsDirty =
    isSearchPage &&
    (() => {
      const eq = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const s = new Set(a);
        return b.every((x) => s.has(x));
      };
      const urlAuthors = (searchParams.get('authors') || '')
        .split(',')
        .filter(Boolean);
      const urlJournals = (searchParams.get('journals') || '')
        .split(',')
        .filter(Boolean);
      const urlInstitutions = (searchParams.get('institutions') || '')
        .split(',')
        .filter(Boolean);
      return (
        !eq(
          chips.map((c) => c.id),
          urlAuthors,
        ) ||
        !eq(
          journalChips.map((c) => c.issn),
          urlJournals,
        ) ||
        !eq(
          institutionChips.map((c) => c.id),
          urlInstitutions,
        )
      );
    })();

  // Single boolean for "user has something pending to apply". The glass
  // button and the hint banner both consume this so they stay in sync
  // no matter which kind of change triggered the dirty state.
  const isDirty = filtersDirty || queryDirty || chipsDirty;

  useEffect(() => {
    const offAuthors = on('paperazzi-authors-changed', ({ authors }) => {
      setChips(authors || []);
    });
    const offJournals = on('paperazzi-journals-changed', ({ journals }) => {
      setJournalChips(journals || []);
    });
    const offInstitutions = on(
      'paperazzi-institutions-changed',
      ({ institutions }) => {
        setInstitutionChips(institutions || []);
      },
    );
    const offDirty = on('paperazzi-filters-dirty', ({ isDirty }) => {
      setFiltersDirty(isDirty);
    });
    return () => {
      offAuthors();
      offJournals();
      offInstitutions();
      offDirty();
    };
  }, []);

  // Compute the list of human-readable conflicts that make semantic search
  // unavailable. Mirrors OpenAlex's "use keyword when you need filters /
  // sorting / specific fields" guidance.
  const semanticConflicts = (() => {
    const c: string[] = [];
    if (searchParams.get('journals')) c.push('journal filter');
    if (searchParams.get('authors')) c.push('author filter');
    if (searchParams.get('institutions')) c.push('institution filter');
    if (searchParams.get('type')) c.push('publication type');
    if (searchParams.get('from') || searchParams.get('to'))
      c.push('date range');
    const sort = searchParams.get('sort');
    if (sort && sort !== 'relevance_score') c.push('custom sort');
    if (searchParams.get('citing') || searchParams.get('citingAll'))
      c.push('citation constraint');
    if (searchParams.get('referencedBy') || searchParams.get('referencesAll'))
      c.push('reference constraint');
    if (searchParams.get('network')) c.push('network view');
    if (econActive) c.push('economics journal whitelist');
    return c;
  })();
  const semanticDisabled = semanticConflicts.length > 0;

  // Listen for econ-filter activeness from PaperazziApp.
  useEffect(
    () =>
      on('semantic-conflict-econ', ({ econActive }) => {
        setEconActive(!!econActive);
      }),
    [],
  );

  // Seed `query` and `semantic` from the URL when on search page. The
  // set-state-in-effect lint rule wants us to derive `query` from
  // `searchParams` directly, but `query` is also user-editable via the
  // input — so it's intrinsically owned by useState and just *seeded*
  // from the URL on entry / back-forward. Suppress the rule for these
  // two seeding writes.
  //
  // CRITICAL: this effect depends ONLY on `searchParams` (and the
  // page guard). It must NOT take `semanticDisabled` as a dep — that
  // value flips whenever the user toggles a filter that conflicts with
  // semantic mode (e.g. clicking a wide-filter tier/domain pill flips
  // `econActive` → `semanticDisabled`), and rerunning this effect on
  // that transition wipes the user's in-progress typing back to the
  // URL's `q=` value (usually empty). URL-cleanup for the
  // semantic+conflict case lives in its own effect below.
  useEffect(() => {
    if (!isSearchPage) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery(searchParams.get('q') || '');
    setSemantic(searchParams.get('semantic') === 'true');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [searchParams, isSearchPage]);

  // Cleanup: if the URL still has `semantic=true` after a conflict
  // appeared (e.g. user added a filter while semantic was on), strip
  // it so the page is in a consistent state. Split out from the seed
  // effect above so that flipping `semanticDisabled` doesn't reseed
  // (and wipe) the user's in-progress query text. router.replace
  // bumps `searchParams`, which re-fires the seed effect — that's
  // fine, the new URL has the same `q=` so `query` is unchanged.
  useEffect(() => {
    if (!isSearchPage) return;
    const urlSemantic = searchParams.get('semantic') === 'true';
    if (urlSemantic && semanticDisabled) {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.delete('semantic');
      router.replace(`/search?${params.toString()}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSemantic(false);
    }
  }, [searchParams, isSearchPage, semanticDisabled, router]);

  // (handleToggleSemantic was removed alongside the Semantic icon
  // toggle. The `semantic` state still tracks `?semantic=true` from
  // the URL so deep links keep working and the mode flows through to
  // the API; there's just no UI affordance to flip it from the
  // navbar anymore. The semantic-disabled conflict detection
  // (`semanticDisabled`, `semanticConflicts`) is retained because the
  // search-syntax (i) popover lists them so a power user with a
  // semantic deep link can see why the chips/filters they're seeing
  // would conflict.)

  // Debounced suggestion update. Triggers only when the query ends in
  // `@xxx` or `#xxx` (xxx ≥ 2 chars), so the dropdown is fully opt-in to a
  // shortcut prefix and never fires on plain keyword searches.
  //   @ → fetch /authors?search= (300ms debounce, network)
  //   # → filter the static JOURNAL_SHORTCUTS map (no debounce, no network)
  // Semantic mode disables the dropdown entirely — OpenAlex's semantic
  // endpoint expects a bare concept query, so author/journal shortcuts
  // would defeat the point. Users can still *type* `@x` or `#y`; those
  // characters just stay in the query as literal text.
  // Fetch one page of mention suggestions from OpenAlex. Handles both
  // /authors (kind='author') and /institutions (kind='institution')
  // because they share an identical paged-response shape; only the
  // endpoint and the per-row mapper differ. Returns null on HTTP /
  // parse error so the caller can decide what to render (typically:
  // clear the list and close the dropdown for page 1, mark
  // hasMore=false for subsequent pages). Shared between the initial
  // fetch and the infinite-scroll load-more.
  const fetchMentionPage = async (
    kind: 'author' | 'institution',
    partial: string,
    page: number,
  ): Promise<{ results: Suggestion[]; totalCount: number } | null> => {
    try {
      const endpoint = kind === 'author' ? 'authors' : 'institutions';
      const url = `https://api.openalex.org/${endpoint}?search=${encodeURIComponent(
        partial,
      )}&per-page=${MENTION_PAGE_SIZE}&page=${page}`;
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
        // Institution mapper. Hint is country code + type (e.g.
        // "FR · education") so the dropdown row carries enough to
        // disambiguate between same-named institutions in different
        // countries.
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

  useEffect(() => {
    // Cleanup-driven cancellation token. Any setState after the user
    // has typed past this partial is dropped — same trick the load-
    // more callback uses via `mentionPartialRef`.
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

    if (semantic) {
      resetAll();
      return;
    }
    const m = query.match(TRAILING_SHORTCUT_RE);
    if (!m) {
      resetAll();
      return;
    }
    const prefix = m[1];
    const partial = m[2];

    // Journal: synchronous static lookup, no need to debounce or
    // paginate — the catalog is small and the whole list fits in one
    // pass. The set-state-in-effect lint rule fires on these direct
    // writes; the cleaner alternative would be a separate useMemo
    // derived from `query`, but `mentionSuggestions` is shared with
    // the async author path which can't be expressed as a memo. The
    // duplicate state would force a merge layer that's strictly
    // worse than this brief synchronous burst. Suppress.
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
    // Both endpoints share `fetchMentionPage` and the same pagination
    // bookkeeping — the only difference is the kind we tell it to
    // fetch, which then drives the load-more endpoint via
    // `mentionKind` state.
    const kind: 'author' | 'institution' =
      prefix === '~' ? 'institution' : 'author';
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
      // hasMore: a non-empty first page that doesn't cover the total.
      // Falls back to false when count is missing (older response
      // shapes) so we don't loop forever fetching empty pages.
      setMentionHasMore(
        page.results.length > 0 && MENTION_PAGE_SIZE < page.totalCount,
      );
      setMentionLoading(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, semantic]);

  // Load the next page of mention suggestions and append. Invoked by
  // the scroll handler on the dropdown when the list nears its bottom
  // (see `handleMentionListScroll`). Works for either kind (@author or
  // ~institution) by dispatching through `mentionKind`. Self-gates:
  // bails if a load is already in flight, if we know there's no more,
  // or if the partial has changed since this call was scheduled (race
  // guard via the ref — the state-based `mentionPartial` would be
  // stale here).
  const loadMoreMention = async () => {
    if (
      mentionLoadingMore ||
      !mentionHasMore ||
      !mentionPartial ||
      !mentionKind
    )
      return;
    const partialAtStart = mentionPartial;
    const kindAtStart = mentionKind;
    setMentionLoadingMore(true);
    const nextPage = mentionPage + 1;
    const page = await fetchMentionPage(kindAtStart, partialAtStart, nextPage);
    // Race guard: user kept typing while this page was in flight —
    // the initial-fetch effect has already reset state for the new
    // partial. Don't pollute the new list.
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

  // Trigger load-more when the user scrolls near the bottom of the
  // suggestion list. 60px from the bottom edge is enough lead time
  // that the next page is usually loaded by the time the user reaches
  // the end of the current page.
  const handleMentionListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const t = e.currentTarget;
    if (t.scrollHeight - t.scrollTop - t.clientHeight < 60) {
      void loadMoreMention();
    }
  };

  // Scroll the highlighted suggestion into view so arrow-key navigation
  // doesn't lose the user inside a long, scrollable dropdown.
  useEffect(() => {
    if (!mentionOpen) return;
    const el = mentionItemRefs.current[mentionIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [mentionIdx, mentionOpen]);

  // Apply a suggestion: strip the trailing @ or # token out of the query
  // (chips replace inline text) and add an author or journal chip. De-dup
  // is per kind: picking the same author or the same journal twice is a
  // no-op, but the same abbreviation could in theory match both an author
  // (unlikely for `#`) and a journal — they're stored in separate lists.
  const selectMention = (idx: number) => {
    const sug = mentionSuggestions[idx];
    if (!sug) return;
    const newQuery = query
      .replace(TRAILING_SHORTCUT_RE, (match) =>
        match.startsWith(' ') ? ' ' : '',
      )
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
      // Institution chip. The Institution shape includes country_code
      // and type, but we don't carry them through the chip facade —
      // PaperazziApp's syncFromURL refetches the full record from
      // OpenAlex when the URL is committed, and a chip only needs the
      // id + display name to render and to round-trip via the URL.
      setInstitutionChips((prev) =>
        prev.find((c) => c.id === sug.id)
          ? prev
          : [...prev, { id: sug.id, display_name: sug.display_name }],
      );
    }
    setMentionOpen(false);
    setMentionSuggestions([]);
    // Clear the pagination bookkeeping too — otherwise the next time
    // the dropdown opens for a new partial, a stale `mentionPartial`
    // could fool the load-more guard into appending the wrong page.
    setMentionPartial('');
    setMentionPage(1);
    setMentionHasMore(false);
    setMentionLoadingMore(false);
    setMentionKind(null);
    // Adding a chip from the autocomplete is a *pending* filter edit,
    // exactly like removing one — it shouldn't fire a search by
    // itself. The dirty state is computed from the URL via
    // `chipsDirty` above, so no manual marker is needed here: the new
    // chip list differs from the URL until commit, which keeps the
    // submit-glass green automatically. (Previously this called
    // setFiltersDirty(true) manually, but that flag only resets via
    // PaperazziApp's dirty-transition event, which never fires for
    // chip-only edits — so the glass got stuck on green after a
    // search-by-chip-alone.)
    // Keep focus in the input so the user can keep typing (keywords or
    // another @ / # token) without clicking back into the bar.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Remove an author chip — update local chip state only. The dirty
  // signal is derived from the URL via `chipsDirty` above, so no
  // manual flag is set here. Chip edits behave like query-text edits,
  // accumulating until the user commits with Enter or the search
  // button; the next handleSearch() reads the trimmed chip list and
  // produces a single URL push.
  const removeAuthorChip = (id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
  };

  // Wipe the search bar to a neutral state: clear text, clear all chips,
  // clear non-URL state (journalFilterMode, econFilter — handled by
  // PaperazziApp via the paperazzi-reset-search event), and navigate to
  // bare /search so SearchResults renders its welcome/use-case tiles
  // instead of running a "find everything" query.
  //
  // We don't gate this on isSearchPage — pressing it from elsewhere just
  // takes you back to the empty search page, which is also the right
  // outcome of "reset".
  const clearAll = () => {
    setQuery('');
    setChips([]);
    setJournalChips([]);
    setInstitutionChips([]);
    setMentionOpen(false);
    setMentionSuggestions([]);
    emit('paperazzi-reset-search');
    router.push('/search');
  };

  // Same deferred-commit behavior for journal chips — local state
  // only, dirty signal derived from URL via `chipsDirty`. See
  // removeAuthorChip for the rationale.
  const removeJournalChip = (issn: string) => {
    setJournalChips((prev) => prev.filter((j) => j.issn !== issn));
  };

  // Institution chip removal — same deferred-commit pattern as
  // authors / journals. Local state only, no URL push; dirty signal
  // derived from URL via `chipsDirty`.
  const removeInstitutionChip = (id: string) => {
    setInstitutionChips((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSearch = async () => {
    if (isSearchPage) {
      // On search page: dispatch the full chip state (authors,
      // journals, institutions) and let PaperazziApp's listener
      // resolve any leftover @text / #text tokens before pushing the
      // URL. In semantic mode we skip the shortcut machinery
      // entirely — the OpenAlex semantic endpoint expects a bare
      // concept query, so we send the raw text untouched and zero
      // chips.
      emit('navbar-search', {
        query: query.trim(),
        semantic,
        chipAuthors: semantic
          ? []
          : chips.map((c) => ({ id: c.id, name: c.name })),
        chipJournals: semantic
          ? []
          : journalChips.map((j) => ({ issn: j.issn, name: j.name })),
        chipInstitutions: semantic
          ? []
          : institutionChips.map((i) => ({
              id: i.id,
              display_name: i.display_name,
            })),
      });
    } else {
      // Off search page: build the URL ourselves. Resolve @ tokens via API
      // and # tokens via the static map, then assemble the params — unless
      // semantic mode is on, in which case the query goes through as-is
      // with no filter resolution. `~institution` shortcuts don't have a
      // static resolver yet, so off-page we just forward the existing
      // `institutionChips` (set via the dropdown autocomplete).
      if (
        query.trim() ||
        (!semantic &&
          (chips.length > 0 ||
            journalChips.length > 0 ||
            institutionChips.length > 0))
      ) {
        const params = new URLSearchParams();

        if (semantic) {
          if (query.trim()) params.set('q', query.trim());
          params.set('semantic', 'true');
        } else {
          const { cleanQuery, mentions, journalAbbrevs } = extractMentions(
            query.trim(),
          );
          if (cleanQuery) params.set('q', cleanQuery);

          const allAuthorIds = chips.map((c) => c.id);
          if (mentions.length > 0) {
            const { resolved } = await resolveMentions(mentions);
            for (const r of resolved)
              if (!allAuthorIds.includes(r.id)) allAuthorIds.push(r.id);
          }
          if (allAuthorIds.length > 0) {
            params.set('authors', allAuthorIds.join(','));
          }

          const allJournalIssns = journalChips.map((j) => j.issn);
          if (journalAbbrevs.length > 0) {
            const { resolved } = resolveJournalShortcuts(journalAbbrevs);
            for (const r of resolved)
              if (!allJournalIssns.includes(r.issn))
                allJournalIssns.push(r.issn);
          }
          if (allJournalIssns.length > 0) {
            params.set('journals', allJournalIssns.join(','));
          }

          if (institutionChips.length > 0) {
            params.set(
              'institutions',
              institutionChips.map((i) => i.id).join(','),
            );
          }
        }

        params.set('page', '1');
        router.push(`/search?${params.toString()}`);
      }
    }
  };

  // KeyDown (not KeyPress — KeyPress doesn't fire for arrow keys, which we
  // need for dropdown navigation). When the dropdown is open, intercept
  // Up/Down/Enter/Tab/Esc; otherwise Enter submits the search.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Clamp at the last item — don't wrap back to the top.
        setMentionIdx((i) => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Clamp at the first item — don't wrap down to the bottom.
        setMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mentionIdx);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    // Backspace at the very start of an empty input deletes the last
    // chip — same gesture as Slack/Gmail/Linear's chip inputs. Pop
    // order matches the visual order (authors, journals, institutions)
    // so the rightmost chip — the one closest to the cursor — leaves
    // first.
    if (
      e.key === 'Backspace' &&
      query === '' &&
      (e.currentTarget.selectionStart ?? 0) === 0
    ) {
      if (institutionChips.length > 0) {
        e.preventDefault();
        removeInstitutionChip(institutionChips[institutionChips.length - 1].id);
        return;
      }
      if (journalChips.length > 0) {
        e.preventDefault();
        removeJournalChip(journalChips[journalChips.length - 1].issn);
        return;
      }
      if (chips.length > 0) {
        e.preventDefault();
        removeAuthorChip(chips[chips.length - 1].id);
        return;
      }
    }
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Close the dropdown when the input loses focus, with a small delay so a
  // mouse click on a suggestion item still registers before we hide it.
  const handleInputBlur = () => {
    setTimeout(() => setMentionOpen(false), 150);
  };

  return (
    <nav className='surface-panel border-app border-b h-16 shrink-0'>
      <div className='flex h-full items-center px-6 max-w-7xl mx-auto gap-6'>
        {/* Brand */}
        <Link
          href='/search'
          // Treat the brand as "go home and reset". Without this, Link
          // navigates to /search but PaperazziApp's non-URL state
          // (journalFilterMode, econFilter) survives — so the user lands
          // on /search with stale filters from their previous session.
          // Routing through clearAll fires `paperazzi-reset-search`,
          // which the app already listens for to wipe those fields back
          // to the initial off/disabled state. Same code path as the X
          // button in the search bar.
          onClick={(e) => {
            e.preventDefault();
            clearAll();
          }}
          className='flex items-center gap-2 flex-shrink-0 text-accent-strong'
        >
          <svg
            viewBox='0 0 24 24'
            width='22'
            height='22'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
          >
            <rect x='3' y='5' width='6' height='14' rx='3' />
            <rect x='15' y='5' width='6' height='14' rx='3' />
            <line x1='9' y1='11' x2='15' y2='11' />
            <line x1='9' y1='13' x2='15' y2='13' />
            <circle cx='6' cy='15' r='1.3' />
            <circle cx='18' cy='15' r='1.3' />
          </svg>
          <span className='text-xl font-semibold tracking-tight'>
            Paperazzi
          </span>
        </Link>

        {/* Conditional Content based on page */}
        {isSearchPage ? (
          // Search page: Show search bar
          <>
            <div className='flex-1 max-w-2xl ml-auto mr-auto group'>
              <div className='relative'>
                {/* Chip facade. Functions exactly like the previous
                    bordered <input> — chips + the real text input share
                    one focus-ring container. Visual refresh: unified 44px
                    height, inline (no longer absolute) search icon,
                    rounded-md chips with tinted hover on their X button,
                    subtle shadow + smoother focus transition. */}
                <div
                  onClick={() => inputRef.current?.focus()}
                  // Visual: rounded-full (pill) for the softest possible
                  // perimeter; warmer "paper on desk" fill
                  // (`background-card`) so the bar reads as an inset
                  // card rather than a hard input field; subtle border
                  // + soft shadow + smooth focus ring transition.
                  // `overflow-hidden` lets the submit button sit flush
                  // against the bar's rounded-full right edge with no
                  // 1px halo when its fill turns green. Safe with
                  // `focus-within-accent` — that class uses box-shadow,
                  // which paints outside the border-box and isn't
                  // clipped by overflow:hidden. The mention dropdown
                  // is a sibling of this div (in the .relative
                  // wrapper), so it isn't clipped either.
                  className='w-full flex flex-wrap items-center gap-1.5 px-4 py-1.5 min-h-[44px] rounded-full cursor-text overflow-hidden shadow-sm transition focus-within-accent bg-[var(--background-card)] border border-[var(--border-muted)]'
                >
                  {/* Author chips — green (success palette). */}
                  {chips.map((chip) => (
                    <span
                      key={`a-${chip.id}`}
                      className='inline-flex items-center gap-1 pl-2 pr-1 h-7 rounded-md text-xs font-medium border'
                      style={{
                        background: 'var(--success-bg)',
                        borderColor: 'var(--success-border)',
                        color: 'var(--success-foreground)',
                      }}
                      title={`Filtering by author: ${chip.name || chip.id}`}
                    >
                      <span className='truncate max-w-[180px]'>
                        @{chip.name || chip.id}
                      </span>
                      <button
                        type='button'
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAuthorChip(chip.id);
                        }}
                        className='rounded-full p-0.5 transition hover:bg-[var(--success-border)]'
                        aria-label={`Remove ${chip.name || chip.id} author filter`}
                        title='Remove'
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {/* Journal chips — purple (analysis palette). Visually
                      distinct from author chips. Pill label is the
                      abbreviation (e.g. `#aer`) so it stays compact even
                      for journals with long names; full name shows in the
                      hover tooltip. Falls back to the name/ISSN for
                      journals added via the panel that aren't in our
                      shortcut catalog. */}
                  {journalChips.map((chip) => {
                    const abbrev = abbrevForIssn(chip.issn);
                    const label = abbrev || chip.name || chip.issn;
                    const tooltip = chip.name
                      ? `Filtering by journal: ${chip.name}${abbrev ? ` (#${abbrev})` : ''}`
                      : `Filtering by journal: ${chip.issn}`;
                    return (
                      <span
                        key={`j-${chip.issn}`}
                        className='inline-flex items-center gap-1 pl-2 pr-1 h-7 rounded-md text-xs font-medium border'
                        style={{
                          background: 'var(--analysis-bg)',
                          borderColor: 'var(--analysis-border)',
                          color: 'var(--analysis-foreground)',
                        }}
                        title={tooltip}
                      >
                        <span className='truncate max-w-[180px]'>#{label}</span>
                        <button
                          type='button'
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeJournalChip(chip.issn);
                          }}
                          className='rounded-full p-0.5 transition hover:bg-[var(--analysis-border)]'
                          aria-label={`Remove ${chip.name || chip.issn} journal filter`}
                          title='Remove'
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                  {/* Institution chips — amber (warning palette).
                      Third pill type, sourced from the `~partial`
                      autocomplete. The leading tilde mirrors the `@`
                      and `#` conventions so the user reads the bar as
                      "three kinds of entity references plus free
                      text". Display name is shown verbatim since
                      there's no standard abbrev catalog for
                      institutions. */}
                  {institutionChips.map((chip) => (
                    <span
                      key={`i-${chip.id}`}
                      className='inline-flex items-center gap-1 pl-2 pr-1 h-7 rounded-md text-xs font-medium border'
                      style={{
                        background: 'var(--warning-bg)',
                        borderColor: 'var(--warning-border)',
                        color: 'var(--warning-foreground)',
                      }}
                      title={`Filtering by institution: ${chip.display_name}`}
                    >
                      <span className='truncate max-w-[180px]'>
                        ~{chip.display_name}
                      </span>
                      <button
                        type='button'
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeInstitutionChip(chip.id);
                        }}
                        className='rounded-full p-0.5 transition hover:bg-[var(--warning-border)]'
                        aria-label={`Remove ${chip.display_name} institution filter`}
                        title='Remove'
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    ref={inputRef}
                    type='text'
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleInputBlur}
                    placeholder={
                      chips.length > 0 ||
                      journalChips.length > 0 ||
                      institutionChips.length > 0
                        ? ''
                        : semantic
                          ? 'Describe a concept...'
                          : 'Search papers, @authors, #journals, ~institutions…'
                    }
                    className='flex-1 min-w-[80px] outline-none border-none bg-transparent text-sm py-1 placeholder:text-app-soft'
                  />
                  {/* (Search-syntax popover removed from the bar to
                      keep the search row uncluttered — placing it
                      next to the green submit button made the two
                      affordances compete in a tight space. The
                      placeholder still hints at @/#/~ shortcuts, and
                      the navbar's Help link goes to /help where the
                      full syntax reference (incl. ~ typing tips and
                      OpenAlex keyword operators) is documented. The
                      SearchSyntaxHelp component is still exported,
                      so it can be re-mounted later — e.g. as a
                      contextual footer link inside the autocomplete
                      dropdown, or behind a `?` keyboard shortcut. */}
                  {/* Submit affordance — integrated into the bar's right
                      pill end. Geometry matches the chip-facade
                      container so the button reads as part of the bar
                      rather than an inset element:
                      • `h-11 w-11`     → 44×44, matching `min-h-[44px]`
                      • `-my-1.5 -mr-4` → exactly cancels the parent's
                                          `py-1.5` and right `px-4`, so
                                          the button bleeds flush with
                                          the container's inner edges.
                      • `rounded-r-full`→ right curve matches the bar's
                                          `rounded-full` exactly (both
                                          radii = height/2 = 22px), so
                                          the green fill follows the
                                          bar's right edge with no
                                          halo (container is
                                          `overflow-hidden`).
                      Idle is a borderless icon — the bar's own border
                      reads as the button's frame. Dirty fills the
                      right pill end with `success-bg` for a clear CTA. */}
                  <button
                    type='button'
                    onClick={() => handleSearch()}
                    className={`-my-1.5 -mr-4 flex-shrink-0 h-11 w-11 rounded-r-full inline-flex items-center justify-center transition ${
                      isDirty
                        ? ''
                        : 'text-app-soft hover:text-app hover:bg-[var(--surface-muted)]'
                    }`}
                    style={
                      isDirty
                        ? {
                            background: 'var(--success-bg)',
                            color: 'var(--success-foreground)',
                          }
                        : undefined
                    }
                    title={
                      isDirty
                        ? 'Apply pending changes (Enter)'
                        : 'Search (Enter)'
                    }
                    aria-label={isDirty ? 'Apply pending changes' : 'Search'}
                  >
                    <Search size={18} />
                  </button>
                </div>

                {/* (No inline syntax-help affordance lives in the bar
                    on purpose — the row is intentionally spare. The
                    /help page's Filters section is the canonical
                    reference for @/#/~ shortcuts, ~ typing tips, and
                    OpenAlex keyword operators. SearchSyntaxHelp.tsx
                    is kept around for a future contextual surface.) */}

                {/* @-mention autocomplete dropdown. Anchored to the input,
                    z-50 so it sits above the search results below but under
                    the help popover (z-100). Only renders when we have at
                    least one suggestion for the trailing @partial. */}
                {mentionOpen && mentionSuggestions.length > 0 && (
                  <div
                    role='listbox'
                    aria-label='Shortcut suggestions'
                    // max-h caps the dropdown at ~7-8 visible rows;
                    // overflow-y-auto turns the rest into a scrollable list.
                    // overscroll-contain prevents wheel events from leaking
                    // out and scrolling the page when the user reaches the
                    // dropdown's edge. onScroll powers the infinite-load
                    // for @author results — see `handleMentionListScroll`.
                    onScroll={handleMentionListScroll}
                    className='absolute left-0 right-0 top-full mt-1 surface-panel border border-app rounded-lg shadow-lg z-50 overflow-y-auto overscroll-contain max-h-80'
                  >
                    {mentionSuggestions.map((sug, idx) => {
                      const active = idx === mentionIdx;
                      const key =
                        sug.kind === 'author'
                          ? `a-${sug.id}`
                          : sug.kind === 'journal'
                            ? `j-${sug.issn}`
                            : `i-${sug.id}`;
                      // Right-side meta column: works count for the
                      // paged kinds (author / institution), the
                      // #abbrev pill for journals.
                      const meta =
                        sug.kind === 'journal'
                          ? `#${sug.abbrev}`
                          : `${sug.works_count.toLocaleString()} works`;
                      return (
                        <button
                          key={key}
                          ref={(el) => {
                            mentionItemRefs.current[idx] = el;
                          }}
                          role='option'
                          aria-selected={active}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectMention(idx)}
                          onMouseEnter={() => setMentionIdx(idx)}
                          className={`block w-full text-left px-3 py-2 text-sm transition ${
                            active
                              ? 'bg-[var(--surface-muted)] text-app'
                              : 'text-app hover:bg-[var(--surface-muted)]'
                          }`}
                        >
                          <div className='flex items-baseline justify-between gap-3'>
                            <span className='font-medium truncate'>
                              {sug.display_name}
                            </span>
                            <span className='text-[11px] text-app-soft flex-shrink-0'>
                              {meta}
                            </span>
                          </div>
                          {/* Secondary row: kind-specific context.
                              Authors get their last-known
                              institution; journals show ISSN;
                              institutions get country · type. */}
                          {sug.kind === 'author' && sug.hint && (
                            <div className='text-[11px] text-app-soft truncate mt-0.5'>
                              {sug.hint}
                            </div>
                          )}
                          {sug.kind === 'journal' && (
                            <div className='text-[11px] text-app-soft truncate mt-0.5'>
                              ISSN {sug.issn}
                            </div>
                          )}
                          {sug.kind === 'institution' && sug.hint && (
                            <div className='text-[11px] text-app-soft truncate mt-0.5'>
                              {sug.hint}
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {mentionLoading && (
                      <div className='px-3 py-1.5 text-[11px] text-app-soft border-t border-app sticky bottom-0 surface-panel'>
                        Searching…
                      </div>
                    )}
                    {/* Infinite-load footers (author dropdown only).
                        `mentionLoadingMore` shows while page N+1 is in
                        flight; the "End of results" line replaces it
                        once we've exhausted the result set so the user
                        knows scrolling further won't reveal more. Both
                        are sticky-bottom so they hover at the dropdown
                        edge as the user scrolls. */}
                    {!mentionLoading && mentionLoadingMore && (
                      <div className='px-3 py-1.5 text-[11px] text-app-soft border-t border-app sticky bottom-0 surface-panel'>
                        Loading more…
                      </div>
                    )}
                    {!mentionLoading &&
                      !mentionLoadingMore &&
                      !mentionHasMore &&
                      mentionSuggestions.length > MENTION_PAGE_SIZE && (
                        <div className='px-3 py-1.5 text-[11px] text-app-soft border-t border-app sticky bottom-0 surface-panel'>
                          End of results
                        </div>
                      )}
                  </div>
                )}

                {/* (Pending-changes hint banner removed — the green
                    submit-glass is sufficient signal. Discard is still
                    reachable via the event bus if we later want to wire
                    it to a context-menu / keyboard shortcut.) */}

                {/* (The semantic-mode shortcut hint was removed along
                    with the Semantic toggle in the navbar. The
                    semantic= URL param still flows through to the API
                    if set, but there's no UI affordance to enable it
                    here anymore.) */}
              </div>
            </div>
          </>
        ) : (
          // Other pages: Show tagline
          <div className='hidden ml-6 md:flex items-center gap-2 text-sm text-stone-600 flex-1'>
            {' '}
          </div>
        )}

        {/* Final navbar utility cluster.
            Three direct items, no overflow menu. The deliberate
            "go-find-it" actions either moved closer to their context
            (Personalize ranking → FilterPanel header) or to the help
            page (Contribute → /help#contribute; search syntax → /help
            Filters section). API-key usage stayed in the codebase but
            lost its visible trigger — it's now reachable only via the
            Cmd/Ctrl+Shift+U keyboard shortcut (admin-only affordance,
            see the `useEffect` near the top of the file). */}
        <button
          onClick={() => setShowStorage(true)}
          className='text-app-soft hover:text-app transition flex-shrink-0 p-1'
          title='View stored data'
          aria-label='View stored data'
        >
          <Database size={18} />
        </button>
        <Link
          href='/help'
          className='text-sm text-app-muted hover:text-app transition flex-shrink-0'
          title='View help documentation'
          aria-label='Help'
        >
          <CircleQuestionMark size={18} />
        </Link>
        <Link
          href='/about'
          className='text-sm text-app-muted hover:text-app transition flex-shrink-0'
        >
          About
        </Link>
      </div>

      <StorageModal
        isOpen={showStorage}
        onClose={() => setShowStorage(false)}
      />
      <OpenAlexUsageModal
        isOpen={showOpenAlexUsage}
        onClose={() => setShowOpenAlexUsage(false)}
      />
    </nav>
  );
}

export default function NavBar() {
  return (
    <Suspense
      fallback={
        <nav className='surface-panel border-app border-b h-16 shrink-0'>
          <div className='flex h-full items-center px-6 max-w-7xl mx-auto gap-6'>
            <div className='flex items-center gap-2 flex-shrink-0 text-accent-strong'>
              <svg
                viewBox='0 0 24 24'
                width='22'
                height='22'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.6'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <rect x='3' y='5' width='6' height='14' rx='3' />
                <rect x='15' y='5' width='6' height='14' rx='3' />
                <line x1='9' y1='11' x2='15' y2='11' />
                <line x1='9' y1='13' x2='15' y2='13' />
                <circle cx='6' cy='15' r='1.3' />
                <circle cx='18' cy='15' r='1.3' />
              </svg>
              <span className='text-xl font-semibold tracking-tight'>
                Paperazzi
              </span>
            </div>
          </div>
        </nav>
      }
    >
      <NavBarContent />
    </Suspense>
  );
}
