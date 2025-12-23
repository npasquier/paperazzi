'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import Select from 'react-select';
import { Journal, SelectedJournal } from '../types';

const journalsData: Journal[] = [
  {
    name: 'Academy of Management Review',
    issn: '0363-7425',
    domain: 'MG',
    category: 1,
  },
  {
    name: 'American Economic Review',
    issn: '0002-8282',
    domain: 'GEN',
    category: 1,
  },
  {
    name: 'Journal of Economics and Management Strategy',
    issn: '1058-6407',
    domain: 'OrgInd',
    category: 1,
  },
];

interface Props {
  isOpen: boolean;
  selectedJournals: SelectedJournal[];
  onClose: () => void;
  onApply: (selected: SelectedJournal[]) => void;
}

export default function JournalModal({
  isOpen,
  selectedJournals,
  onClose,
  onApply,
}: Props) {
  // ✅ derive initial value ONCE
  const initialOptions = useMemo(
    () =>
      selectedJournals.map((j) => ({
        value: j.issn,
        label: j.name,
      })),
    [selectedJournals]
  );

  const [selectedOptions, setSelectedOptions] = useState(initialOptions);

  // ✅ effect ONLY for external system
  useEffect(() => {
    Modal.setAppElement('body');
  }, []);

  const options = journalsData.map((j) => ({
    value: j.issn,
    label: `${j.name} [${j.domain}, Cat ${j.category}]`,
  }));

  const handleApply = () => {
    const selected = journalsData.filter((j) =>
      selectedOptions.some((o) => o.value === j.issn)
    );
    onApply(selected);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel='Select journals'
      // appElement={document.getElementById('main-app')}
      ariaHideApp={false}
    >
      <h2 className='text-lg font-semibold mb-2'>Select Journals</h2>

      <Select
        isMulti
        options={options}
        value={selectedOptions}
        onChange={(opts) => setSelectedOptions(opts as any)}
      />

      <div className='flex justify-end gap-2 mt-4'>
        <button onClick={onClose} className='border px-2 py-1'>
          Cancel
        </button>
        <button onClick={handleApply} className='border px-2 py-1'>
          Apply
        </button>
      </div>
    </Modal>
  );
}
