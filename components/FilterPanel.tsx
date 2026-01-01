'use client';
import { SelectedJournal, SelectedAuthor } from '../types/interfaces';
import { ArrowUpDown } from 'lucide-react';

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
}

export default function FilterPanel({
  filters,
  setFilters,
  openJournalModal,
  openAuthorModal,
  onSortChange,
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

    // Trigger immediate search
    if (onSortChange) {
      onSortChange(newSort);
    }
  };

  return (
    <div className='w-80 border-r border-stone-200 bg-white p-4 flex flex-col'>
      <h3 className='text-xs uppercase tracking-wide text-stone-500 mb-4 font-semibold'>
        Filters
      </h3>

      {/* Sort By */}
      <div className='mb-6'>
        <label className='flex items-center gap-2 font-semibold text-sm mb-2'>
          <ArrowUpDown className='w-4 h-4 text-stone-600' />
          Sort By
        </label>
        <select
          value={filters.sortBy}
          onChange={handleSortChange}
          className='w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400 text-sm bg-white'
        >
          <option value='relevance_score'>Relevance</option>
          <option value='publication_date:desc'>Most Recent</option>
          <option value='cited_by_count:desc'>Most Cited</option>
          <option value='publication_date:asc'>Oldest First</option>
        </select>
      </div>

      {/* Journals */}
      <div className='mb-6'>
        <h3 className='font-semibold text-sm mb-2'>Journals</h3>
        {filters.journals.length > 0 && (
          <div className='flex flex-wrap gap-2 mb-2'>
            {filters.journals.map((j) => (
              <span
                key={j.issn}
                className='inline-flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-700 rounded-full text-xs font-medium'
              >
                {j.name}
                <button
                  onClick={() => removeJournal(j.issn)}
                  className='ml-1 hover:text-stone-900 transition'
                  aria-label={`Remove ${j.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={openJournalModal}
          className='w-full px-3 py-2 bg-stone-100 hover:bg-stone-200 transition rounded-lg text-sm font-medium text-stone-700'
        >
          + Add Journals
        </button>
      </div>

      {/* Authors */}
      <div className='mb-6'>
        <h3 className='font-semibold text-sm mb-2'>Authors</h3>
        {filters.authors.length > 0 && (
          <div className='flex flex-wrap gap-2 mb-2'>
            {filters.authors.map((a) => (
              <span
                key={a.id}
                className='inline-flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-700 rounded-full text-xs font-medium'
              >
                {a.name}
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      authors: prev.authors.filter((x) => x.id !== a.id),
                    }))
                  }
                  className='ml-1 hover:text-stone-900 transition'
                  aria-label={`Remove ${a.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={openAuthorModal}
          className='w-full px-3 py-2 bg-stone-100 hover:bg-stone-200 transition rounded-lg text-sm font-medium text-stone-700'
        >
          + Add Authors
        </button>
      </div>

      {/* Date Range */}
      <div className='mb-6'>
        <h3 className='font-semibold text-sm mb-2'>Publication Year</h3>
        <div className='space-y-2'>
          <div>
            <label className='text-xs text-stone-600 block mb-1'>From</label>
            <input
              type='number'
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
              placeholder='e.g. 2020'
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
            />
          </div>
          <div>
            <label className='text-xs text-stone-600 block mb-1'>To</label>
            <input
              type='number'
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
              }
              placeholder='e.g. 2024'
              className='w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
