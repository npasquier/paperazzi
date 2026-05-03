'use client';
import { useEffect, useState } from 'react';
import Modal from 'react-modal';
import Select from 'react-select';
import { loadJournals } from '@/utils/loadJournals';
import domains from '../data/domains';
import { Journal, SelectedJournal } from '../types/interfaces';

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
  const MAX_JOURNALS = 50;

  // Local state for pending selections (not yet applied)
  const [pendingJournals, setPendingJournals] = useState<SelectedJournal[]>(selectedJournals);

  // Sync pending state when modal opens with new selectedJournals
  const [lastSelectedJournals, setLastSelectedJournals] = useState(selectedJournals);
  if (selectedJournals !== lastSelectedJournals) {
    setLastSelectedJournals(selectedJournals);
    setPendingJournals(selectedJournals);
  }

  const isOverLimit = pendingJournals.length > MAX_JOURNALS;
  const isAtLimit = pendingJournals.length === MAX_JOURNALS;
  const canApply = pendingJournals.length <= MAX_JOURNALS;

  // Lazy-load the full journal dataset (~5k entries). The fetch is shared
  // across all callers via the loader's promise cache, so opening this
  // modal more than once costs at most one network/parse pass total.
  const [journals, setJournals] = useState<readonly Journal[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    loadJournals().then((list) => {
      if (!cancelled) setJournals(list);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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

  // Select all filtered journals
  const handleSelectAllFiltered = () => {
    const merged = [
      ...pendingJournals,
      ...filteredJournals
        .filter((j) => !pendingJournals.some((s) => s.issn === j.issn))
        .map((j) => ({
          issn: j.issn,
          name: j.name,
          domain: j.domain,
          category: j.category,
        })),
    ];
    setPendingJournals(merged);
  };

  const handleAddJournals = (newJournals: SelectedJournal[]) => {
    const merged = [...pendingJournals, ...newJournals];
    setPendingJournals(merged);
  };

  const handleRemoveJournal = (issn: string) => {
    setPendingJournals(pendingJournals.filter((j) => j.issn !== issn));
  };

  const handleClearAll = () => {
    setPendingJournals([]);
  };

  const handleApply = () => {
    if (canApply) {
      onApply(pendingJournals);
      onClose();
      setDomainFilter('');
      setCategoryFilter(null);
    }
  };

  const handleCancel = () => {
    setPendingJournals(selectedJournals); // Reset to original
    onClose();
    setDomainFilter('');
    setCategoryFilter(null);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleCancel}
      contentLabel='Select Journals'
      ariaHideApp={false}
      className='surface-card border border-app rounded-lg p-6 max-w-5xl w-full max-h-[80vh] overflow-y-auto outline-none'
      overlayClassName='fixed inset-0 overlay-soft flex items-center justify-center p-4'
    >
      <h2 className='text-xl font-semibold mb-4 text-stone-900'>
        Select Journals
      </h2>

      <div className='flex gap-6'>
        {/* LEFT COLUMN: Selected Journals */}
        <div className='w-2/5 flex flex-col'>
          <div className='mb-2 flex items-center justify-between'>
            <h3 className='font-medium text-stone-900'>
              Selected ({pendingJournals.length}/{MAX_JOURNALS})
            </h3>
            <button
              onClick={handleClearAll}
              className='text-xs text-stone-600 hover:text-stone-800 underline'
            >
              Clear All
            </button>
          </div>

          {/* Over limit warning */}
          {isOverLimit && (
            <div className='text-danger text-sm mb-2 p-2 banner-danger rounded'>
              <span className='font-medium'>Too many journals selected.</span>{' '}
              Remove {pendingJournals.length - MAX_JOURNALS} journal(s) to apply.
            </div>
          )}

          {/* At limit info */}
          {isAtLimit && (
            <div className='text-warning text-sm mb-2 p-2 banner-warning rounded'>
              Maximum of {MAX_JOURNALS} journals reached.
            </div>
          )}

          <div className='flex-1 border border-app rounded-lg overflow-hidden'>
            {pendingJournals.length > 0 ? (
              <div className='divide-y divide-stone-200 max-h-96 overflow-y-auto'>
                {pendingJournals.map((journal, index) => (
                  <div
                    key={journal.issn}
                    className={`flex items-start justify-between p-3 hover:bg-[var(--surface-muted)] group ${
                      index >= MAX_JOURNALS ? 'bg-[var(--danger-bg)]' : ''
                    }`}
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
                      onClick={() => handleRemoveJournal(journal.issn)}
                      className={`flex-shrink-0 transition ${
                        index >= MAX_JOURNALS
                          ? 'text-danger hover:opacity-80 opacity-100'
                          : 'text-stone-400 hover:text-danger opacity-0 group-hover:opacity-100'
                      }`}
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
                  borderColor: 'var(--border-subtle)',
                  borderRadius: '0.5rem',
                  '&:hover': { borderColor: 'var(--border-strong)' },
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
                  borderColor: 'var(--border-subtle)',
                  borderRadius: '0.5rem',
                  '&:hover': { borderColor: 'var(--border-strong)' },
                }),
              }}
            />
          </div>

          {/* Select All Filtered button */}
          <button
            onClick={handleSelectAllFiltered}
            className='mb-3 px-3 py-1.5 text-sm button-secondary rounded-lg font-medium transition w-full disabled:opacity-50 disabled:cursor-not-allowed'
            disabled={filteredJournals.length === 0}
          >
            Select All Filtered ({filteredJournals.length})
          </button>

          {/* Journal multi-select */}
          <Select
            isMulti
            options={options.filter(
              (opt) => !pendingJournals.some((j) => j.issn === opt.value)
            )}
            value={null}
            onChange={(opts) => {
              if (opts && opts.length > 0) {
                const newJournals = opts
                  .filter((o) => o !== null)
                  .map((o) => journals.find((j) => j.issn === o.value)!)
                  .map((j) => ({
                    issn: j.issn,
                    name: j.name,
                    domain: j.domain,
                    category: j.category,
                  }));
                handleAddJournals(newJournals);
              }
            }}
            placeholder='Search to add journals...'
            menuPortalTarget={document.body}
            styles={{
              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              control: (base) => ({
                ...base,
                borderColor: 'var(--border-subtle)',
                borderRadius: '0.5rem',
                '&:hover': { borderColor: 'var(--border-strong)' },
              }),
            }}
          />

          {!isOverLimit && pendingJournals.length < MAX_JOURNALS && (
            <div className='mt-2 text-xs text-stone-600'>
              {MAX_JOURNALS - pendingJournals.length} slot(s) remaining
            </div>
          )}
        </div>
      </div>

      {/* Bottom buttons */}
      <div className='flex justify-end gap-2 mt-6 pt-4 border-t border-app'>
        <button
          onClick={handleCancel}
          className='px-4 py-2 button-secondary rounded-lg transition font-medium'
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={!canApply}
          className='px-4 py-2 button-primary rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed'
        >
          Apply{isOverLimit && ` (remove ${pendingJournals.length - MAX_JOURNALS})`}
        </button>
      </div>
    </Modal>
  );
}
