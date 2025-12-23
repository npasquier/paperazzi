'use client';

import { useState, useEffect } from 'react';
import Modal from 'react-modal';
import Select from 'react-select';
import journals from '../data/journals';
import domains from '../data/domains';
import { SelectedJournal } from '../types';

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
  const [selectedOptions, setSelectedOptions] =
    useState<SelectedJournal[]>(selectedJournals);
  const [domainFilter, setDomainFilter] = useState<string>(''); // Domain filter
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null); // Category filter

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

  const handleApply = () => {
    const selected = selectedOptions
      .map((o) => journals.find((j) => j.issn === o.issn)!)
      .filter(Boolean);
    onApply(selected);
    onClose();
  };

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

      {/* Journal multi-select */}
      <Select
        isMulti
        options={options}
        value={selectedOptions.map((j) => ({
          value: j.issn,
          label: `${j.name} [${j.domain}, Rank ${j.category}]`,
        }))}
        onChange={(opts) =>
          setSelectedOptions(
            opts.map((o) => ({ name: o.label.split(' [')[0], issn: o.value }))
          )
        }
        isClearable
        placeholder='Search and select journals...'
        menuPortalTarget={document.body}
        styles={{
          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        }}
      />

      <div className='flex justify-end gap-2 mt-4'>
        <button
          onClick={() => {
            onClose();
            setDomainFilter('');
            setCategoryFilter(null);
            setSelectedOptions([]);
          }}
          className='px-2 py-1 border rounded'
        >
          Cancel
        </button>
        <button
          onClick={() => {
            handleApply();
            setDomainFilter('');
            setCategoryFilter(null);
            setSelectedOptions([]);
          }}
          className='px-2 py-1 border rounded'
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
