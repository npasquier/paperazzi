'use client';
import { useEffect, useRef, useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import { JOURNAL_SHORTCUTS_LIST } from '@/data/journalAbbreviations';

interface SearchSyntaxHelpProps {
  /** Render the Semantic-mode docs instead of Keyword. */
  semantic?: boolean;
  /**
   * Active filter / sort settings that block Semantic mode. When non-empty,
   * we surface a banner inside the Keyword popover explaining why Semantic
   * is currently disabled. Caller computes this list (see NavBar).
   */
  conflicts?: string[];
}

/**
 * Subtle (i)-icon popover anchored to the search input. Click-outside / Esc
 * closes. Uses position: fixed because the layout shell has overflow-hidden,
 * which would otherwise clip an absolutely-positioned popover hanging below
 * the navbar. The popover content is split into two views (Keyword vs.
 * Semantic) since the syntax that applies to each is genuinely different.
 */
export default function SearchSyntaxHelp({
  semantic = false,
  conflicts = [],
}: SearchSyntaxHelpProps) {
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
                  <code className='surface-subtle rounded px-1 text-xs'>
                    @
                  </code>{' '}
                  and{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    #
                  </code>{' '}
                  shortcuts are inactive — author/journal filters are not
                  supported by this endpoint, and the tokens stay as
                  literal text in the query.
                </li>
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
