'use client';

import { useState } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { SelectedAuthor } from '../types';

interface Props {
  isOpen: boolean;
  selectedAuthors: SelectedAuthor[];
  onAddAuthor: (author: SelectedAuthor) => void;
  onClose: () => void;
}

export default function AuthorModal({
  isOpen,
  selectedAuthors,
  onAddAuthor,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SelectedAuthor[]>([]);
  const [loading, setLoading] = useState(false);

  const searchAuthors = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `https://api.openalex.org/authors?filter=display_name.search:${encodeURIComponent(
          query
        )}&per-page=10`
      );

      const authors: SelectedAuthor[] = res.data.results.map((a: any) => ({
        id: a.id.split('/').pop(),
        name: a.display_name,
        orcid: a.orcid,
        institution:
          a.last_known_institutions && a.last_known_institutions.length > 0
            ? a.last_known_institutions[0].display_name
            : 'Unknown',
      }));

      setResults(authors);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel='Select authors'
      ariaHideApp={false}
    >
      <h2 className='font-semibold mb-2'>Add authors</h2>

      <div className='flex gap-2 mb-2'>
        <input
          className='border p-1 flex-1'
          placeholder='Search author name...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={searchAuthors} className='border px-2'>
          Search
        </button>
      </div>

      {loading && <div>Searching…</div>}

      <ul className='max-h-64 overflow-y-auto'>
        {results.map((a) => {
          const alreadySelected = selectedAuthors.some((s) => s.id === a.id);
          return (
            <li
              key={a.id}
              className={`flex justify-between border-b py-1 px-2 cursor-pointer ${
                alreadySelected ? 'bg-green-100' : 'hover:bg-gray-100'
              }`}
              onClick={() => {
                if (!alreadySelected) {
                  onAddAuthor(a);
                  onClose();
                  setQuery('');
                  setResults([]);
                }
              }}
            >
              <div>
                <div className='font-medium'>{a.name}</div>
                <div className='text-xs text-gray-500'>{a.institution}</div>
              </div>
              <div className='text-sm'>{alreadySelected ? '✓' : ''}</div>
            </li>
          );
        })}
      </ul>

      <div className='flex justify-end gap-2 mt-4'>
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
