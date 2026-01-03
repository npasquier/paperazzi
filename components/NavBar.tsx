'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';

function NavBarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSearchPage = pathname?.startsWith('/search') || false;

  // Local search query state (only for search page)
  const [query, setQuery] = useState('');

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
    <nav className='bg-white border-b border-stone-200'>
      <div className='flex items-center px-6 py-3 max-w-7xl mx-auto gap-6'>
        {/* Brand */}
        <Link href='/' className='flex items-center gap-3 flex-shrink-0'>
          <div className='bg-stone-100 p-1.5 rounded-lg'>
            <Image
              src='/binocular.svg'
              alt='Paperazzi logo'
              width={28}
              height={28}
            />
          </div>
          <span className='text-xl font-semibold text-stone-900'>
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
                  placeholder='Search papers by title, author, keywords...'
                  className='w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400'
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              className='px-6 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition font-medium flex-shrink-0'
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

        {/* About link - always visible */}
        <Link
          href='/about'
          className='text-sm text-stone-700 hover:text-stone-900 transition flex-shrink-0 ml-auto'
        >
          About
        </Link>
      </div>
    </nav>
  );
}

export default function NavBar() {
  return (
    <Suspense fallback={
      <nav className='bg-white border-b border-stone-200'>
        <div className='flex items-center px-6 py-3 max-w-7xl mx-auto gap-6'>
          <div className='flex items-center gap-3'>
            <div className='bg-stone-100 p-1.5 rounded-lg'>
              <div className='w-7 h-7' />
            </div>
            <span className='text-xl font-semibold text-stone-900'>Paperazzi</span>
          </div>
        </div>
      </nav>
    }>
      <NavBarContent />
    </Suspense>
  );
}