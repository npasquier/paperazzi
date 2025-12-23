"use client";

interface Props {
  query: string;
  setQuery: (q: string) => void;
  onSearch: () => void;
}

export default function SearchBar({ query, setQuery, onSearch }: Props) {
  return (
    <div className="flex gap-2 mb-4">
      <input
        className="border p-1 flex-1"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search papers..."
      />
      <button onClick={onSearch} className="border px-2">
        Search
      </button>
    </div>
  );
}
