'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Database, CircleQuestionMark } from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';
import StorageModal from './StorageModal';
import OpenAlexUsageModal from './OpenAlexUsageModal';
import {
  extractMentions,
  resolveMentions,
  resolveJournalShortcuts,
} from '@/utils/queryMentions';
import { abbrevForIssn } from '@/data/journalAbbreviations';
import { emit } from '@/utils/eventBus';
import { useNavBarChips } from '@/hooks/useNavBarChips';
import {
  useNavBarAutocomplete,
  MENTION_PAGE_SIZE,
} from '@/hooks/useNavBarAutocomplete';

function NavBarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSearchPage = pathname?.startsWith('/search') || false;

  const [query, setQuery] = useState('');
  // Collapsed (single row, "+N more") vs expanded (wrapping overlay) layout.
  // Only "+N more" toggles this on — focusing the input to edit the keyword
  // must NOT expand the pills. Leaving the bar collapses it again.
  const [pillsExpanded, setPillsExpanded] = useState(false);
  // Stored-data viewer modal — direct trigger in the navbar.
  const [showStorage, setShowStorage] = useState(false);

  // OpenAlex API key usage dashboard — admin-only affordance, no
  // visible trigger. Open it with Cmd+Shift+U (Mac) / Ctrl+Shift+U.
  const [showOpenAlexUsage, setShowOpenAlexUsage] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  // Abstract curation dashboard — admin-only affordance, no visible trigger.
  // Open it with Cmd+Shift+G (Mac) / Ctrl+Shift+G. (G avoids the browser
  // devtools combos I/J/K/C/M and the reopen-tab combo T.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'g' || !e.shiftKey) return;
      if (!e.metaKey && !e.ctrlKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      router.push('/curate');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  // Seed `query` from the URL when on the search page. Owned by useState
  // and just seeded from the URL on entry / back-forward.
  useEffect(() => {
    if (!isSearchPage) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery(searchParams.get('q') || '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [searchParams, isSearchPage]);

  // ── Chips + dirty signals ────────────────────────────────────────────
  const {
    chips,
    setChips,
    journalChips,
    setJournalChips,
    institutionChips,
    setInstitutionChips,
    isDirty,
    removeAuthorChip,
    removeJournalChip,
    removeInstitutionChip,
  } = useNavBarChips(searchParams, isSearchPage, query);

  // ── @/#/~ autocomplete ───────────────────────────────────────────────
  const {
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
  } = useNavBarAutocomplete({
    query,
    setQuery,
    setChips,
    setJournalChips,
    setInstitutionChips,
  });

  // ── Actions ──────────────────────────────────────────────────────────

  // Wipe the search bar to a neutral state: clear text, clear all chips,
  // clear non-URL state (journalFilterMode, econFilter — handled by
  // PaperazziApp via the paperazzi-reset-search event), and navigate to
  // bare /search so SearchResults renders its welcome tiles.
  const clearAll = () => {
    setQuery('');
    setChips([]);
    setJournalChips([]);
    setInstitutionChips([]);
    setMentionOpen(false);
    emit('paperazzi-reset-search');
    router.push('/search');
  };

  const handleSearch = async () => {
    if (isSearchPage) {
      // On search page: dispatch the full chip state and let PaperazziApp's
      // listener resolve any leftover @text / #text tokens before pushing the URL.
      emit('navbar-search', {
        query: query.trim(),
        chipAuthors: chips.map((c) => ({ id: c.id, name: c.name })),
        chipJournals: journalChips.map((j) => ({ issn: j.issn, name: j.name })),
        chipInstitutions: institutionChips.map((i) => ({
          id: i.id,
          display_name: i.display_name,
        })),
      });
    } else {
      // Off search page: build the URL ourselves. Resolve @ tokens via API
      // and # tokens via the static map, then assemble the params.
      if (
        query.trim() ||
        chips.length > 0 ||
        journalChips.length > 0 ||
        institutionChips.length > 0
      ) {
        const params = new URLSearchParams();

        const { cleanQuery, mentions, journalAbbrevs } = extractMentions(query.trim());
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
            if (!allJournalIssns.includes(r.issn)) allJournalIssns.push(r.issn);
        }
        if (allJournalIssns.length > 0) {
          params.set('journals', allJournalIssns.join(','));
        }

        if (institutionChips.length > 0) {
          params.set('institutions', institutionChips.map((i) => i.id).join(','));
        }

        params.set('page', '1');
        router.push(`/search?${params.toString()}`);
      }
    }
  };

  // KeyDown (not KeyPress — KeyPress doesn't fire for arrow keys). When
  // the dropdown is open, intercept Up/Down/Enter/Tab/Esc; otherwise
  // Enter submits the search. Backspace at the start of an empty input
  // deletes the last chip (Slack/Gmail/Linear gesture).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
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
    // Escape with the dropdown closed: leave the bar (collapses the overlay).
    if (e.key === 'Escape') {
      e.currentTarget.blur();
      return;
    }
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

  // ── Chip display model ───────────────────────────────────────────────
  // All three chip types flattened into one render list so the collapsed
  // bar can show the first few and summarize the rest as "+N more".
  const chipItems = [
    ...chips.map((chip) => ({
      key: `a-${chip.id}`,
      label: `@${chip.name || chip.id}`,
      title: `Filtering by author: ${chip.name || chip.id}`,
      ariaLabel: `Remove ${chip.name || chip.id} author filter`,
      bg: 'var(--success-bg)',
      border: 'var(--success-border)',
      fg: 'var(--success-foreground)',
      hoverClass: 'hover:bg-[var(--success-border)]',
      onRemove: () => removeAuthorChip(chip.id),
    })),
    ...journalChips.map((chip) => {
      const abbrev = abbrevForIssn(chip.issn);
      return {
        key: `j-${chip.issn}`,
        label: `#${abbrev || chip.name || chip.issn}`,
        title: chip.name
          ? `Filtering by journal: ${chip.name}${abbrev ? ` (#${abbrev})` : ''}`
          : `Filtering by journal: ${chip.issn}`,
        ariaLabel: `Remove ${chip.name || chip.issn} journal filter`,
        bg: 'var(--analysis-bg)',
        border: 'var(--analysis-border)',
        fg: 'var(--analysis-foreground)',
        hoverClass: 'hover:bg-[var(--analysis-border)]',
        onRemove: () => removeJournalChip(chip.issn),
      };
    }),
    ...institutionChips.map((chip) => ({
      key: `i-${chip.id}`,
      label: `~${chip.display_name}`,
      title: `Filtering by institution: ${chip.display_name}`,
      ariaLabel: `Remove ${chip.display_name} institution filter`,
      bg: 'var(--warning-bg)',
      border: 'var(--warning-border)',
      fg: 'var(--warning-foreground)',
      hoverClass: 'hover:bg-[var(--warning-border)]',
      onRemove: () => removeInstitutionChip(chip.id),
    })),
  ];

  // Collapsed: single row, first N chips + "+N more" summary, input always
  // visible. Expanded (focused): chips wrap in an overlay capped at two
  // rows (scrolls beyond) so the navbar itself never changes height.
  const COLLAPSED_CHIP_LIMIT = 2;
  const searchExpanded = pillsExpanded;
  const visibleChips = searchExpanded
    ? chipItems
    : chipItems.slice(0, COLLAPSED_CHIP_LIMIT);
  const hiddenChipCount = chipItems.length - visibleChips.length;

  return (
    <nav className='surface-panel border-app border-b h-16 shrink-0'>
      <div className='flex h-full items-center px-6 max-w-7xl mx-auto gap-6'>
        {/* Brand */}
        <Link
          href='/search'
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
          <span className='text-xl font-semibold tracking-tight'>Paperazzi</span>
        </Link>

        {isSearchPage ? (
          <div className='flex-1 max-w-2xl ml-auto mr-auto group'>
            {/* Fixed-height anchor — the bar overlays content below when it
                expands, so the 64px navbar itself never changes height. */}
            <div className='relative h-11'>
              <div
                className='absolute inset-x-0 top-0 z-40'
                onBlurCapture={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setPillsExpanded(false);
                  }
                }}
              >
                <div className='relative'>
                  {/* Chip facade — chips + real text input share one focus-ring
                      container. Collapsed: single row, first chips + "+N more".
                      Expanded (focused): wraps up to two rows, scrolls beyond. */}
                  <div
                    onClick={() => inputRef.current?.focus()}
                    className={`w-full flex items-center gap-1.5 pl-4 pr-12 py-1.5 min-h-[44px] cursor-text shadow-sm transition focus-within-accent bg-[var(--background-card)] border border-[var(--border-muted)] ${
                      searchExpanded
                        ? 'flex-wrap rounded-[22px] max-h-[76px] overflow-y-auto'
                        : 'flex-nowrap rounded-full overflow-hidden'
                    }`}
                  >
                    {visibleChips.map((c) => (
                      <span
                        key={c.key}
                        className='inline-flex flex-shrink-0 items-center gap-1 pl-2 pr-1 h-7 rounded-md text-xs font-medium border'
                        style={{ background: c.bg, borderColor: c.border, color: c.fg }}
                        title={c.title}
                      >
                        <span className='truncate max-w-[180px]'>{c.label}</span>
                        <button
                          type='button'
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            c.onRemove();
                          }}
                          className={`rounded-full p-0.5 transition ${c.hoverClass}`}
                          aria-label={c.ariaLabel}
                          title='Remove'
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}

                    {/* Overflow summary — click to expand and see everything. */}
                    {!searchExpanded && hiddenChipCount > 0 && (
                      <button
                        type='button'
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPillsExpanded(true);
                        }}
                        className='inline-flex flex-shrink-0 items-center h-7 px-2 rounded-md text-xs font-medium border border-[var(--border-muted)] bg-[var(--surface-muted)] text-app-soft hover:text-app transition'
                        title={`${hiddenChipCount} more filter${hiddenChipCount > 1 ? 's' : ''} — click to show all`}
                        aria-label={`Show ${hiddenChipCount} more filters`}
                      >
                        +{hiddenChipCount} more
                      </button>
                    )}

                    <input
                      ref={inputRef}
                      type='text'
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={handleInputBlur}
                      placeholder={
                        chipItems.length > 0
                          ? ''
                          : 'Search papers, @surname+firstname, #journals, ~institutions…'
                      }
                      className='flex-1 min-w-[80px] outline-none border-none bg-transparent text-sm py-1 placeholder:text-app-soft'
                    />
                  </div>

                  {/* Submit affordance — pinned to the bar's top-right pill end
                      so it stays put when the bar expands. */}
                  <button
                    type='button'
                    onClick={() => handleSearch()}
                    className={`absolute right-0 top-0 h-11 w-11 rounded-r-full inline-flex items-center justify-center transition ${
                      isDirty
                        ? ''
                        : 'text-app-soft hover:text-app hover:bg-[var(--surface-muted)]'
                    }`}
                    style={
                      isDirty
                        ? { background: 'var(--success-bg)', color: 'var(--success-foreground)' }
                        : undefined
                    }
                    title={isDirty ? 'Apply pending changes (Enter)' : 'Search (Enter)'}
                    aria-label={isDirty ? 'Apply pending changes' : 'Search'}
                  >
                    <Search size={18} />
                  </button>
                </div>

              {/* @-mention autocomplete dropdown. */}
              {mentionOpen && mentionSuggestions.length > 0 && (
                <div
                  role='listbox'
                  aria-label='Shortcut suggestions'
                  onScroll={handleMentionListScroll}
                  className='mt-1 surface-panel border border-app rounded-lg shadow-lg overflow-y-auto overscroll-contain max-h-80'
                >
                  {mentionSuggestions.map((sug, idx) => {
                    const active = idx === mentionIdx;
                    const key =
                      sug.kind === 'author'
                        ? `a-${sug.id}`
                        : sug.kind === 'journal'
                          ? `j-${sug.issn}`
                          : `i-${sug.id}`;
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
                          <span className='font-medium truncate'>{sug.display_name}</span>
                          <span className='text-[11px] text-app-soft flex-shrink-0'>{meta}</span>
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
              </div>
            </div>
          </div>
        ) : (
          <div className='hidden ml-6 md:flex items-center gap-2 text-sm text-stone-600 flex-1'>
            {' '}
          </div>
        )}

        {/* Utility cluster: storage viewer, help, about. */}
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

      <StorageModal isOpen={showStorage} onClose={() => setShowStorage(false)} />
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
              <span className='text-xl font-semibold tracking-tight'>Paperazzi</span>
            </div>
          </div>
        </nav>
      }
    >
      <NavBarContent />
    </Suspense>
  );
}
