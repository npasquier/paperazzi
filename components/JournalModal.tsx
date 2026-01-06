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
  const MAX_JOURNALS = 15;
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
      className='bg-white rounded-lg p-6 max-w-5xl w-full max-h-[80vh] overflow-y-auto outline-none'
      overlayClassName='fixed inset-0 bg-black/50 flex items-center justify-center p-4'
    >
      <h2 className='text-xl font-semibold mb-4 text-stone-900'>
        Select Journals
      </h2>

      <div className='flex gap-6'>
        {/* LEFT COLUMN: Selected Journals */}
        <div className='w-2/5 flex flex-col'>
          <div className='mb-2 flex items-center justify-between'>
            <h3 className='font-medium text-stone-900'>
              Selected ({selectedJournals.length}/{MAX_JOURNALS})
            </h3>
            <button
              onClick={() => {
                onApply([]);
                setLimitWarning(false);
              }}
              className='text-xs text-stone-600 hover:text-stone-800 underline'
            >
              Clear All
            </button>
          </div>

          {selectedJournals.length === MAX_JOURNALS && !limitWarning && (
            <div className='text-amber-700 text-sm mb-2 p-2 bg-amber-50 border border-amber-200 rounded'>
              Maximum of {MAX_JOURNALS} journals reached.
            </div>
          )}

          {limitWarning && (
            <div className='text-red-700 text-sm mb-2 p-2 bg-red-50 border border-red-200 rounded'>
              You can&apos;t add more than {MAX_JOURNALS} journals.
            </div>
          )}

          <div className='flex-1 border border-stone-200 rounded-lg overflow-hidden'>
            {selectedJournals.length > 0 ? (
              <div className='divide-y divide-stone-200 max-h-96 overflow-y-auto'>
                {selectedJournals.map((journal) => (
                  <div
                    key={journal.issn}
                    className='flex items-start justify-between p-3 hover:bg-stone-50 group'
                  >
                    <div className='flex-1 min-w-0 pr-2'>
                      <div className='font-medium text-sm text-stone-900 truncate'>
                        {journal.name}
                      </div>
                      <div className='text-xs text-stone-500 mt-0.5'>
                        {journal.domain} • Rank {journal.category}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const updated = selectedJournals.filter(
                          (j) => j.issn !== journal.issn
                        );
                        onApply(updated);
                        setLimitWarning(false);
                      }}
                      className='text-stone-400 hover:text-red-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition'
                      title='Remove'
                    >
                      <svg
                        className='w-5 h-5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M6 18L18 6M6 6l12 12'
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className='flex items-center justify-center h-48 text-stone-400 text-sm'>
                No journals selected yet
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Search & Add */}
        <div className='w-3/5 flex flex-col'>
          <h3 className='font-medium text-stone-900 mb-2'>Add Journals</h3>

          {/* Domain & Category filters */}
          <div className='flex gap-2 mb-3'>
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

          {/* Select All Filtered button */}
          <button
            onClick={handleSelectAllFiltered}
            className='mb-3 px-3 py-1.5 text-sm border border-stone-300 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium transition w-full'
            disabled={
              filteredJournals.length === 0 ||
              selectedJournals.length >= MAX_JOURNALS
            }
          >
            Select All Filtered ({filteredJournals.length})
          </button>

          {/* Journal multi-select - ONLY SHOWS AVAILABLE JOURNALS */}
          <Select
            isMulti
            options={options.filter(
              (opt) => !selectedJournals.some((j) => j.issn === opt.value)
            )}
            value={null} // Use null instead of []
            onChange={(opts) => {
              if (opts && opts.length > 0) {
                const newJournals = opts
                  .filter((o) => o !== null) // Filter out any null values
                  .map((o) => journals.find((j) => j.issn === o.value)!);
                const merged = [...selectedJournals, ...newJournals];
                applyWithCap(merged);
              }
            }}
            isDisabled={selectedJournals.length >= MAX_JOURNALS}
            placeholder={
              selectedJournals.length >= MAX_JOURNALS
                ? 'Maximum journals selected'
                : 'Search to add journals...'
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

          {selectedJournals.length < MAX_JOURNALS && (
            <div className='mt-2 text-xs text-stone-600'>
              {MAX_JOURNALS - selectedJournals.length} slot(s) remaining
            </div>
          )}
        </div>
      </div>

      {/* Bottom buttons */}
      <div className='flex justify-end gap-2 mt-6 pt-4 border-t border-stone-200'>
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
