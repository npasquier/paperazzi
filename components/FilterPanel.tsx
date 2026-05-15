'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Filters, JournalFilterPreset } from '../types/interfaces';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Plus,
  Save,
  Bookmark,
  SlidersHorizontal,
} from 'lucide-react';

import { countIssns, useActiveRanking } from '@/utils/activeRanking';
import {
  migrateFilters,
  migrateJournalFilterPreset,
} from '@/utils/migrateFilters';
import { STORAGE_KEYS } from '@/utils/storageKeys';

export interface FilterPreset {
  id: string;
  name: string;
  query: string;
  filters: Filters;
}
interface FilterPanelProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  query: string;
  openJournalModal: () => void;
  onSortChange?: (sortBy: string) => void;
  onPresetLoad?: (preset: FilterPreset) => void;
  isOpen: boolean;
  onToggle: () => void;
}
const PUBLICATION_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'article', label: 'Journal Article' },
  { value: 'review', label: 'Review' },
  { value: 'preprint', label: 'Preprint' },
  { value: 'book-chapter', label: 'Book Chapter' },
  { value: 'book', label: 'Book' },
  { value: 'dissertation', label: 'Dissertation' },
  { value: 'dataset', label: 'Dataset' },
];
const MAX_PRESETS = 3;
export default function FilterPanel({
  filters,
  setFilters,
  query,
  openJournalModal,
  onSortChange,
  onPresetLoad,
  isOpen,
  onToggle,
}: FilterPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['journals']),
  );
  // Load presets from localStorage on mount. Both reads go through
  // `migrate*` helpers so legacy entries (Journal.category: number,
  // econFilter.categories: number[]) are coerced to the new tier-string
  // shape — saved presets survive the schema migration.
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.filterPresets);
      if (!saved) return [];
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return (parsed as unknown[])
        .map((p): FilterPreset | null => {
          if (!p || typeof p !== 'object') return null;
          const o = p as Record<string, unknown>;
          if (typeof o.id !== 'string' || typeof o.name !== 'string')
            return null;
          return {
            id: o.id,
            name: o.name,
            query: typeof o.query === 'string' ? o.query : '',
            filters: migrateFilters(o.filters),
          };
        })
        .filter((p): p is FilterPreset => p !== null);
    } catch {
      return [];
    }
  });
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // ── Saved journal filters (Wide + Manual snapshot) ───────────────────
  const [journalPresets, setJournalPresets] = useState<JournalFilterPreset[]>(
    () => {
      if (typeof window === 'undefined') return [];
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.journalPresets);
        if (!saved) return [];
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return (parsed as unknown[])
          .map((p) => migrateJournalFilterPreset(p))
          .filter((p): p is JournalFilterPreset => p !== null);
      } catch {
        return [];
      }
    },
  );
  const [showSaveJournalModal, setShowSaveJournalModal] = useState(false);
  const [journalPresetName, setJournalPresetName] = useState('');
  const [activeJournalPresetId, setActiveJournalPresetId] = useState<
    string | null
  >(null);

  // Active ranking scheme — drives the tier/domain pill rows + journal
  // count. Hook returns null on first paint (the dataset chunk-loads),
  // then re-renders once it resolves. Tiers/domains/presets are read
  // straight from the scheme so an imported scheme (medicine, JCR, etc.)
  // automatically replaces the CNRS pills.
  const activeRanking = useActiveRanking();
  const schemeTiers = activeRanking?.tiers ?? [];
  const schemeDomains = activeRanking?.domains ?? [];
  const schemePresets = activeRanking?.presets ?? [];

  // Live count of journals matching the current econ filter — derived
  // synchronously from the active scheme. No data fetch involved here:
  // the scheme is already in memory by the time this component rerenders.
  const econJournalCount = useMemo(() => {
    const econ = filters.econFilter;
    if (!econ?.enabled || !activeRanking) return 0;
    return countIssns(activeRanking, econ.tiers, econ.domains);
  }, [activeRanking, filters.econFilter]);

  const updateJournalPresets = (next: JournalFilterPreset[]) => {
    setJournalPresets(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.journalPresets, JSON.stringify(next));
    }
  };

  const saveCurrentJournalFilters = () => {
    if (!journalPresetName.trim()) return;
    if (journalPresets.length >= MAX_PRESETS) return;
    const econ = filters.econFilter || {
      enabled: false,
      tiers: [],
      domains: [],
    };
    const newPreset: JournalFilterPreset = {
      id: Date.now().toString(),
      name: journalPresetName.trim(),
      econFilter: { ...econ },
      journals: filters.journals.map((j) => ({ ...j })),
      mode: filters.journalFilterMode || 'wide',
    };
    updateJournalPresets([...journalPresets, newPreset]);
    setJournalPresetName('');
    setShowSaveJournalModal(false);
    setActiveJournalPresetId(newPreset.id);
  };

  const loadJournalPreset = (preset: JournalFilterPreset) => {
    setActiveJournalPresetId(preset.id);
    setFilters((prev) => ({
      ...prev,
      econFilter: { ...preset.econFilter },
      journals: preset.journals.map((j) => ({ ...j })),
      journalFilterMode: preset.mode || 'wide',
    }));
  };

  const deleteJournalPreset = (id: string) => {
    updateJournalPresets(journalPresets.filter((p) => p.id !== id));
    if (activeJournalPresetId === id) setActiveJournalPresetId(null);
  };

  // Clear the active saved preset whenever current journals/econFilter
  // diverge from its snapshot (e.g. user toggles a domain or adds a journal).
  useEffect(() => {
    if (!activeJournalPresetId) return;
    const preset = journalPresets.find((p) => p.id === activeJournalPresetId);
    if (!preset) {
      setActiveJournalPresetId(null);
      return;
    }
    const econNow = filters.econFilter || {
      enabled: false,
      tiers: [],
      domains: [],
    };
    const arrEq = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    const issnsNow = new Set(filters.journals.map((j) => j.issn));
    const issnsP = new Set(preset.journals.map((j) => j.issn));
    const journalsMatch =
      issnsNow.size === issnsP.size &&
      [...issnsNow].every((x) => issnsP.has(x));
    const econMatch =
      econNow.enabled === preset.econFilter.enabled &&
      arrEq(econNow.tiers, preset.econFilter.tiers) &&
      arrEq(econNow.domains, preset.econFilter.domains) &&
      (econNow.presetId || null) === (preset.econFilter.presetId || null);
    const modeMatch =
      (filters.journalFilterMode || 'wide') === (preset.mode || 'wide');
    if (!journalsMatch || !econMatch || !modeMatch)
      setActiveJournalPresetId(null);
    // We intentionally exclude `journalPresets` from deps — list edits
    // (delete/save) are handled by their own setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.journals,
    filters.econFilter,
    filters.journalFilterMode,
    activeJournalPresetId,
  ]);

  // ─────────────────────────────────────────────────────────────────────

  // Save presets to localStorage whenever they change
  const updatePresets = (newPresets: FilterPreset[]) => {
    setPresets(newPresets);
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEYS.filterPresets,
        JSON.stringify(newPresets),
      );
    }
  };
  const saveCurrentFilters = () => {
    if (!presetName.trim()) return;
    if (presets.length >= MAX_PRESETS) return;
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      query: query,
      filters: { ...filters },
    };
    updatePresets([...presets, newPreset]);
    setPresetName('');
    setShowSaveModal(false);
    setActivePresetId(newPreset.id);
  };
  const loadPreset = (preset: FilterPreset) => {
    setActivePresetId(preset.id);
    if (onPresetLoad) {
      onPresetLoad(preset);
    }
  };
  const deletePreset = (presetId: string) => {
    updatePresets(presets.filter((p) => p.id !== presetId));
    if (activePresetId === presetId) {
      setActivePresetId(null);
    }
  };
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };
  const removeJournal = (issn: string) => {
    setFilters((prev) => ({
      ...prev,
      journals: prev.journals.filter((j) => j.issn !== issn),
    }));
    setActivePresetId(null);
  };
  // (removeAuthor / removeInstitution were used by the Authors and
  // Institutions sections that this panel used to render. Both
  // sections moved into the navbar's chip facade; chip removal is
  // owned there. Re-add these handlers if you re-introduce the panel
  // sections.)
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value;
    setFilters((prev) => ({ ...prev, sortBy: newSort }));
    if (onSortChange) {
      onSortChange(newSort);
    }
    setActivePresetId(null);
  };
  const handlePublicationTypeChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setFilters((prev) => ({ ...prev, publicationType: e.target.value }));
    setActivePresetId(null);
  };
  const journalActiveCount = (() => {
    const mode = filters.journalFilterMode || 'wide';
    if (mode === 'wide') return filters.econFilter?.enabled ? 1 : 0;
    return filters.journals.length;
  })();
  const activeFilterCount =
    journalActiveCount +
    filters.authors.length +
    filters.institutions.length +
    (filters.publicationType ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);
  // Collapsed panel
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className='fixed left-0 top-1/2 -translate-y-1/2 z-40 surface-panel border border-app border-l-0 rounded-r-lg p-2 shadow-sm hover:bg-[var(--surface-muted)] transition'
        title='Open filters'
      >
        <div className='flex flex-col items-center gap-1'>
          <Filter
            size={18}
            className={
              activeFilterCount > 0 ? 'text-stone-800' : 'text-stone-400'
            }
          />
          {activeFilterCount > 0 && (
            <span className='text-xs font-medium text-stone-600'>
              {activeFilterCount}
            </span>
          )}
        </div>
      </button>
    );
  }
  // Render a badge/pill
  const renderPill = (key: string, label: string, onRemove: () => void) => (
    <span
      key={key}
      className='inline-flex items-center gap-1 px-2 py-1 chip-muted rounded text-xs group'
    >
      <span className='truncate max-w-[140px]'>{label}</span>
      <button
        onClick={onRemove}
        className='text-stone-400 hover:text-stone-600 transition'
        aria-label={`Remove ${label}`}
      >
        <X size={12} />
      </button>
    </span>
  );

  // Compute `enabled` from the rest of the wide-filter state. Wide filter is
  // active iff any of: a preset is selected, an ISSN whitelist is set, or
  // any tier/domain is picked.
  type EconState = NonNullable<Filters['econFilter']>;
  const reconcileEcon = (e: Partial<EconState>): EconState => {
    const merged: EconState = {
      enabled: false,
      tiers: [],
      domains: [],
      presetId: null,
      issns: undefined,
      ...e,
    };
    const hasPreset = !!merged.presetId;
    const hasIssns = !!merged.issns?.length;
    const hasTiers = merged.tiers.length > 0;
    const hasDoms = merged.domains.length > 0;
    merged.enabled = hasPreset || hasIssns || hasTiers || hasDoms;
    return merged;
  };

  // (renderSection used to be the generic body for the Authors and
  // Institutions collapsible sections. With both sections gone, this
  // helper has no callers. Kept the comment as documentation; the
  // body was removed to satisfy the unused-variable lint.)
  return (
    <aside className='w-64 surface-panel border-r border-app flex flex-col h-full overflow-hidden'>
      {/* Header */}
      <div className='px-4 py-3 border-b border-app flex-shrink-0'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Filter size={14} className='text-stone-400' />
            <span className='text-sm font-medium text-stone-700'>Filters</span>
            {activeFilterCount > 0 && (
              <span className='text-xs badge-accent px-1.5 py-0.5 rounded'>
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            onClick={onToggle}
            className='p-1 hover:bg-[var(--surface-muted)] rounded transition'
            title='Close filters'
          >
            <ChevronLeft size={16} className='text-stone-400' />
          </button>
        </div>
      </div>
      {/* Save Journal-Filter Modal */}
      {showSaveJournalModal && (
        <div className='fixed inset-0 overlay-soft flex items-center justify-center z-50'>
          <div className='surface-card border border-app rounded-lg p-4 max-w-sm w-full mx-4 shadow-lg'>
            <h3 className='text-sm font-medium text-stone-900 mb-3'>
              Save Journal Filter
            </h3>
            <div className='mb-3 p-2 surface-muted rounded text-xs text-stone-600 space-y-0.5'>
              <div>
                <span className='text-stone-500'>Wide: </span>
                {filters.econFilter?.enabled
                  ? filters.econFilter?.presetId
                    ? `preset "${filters.econFilter.presetId}"`
                    : `tiers=${
                        filters.econFilter?.tiers.length
                          ? filters.econFilter.tiers.join(',')
                          : 'all'
                      } · doms=${
                        filters.econFilter?.domains.length
                          ? filters.econFilter.domains.join(',')
                          : 'all'
                      }`
                  : 'off'}
              </div>
              <div>
                <span className='text-stone-500'>Manual: </span>
                {filters.journals.length > 0
                  ? `${filters.journals.length} journal${
                      filters.journals.length === 1 ? '' : 's'
                    }`
                  : 'none'}
              </div>
            </div>
            <input
              type='text'
              value={journalPresetName}
              onChange={(e) => setJournalPresetName(e.target.value)}
              placeholder='Enter preset name'
              className='w-full px-3 py-2 border border-app rounded focus-accent text-sm mb-3'
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCurrentJournalFilters();
                if (e.key === 'Escape') {
                  setShowSaveJournalModal(false);
                  setJournalPresetName('');
                }
              }}
            />
            <div className='flex justify-end gap-2'>
              <button
                onClick={() => {
                  setShowSaveJournalModal(false);
                  setJournalPresetName('');
                }}
                className='px-3 py-1.5 text-xs text-app-muted hover:text-app'
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentJournalFilters}
                disabled={!journalPresetName.trim()}
                className='px-3 py-1.5 text-xs button-primary rounded disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Save Modal */}
      {showSaveModal && (
        <div className='fixed inset-0 overlay-soft flex items-center justify-center z-50'>
          <div className='surface-card border border-app rounded-lg p-4 max-w-sm w-full mx-4 shadow-lg'>
            <h3 className='text-sm font-medium text-stone-900 mb-3'>
              Save Search
            </h3>
            {query && (
              <div className='mb-3 p-2 surface-muted rounded text-xs text-stone-600'>
                <span className='text-stone-500'>Query: </span>
                {query}
              </div>
            )}
            <input
              type='text'
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder='Enter preset name'
              className='w-full px-3 py-2 border border-app rounded focus-accent text-sm mb-3'
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCurrentFilters();
                if (e.key === 'Escape') {
                  setShowSaveModal(false);
                  setPresetName('');
                }
              }}
            />
            <div className='flex justify-end gap-2'>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setPresetName('');
                }}
                className='px-3 py-1.5 text-xs text-app-muted hover:text-app'
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentFilters}
                disabled={!presetName.trim()}
                className='px-3 py-1.5 text-xs button-primary rounded disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Scrollable content */}
      <div className='app-scrollbar flex-1 overflow-y-auto'>
        {/* Sort By — sobered to a borderless inline control that
            matches the PinSidebar collection-switcher pattern. The
            native <select> is preserved (browser-native menu, free
            keyboard nav, mobile-friendly picker); only the chrome is
            removed. `appearance-none` strips the system chevron, a
            lucide ChevronDown is overlaid on the right via
            `pointer-events-none` so it doesn't intercept the click.
            Hover gives back the affordance: text darkens and the row
            picks up a subtle `surface-muted` fill. */}
        <div className='px-4 py-4 border-b border-app-muted'>
          <label className='text-xs text-app-soft block mb-1.5'>Sort by</label>
          <div className='relative group'>
            <select
              value={filters.sortBy}
              onChange={handleSortChange}
              className='w-full appearance-none bg-transparent border-0 pl-1 pr-6 py-1 text-sm text-stone-700 group-hover:text-stone-900 group-hover:bg-[var(--surface-muted)] cursor-pointer rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition'
            >
              <option value='relevance_score'>Relevance</option>
              <option value='publication_date:desc'>Most Recent</option>
              <option value='cited_by_count:desc'>Most Cited</option>
              <option value='publication_date:asc'>Oldest First</option>
            </select>
            <ChevronDown
              size={12}
              aria-hidden='true'
              className='absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 group-hover:text-stone-600 pointer-events-none transition'
            />
          </div>
        </div>

        {/* Collapsible filter sections */}
        <div className='px-4'>
          {/* (Saved searches moved to a footer-style block at the
              bottom of the panel — see the section below Type & Year.
              Kept out of the primary scan path because it's a power-
              user / returning-user affordance, not a per-search edit.) */}
          {/* Journals — section header row is a flex container
              instead of one big button, because we want a secondary
              entry point (Personalize ranking → /rankings) next to
              the section title without nesting buttons. The toggle
              button still spans the chevron + label region so the
              click target stays generous. */}
          <div className='border-b border-app-muted'>
            <div className='w-full flex items-center justify-between py-4'>
              <span className='text-xs text-app-soft'>Journals</span>
              <div className='flex items-center gap-2'>
                {(() => {
                  const mode = filters.journalFilterMode || 'wide';
                  if (mode === 'wide' && filters.econFilter?.enabled) {
                    return (
                      <span className='text-xs badge-neutral px-1.5 py-0.5 rounded'>
                        Wide
                      </span>
                    );
                  }
                  if (mode === 'specific' && filters.journals.length > 0) {
                    return (
                      <span className='text-xs badge-neutral px-1.5 py-0.5 rounded'>
                        {filters.journals.length}
                      </span>
                    );
                  }
                  return null;
                })()}
                {/* Personalize ranking — the journal-filter UI is
                    sourced from the active RankingScheme (tiers,
                    domains, ISSN whitelist), so the most contextual
                    place to edit that scheme is right here in the
                    section header. Used to be in the navbar Tools
                    dropdown; promoted here when the navbar was
                    sobered up. */}
                <Link
                  href='/rankings'
                  className='inline-flex items-center gap-1 text-[10px] text-app-soft hover:text-app underline-offset-2 hover:underline transition px-1 py-0.5'
                  title='Personalize the journal ranking scheme — tiers, domains, journals'
                >
                  <SlidersHorizontal size={11} />
                  <span>Personalize</span>
                </Link>
              </div>
            </div>
            {expandedSections.has('journals') && (
              <div className='pb-3 pl-0'>
                {/* Mode toggle: which subsection feeds the search */}
                {(() => {
                  const mode = filters.journalFilterMode || 'wide';
                  const setMode = (next: 'wide' | 'specific' | 'off') => {
                    if (next === mode) return;
                    setFilters((prev) => ({
                      ...prev,
                      journalFilterMode: next,
                    }));
                    setActivePresetId(null);
                  };
                  const tabClass = (active: boolean) =>
                    `flex-1 px-2 py-1 rounded transition ${
                      active
                        ? 'surface-card text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`;
                  return (
                    <div className='flex items-center gap-1 p-0.5 mb-3 surface-subtle rounded text-[11px]'>
                      <button
                        onClick={() => setMode('wide')}
                        className={tabClass(mode === 'wide')}
                      >
                        Wide
                      </button>
                      <button
                        onClick={() => setMode('specific')}
                        className={tabClass(mode === 'specific')}
                      >
                        Specific
                      </button>
                      <button
                        onClick={() => setMode('off')}
                        className={tabClass(mode === 'off')}
                        title='Pause journal filtering — selections are kept but inactive.'
                      >
                        Off
                      </button>
                    </div>
                  );
                })()}

                {/* ─── Subsection: Wide filter (only visible in wide mode) ── */}
                {(filters.journalFilterMode || 'wide') === 'wide' &&
                  (() => {
                    const econ = filters.econFilter || reconcileEcon({});
                    const hasIssnWhitelist = !!econ.issns?.length;
                    return (
                      <div className='mb-3'>
                        <p className='text-[10px] uppercase tracking-wider text-app-soft mb-1.5'>
                          Wide filter
                        </p>

                        {/* Preset pills — sourced from the active ranking
                          scheme so an imported scheme can ship its own
                          shortcuts (e.g. "Q1 only" for a JCR-style ranking). */}
                        <div className='flex flex-wrap gap-1 mb-2'>
                          {schemePresets.map((preset) => {
                            const isActive = econ.presetId === preset.id;
                            return (
                              <button
                                key={preset.id}
                                onClick={() => {
                                  setFilters((prev) => ({
                                    ...prev,
                                    econFilter: reconcileEcon(
                                      isActive
                                        ? {} // deselect → empty state
                                        : {
                                            tiers: preset.tiers
                                              ? [...preset.tiers]
                                              : [],
                                            domains: preset.domains
                                              ? [...preset.domains]
                                              : [],
                                            presetId: preset.id,
                                            issns: preset.issns
                                              ? [...preset.issns]
                                              : undefined,
                                          },
                                    ),
                                    // Picking any wide pill auto-switches mode.
                                    journalFilterMode: 'wide',
                                  }));
                                  setActivePresetId(null);
                                }}
                                className={`px-2 py-0.5 text-[11px] rounded transition ${
                                  isActive
                                    ? 'button-primary'
                                    : 'surface-muted text-stone-500 hover:bg-[var(--surface-subtle)]'
                                }`}
                              >
                                {preset.name}
                              </button>
                            );
                          })}
                        </div>

                        {/* Note when an ISSN-whitelist preset is active */}
                        {hasIssnWhitelist && (
                          <p className='text-[10px] text-app-soft mb-2'>
                            Using whitelist of {econ.issns!.length} journals —
                            tier & domain rows have no effect.
                          </p>
                        )}

                        {/* Tier row — keys come from the active scheme.
                          Selecting every tier collapses to "all" (empty),
                          mirroring the previous behaviour for CNRS 1..4. */}
                        <div
                          className={`mb-2 ${
                            hasIssnWhitelist ? 'opacity-50' : ''
                          }`}
                        >
                          <p className='text-[11px] text-app-soft mb-1'>Tier</p>
                          <div className='flex gap-1'>
                            {schemeTiers.map((tier) => {
                              // Only highlight when the wide filter is actually
                              // engaged — default WIDE state (nothing selected)
                              // shows no buttons highlighted.
                              const isSelected =
                                econ.enabled &&
                                !hasIssnWhitelist &&
                                (econ.tiers.length === 0 ||
                                  econ.tiers.includes(tier.key));
                              return (
                                <button
                                  key={tier.key}
                                  title={tier.label || undefined}
                                  onClick={() => {
                                    setFilters((prev) => {
                                      const current =
                                        prev.econFilter?.tiers || [];
                                      let next: string[];
                                      if (current.length === 0) {
                                        next = [tier.key];
                                      } else if (current.includes(tier.key)) {
                                        next = current.filter(
                                          (c) => c !== tier.key,
                                        );
                                      } else {
                                        next = [...current, tier.key];
                                      }
                                      // Note: we deliberately do NOT auto-
                                      // collapse to empty when every tier is
                                      // selected. Functionally that produces
                                      // the same ISSN list (all journals
                                      // match), but the user reads the empty
                                      // state as "my selection just reset
                                      // itself". Leaving the explicit
                                      // selection keeps the UI honest — the
                                      // "All" pill below is the dedicated way
                                      // to clear.
                                      return {
                                        ...prev,
                                        econFilter: reconcileEcon({
                                          tiers: next,
                                          domains:
                                            prev.econFilter?.domains || [],
                                          // manual edit clears any active preset
                                          presetId: null,
                                          issns: undefined,
                                        }),
                                        journalFilterMode: 'wide',
                                      };
                                    });
                                    setActivePresetId(null);
                                  }}
                                  className={`px-2 py-0.5 text-[11px] rounded transition ${
                                    isSelected
                                      ? 'button-primary'
                                      : 'surface-muted text-stone-400 hover:bg-[var(--surface-subtle)]'
                                  }`}
                                >
                                  {/* Compact pills: show the stable key
                                    (e.g. "1", "Q1") with the human label
                                    surfaced as a tooltip on hover. */}
                                  {tier.key}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => {
                                setFilters((prev) => ({
                                  ...prev,
                                  econFilter: reconcileEcon({
                                    tiers: [],
                                    domains: prev.econFilter?.domains || [],
                                    presetId: null,
                                    issns: undefined,
                                  }),
                                  journalFilterMode: 'wide',
                                }));
                                setActivePresetId(null);
                              }}
                              className={`px-2 py-0.5 text-[11px] rounded transition ${
                                !hasIssnWhitelist &&
                                econ.tiers.length === 0 &&
                                econ.enabled
                                  ? 'button-primary'
                                  : 'surface-muted text-stone-400 hover:bg-[var(--surface-subtle)]'
                              }`}
                            >
                              All
                            </button>
                          </div>
                        </div>

                        {/* Domain row — dimmed + unhighlighted under whitelist */}
                        <div className={hasIssnWhitelist ? 'opacity-50' : ''}>
                          <p className='text-[11px] text-app-soft mb-1'>
                            Domain
                          </p>
                          <div className='flex flex-wrap gap-1 max-h-24 overflow-y-auto'>
                            {schemeDomains.map(({ key, label }) => {
                              const isSelected =
                                econ.enabled &&
                                !hasIssnWhitelist &&
                                (econ.domains.length === 0 ||
                                  econ.domains.includes(key));
                              return (
                                <button
                                  key={key}
                                  title={label || undefined}
                                  onClick={() => {
                                    setFilters((prev) => {
                                      const current =
                                        prev.econFilter?.domains || [];
                                      let next: string[];
                                      if (current.length === 0) {
                                        next = [key];
                                      } else if (current.includes(key)) {
                                        next = current.filter((d) => d !== key);
                                      } else {
                                        next = [...current, key];
                                      }
                                      // Same rationale as the tier row: no
                                      // auto-collapse when every domain is
                                      // selected — the "Reset to all" link
                                      // below is the explicit way out.
                                      return {
                                        ...prev,
                                        econFilter: reconcileEcon({
                                          tiers: prev.econFilter?.tiers || [],
                                          domains: next,
                                          presetId: null,
                                          issns: undefined,
                                        }),
                                        journalFilterMode: 'wide',
                                      };
                                    });
                                    setActivePresetId(null);
                                  }}
                                  className={`px-1.5 py-0.5 text-[10px] rounded transition ${
                                    isSelected
                                      ? 'button-primary'
                                      : 'surface-muted text-stone-400 hover:bg-[var(--surface-subtle)]'
                                  }`}
                                >
                                  {/* Pill shows the stable key (e.g. "GEN",
                                    "AgrEnEnv"); tooltip carries the full
                                    human label. */}
                                  {key}
                                </button>
                              );
                            })}
                          </div>
                          {econ.domains.length > 0 && !hasIssnWhitelist && (
                            <button
                              onClick={() => {
                                setFilters((prev) => ({
                                  ...prev,
                                  econFilter: reconcileEcon({
                                    tiers: prev.econFilter?.tiers || [],
                                    domains: [],
                                    presetId: null,
                                    issns: undefined,
                                  }),
                                  journalFilterMode: 'wide',
                                }));
                                setActivePresetId(null);
                              }}
                              className='text-[10px] text-app-soft hover:text-app-muted mt-1'
                            >
                              Reset to all
                            </button>
                          )}
                        </div>

                        {/* Journal count (only when wide is active) */}
                        {econ.enabled && (
                          <p className='text-[10px] text-app-soft mt-1.5'>
                            {hasIssnWhitelist
                              ? `${econ.issns!.length} journals (whitelist)`
                              : `${econJournalCount} journals selected`}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                {/* ─── Subsection: Manual selection (only in specific mode) ── */}
                {(filters.journalFilterMode || 'wide') === 'specific' && (
                  <div className='mb-3'>
                    <p className='text-[10px] uppercase tracking-wider text-app-soft mb-1.5'>
                      Manual selection
                    </p>
                    {filters.journals.length > 0 && (
                      <div className='flex flex-wrap gap-1.5 mb-2 max-h-32 overflow-y-auto pr-1'>
                        {filters.journals.map((j) =>
                          renderPill(j.issn, j.name || 'Unknown Journal', () =>
                            removeJournal(j.issn),
                          ),
                        )}
                      </div>
                    )}
                    <button
                      onClick={openJournalModal}
                      className='inline-flex items-center gap-1 text-xs text-app-soft hover:text-app-muted transition'
                    >
                      <Plus size={14} />
                      Select journals
                    </button>
                  </div>
                )}

                {/* ─── Subsection: Saved journal filters ───────────────── */}
                <div>
                  <p className='text-[10px] uppercase tracking-wider text-app-soft mb-1.5'>
                    Saved journal filters
                  </p>
                  {journalPresets.length > 0 ? (
                    <div className='space-y-0.5 mb-2'>
                      {journalPresets.map((preset) => {
                        const isActive = activeJournalPresetId === preset.id;
                        return (
                          <div
                            key={preset.id}
                            className='flex items-center justify-between gap-2 group'
                          >
                            <button
                              onClick={() => loadJournalPreset(preset)}
                              className={`flex-1 text-left px-2 py-1 rounded text-xs transition flex items-center gap-1.5 ${
                                isActive
                                  ? 'surface-muted text-stone-700'
                                  : 'text-stone-500 hover:bg-[var(--surface-muted)] hover:text-stone-700'
                              }`}
                              title={`Wide: ${
                                preset.econFilter.enabled ? 'on' : 'off'
                              } · ${preset.journals.length} manual`}
                            >
                              <Bookmark
                                size={10}
                                className='text-app-soft flex-shrink-0'
                              />
                              <span className='truncate'>{preset.name}</span>
                            </button>
                            <button
                              onClick={() => deleteJournalPreset(preset.id)}
                              className='opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-stone-500 transition'
                              title='Delete'
                            >
                              <X size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className='text-[11px] text-app-soft mb-2'>
                      No saved journal filters yet
                    </div>
                  )}
                  {journalPresets.length < MAX_PRESETS &&
                  (filters.journals.length > 0 ||
                    filters.econFilter?.enabled) ? (
                    <button
                      onClick={() => setShowSaveJournalModal(true)}
                      className='inline-flex items-center gap-1 text-[11px] text-app-soft hover:text-app-muted transition'
                    >
                      <Save size={11} />
                      Save current
                    </button>
                  ) : journalPresets.length >= MAX_PRESETS ? (
                    <div className='text-[11px] text-app-soft'>
                      Max {MAX_PRESETS} presets
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Authors and Institutions sections used to live here.
              Both moved into the navbar's chip facade — authors via
              the existing `@partial` autocomplete, institutions via
              a new `~partial` autocomplete with the same pagination
              and chip-rendering pattern. Removing the two sections
              from the panel keeps the filter-by-entity flow in one
              place and shortens the left rail. The `removeAuthor`,
              `removeInstitution`, `openAuthorModal`, and
              `openInstitutionModal` bindings are kept (currently
              unused) so this is reversible — re-add the
              `renderSection` calls and the panel works again. */}
        </div>
        {/* Type & Year */}
        <div className='px-4 py-4 border-t border-app-muted space-y-4'>
          <div>
            <label className='text-xs text-app-soft block mb-1.5'>Type</label>
            {/* Type — same sobered pattern as Sort By: borderless
                inline select with a lucide chevron overlay. See the
                Sort By comment above for rationale. */}
            <div className='relative group'>
              <select
                value={filters.publicationType}
                onChange={handlePublicationTypeChange}
                className='w-full appearance-none bg-transparent border-0 pl-1 pr-6 py-1 text-sm text-stone-700 group-hover:text-stone-900 group-hover:bg-[var(--surface-muted)] cursor-pointer rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition'
              >
                {PUBLICATION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                aria-hidden='true'
                className='absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 group-hover:text-stone-600 pointer-events-none transition'
              />
            </div>
          </div>
          <div>
            <label className='text-xs text-app-soft block mb-1.5'>Year</label>
            <div className='flex items-center gap-2'>
              <input
                type='number'
                value={filters.dateFrom}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, dateFrom: e.target.value }));
                  setActivePresetId(null);
                }}
                placeholder='From'
                className='w-full px-2 py-1.5 border border-app rounded focus-accent text-sm'
              />
              <span className='text-app-soft'>–</span>
              <input
                type='number'
                value={filters.dateTo}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }));
                  setActivePresetId(null);
                }}
                placeholder='To'
                className='w-full px-2 py-1.5 border border-app rounded focus-accent text-sm'
              />
            </div>
          </div>
        </div>
        {/* Saved searches — footer-style section at the very bottom of
            the panel. Rendered as a quiet collapsible row so the
            primary scan path stays focused on per-search controls
            (Sort, Journals, Type & Year). The disclosure chevron sits
            on the right, reading as a settings/utility affordance
            rather than a primary section header. */}
        <div className='px-4 py-2.5 border-t border-app-muted'>
          <button
            onClick={() => toggleSection('presets')}
            className='w-full flex items-center justify-between gap-2 group'
            aria-expanded={expandedSections.has('presets')}
            title='Saved searches'
          >
            <span className='text-[11px] uppercase tracking-wider text-app-soft group-hover:text-app-muted transition'>
              Saved searches
              {presets.length > 0 && (
                <span className='ml-1.5 normal-case tracking-normal text-app-soft'>
                  ({presets.length})
                </span>
              )}
            </span>
            {expandedSections.has('presets') ? (
              <ChevronDown size={12} className='text-app-soft' />
            ) : (
              <ChevronRight size={12} className='text-app-soft' />
            )}
          </button>
          {expandedSections.has('presets') && (
            <div className='pt-2'>
              {presets.length > 0 && (
                <div className='space-y-0.5 mb-2'>
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className='flex items-center justify-between gap-2 group'
                    >
                      <button
                        onClick={() => loadPreset(preset)}
                        className={`flex-1 text-left px-2 py-1 rounded text-xs transition ${
                          activePresetId === preset.id
                            ? 'surface-muted text-stone-700'
                            : 'text-stone-500 hover:bg-[var(--surface-muted)] hover:text-stone-700'
                        }`}
                        title={
                          preset.query ? `Query: ${preset.query}` : 'No query'
                        }
                      >
                        {preset.name}
                        {preset.query && (
                          <span className='text-app-soft ml-1 text-[11px]'>
                            · {preset.query.slice(0, 15)}
                            {preset.query.length > 15 ? '...' : ''}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => deletePreset(preset.id)}
                        className='opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-stone-500 transition'
                        title='Delete'
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {presets.length < MAX_PRESETS && activeFilterCount > 0 && (
                <button
                  onClick={() => setShowSaveModal(true)}
                  className='inline-flex items-center gap-1 text-[11px] text-app-soft hover:text-app-muted transition'
                >
                  <Save size={11} />
                  Save current
                </button>
              )}
              {presets.length >= MAX_PRESETS && (
                <div className='text-[11px] text-app-soft'>
                  Max {MAX_PRESETS} presets
                </div>
              )}
              {presets.length === 0 && (
                <div className='text-[11px] text-app-soft'>
                  No saved searches yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
