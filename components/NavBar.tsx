'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Database, Github, Info, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef, Suspense } from 'react';
import StorageModal from './StorageModal';
import { extractMentions, resolveMentions } from '@/utils/queryMentions';

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
          className='fixed w-[28rem] max-w-[92vw] surface-panel border border-app rounded-lg shadow-lg z-[100] p-4 text-sm'
          style={{ top: coords.top, right: coords.right }}
        >
          <div className='flex items-center justify-between mb-3'>
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
            <div className='space-y-3 text-app-muted'>
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
                  Boolean operators, wildcards, and quotes don't apply here.
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
          <div className='space-y-3 text-app-muted'>
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
                    OpenAlex's semantic endpoint expects a bare concept query.
                    Currently active: {conflicts.join(', ')}. Clear them to
                    re-enable Semantic.
                  </p>
                </div>
              </div>
            )}
            <section>
              <div className='text-app text-xs font-semibold mb-1'>
                Author shortcut
              </div>
              <p>
                Prefix a name with{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  @
                </code>{' '}
                to filter by that author. Suggestions appear as you type —
                use{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  ↑↓
                </code>{' '}
                +{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  Enter
                </code>{' '}
                (or click) to pick the right one. Multiple{' '}
                <code className='surface-subtle rounded px-1 text-xs'>
                  @
                </code>{' '}
                tokens are AND-ed (intersection); the rest of the text is
                searched as keywords.
              </p>
              <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`@acemoglu institutions    @kahneman @tversky prospect`}
              </pre>
            </section>

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
                wildcards aren't supported.
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

// Trailing @-mention pattern: matches `@xxx` at the end of the query, where
// xxx starts with a letter and is at least 2 chars. We only suggest while the
// user is actively typing the *last* token, which keeps the dropdown out of
// the way for everything else.
const TRAILING_MENTION_RE = /(?:^|\s)@([A-Za-z][A-Za-z0-9-]{1,})$/;

interface AuthorSuggestion {
  id: string; // OpenAlex ID, normalized (no URL prefix)
  display_name: string;
  works_count: number;
  hint?: string; // last-known institution, when available
}

// Reduce a display name like "Daron Acemoglu" or "Maria de la Rica" to a
// short, lowercase token suitable for replacing the user's @partial in the
// input box. We use the surname-ish last word so the chip stays visually
// close to what the user typed.
function slugifyAuthorName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || displayName;
  return last.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

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

  // ── @author autocomplete ────────────────────────────────────────────
  // Suggestions for the trailing @partial token. Open only while the user is
  // typing inside an @mention; closes on selection, blur, or Esc.
  const [mentionSuggestions, setMentionSuggestions] = useState<
    AuthorSuggestion[]
  >([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Cache of explicit user picks: slug → {id, displayName}. Survives across
  // renders so submit-time resolution can prefer the user's choice over the
  // silent top-match fallback. Forwarded to PaperazziApp via the
  // navbar-search event so it can short-circuit there too.
  const resolvedMentionsRef = useRef<
    Map<string, { id: string; name?: string }>
  >(new Map());
  // One ref per suggestion row so arrow-key navigation can scroll the
  // highlighted item into view inside the (overflow-y-auto) dropdown.
  const mentionItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // Debounced fetch of @-mention suggestions. Triggers only when the query
  // ends in `@xxx` (xxx ≥ 2 chars), so the dropdown is fully opt-in to the
  // `@` prefix and doesn't fire on plain keyword searches. 300ms debounce
  // keeps API load proportional to user pauses, not keystrokes.
  useEffect(() => {
    const m = query.match(TRAILING_MENTION_RE);
    if (!m) {
      setMentionOpen(false);
      setMentionSuggestions([]);
      setMentionLoading(false);
      return;
    }
    const partial = m[1];
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
        const results: AuthorSuggestion[] = (data.results || []).map(
          (a: {
            id: string;
            display_name: string;
            works_count?: number;
            last_known_institution?: { display_name?: string };
            affiliations?: { institution?: { display_name?: string } }[];
          }) => ({
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

  // Apply a suggestion: replace the trailing @partial with @<lastname-slug>
  // and remember the resolved id so submit doesn't re-resolve via top-match.
  const selectMention = (idx: number) => {
    const sug = mentionSuggestions[idx];
    if (!sug) return;
    const slug = slugifyAuthorName(sug.display_name) || `a${sug.id}`;
    const newQuery = query.replace(TRAILING_MENTION_RE, (match) => {
      const leadingSpace = match.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}@${slug} `;
    });
    setQuery(newQuery);
    resolvedMentionsRef.current.set(slug.toLowerCase(), {
      id: sug.id,
      name: sug.display_name,
    });
    setMentionOpen(false);
    setMentionSuggestions([]);
    // Keep focus in the input so the user can keep typing (keywords or
    // another @mention) without clicking back into the bar.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSearch = async () => {
    if (isSearchPage) {
      // On search page, trigger event with the current query + mode.
      // PaperazziApp's navbar-search handler resolves any `@` mentions on
      // its side; we forward the user's pick cache so it can use the
      // explicit choice instead of falling back to silent top-match.
      window.dispatchEvent(
        new CustomEvent('navbar-search', {
          detail: {
            query: query.trim(),
            semantic,
            mentionCache: Array.from(resolvedMentionsRef.current.entries()),
          },
        }),
      );
    } else {
      // Not on search page, navigate there with query + mode. We do the
      // `@author` resolution here too — there's no PaperazziApp listener
      // to catch it on a fresh search-page load.
      if (query.trim()) {
        const { cleanQuery, mentions } = extractMentions(query.trim());
        const params = new URLSearchParams();
        if (cleanQuery) params.set('q', cleanQuery);
        if (semantic) params.set('semantic', 'true');
        if (mentions.length > 0) {
          const { resolved } = await resolveMentions(
            mentions,
            resolvedMentionsRef.current,
          );
          if (resolved.length > 0) {
            params.set('authors', resolved.map((a) => a.id).join(','));
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
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400' />
                <input
                  ref={inputRef}
                  type='text'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleInputBlur}
                  placeholder={
                    semantic
                      ? 'Describe a concept...'
                      : 'Search papers...'
                  }
                  className='w-full pl-10 pr-10 py-2 border border-app rounded-lg focus-accent'
                />
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
                    aria-label='Author suggestions'
                    // max-h caps the dropdown at ~8 visible rows (each row
                    // is ~44–52px tall depending on whether it has a hint
                    // line); overflow-y-auto turns the rest into a
                    // scrollable list. overscroll-contain prevents wheel
                    // events from leaking out and scrolling the page when
                    // the user reaches the dropdown's edge.
                    className='absolute left-0 right-0 top-full mt-1 surface-panel border border-app rounded-lg shadow-lg z-50 overflow-y-auto overscroll-contain max-h-80'
                  >
                    {mentionSuggestions.map((sug, idx) => {
                      const active = idx === mentionIdx;
                      return (
                        <button
                          key={sug.id}
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
                              {sug.works_count.toLocaleString()} works
                            </span>
                          </div>
                          {sug.hint && (
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
