'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Database } from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';
import StorageModal from './StorageModal';

function NavBarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSearchPage = pathname?.startsWith('/search') || false;

  // Local search query state (only for search page)
  const [query, setQuery] = useState('');
  // Storage viewer modal
  const [showStorage, setShowStorage] = useState(false);

  // Sync with URL when on search page
  useEffect(() => {
    if (isSearchPage) {
      setQuery(searchParams.get('q') || '');
    }
  }, [searchParams, isSearchPage]);

  const handleSearch = () => {
    if (isSearchPage) {
      // On search page, trigger event with the current query
      window.dispatchEvent(new CustomEvent('navbar-search', { 
        detail: { query: query.trim() } 
      }));
    } else {
      // Not on search page, navigate there with query
      if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}&page=1`);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <nav className='surface-panel border-app border-b h-16 shrink-0'>
      <div className='flex h-full items-center px-6 max-w-7xl mx-auto gap-6'>
        {/* Brand */}
        <Link
          href='/'
          className='flex items-center gap-2 flex-shrink-0 text-accent-strong'
        >
          <svg
            viewBox='0 0 24 24'
            width='22'
            height='22'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
          >
            <rect x='3' y='5' width='6' height='14' rx='3' />
            <rect x='15' y='5' width='6' height='14' rx='3' />
            <line x1='9' y1='11' x2='15' y2='11' />
            <line x1='9' y1='13' x2='15' y2='13' />
            <circle cx='6' cy='15' r='1.3' />
            <circle cx='18' cy='15' r='1.3' />
          </svg>
          <span className='text-xl font-semibold tracking-tight'>
            Paperazzi
          </span>
        </Link>

        {/* Conditional Content based on page */}
        {isSearchPage ? (
          // Search page: Show search bar
          <>
            <div className='flex-1 max-w-2xl ml-auto'>
              <div className='relative'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400' />
                <input
                  type='text'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder='Search papers...'
                  className='w-full pl-10 pr-4 py-2 border border-app rounded-lg focus-accent'
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              className='px-6 py-2 button-primary rounded-lg transition font-medium flex-shrink-0'
            >
              Search
            </button>
          </>
        ) : (
          // Other pages: Show tagline
          <div className='hidden ml-6 md:flex items-center gap-2 text-sm text-stone-600 flex-1'>
              {' '}
          </div>
        )}

        {/* Stored-data viewer */}
        <button
          onClick={() => setShowStorage(true)}
          className='text-app-soft hover:text-app transition flex-shrink-0 ml-auto p-1'
          title='View stored data'
          aria-label='View stored data'
        >
          <Database size={18} />
        </button>

        {/* About link - always visible */}
        <Link
          href='/about'
          className='text-sm text-app-muted hover:text-app transition flex-shrink-0'
        >
          About
        </Link>
      </div>

      <StorageModal
        isOpen={showStorage}
        onClose={() => setShowStorage(false)}
      />
    </nav>
  );
}

export default function NavBar() {
  return (
    <Suspense fallback={
      <nav className='surface-panel border-app border-b h-16 shrink-0'>
        <div className='flex h-full items-center px-6 max-w-7xl mx-auto gap-6'>
          <div className='flex items-center gap-2 flex-shrink-0 text-accent-strong'>
            <svg
              viewBox='0 0 24 24'
              width='22'
              height='22'
              fill='none'
              stroke='currentColor'
              strokeWidth='1.6'
              strokeLinecap='round'
              strokeLinejoin='round'
              aria-hidden='true'
            >
              <rect x='3' y='5' width='6' height='14' rx='3' />
              <rect x='15' y='5' width='6' height='14' rx='3' />
              <line x1='9' y1='11' x2='15' y2='11' />
              <line x1='9' y1='13' x2='15' y2='13' />
              <circle cx='6' cy='15' r='1.3' />
              <circle cx='18' cy='15' r='1.3' />
            </svg>
            <span className='text-xl font-semibold tracking-tight'>Paperazzi</span>
          </div>
        </div>
      </nav>
    }>
      <NavBarContent />
    </Suspense>
  );
}
