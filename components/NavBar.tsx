'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Database, Github, Info, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef, Suspense } from 'react';
import StorageModal from './StorageModal';

// Subtle info popover anchored to the search input. Click-outside / Esc closes.
// Uses position: fixed because the layout shell has overflow-hidden, which
// would otherwise clip an absolutely-positioned popover hanging below the nav.
function SearchSyntaxHelp({ semantic = false }: { semantic?: boolean }) {
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
                  Filters (year, journal, type) still apply best-effort on top
                  of the semantic candidates.
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

function NavBarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSearchPage = pathname?.startsWith('/search') || false;

  // Local search query state (only for search page)
  const [query, setQuery] = useState('');
  // Semantic search mode (OpenAlex `search.semantic=`).
  const [semantic, setSemantic] = useState(false);
  // Storage viewer modal
  const [showStorage, setShowStorage] = useState(false);

  // Sync with URL when on search page
  useEffect(() => {
    if (isSearchPage) {
      setQuery(searchParams.get('q') || '');
      setSemantic(searchParams.get('semantic') === 'true');
    }
  }, [searchParams, isSearchPage]);

  // Toggle semantic mode. On the search page, push the URL change immediately
  // so the results refetch in the new mode. Off the search page, just keep
  // local state — it'll be applied when the user submits.
  const handleToggleSemantic = (next: boolean) => {
    setSemantic(next);
    if (!isSearchPage) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (next) params.set('semantic', 'true');
    else params.delete('semantic');
    params.set('page', '1');
    router.replace(`/search?${params.toString()}`);
  };

  const handleSearch = () => {
    if (isSearchPage) {
      // On search page, trigger event with the current query + mode.
      window.dispatchEvent(
        new CustomEvent('navbar-search', {
          detail: { query: query.trim(), semantic },
        }),
      );
    } else {
      // Not on search page, navigate there with query + mode.
      if (query.trim()) {
        const params = new URLSearchParams();
        params.set('q', query.trim());
        if (semantic) params.set('semantic', 'true');
        params.set('page', '1');
        router.push(`/search?${params.toString()}`);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
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
                  type='text'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    semantic
                      ? 'Describe a concept...'
                      : 'Search papers...'
                  }
                  className='w-full pl-10 pr-10 py-2 border border-app rounded-lg focus-accent'
                />
                <SearchSyntaxHelp semantic={semantic} />
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
                onClick={() => handleToggleSemantic(true)}
                className={`px-3 py-1 text-sm rounded-md transition flex items-center gap-1 ${
                  semantic
                    ? 'surface-card text-accent-strong shadow-sm font-medium'
                    : 'text-app-muted hover:text-app'
                }`}
                title='Semantic search — natural-language concept matching (max 50 results)'
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
