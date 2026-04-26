'use client';
import { useState, useEffect } from 'react';
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
} from 'lucide-react';

import {
  ECON_DOMAINS,
  ECON_CATEGORIES,
  ECON_PRESETS,
} from '@/data/econDomains';
import econJournalList from '@/data/journals';

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
  openAuthorModal: () => void;
  openInstitutionModal: () => void;
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
  openAuthorModal,
  openInstitutionModal,
  onSortChange,
  onPresetLoad,
  isOpen,
  onToggle,
}: FilterPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['journals']),
  );
  // Load presets from localStorage on mount
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('filterPresets');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // ── Saved journal filters (Wide + Manual snapshot) ───────────────────
  const [journalPresets, setJournalPresets] = useState<JournalFilterPreset[]>(
    () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('journal-filter-presets');
        return saved ? JSON.parse(saved) : [];
      }
      return [];
    },
  );
  const [showSaveJournalModal, setShowSaveJournalModal] = useState(false);
  const [journalPresetName, setJournalPresetName] = useState('');
  const [activeJournalPresetId, setActiveJournalPresetId] = useState<
    string | null
  >(null);

  const updateJournalPresets = (next: JournalFilterPreset[]) => {
    setJournalPresets(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('journal-filter-presets', JSON.stringify(next));
    }
  };

  const saveCurrentJournalFilters = () => {
    if (!journalPresetName.trim()) return;
    if (journalPresets.length >= MAX_PRESETS) return;
    const econ = filters.econFilter || {
      enabled: false,
      categories: [],
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
      categories: [],
      domains: [],
    };
    const arrEq = (a: readonly (string | number)[], b: readonly (string | number)[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    const issnsNow = new Set(filters.journals.map((j) => j.issn));
    const issnsP = new Set(preset.journals.map((j) => j.issn));
    const journalsMatch =
      issnsNow.size === issnsP.size &&
      [...issnsNow].every((x) => issnsP.has(x));
    const econMatch =
      econNow.enabled === preset.econFilter.enabled &&
      arrEq(econNow.categories, preset.econFilter.categories) &&
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
      localStorage.setItem('filterPresets', JSON.stringify(newPresets));
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
  const removeAuthor = (authorId: string) => {
    setFilters((prev) => ({
      ...prev,
      authors: prev.authors.filter((a) => a.id !== authorId),
    }));
    setActivePresetId(null);
  };
  const removeInstitution = (instId: string) => {
    setFilters((prev) => ({
      ...prev,
      institutions: prev.institutions.filter((i) => i.id !== instId),
    }));
    setActivePresetId(null);
  };
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
        className='fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-white border border-l-0 border-stone-200 rounded-r-lg p-2 shadow-sm hover:bg-stone-50 transition'
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
      className='inline-flex items-center gap-1 px-2 py-1 bg-stone-100 text-stone-700 rounded text-xs group'
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

  const getEconJournalCount = () => {
    if (!filters.econFilter?.enabled) return 0;
    let filtered = econJournalList as any[];
    const cats = filters.econFilter.categories;
    const doms = filters.econFilter.domains;
    if (cats.length > 0)
      filtered = filtered.filter((j: any) => cats.includes(j.category));
    if (doms.length > 0)
      filtered = filtered.filter((j: any) => doms.includes(j.domain));
    return filtered.length;
  };

  // Compute `enabled` from the rest of the wide-filter state. Wide filter is
  // active iff any of: a preset is selected, an ISSN whitelist is set, or
  // any category/domain is picked.
  type EconState = NonNullable<Filters['econFilter']>;
  const reconcileEcon = (e: Partial<EconState>): EconState => {
    const merged: EconState = {
      enabled: false,
      categories: [],
      domains: [],
      presetId: null,
      issns: undefined,
      ...e,
    };
    const hasPreset = !!merged.presetId;
    const hasIssns = !!merged.issns?.length;
    const hasCats = merged.categories.length > 0;
    const hasDoms = merged.domains.length > 0;
    merged.enabled = hasPreset || hasIssns || hasCats || hasDoms;
    return merged;
  };

  // Render collapsible section
  const renderSection = (
    id: string,
    label: string,
    count: number,
    onAdd: () => void,
    items: { key: string; label: string; onRemove: () => void }[],
  ) => {
    const isExpanded = expandedSections.has(id);
    return (
      <div className='border-b border-stone-100 last:border-b-0'>
        <button
          onClick={() => toggleSection(id)}
          className='w-full flex items-center justify-between py-3 hover:bg-stone-50 transition'
        >
          <div className='flex items-center gap-2'>
            {isExpanded ? (
              <ChevronDown size={14} className='text-stone-400' />
            ) : (
              <ChevronRight size={14} className='text-stone-400' />
            )}
            <span className='text-sm text-stone-600'>{label}</span>
          </div>
          {count > 0 && (
            <span className='text-xs bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded'>
              {count}
            </span>
          )}
        </button>
        {isExpanded && (
          <div className='pb-3 pl-6'>
            {items.length > 0 && (
              <div className='flex flex-wrap gap-1.5 mb-2'>
                {items.map((item) =>
                  renderPill(item.key, item.label, item.onRemove),
                )}
              </div>
            )}
            <button
              onClick={onAdd}
              className='inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition'
            >
              <Plus size={12} />
              Add
            </button>
          </div>
        )}
      </div>
    );
  };
  return (
    <aside className='w-64 bg-white border-r border-stone-200 flex flex-col h-full overflow-hidden'>
      {/* Header */}
      <div className='px-4 py-3 border-b border-stone-200 flex-shrink-0'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Filter size={14} className='text-stone-400' />
            <span className='text-sm font-medium text-stone-700'>Filters</span>
            {activeFilterCount > 0 && (
              <span className='text-xs bg-stone-800 text-white px-1.5 py-0.5 rounded'>
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            onClick={onToggle}
            className='p-1 hover:bg-stone-100 rounded transition'
            title='Close filters'
          >
            <ChevronLeft size={16} className='text-stone-400' />
          </button>
        </div>
      </div>
      {/* Save Journal-Filter Modal */}
      {showSaveJournalModal && (
        <div className='fixed inset-0 bg-black/30 flex items-center justify-center z-50'>
          <div className='bg-white rounded-lg p-4 max-w-sm w-full mx-4 shadow-lg'>
            <h3 className='text-sm font-medium text-stone-900 mb-3'>
              Save Journal Filter
            </h3>
            <div className='mb-3 p-2 bg-stone-50 rounded text-xs text-stone-600 space-y-0.5'>
              <div>
                <span className='text-stone-500'>Wide: </span>
                {filters.econFilter?.enabled
                  ? filters.econFilter?.presetId
                    ? `preset "${filters.econFilter.presetId}"`
                    : `cats=${
                        filters.econFilter?.categories.length
                          ? filters.econFilter.categories.join(',')
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
              className='w-full px-3 py-2 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm mb-3'
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
                className='px-3 py-1.5 text-xs text-stone-600 hover:text-stone-700'
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentJournalFilters}
                disabled={!journalPresetName.trim()}
                className='px-3 py-1.5 text-xs bg-stone-700 text-white rounded hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Save Modal */}
      {showSaveModal && (
        <div className='fixed inset-0 bg-black/30 flex items-center justify-center z-50'>
          <div className='bg-white rounded-lg p-4 max-w-sm w-full mx-4 shadow-lg'>
            <h3 className='text-sm font-medium text-stone-900 mb-3'>
              Save Search
            </h3>
            {query && (
              <div className='mb-3 p-2 bg-stone-50 rounded text-xs text-stone-600'>
                <span className='text-stone-500'>Query: </span>
                {query}
              </div>
            )}
            <input
              type='text'
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder='Enter preset name'
              className='w-full px-3 py-2 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm mb-3'
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
                className='px-3 py-1.5 text-xs text-stone-600 hover:text-stone-700'
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentFilters}
                disabled={!presetName.trim()}
                className='px-3 py-1.5 text-xs bg-stone-700 text-white rounded hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto'>
        {/* Sort By */}
        <div className='px-4 py-3 border-b border-stone-100'>
          <label className='text-xs text-stone-400 block mb-1.5'>Sort by</label>
          <select
            value={filters.sortBy}
            onChange={handleSortChange}
            className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm bg-white text-stone-700'
          >
            <option value='relevance_score'>Relevance</option>
            <option value='publication_date:desc'>Most Recent</option>
            <option value='cited_by_count:desc'>Most Cited</option>
            <option value='publication_date:asc'>Oldest First</option>
          </select>
        </div>

        {/* Collapsible filter sections */}
        <div className='px-4'>
          {/* Saved Presets - Collapsible and Discrete */}
          <div className='border-b border-stone-100'>
            <button
              onClick={() => toggleSection('presets')}
              className='w-full flex items-center justify-between py-2.5 hover:bg-stone-50 transition'
            >
              <div className='flex items-center gap-2'>
                {expandedSections.has('presets') ? (
                  <ChevronDown size={12} className='text-stone-300' />
                ) : (
                  <ChevronRight size={12} className='text-stone-300' />
                )}
                <span className='text-xs text-stone-400'>Saved Searches</span>
              </div>
              {/* {presets.length > 0 && (
                <span className='text-xs text-stone-400'>{presets.length}</span>
              )} */}
            </button>
            {expandedSections.has('presets') && (
              <div className='pb-2.5 pl-5'>
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
                              ? 'bg-stone-100 text-stone-700'
                              : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
                          }`}
                          title={
                            preset.query ? `Query: ${preset.query}` : 'No query'
                          }
                        >
                          {preset.name}
                          {preset.query && (
                            <span className='text-stone-400 ml-1 text-[11px]'>
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
                    className='inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 transition'
                  >
                    <Save size={11} />
                    Save Current
                  </button>
                )}
                {presets.length >= MAX_PRESETS && (
                  <div className='text-[11px] text-stone-300'>
                    Max {MAX_PRESETS} presets
                  </div>
                )}
                {presets.length === 0 && (
                  <div className='text-[11px] text-stone-300 mb-2'>
                    No saved filters yet
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Journals */}
          <div className='border-b border-stone-100'>
            <button
              onClick={() => toggleSection('journals')}
              className='w-full flex items-center justify-between py-3 hover:bg-stone-50 transition'
            >
              <div className='flex items-center gap-2'>
                {expandedSections.has('journals') ? (
                  <ChevronDown size={14} className='text-stone-400' />
                ) : (
                  <ChevronRight size={14} className='text-stone-400' />
                )}
                <span className='text-sm text-stone-600'>Journals</span>
              </div>
              {(() => {
                const mode = filters.journalFilterMode || 'wide';
                if (mode === 'wide' && filters.econFilter?.enabled) {
                  return (
                    <span className='text-xs bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded'>
                      Wide
                    </span>
                  );
                }
                if (mode === 'specific' && filters.journals.length > 0) {
                  return (
                    <span className='text-xs bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded'>
                      {filters.journals.length}
                    </span>
                  );
                }
                return null;
              })()}
            </button>
            {expandedSections.has('journals') && (
              <div className='pb-3 pl-6'>
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
                        ? 'bg-white text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`;
                  return (
                    <div className='flex items-center gap-1 p-0.5 mb-3 bg-stone-100 rounded text-[11px]'>
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
                {(filters.journalFilterMode || 'wide') === 'wide' && (() => {
                  const econ = filters.econFilter || reconcileEcon({});
                  const hasIssnWhitelist = !!econ.issns?.length;
                  return (
                    <div className='mb-3'>
                      <p className='text-[10px] uppercase tracking-wider text-stone-400 mb-1.5'>
                        Wide filter
                      </p>

                      {/* Preset pills */}
                      <div className='flex flex-wrap gap-1 mb-2'>
                        {ECON_PRESETS.map((preset) => {
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
                                          categories: [...preset.categories],
                                          domains: [...preset.domains],
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
                                  ? 'bg-stone-800 text-white'
                                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                              }`}
                            >
                              {preset.name}
                            </button>
                          );
                        })}
                      </div>

                      {/* Note when an ISSN-whitelist preset is active */}
                      {hasIssnWhitelist && (
                        <p className='text-[10px] text-stone-400 mb-2'>
                          Using whitelist of {econ.issns!.length} journals —
                          category & domain rows have no effect.
                        </p>
                      )}

                      {/* Category row — dimmed + unhighlighted under whitelist */}
                      <div
                        className={`mb-2 ${
                          hasIssnWhitelist ? 'opacity-50' : ''
                        }`}
                      >
                        <p className='text-[11px] text-stone-400 mb-1'>
                          Category
                        </p>
                        <div className='flex gap-1'>
                          {ECON_CATEGORIES.map((cat) => {
                            // Only highlight when the wide filter is actually
                            // engaged — default WIDE state (nothing selected)
                            // shows no buttons highlighted.
                            const isSelected =
                              econ.enabled &&
                              !hasIssnWhitelist &&
                              (econ.categories.length === 0 ||
                                econ.categories.includes(cat));
                            return (
                              <button
                                key={cat}
                                onClick={() => {
                                  setFilters((prev) => {
                                    const current =
                                      prev.econFilter?.categories || [];
                                    let next: number[];
                                    if (current.length === 0) {
                                      next = [cat];
                                    } else if (current.includes(cat)) {
                                      next = current.filter((c) => c !== cat);
                                    } else {
                                      next = [...current, cat];
                                    }
                                    if (next.length === 4) next = [];
                                    return {
                                      ...prev,
                                      econFilter: reconcileEcon({
                                        categories: next,
                                        domains: prev.econFilter?.domains || [],
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
                                    ? 'bg-stone-700 text-white'
                                    : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                                }`}
                              >
                                {cat}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => {
                              setFilters((prev) => ({
                                ...prev,
                                econFilter: reconcileEcon({
                                  categories: [],
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
                              econ.categories.length === 0 &&
                              econ.enabled
                                ? 'bg-stone-700 text-white'
                                : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                            }`}
                          >
                            All
                          </button>
                        </div>
                      </div>

                      {/* Domain row — dimmed + unhighlighted under whitelist */}
                      <div className={hasIssnWhitelist ? 'opacity-50' : ''}>
                        <p className='text-[11px] text-stone-400 mb-1'>
                          Domain
                        </p>
                        <div className='flex flex-wrap gap-1 max-h-24 overflow-y-auto'>
                          {ECON_DOMAINS.map(({ key, label }) => {
                            const isSelected =
                              econ.enabled &&
                              !hasIssnWhitelist &&
                              (econ.domains.length === 0 ||
                                econ.domains.includes(key));
                            return (
                              <button
                                key={key}
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
                                    if (next.length === ECON_DOMAINS.length)
                                      next = [];
                                    return {
                                      ...prev,
                                      econFilter: reconcileEcon({
                                        categories:
                                          prev.econFilter?.categories || [],
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
                                    ? 'bg-stone-600 text-white'
                                    : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                                }`}
                              >
                                {label}
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
                                  categories:
                                    prev.econFilter?.categories || [],
                                  domains: [],
                                  presetId: null,
                                  issns: undefined,
                                }),
                                journalFilterMode: 'wide',
                              }));
                              setActivePresetId(null);
                            }}
                            className='text-[10px] text-stone-400 hover:text-stone-600 mt-1'
                          >
                            Reset to all
                          </button>
                        )}
                      </div>

                      {/* Journal count (only when wide is active) */}
                      {econ.enabled && (
                        <p className='text-[10px] text-stone-400 mt-1.5'>
                          {hasIssnWhitelist
                            ? `${econ.issns!.length} journals (whitelist)`
                            : `${getEconJournalCount()} journals selected`}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* ─── Subsection: Manual selection (only in specific mode) ── */}
                {(filters.journalFilterMode || 'wide') === 'specific' && (
                  <div className='mb-3'>
                    <p className='text-[10px] uppercase tracking-wider text-stone-400 mb-1.5'>
                      Manual selection
                    </p>
                    {filters.journals.length > 0 && (
                      <div className='flex flex-wrap gap-1.5 mb-2 max-h-32 overflow-y-auto pr-1'>
                        {filters.journals.map((j) =>
                          renderPill(
                            j.issn,
                            j.name || 'Unknown Journal',
                            () => removeJournal(j.issn),
                          ),
                        )}
                      </div>
                    )}
                    <button
                      onClick={openJournalModal}
                      className='inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition'
                    >
                      <Plus size={14} />
                      Select journals
                    </button>
                  </div>
                )}

                {/* ─── Subsection: Saved journal filters ───────────────── */}
                <div>
                  <p className='text-[10px] uppercase tracking-wider text-stone-400 mb-1.5'>
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
                                  ? 'bg-stone-100 text-stone-700'
                                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
                              }`}
                              title={`Wide: ${
                                preset.econFilter.enabled ? 'on' : 'off'
                              } · ${preset.journals.length} manual`}
                            >
                              <Bookmark
                                size={10}
                                className='text-stone-400 flex-shrink-0'
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
                    <div className='text-[11px] text-stone-300 mb-2'>
                      No saved journal filters yet
                    </div>
                  )}
                  {journalPresets.length < MAX_PRESETS &&
                  (filters.journals.length > 0 ||
                    filters.econFilter?.enabled) ? (
                    <button
                      onClick={() => setShowSaveJournalModal(true)}
                      className='inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 transition'
                    >
                      <Save size={11} />
                      Save current
                    </button>
                  ) : journalPresets.length >= MAX_PRESETS ? (
                    <div className='text-[11px] text-stone-300'>
                      Max {MAX_PRESETS} presets
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Authors */}
          {renderSection(
            'authors',
            'Authors',
            filters.authors.length,
            openAuthorModal,
            filters.authors.map((a) => ({
              key: a.id,
              label: a.name || 'Unknown Author',
              onRemove: () => removeAuthor(a.id),
            })),
          )}
          {/* Institutions */}
          {renderSection(
            'institutions',
            'Institutions',
            filters.institutions.length,
            openInstitutionModal,
            filters.institutions.map((i) => ({
              key: i.id,
              label: i.display_name || 'Unknown Institution',
              onRemove: () => removeInstitution(i.id),
            })),
          )}
        </div>
        {/* Type & Year */}
        <div className='px-4 py-3 border-t border-stone-100 space-y-3'>
          <div>
            <label className='text-xs text-stone-400 block mb-1.5'>Type</label>
            <select
              value={filters.publicationType}
              onChange={handlePublicationTypeChange}
              className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm bg-white text-stone-700'
            >
              {PUBLICATION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className='text-xs text-stone-400 block mb-1.5'>Year</label>
            <div className='flex items-center gap-2'>
              <input
                type='number'
                value={filters.dateFrom}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, dateFrom: e.target.value }));
                  setActivePresetId(null);
                }}
                placeholder='From'
                className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm'
              />
              <span className='text-stone-300'>–</span>
              <input
                type='number'
                value={filters.dateTo}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }));
                  setActivePresetId(null);
                }}
                placeholder='To'
                className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm'
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
