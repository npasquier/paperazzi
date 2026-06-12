'use client';
import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { JOURNAL_SHORTCUTS_LIST } from '@/data/journalAbbreviations';
import { useDismissablePopover } from '@/hooks/useDismissablePopover';

interface SearchSyntaxHelpProps {
  /**
   * Override the trigger button's className. By default the button is
   * absolutely positioned at the right edge of its containing relative
   * parent (matches the original NavBar layout). Pass a custom className
   * (e.g. inline-flex utilities) to render the icon inline instead.
   */
  buttonClassName?: string;
}

/**
 * Subtle (i)-icon popover anchored to the search input. Click-outside / Esc
 * closes. Uses position: fixed because the layout shell has overflow-hidden,
 * which would otherwise clip an absolutely-positioned popover hanging below
 * the navbar.
 */
export default function SearchSyntaxHelp({
  buttonClassName,
}: SearchSyntaxHelpProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  // Outside-click + Escape dismissal via the shared hook; the hook's
  // anchor ref doubles as the coords anchor below.
  const { popoverRef, anchorRef: buttonRef } = useDismissablePopover(
    open,
    () => setOpen(false),
  );

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

  // Keep the fixed-position popover glued to the button across window
  // resizes while open.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, buttonRef]);

  return (
    <>
      <button
        ref={buttonRef}
        type='button'
        onClick={handleToggle}
        className={
          buttonClassName ??
          'absolute right-2 top-1/2 -translate-y-1/2 text-app-soft hover:text-app transition p-1 rounded'
        }
        title='Search syntax'
        aria-label='Search syntax help'
        aria-expanded={open}
      >
        <Info size={16} className='opacity-0 group-hover:opacity-100' />
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
            <span className='font-medium text-app'>Search syntax</span>
            <a
              href='https://docs.openalex.org/how-to-use-the-api/get-lists-of-entities/search-entities'
              target='_blank'
              rel='noopener noreferrer'
              className='text-xs text-app-soft hover:text-app underline'
            >
              OpenAlex docs
            </a>
          </div>

          <div className='space-y-4 text-app-muted overflow-y-auto overscroll-contain px-4 py-3'>
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

              {/* Institution — third shortcut, paired with the
                  `~partial` autocomplete that lives in NavBar. A
                  typing tip for the `~` key lives right under the
                  example, since the keystroke isn't obvious on
                  every layout. */}
              <section>
                <div className='text-app text-xs font-semibold mb-1'>
                  Institution —{' '}
                  <code className='surface-subtle rounded px-1 text-xs'>
                    ~name
                  </code>
                </div>
                <p>
                  Same idea, but resolves an institution name against
                  OpenAlex. The picked institution becomes an amber chip in
                  the bar.
                </p>
                <pre className='surface-subtle rounded px-2 py-1 mt-1 text-xs overflow-x-auto'>
{`~stanford econ    ~MIT inequality`}
                </pre>
                <div className='banner-info rounded p-2 mt-2 text-[11px] leading-relaxed'>
                  <div className='font-medium text-app mb-0.5'>
                    Typing the tilde (
                    <code className='surface-subtle rounded px-1'>~</code>)
                  </div>
                  <ul className='list-disc pl-4 space-y-0.5 text-app-muted'>
                    <li>
                      <strong>US / UK QWERTY:</strong> top-left key,{' '}
                      <code className='surface-subtle rounded px-1'>
                        Shift + `
                      </code>
                      .
                    </li>
                    <li>
                      <strong>Mac French AZERTY:</strong>{' '}
                      <code className='surface-subtle rounded px-1'>
                        Option + N
                      </code>
                      , then press <code className='surface-subtle rounded px-1'>Space</code>.
                    </li>
                    <li>
                      <strong>Windows / Linux French AZERTY:</strong>{' '}
                      <code className='surface-subtle rounded px-1'>
                        AltGr + é
                      </code>{' '}
                      (the <code className='surface-subtle rounded px-1'>2</code>{' '}
                      key), then press{' '}
                      <code className='surface-subtle rounded px-1'>Space</code>.
                    </li>
                    <li>
                      Or copy from here:{' '}
                      <code className='surface-subtle rounded px-1 select-all'>
                        ~
                      </code>
                    </li>
                  </ul>
                </div>
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
        </div>
      )}
    </>
  );
}
