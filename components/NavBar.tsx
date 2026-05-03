'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Database, Github, Info, Sparkles, X } from 'lucide-react';
import { useState, useEffect, useRef, Suspense } from 'react';
import StorageModal from './StorageModal';
import {
  extractMentions,
  resolveMentions,
  resolveJournalShortcuts,
} from '@/utils/queryMentions';
import { SelectedAuthor, SelectedJournal } from '@/types/interfaces';
import {
  searchJournalShortcuts,
  JOURNAL_SHORTCUTS_LIST,
  abbrevForIssn,
} from '@/data/journalAbbreviations';

// Subtle info popover anchored to the search input. Click-outside / Esc closes.
// Uses position: fixed because the layout shell has overflow-hidden, which
// would otherwise clip an absolutely-positioned popover hanging below the nav.
function SearchSyntaxHelp({
  semantic = false,
  conflicts = [],
}: {
  semantic?: boolean;
  conflicts?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const recomputeCoords = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  };

  const handleToggle = () => {
    if (!open) recomputeCoords();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onResize = () => recomputeCoords();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type='button'
        onClick={handleToggle}
        className='absolute right-2 top-1/2 -translate-y-1/2 text-app-soft hover:text-app transition p-1 rounded'
        title='Search syntax'
        aria-label='Search syntax help'
        aria-expanded={open}
      >
        <Info size={16} />
      </button>

      {open && coords && (
        <div
          ref={popoverRef}
          role='dialog'
          aria-label='OpenAlex search syntax'
          // Capped to 80vh so the popover never escapes the viewport, even
          // on short laptop screens. Outer is a flex column: sticky header,
          // then a scrollable content region (overflow-y-auto on the inner
          // div). overscroll-contain keeps the page from scrolling when
          // the user wheels past the dropdown's edges.
          className='fixed w-[28rem] max-w-[92vw] max-h-[80vh] surface-panel border border-app rounded-lg shadow-lg z-[100] text-sm flex flex-col'
          style={{ top: coords.top, right: coords.right }}
        >
          <div className='flex items-center justify-between px-4 pt-4 pb-2 border-b border-app flex-shrink-0'>
            <span className='font-medium text-app'>
              {semantic ? 'Semantic search (Beta)' : 'Search syntax'}
            </span>
            <a
              href='https://docs.openalex.org/how-to-use-the-api/get-lists-of-entities/search-entities'
              target='_blank'
              rel='noopener noreferrer'
              className='text-xs text-app-soft hover:text-app underline'
            >
              OpenAlex docs
            </a>
          </div>

          {semantic ? (
            <div className='space-y-3 text-app-muted overflow-y-auto overscroll-contain px-4 py-3'>
              <p>
                Describe a concept in natural language — even a sentence or
                paragraph. Results are returned by similarity, so conceptually
                related work surfaces even when it uses different vocabulary.
              </p>
              <pre className='surface-subtle rounded px-2 py-1 text-xs overflow-x-auto whitespace-pre-wrap'>
{`how do firms respond to minimum wage increases in low-income labor markets`}
              </pre>
              <ul className='list-disc pl-5 space-y-1 text-xs'>
                <li>
                  Boolean operators, wildcards, and quotes don&apos;t apply here.
                </li>
                <li>
                  Capped at <strong>50 results</strong> per query — pagination
                  is disabled.
                </li>
                <li>
                  Filters (year, journal, type, etc.) and citation / reference
                  constraints <strong>disable</strong> Semantic — the
                  endpoint expects a bare concept query. Clear them to use
                  Semantic, or stay on Keyword if you need filtering.
                </li>
                <li>
                  Rate-limited to <strong>1 request/second</strong> upstream.
                </li>
              </ul>
              <p className='text-xs text-app-soft pt-1 border-t border-app'>
                Switch back to Keyword for exact-term search, full filtering,
                and unlimited pagination.
              </p>
            </div>
          ) : (
          <div className='space-y-4 text-app-muted overflow-y-auto overscroll-contain px-4 py-3'>
            {conflicts.length > 0 && (
              <div className='banner-info rounded p-2 text-xs flex gap-2'>
                <Sparkles
                  size={14}
                  className='flex-shrink-0 mt-0.5 text-accent-strong'
                />
                <div>
                  <div className='font-medium text-app mb-0.5'>
                    Semantic search is disabled
                  </div>
                  <p>
                    OpenAlex&apos;s semantic endpoint expects a bare concept query.
                    Currently active: {conflicts.join(', ')}. Clear them to
                    re-enable Semantic.
                  </p>
                </div>
              </div>
            )}

            {/* ─── SHORTCUTS group ─────────────────────────────────── */}
            <div className='space-y-3'>
              <div className='text-[10px] uppercase tracking-wider text-app-soft font-semibold'>
                Shortcuts
              </div>

              <section>
                <div className='text-app text-xs font-semibold mb-1'>
                  Author —{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    @name
                  </code>
                </div>
                <p>
                  Suggestions appear as you type;{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    ↑↓
                  </code>{' '}
                  +{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    Enter
                  </code>{' '}
                  picks one. The picked author becomes a green chip in the
                  bar — click its{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    ✕
                  </code>{' '}
                  or press{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    Backspace
                  </code>{' '}
                  with an empty input to remove it.
                </p>
                <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`@acemoglu institutions    @kahneman @tversky prospect`}
                </pre>
              </section>

              <section>
                <div className='text-app text-xs font-semibold mb-1'>
                  Journal —{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    #abbrev
                  </code>
                </div>
                <p>
                  Same idea, but resolves a journal abbreviation against a
                  built-in list. The picked journal becomes a purple chip in
                  the bar.
                </p>
                <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`#aer minimum wage    #qje #jpe inequality`}
                </pre>
                <details className='mt-2 text-xs'>
                  <summary className='cursor-pointer text-app-soft hover:text-app select-none'>
                    Available journal abbreviations (
                    {JOURNAL_SHORTCUTS_LIST.length})
                  </summary>
                  <div className='mt-2 grid grid-cols-2 gap-x-3 gap-y-1'>
                    {JOURNAL_SHORTCUTS_LIST.map((j) => (
                      <div
                        key={j.abbrev}
                        className='flex items-baseline gap-1.5 text-[11px]'
                      >
                        <code className='surface-subtle rounded px-1 text-app font-mono flex-shrink-0'>
                          #{j.abbrev}
                        </code>
                        <span className='text-app-soft truncate'>
                          {j.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </section>

              <p className='text-[11px] text-app-soft'>
                Multiple chips of the same kind are AND-ed (intersection).
                The rest of the text is searched as keywords.
              </p>
            </div>

            {/* ─── BOOLEAN group ──────────────────────────────────── */}
            <div className='space-y-3 pt-1 border-t border-app'>
              <div className='text-[10px] uppercase tracking-wider text-app-soft font-semibold pt-2'>
                Operators &amp; matching
              </div>

            <section>
              <div className='text-app text-xs font-semibold mb-1'>
                Boolean
              </div>
              <p>
                Combine terms with{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  AND
                </code>
                ,{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  OR
                </code>
                ,{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  NOT
                </code>{' '}
                (uppercase). Plain words are joined by{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  AND
                </code>
                .
              </p>
              <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`(firm AND "horizontal merger") NOT (chicken OR vertical)`}
              </pre>
            </section>

            <section>
              <div className='text-app text-xs font-semibold mb-1'>
                Exact phrase
              </div>
              <p>Quote a phrase to match it exactly.</p>
              <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`"horizontal merger"`}
              </pre>
            </section>

            <section>
              <div className='text-app text-xs font-semibold mb-1'>
                Proximity
              </div>
              <p>
                Append{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  ~N
                </code>{' '}
                to a quoted phrase to find the words within N positions of
                each other.
              </p>
              <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`"climate change"~5`}
              </pre>
            </section>

            <section>
              <div className='text-app text-xs font-semibold mb-1'>
                Wildcards
              </div>
              <p>
                <code className='surface-subtle rounded px-1 text-xs'>
                  *
                </code>{' '}
                matches any characters,{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  ?
                </code>{' '}
                matches one. Need ≥3 chars before the wildcard. Leading
                wildcards aren&apos;t supported.
              </p>
              <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`machin*     wom?n`}
              </pre>
            </section>

            <section>
              <div className='text-app text-xs font-semibold mb-1'>
                Fuzzy
              </div>
              <p>
                Append{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  ~N
                </code>{' '}
                (N = 0, 1, 2) to a single term to tolerate typos. Need ≥3
                chars before{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  ~
                </code>
                .
              </p>
              <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`machin~1`}
              </pre>
            </section>
            </div>{/* /Operators & matching group */}

            <p className='text-xs text-app-soft pt-1 border-t border-app'>
              Results are sorted by{' '}
              <code className='surface-subtle rounded px-1'>
                relevance_score
              </code>{' '}
              by default — a blend of text similarity and citation count.
            </p>
          </div>
          )}
        </div>
      )}
    </>
  );
}

// Trailing shortcut pattern: matches `@xxx` (author) or `#xxx` (journal) at
// the end of the query, where xxx starts with a letter and is at least 2
// chars. We only suggest while the user is actively typing the *last* token,
// which keeps the dropdown out of the way for everything else.
const TRAILING_SHORTCUT_RE = /(?:^|\s)([@#])([A-Za-z][A-Za-z0-9-]{1,})$/;

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
  // Storage viewer modal
  const [showStorage, setShowStorage] = useState(false);

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
  const inputRef = useRef<HTMLInputElement>(null);
  // One ref per suggestion row so arrow-key navigation can scroll the
  // highlighted item into view inside the (overflow-y-auto) dropdown.
  const mentionItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  useEffect(() => {
    const onAuthors = (e: Event) => {
      const ev = e as CustomEvent<{ authors: SelectedAuthor[] }>;
      setChips(ev.detail?.authors || []);
    };
    const onJournals = (e: Event) => {
      const ev = e as CustomEvent<{ journals: SelectedJournal[] }>;
      setJournalChips(ev.detail?.journals || []);
    };
    window.addEventListener('paperazzi-authors-changed', onAuthors);
    window.addEventListener('paperazzi-journals-changed', onJournals);
    return () => {
      window.removeEventListener('paperazzi-authors-changed', onAuthors);
      window.removeEventListener('paperazzi-journals-changed', onJournals);
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
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ econActive: boolean }>;
      setEconActive(!!ev.detail?.econActive);
    };
    window.addEventListener('semantic-conflict-econ', handler);
    return () =>
      window.removeEventListener('semantic-conflict-econ', handler);
  }, []);

  // Sync with URL when on search page
  useEffect(() => {
    if (!isSearchPage) return;
    setQuery(searchParams.get('q') || '');

    const urlSemantic = searchParams.get('semantic') === 'true';
    // Treat URL semantic=true as effective only when no conflicts are active;
    // if a conflict slipped in (e.g. user added a filter while semantic was on),
    // clean it out of the URL so the page is in a consistent state.
    if (urlSemantic && semanticDisabled) {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.delete('semantic');
      router.replace(`/search?${params.toString()}`);
      setSemantic(false);
    } else {
      setSemantic(urlSemantic);
    }
  }, [searchParams, isSearchPage, semanticDisabled, router]);

  // Toggle semantic mode. On the search page, push the URL change immediately
  // so the results refetch in the new mode. Off the search page, just keep
  // local state — it'll be applied when the user submits.
  const handleToggleSemantic = (next: boolean) => {
    // Refuse to enable semantic when conflicts are active. The pill itself
    // is disabled in that state, but this is a defensive guard.
    if (next && semanticDisabled) return;
    setSemantic(next);
    if (!isSearchPage) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (next) params.set('semantic', 'true');
    else params.delete('semantic');
    params.set('page', '1');
    router.replace(`/search?${params.toString()}`);
  };

  // Debounced suggestion update. Triggers only when the query ends in
  // `@xxx` or `#xxx` (xxx ≥ 2 chars), so the dropdown is fully opt-in to a
  // shortcut prefix and never fires on plain keyword searches.
  //   @ → fetch /authors?search= (300ms debounce, network)
  //   # → filter the static JOURNAL_SHORTCUTS map (no debounce, no network)
  useEffect(() => {
    const m = query.match(TRAILING_SHORTCUT_RE);
    if (!m) {
      setMentionOpen(false);
      setMentionSuggestions([]);
      setMentionLoading(false);
      return;
    }
    const prefix = m[1];
    const partial = m[2];

    // Journal: synchronous static lookup, no need to debounce or load.
    if (prefix === '#') {
      const hits = searchJournalShortcuts(partial, 25);
      const results: Suggestion[] = hits.map((j) => ({
        kind: 'journal' as const,
        issn: j.issn,
        display_name: j.name,
        abbrev: j.abbrev,
      }));
      setMentionSuggestions(results);
      setMentionOpen(results.length > 0);
      setMentionIdx(0);
      setMentionLoading(false);
      return;
    }

    // Author: debounced network call.
    setMentionLoading(true);
    const handle = setTimeout(async () => {
      try {
        const url = `https://api.openalex.org/authors?search=${encodeURIComponent(
          partial,
        )}&per-page=25`;
        const res = await fetch(url);
        if (!res.ok) {
          setMentionSuggestions([]);
          setMentionOpen(false);
          return;
        }
        const data = await res.json();
        const results: Suggestion[] = (data.results || []).map(
          (a: {
            id: string;
            display_name: string;
            works_count?: number;
            last_known_institution?: { display_name?: string };
            affiliations?: { institution?: { display_name?: string } }[];
          }) => ({
            kind: 'author' as const,
            id: a.id.replace('https://openalex.org/', ''),
            display_name: a.display_name,
            works_count: a.works_count || 0,
            hint:
              a.last_known_institution?.display_name ||
              a.affiliations?.[0]?.institution?.display_name ||
              undefined,
          }),
        );
        setMentionSuggestions(results);
        setMentionOpen(results.length > 0);
        setMentionIdx(0);
      } catch {
        setMentionSuggestions([]);
        setMentionOpen(false);
      } finally {
        setMentionLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

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
    } else {
      setJournalChips((prev) =>
        prev.find((j) => j.issn === sug.issn)
          ? prev
          : [...prev, { issn: sug.issn, name: sug.display_name }],
      );
    }
    setMentionOpen(false);
    setMentionSuggestions([]);
    // Keep focus in the input so the user can keep typing (keywords or
    // another @ / # token) without clicking back into the bar.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Remove an author chip — immediately update the URL so results refresh
  // without that author. Clicking X already expresses the intent "stop
  // filtering by this".
  const removeAuthorChip = (id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
    if (!isSearchPage) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    const remaining = (params.get('authors') || '')
      .split(',')
      .filter(Boolean)
      .filter((a) => a !== id);
    if (remaining.length > 0) params.set('authors', remaining.join(','));
    else params.delete('authors');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
  };

  // Same for journal chips, but routes to the `journals=` URL param.
  const removeJournalChip = (issn: string) => {
    setJournalChips((prev) => prev.filter((j) => j.issn !== issn));
    if (!isSearchPage) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    const remaining = (params.get('journals') || '')
      .split(',')
      .filter(Boolean)
      .filter((j) => j !== issn);
    if (remaining.length > 0) params.set('journals', remaining.join(','));
    else params.delete('journals');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
  };

  const handleSearch = async () => {
    if (isSearchPage) {
      // On search page: dispatch the full chip state (authors + journals)
      // and let PaperazziApp's listener resolve any leftover @text / #text
      // tokens before pushing the URL.
      window.dispatchEvent(
        new CustomEvent('navbar-search', {
          detail: {
            query: query.trim(),
            semantic,
            chipAuthors: chips.map((c) => ({ id: c.id, name: c.name })),
            chipJournals: journalChips.map((j) => ({
              issn: j.issn,
              name: j.name,
            })),
          },
        }),
      );
    } else {
      // Off search page: build the URL ourselves. Resolve @ tokens via API
      // and # tokens via the static map, then assemble the params.
      if (
        query.trim() ||
        chips.length > 0 ||
        journalChips.length > 0
      ) {
        const { cleanQuery, mentions, journalAbbrevs } = extractMentions(
          query.trim(),
        );
        const params = new URLSearchParams();
        if (cleanQuery) params.set('q', cleanQuery);
        if (semantic) params.set('semantic', 'true');

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
        setMentionIdx((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx(
          (i) =>
            (i - 1 + mentionSuggestions.length) % mentionSuggestions.length,
        );
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
    // Backspace at the very start of an empty input deletes the last chip
    // — same gesture as Slack/Gmail/Linear's chip inputs. Journal chips
    // come visually after author chips, so they get popped first.
    if (
      e.key === 'Backspace' &&
      query === '' &&
      (e.currentTarget.selectionStart ?? 0) === 0
    ) {
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
          href='/'
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
            <div className='flex-1 max-w-2xl ml-auto'>
              <div className='relative'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none z-10' />

                {/* Chip facade. Looks like the original `<input>` (same
                    border, padding, rounded, focus ring) but is actually a
                    flex container holding green author chips followed by
                    the real text input. Click anywhere in the bar to focus
                    the input — common chip-input UX. */}
                <div
                  onClick={() => inputRef.current?.focus()}
                  className='w-full flex flex-wrap items-center gap-1 pl-10 pr-10 py-1.5 min-h-[40px] border border-app rounded-lg focus-within-accent cursor-text bg-[var(--background)]'
                >
                  {/* Author chips — green (success palette). */}
                  {chips.map((chip) => (
                    <span
                      key={`a-${chip.id}`}
                      className='inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs font-medium border'
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
                        className='rounded p-0.5 hover:bg-black/10 transition'
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
                        className='inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs font-medium border'
                        style={{
                          background: 'var(--analysis-bg)',
                          borderColor: 'var(--analysis-border)',
                          color: 'var(--analysis-foreground)',
                        }}
                        title={tooltip}
                      >
                        <span className='truncate max-w-[180px]'>
                          #{label}
                        </span>
                        <button
                          type='button'
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeJournalChip(chip.issn);
                          }}
                          className='rounded p-0.5 hover:bg-black/10 transition'
                          aria-label={`Remove ${chip.name || chip.issn} journal filter`}
                          title='Remove'
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                  <input
                    ref={inputRef}
                    type='text'
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleInputBlur}
                    placeholder={
                      chips.length > 0 || journalChips.length > 0
                        ? ''
                        : semantic
                          ? 'Describe a concept...'
                          : 'Search papers...'
                    }
                    className='flex-1 min-w-[80px] outline-none border-none bg-transparent text-sm py-0.5'
                  />
                </div>

                <SearchSyntaxHelp
                  semantic={semantic}
                  conflicts={semanticConflicts}
                />

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
                    // dropdown's edge.
                    className='absolute left-0 right-0 top-full mt-1 surface-panel border border-app rounded-lg shadow-lg z-50 overflow-y-auto overscroll-contain max-h-80'
                  >
                    {mentionSuggestions.map((sug, idx) => {
                      const active = idx === mentionIdx;
                      const key =
                        sug.kind === 'author'
                          ? `a-${sug.id}`
                          : `j-${sug.issn}`;
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
                              {sug.kind === 'author'
                                ? `${sug.works_count.toLocaleString()} works`
                                : `#${sug.abbrev}`}
                            </span>
                          </div>
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
                        </button>
                      );
                    })}
                    {mentionLoading && (
                      <div className='px-3 py-1.5 text-[11px] text-app-soft border-t border-app sticky bottom-0 surface-panel'>
                        Searching…
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mode toggle: keyword (Boolean syntax) vs. semantic (concept). */}
            <div
              role='radiogroup'
              aria-label='Search mode'
              className='flex items-center surface-subtle border border-app rounded-lg p-0.5 flex-shrink-0'
            >
              <button
                role='radio'
                aria-checked={!semantic}
                onClick={() => handleToggleSemantic(false)}
                className={`px-3 py-1 text-sm rounded-md transition ${
                  !semantic
                    ? 'surface-card text-app shadow-sm font-medium'
                    : 'text-app-muted hover:text-app'
                }`}
                title='Keyword search — Boolean syntax, full filtering, unlimited pagination'
              >
                Keyword
              </button>
              <button
                role='radio'
                aria-checked={semantic}
                aria-disabled={semanticDisabled}
                disabled={semanticDisabled}
                onClick={() => handleToggleSemantic(true)}
                className={`px-3 py-1 text-sm rounded-md transition flex items-center gap-1 ${
                  semantic
                    ? 'surface-card text-accent-strong shadow-sm font-medium'
                    : semanticDisabled
                      ? 'text-app-soft opacity-50 cursor-not-allowed'
                      : 'text-app-muted hover:text-app'
                }`}
                title={
                  semanticDisabled
                    ? `Semantic disabled — clear ${semanticConflicts.join(
                        ', ',
                      )} to use Semantic. Click the info icon for details.`
                    : 'Semantic search — natural-language concept matching (max 50 results)'
                }
              >
                <Sparkles size={13} />
                Semantic
              </button>
            </div>

            <button
              onClick={handleSearch}
              className='px-6 py-2 button-primary rounded-lg transition font-medium flex-shrink-0'
            >
              Search
            </button>
          </>
        ) : (
          // Other pages: Show tagline
          <div className='hidden ml-6 md:flex items-center gap-2 text-sm text-stone-600 flex-1'>
              {' '}
          </div>
        )}

        {/* GitHub link — open source signal */}
        {/* <a
          href='https://github.com/npasquier/paperazzi'
          target='_blank'
          rel='noopener noreferrer'
          className='text-app-soft hover:text-app transition flex-shrink-0 ml-auto p-1'
          title='View source on GitHub'
          aria-label='View source on GitHub'
        >
          <Github size={18} />
        </a> */}

        {/* Stored-data viewer */}
        <button
          onClick={() => setShowStorage(true)}
          className='text-app-soft hover:text-app transition flex-shrink-0 p-1'
          title='View stored data'
          aria-label='View stored data'
        >
          <Database size={18} />
        </button>

        {/* Help link - always visible */}
        <Link
          href='/help'
          className='text-sm text-app-muted hover:text-app transition flex-shrink-0'
        >
          Help
        </Link>

        {/* About link - always visible */}
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
    </nav>
  );
}

export default function NavBar() {
  return (
    <Suspense fallback={
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
            <span className='text-xl font-semibold tracking-tight'>Paperazzi</span>
          </div>
        </div>
      </nav>
    }>
      <NavBarContent />
    </Suspense>
  );
}
