'use client';

import { SelectedJournal, SelectedAuthor } from '../types/interfaces';
import { ArrowUpDown, ChevronLeft, Filter, X } from 'lucide-react';

interface FilterPanelProps {
  filters: {
    journals: SelectedJournal[];
    authors: SelectedAuthor[];
    dateFrom: string;
    dateTo: string;
    sortBy: string;
  };
  setFilters: React.Dispatch<
    React.SetStateAction<{
      journals: SelectedJournal[];
      authors: SelectedAuthor[];
      dateFrom: string;
      dateTo: string;
      sortBy: string;
    }>
  >;
  openJournalModal: () => void;
  openAuthorModal: () => void;
  onSortChange?: (sortBy: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function FilterPanel({
  filters,
  setFilters,
  openJournalModal,
  openAuthorModal,
  onSortChange,
  isOpen,
  onToggle,
}: FilterPanelProps) {
  const removeJournal = (issn: string) => {
    setFilters((prev) => ({
      ...prev,
      journals: prev.journals.filter((j) => j.issn !== issn),
    }));
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value;
    setFilters((prev) => ({ ...prev, sortBy: newSort }));

    if (onSortChange) {
      onSortChange(newSort);
    }
  };

  // Count active filters
  const activeFilterCount =
    filters.journals.length +
    filters.authors.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  // Collapsed state
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-white border border-l-0 border-stone-200 rounded-r-lg p-2 shadow-sm hover:bg-stone-50 transition"
        title="Open filters"
      >
        <div className="flex flex-col items-center gap-1">
          <Filter size={18} className={activeFilterCount > 0 ? 'text-stone-800' : 'text-stone-400'} />
          {activeFilterCount > 0 && (
            <span className="text-xs font-medium text-stone-600">{activeFilterCount}</span>
          )}
        </div>
      </button>
    );
  }

  return (
    <aside className="w-80 bg-white border-r border-stone-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-stone-500 font-semibold flex items-center gap-2">
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-stone-800 text-white text-xs px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </h3>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-stone-100 rounded transition"
            title="Close filters"
          >
            <ChevronLeft size={16} className="text-stone-500" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Sort By */}
        <div className="mb-6">
          <label className="flex items-center gap-2 font-semibold text-sm mb-2">
            <ArrowUpDown className="w-4 h-4 text-stone-600" />
            Sort By
          </label>
          <select
            value={filters.sortBy}
            onChange={handleSortChange}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400 text-sm bg-white"
          >
            <option value="relevance_score">Relevance</option>
            <option value="publication_date:desc">Most Recent</option>
            <option value="cited_by_count:desc">Most Cited</option>
            <option value="publication_date:asc">Oldest First</option>
          </select>
        </div>

        {/* Journals */}
        <div className="mb-6">
          <h3 className="font-semibold text-sm mb-2">Journals</h3>
          {filters.journals.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {filters.journals.map((j) => (
                <span
                  key={j.issn}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-700 rounded-full text-xs font-medium"
                >
                  <span className="max-w-[120px] truncate">{j.name}</span>
                  <button
                    onClick={() => removeJournal(j.issn)}
                    className="ml-1 hover:text-stone-900 transition flex-shrink-0"
                    aria-label={`Remove ${j.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <button
            onClick={openJournalModal}
            className="w-full px-3 py-2 bg-stone-100 hover:bg-stone-200 transition rounded-lg text-sm font-medium text-stone-700"
          >
            + Add Journals
          </button>
        </div>

        {/* Authors */}
        <div className="mb-6">
          <h3 className="font-semibold text-sm mb-2">Authors</h3>
          {filters.authors.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {filters.authors.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-700 rounded-full text-xs font-medium"
                >
                  <span className="max-w-[120px] truncate">{a.name}</span>
                  <button
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        authors: prev.authors.filter((x) => x.id !== a.id),
                      }))
                    }
                    className="ml-1 hover:text-stone-900 transition flex-shrink-0"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <button
            onClick={openAuthorModal}
            className="w-full px-3 py-2 bg-stone-100 hover:bg-stone-200 transition rounded-lg text-sm font-medium text-stone-700"
          >
            + Add Authors
          </button>
        </div>

        {/* Date Range */}
        <div className="mb-6">
          <h3 className="font-semibold text-sm mb-2">Publication Year</h3>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-stone-600 block mb-1">From</label>
              <input
                type="number"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                }
                placeholder="e.g. 2020"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-stone-600 block mb-1">To</label>
              <input
                type="number"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                }
                placeholder="e.g. 2024"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}