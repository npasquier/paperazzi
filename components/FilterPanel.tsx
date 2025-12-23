'use client';

interface SelectedJournal {
  name: string;
  issn: string;
}

interface FilterPanelProps {
  filters: {
    journals: SelectedJournal[];
    authors: string[];
    dateFrom: string;
    dateTo: string;
  };
  setFilters: React.Dispatch<
    React.SetStateAction<{
      journals: SelectedJournal[];
      authors: string[];
      dateFrom: string;
      dateTo: string;
    }>
  >;
  openJournalModal: () => void;
}



export default function FilterPanel({
  filters,
  setFilters,
  openJournalModal,
}: FilterPanelProps) {

  const removeJournal = (issn: string) => {
  setFilters((prev) => ({
    ...prev,
    journals: prev.journals.filter((j) => j.issn !== issn),
  }));
};

  return (
    <div className='w-64 border-r border-gray-300 p-4 flex flex-col'>
      <h3 className='text-lg font-semibold mb-4'>Filters</h3>

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
          className='mt-2 px-2 py-1 border rounded bg-white hover:bg-gray-100'
        >
          + Add Journals
        </button>
      </div>

      {/* Authors */}
      <div className='mb-4'>
        <strong>Authors:</strong>
        <input
          type='text'
          value={filters.authors.join(', ')}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              authors: e.target.value.split(',').map((a) => a.trim()),
            }))
          }
          placeholder='Comma-separated'
          className='mt-1 p-1 w-full border rounded'
        />
      </div>

      {/* Dates */}
      <div className='mb-4'>
        <strong>From:</strong>
        <input
          type='date'
          value={filters.dateFrom}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
          }
          className='mt-1 p-1 w-full border rounded'
        />
      </div>
      <div className='mb-4'>
        <strong>To:</strong>
        <input
          type='date'
          value={filters.dateTo}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
          }
          className='mt-1 p-1 w-full border rounded'
        />
      </div>
    </div>
  );
}
