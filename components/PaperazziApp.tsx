'use client';

import { useState } from 'react';
import FilterPanel from './FilterPanel';
import SearchBar from './SearchBar';
import SearchResults from './SearchResults';
import JournalModal from './JournalModal';
import { Filters } from '../types/interfaces';

export default function PaperazziApp() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({
    journals: [],
    authors: [],
    dateFrom: '',
    dateTo: '',
  });
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [triggerSearch, setTriggerSearch] = useState(0);

  return (
    <div className='flex h-screen'>
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        openJournalModal={() => setShowJournalModal(true)}
      />

      <div className='flex-1 p-4'>
        <SearchBar
          query={query}
          setQuery={setQuery}
          onSearch={() => setTriggerSearch((v) => v + 1)}
        />

        <SearchResults
          query={query}
          filters={filters}
          trigger={triggerSearch}
        />
      </div>

      <JournalModal
        isOpen={showJournalModal}
        selectedJournals={filters.journals}
        onClose={() => setShowJournalModal(false)}
        onApply={(selected) =>
          setFilters((prev) => ({ ...prev, journals: selected }))
        }
      />
    </div>
  );
}
