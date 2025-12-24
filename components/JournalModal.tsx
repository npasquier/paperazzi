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

  // Select all journals (no filters)
  // const handleSelectAllJournals = () => {
  //   const all = journals.map((j) => ({
  //     issn: j.issn,
  //     name: j.name,
  //     domain: j.domain,
  //     category: j.category,
  //   }));
  //   setSelectedOptions(all);
  // };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel='Select Journals'
      ariaHideApp={false}
      style={{
        content: {
          top: '50%',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          marginRight: '-50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          maxHeight: '80vh',
        },
      }}
    >
      <h2 className='font-semibold mb-2'>Select Journals</h2>

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
          }}
        />
      </div>

      {/* Select All buttons */}
      <div className='flex gap-2 mb-4'>
        <button
          onClick={handleSelectAllFiltered}
          className='px-3 py-1 text-sm border rounded bg-blue-50 hover:bg-blue-100'
          disabled={
            filteredJournals.length === 0 ||
            selectedJournals.length > MAX_JOURNALS
          }
        >
          Select All Filtered ({filteredJournals.length})
        </button>
        {/* <button
          onClick={handleSelectAllJournals}
          className='px-3 py-1 text-sm border rounded bg-green-50 hover:bg-green-100'
        >
          Select All Journals ({journals.length})
        </button> */}
        <button
          onClick={() => {
            onApply([]);
            setLimitWarning(false);
          }}
          className='px-3 py-1 text-sm border rounded bg-gray-50 hover:bg-gray-100'
        >
          Clear All
        </button>
      </div>

      {/* Selection counter - no individual journals shown if too many */}
      <div className='mb-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm'>
        <strong>
          {selectedJournals.length} / {MAX_JOURNALS} journals selected
        </strong>

        {selectedJournals.length === MAX_JOURNALS && !limitWarning && (
          <div className='text-orange-600 mt-1'>
            You reached the maximum of 10 journals.
          </div>
        )}

        {limitWarning && (
          <div className='text-red-600 mt-1'>
            You can’t add more than 10 journals.
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
        }}
      />

      {selectedJournals.length == 10 && (
        <div className='mt-2 text-xs text-gray-600'>
          Tip: Click on the journal&apos;s associated cross to remove it.
        </div>
      )}

      <div className='flex justify-end gap-2 mt-4'>
        <button
          onClick={() => {
            onClose();
            setDomainFilter('');
            setCategoryFilter(null);
          }}
          className='px-2 py-1 border rounded'
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onClose();
            setDomainFilter('');
            setCategoryFilter(null);
          }}
          className='px-2 py-1 bg-blue-600 text-white border rounded hover:bg-blue-700'
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
