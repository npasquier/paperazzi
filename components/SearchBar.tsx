'use client';

interface Props {
  query: string;
  setQuery: (q: string) => void;
  onSearch: () => void;
}

export default function SearchBar({ query, setQuery, onSearch }: Props) {
  return (
    <div className='flex gap-2 mb-4 bg-white p-3 rounded-xl shadow'>
      <input
        className='flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Search papers...'
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearch();
        }}
      />
      <button
        onClick={onSearch}
        className='px-4 py-2 bg-blue-600 hover:bg-blue-700 transition text-white rounded-lg'
      >
        Search
      </button>
    </div>
  );
}
