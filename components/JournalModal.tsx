'use client';
import { useState } from 'react';
import Modal from 'react-modal';
import Select from 'react-select';
import journals from '../data/journals';
import domains from '../data/domains';
import { SelectedJournal } from '../types/interfaces';

interface Props {
  isOpen: boolean;
  selectedJournals: SelectedJournal[];
  onApply: (selected: SelectedJournal[]) => void;
  onClose: () => void;
}

export default function JournalModal({
  isOpen,
  selectedJournals,
  onApply,
  onClose,
}: Props) {
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const MAX_JOURNALS = 10;
  const [limitWarning, setLimitWarning] = useState(false);

  const applyWithCap = (list: SelectedJournal[]) => {
    if (list.length <= MAX_JOURNALS) {
      setLimitWarning(false);
      onApply(list);
    } else {
      setLimitWarning(true);
      onApply(list.slice(0, MAX_JOURNALS));
    }
  };

  // Filter journals according to domain and category
  const filteredJournals = journals.filter(
    (j) =>
      (!domainFilter || j.domain === domainFilter) &&
      (!categoryFilter || j.category === categoryFilter)
  );

  const options = filteredJournals.map((j) => ({
    value: j.issn,
    label: `${j.name} [${j.domain}, Rank ${j.category}]`,
  }));

  // Select all filtered journals immediately
  const handleSelectAllFiltered = () => {
    const merged = [
      ...selectedJournals,
      ...filteredJournals
        .filter((j) => !selectedJournals.some((s) => s.issn === j.issn))
        .map((j) => ({
          issn: j.issn,
          name: j.name,
          domain: j.domain,
          category: j.category,
        })),
    ];

    applyWithCap(merged);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel='Select Journals'
      ariaHideApp={false}
      className='bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto outline-none'
      overlayClassName='fixed inset-0 bg-black/50 flex items-center justify-center p-4'
    >
      <h2 className='text-xl font-semibold mb-4 text-stone-900'>Select Journals</h2>

      {/* Domain & Category filters */}
      <div className='flex gap-2 mb-4'>
        <Select
          options={domains.map((d) => ({
            value: d.value,
            label: d.translation || d.value,
          }))}
          value={
            domainFilter
              ? {
                  value: domainFilter,
                  label: domains.find((d) => d.value === domainFilter)
                    ?.translation,
                }
              : null
          }
          onChange={(opt) => setDomainFilter(opt?.value || '')}
          isClearable
          placeholder='Filter by domain...'
          className='flex-1'
          menuPortalTarget={document.body}
          styles={{
            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
            control: (base) => ({
              ...base,
              borderColor: '#d6d3d1',
              borderRadius: '0.5rem',
              '&:hover': { borderColor: '#a8a29e' },
            }),
          }}
        />
        <Select
          options={[1, 2, 3, 4].map((c) => ({
            value: c,
            label: `Rank ${c}`,
          }))}
          value={
            categoryFilter
              ? { value: categoryFilter, label: `Rank ${categoryFilter}` }
              : null
          }
          onChange={(opt) => setCategoryFilter(opt?.value || null)}
          isClearable
          placeholder='Filter by rank...'
          className='flex-1'
          menuPortalTarget={document.body}
          styles={{
            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
            control: (base) => ({
              ...base,
              borderColor: '#d6d3d1',
              borderRadius: '0.5rem',
              '&:hover': { borderColor: '#a8a29e' },
            }),
          }}
        />
      </div>

      {/* Select All buttons */}
      <div className='flex gap-2 mb-4'>
        <button
          onClick={handleSelectAllFiltered}
          className='px-3 py-1.5 text-sm border border-stone-300 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium transition'
          disabled={
            filteredJournals.length === 0 ||
            selectedJournals.length >= MAX_JOURNALS
          }
        >
          Select All Filtered ({filteredJournals.length})
        </button>
        <button
          onClick={() => {
            onApply([]);
            setLimitWarning(false);
          }}
          className='px-3 py-1.5 text-sm border border-stone-300 rounded-lg bg-white hover:bg-stone-50 text-stone-700 font-medium transition'
        >
          Clear All
        </button>
      </div>

      {/* Selection counter */}
      <div className='mb-4 p-3 bg-stone-50 border border-stone-200 rounded-lg text-sm'>
        <strong className='text-stone-900'>
          {selectedJournals.length} / {MAX_JOURNALS} journals selected
        </strong>

        {selectedJournals.length === MAX_JOURNALS && !limitWarning && (
          <div className='text-amber-700 mt-1'>
            You reached the maximum of 10 journals.
          </div>
        )}

        {limitWarning && (
          <div className='text-red-700 mt-1'>
            You can&apos;t add more than 10 journals.
          </div>
        )}
      </div>

      {/* Journal multi-select */}
      <Select
        isMulti
        options={options}
        isDisabled={selectedJournals.length > MAX_JOURNALS}
        value={
          selectedJournals.length <= 10
            ? selectedJournals.map((j) => ({
                value: j.issn,
                label: `${j.name} [${j.domain}, Rank ${j.category}]`,
              }))
            : []
        }
        onChange={(opts) => {
          const selected = opts.map(
            (o) => journals.find((j) => j.issn === o.value)!
          );
          applyWithCap(selected);
        }}
        isClearable
        placeholder={
          selectedJournals.length > 10
            ? `${selectedJournals.length} Too many journals selected to display`
            : 'Search and select journals...'
        }
        menuPortalTarget={document.body}
        styles={{
          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
          control: (base) => ({
            ...base,
            borderColor: '#d6d3d1',
            borderRadius: '0.5rem',
            '&:hover': { borderColor: '#a8a29e' },
          }),
        }}
      />

      {selectedJournals.length === 10 && (
        <div className='mt-2 text-xs text-stone-600'>
          Tip: Click on the journal&apos;s associated cross to remove it.
        </div>
      )}

      <div className='flex justify-end gap-2 mt-6'>
        <button
          onClick={() => {
            onClose();
            setDomainFilter('');
            setCategoryFilter(null);
          }}
          className='px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition font-medium'
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onClose();
            setDomainFilter('');
            setCategoryFilter(null);
          }}
          className='px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition font-medium'
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}