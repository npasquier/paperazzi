'use client';
import { useState } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { SelectedAuthor } from '../types/interfaces';
import { Search } from 'lucide-react';

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
        )}&per-page=10&mailto=${process.env.NEXT_PUBLIC_MAIL_ID}`
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

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      searchAuthors();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel='Select authors'
      ariaHideApp={false}
      className='bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto outline-none'
      overlayClassName='fixed inset-0 bg-black/50 flex items-center justify-center p-4'
    >
      <h2 className='text-xl font-semibold mb-4 text-stone-900'>Add Authors</h2>
      
      <div className='flex gap-2 mb-4'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400' />
          <input
            className='w-full pl-9 pr-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400'
            placeholder='Search author name...'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
          />
        </div>
        <button 
          onClick={searchAuthors}
          disabled={loading}
          className='px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition font-medium disabled:opacity-50'
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {loading && (
        <div className='text-center py-8 text-stone-500'>Searching authors…</div>
      )}

      {!loading && results.length > 0 && (
        <ul className='max-h-96 overflow-y-auto border border-stone-200 rounded-lg'>
          {results.map((a) => {
            const alreadySelected = selectedAuthors.some((s) => s.id === a.id);
            return (
              <li
                key={a.id}
                className={`flex justify-between items-center border-b border-stone-200 last:border-b-0 py-3 px-4 cursor-pointer transition ${
                  alreadySelected 
                    ? 'bg-stone-100 cursor-default' 
                    : 'hover:bg-stone-50'
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
                  <div className='font-medium text-stone-900'>{a.name}</div>
                  <div className='text-xs text-stone-500'>{a.institution}</div>
                </div>
                {alreadySelected && (
                  <div className='text-sm text-stone-600 font-medium'>✓ Selected</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && query && results.length === 0 && (
        <div className='text-center py-8 text-stone-500'>
          No authors found. Try a different search term.
        </div>
      )}

      <div className='flex justify-end gap-2 mt-6'>
        <button 
          onClick={onClose}
          className='px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition font-medium'
        >
          Close
        </button>
      </div>
    </Modal>
  );
}