'use client';

import { useState, useEffect } from 'react';
import { X, Filter, Pin, Search } from 'lucide-react';

export default function OnboardingOverlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className='fixed inset-0 z-50 pointer-events-none'>
      {/* Subtle dark overlay */}
      <div
        className='absolute inset-0 bg-black/20 pointer-events-auto'
        onClick={dismiss}
      />

      {/* Left hint - Filters */}
      <div className='absolute left-4 top-1/2 -translate-y-1/2 pointer-events-auto'>
        <div className='bg-white rounded-lg shadow-lg p-4 max-w-[200px]'>
          <div className='flex items-center gap-2 mb-2'>
            <Filter size={16} className='text-stone-600' />
            <span className='font-medium text-stone-900 text-sm'>Filters</span>
          </div>
          <p className='text-xs text-stone-500'>
            Filter by journals, author, institution, and year
          </p>
        </div>
        <div className='w-8 h-0.5 bg-stone-300 ml-4 mt-2' />
      </div>

      {/* Top hint - Search */}
      <div className='absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto'>
        <div className='bg-white rounded-lg shadow-lg p-4 max-w-[220px] text-center'>
          <div className='flex items-center justify-center gap-2 mb-2'>
            <Search size={16} className='text-stone-600' />
            <span className='font-medium text-stone-900 text-sm'>Search</span>
          </div>
          <p className='text-xs text-stone-500'>
            Search by keywords
          </p>
        </div>
        <div className='w-0.5 h-6 bg-stone-300 mx-auto mt-2' />
      </div>

      {/* Right hint - Pinned Papers */}
      <div className='absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto'>
        <div className='bg-white rounded-lg shadow-lg p-4 max-w-[200px]'>
          <div className='flex items-center gap-2 mb-2'>
            <Pin size={16} className='text-stone-600' />
            <span className='font-medium text-stone-900 text-sm'>
              Pinned Papers
            </span>
          </div>
          <p className='text-xs text-stone-500'>
            Save papers and explore their links
          </p>
        </div>
        <div className='w-8 h-0.5 bg-stone-300 mr-4 mt-2 ml-auto' />
      </div>

      {/* Dismiss button */}
      <button
        onClick={dismiss}
        className='absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto bg-stone-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-800 transition flex items-center gap-2'
      >
        Got it
      </button>

      {/* Skip text */}
      <button
        onClick={dismiss}
        className='absolute bottom-8 right-8 pointer-events-auto text-xs text-white/70 hover:text-white transition'
      >
        Press anywhere to dismiss
      </button>
    </div>
  );
}