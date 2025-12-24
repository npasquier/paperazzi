'use client';

import { SelectedJournal, SelectedAuthor } from '../types/interfaces';

interface FilterPanelProps {
  filters: {
    journals: SelectedJournal[];
    authors: SelectedAuthor[];
    dateFrom: string;
    dateTo: string;
  };
  setFilters: React.Dispatch<
    React.SetStateAction<{
      journals: SelectedJournal[];
      authors: SelectedAuthor[];
      dateFrom: string;
      dateTo: string;
    }>
  >;
  openJournalModal: () => void;
  openAuthorModal: () => void;
}

export default function FilterPanel({
  filters,
  setFilters,
  openJournalModal,
  openAuthorModal,
}: FilterPanelProps) {
  const removeJournal = (issn: string) => {
    setFilters((prev) => ({
      ...prev,
      journals: prev.journals.filter((j) => j.issn !== issn),
    }));
  };

  return (
    <div className='w-72 border-r bg-white shadow-sm p-4 flex flex-col'>
      <h3 className='text-xs uppercase tracking-wide text-slate-500 mb-2'>
        Filters
      </h3>

      {/* Journals */}
      <div className='mb-4'>
        <strong>Selected Journals:</strong>
        <div className='flex flex-wrap gap-1 mt-1'>
          {filters.journals.map((j) => (
            <span
              key={j.issn}
              className='px-2 py-1 bg-gray-200 rounded text-sm'
            >
              {j.name}
              <button
                onClick={() => removeJournal(j.issn)}
                className='text-gray-600 hover:text-black'
                aria-label={`Remove ${j.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <button
          onClick={openJournalModal}
          className='px-2 py-1 bg-slate-100 hover:bg-slate-200 transition rounded-full text-xs flex items-center gap-1'
        >
          + Add Journals
        </button>
      </div>

      {/* Authors */}
      <div className='mb-4'>
        <h3 className='font-semibold mt-4 mb-2'>Authors</h3>

        <div className='flex flex-wrap gap-1'>
          {filters.authors.map((a) => (
            <span
              key={a.id}
              className='flex items-center gap-1 bg-gray-200 px-2 py-1 rounded text-sm'
            >
              {a.name}
              <button
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    authors: prev.authors.filter((x) => x.id !== a.id),
                  }))
                }
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <button
          onClick={openAuthorModal}
          className='px-2 py-1 bg-slate-100 hover:bg-slate-200 transition rounded-full text-xs flex items-center gap-1'
        >
          + Add authors
        </button>
      </div>

      {/* Dates */}
      <div className='mb-4'>
        <strong>From:</strong>
        <input
          type='number'
          value={filters.dateFrom}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
          }
          className='px-2 py-1 bg-slate-100 hover:bg-slate-200 transition rounded-full text-xs flex items-center gap-1'
        />
      </div>
      <div className='mb-4'>
        <strong>To:</strong>
        <input
          type='number'
          value={filters.dateTo}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
          }
          className='px-2 py-1 bg-slate-100 hover:bg-slate-200 transition rounded-full text-xs flex items-center gap-1'
        />
      </div>
    </div>
  );
}
