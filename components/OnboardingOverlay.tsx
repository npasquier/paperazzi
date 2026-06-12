'use client';

import { useSyncExternalStore } from 'react';
import { Filter, Pin, Search, Flag } from 'lucide-react';
import { STORAGE_KEYS } from '@/utils/storageKeys';

// "Has the user seen onboarding?" as a tiny external store over
// localStorage, read via useSyncExternalStore. This replaces the old
// read-in-effect + setState pattern (flagged by the React 19 compiler
// lint and double-rendering on mount). The server/hydration snapshot
// is `true` ("assume seen") so returning users never get an overlay
// flash; for new users the overlay appears right after hydration.
const seenListeners = new Set<() => void>();
// In-memory fallback so dismissal still works when localStorage is
// unavailable (private mode etc.) — degrades to once-per-session.
let seenInMemory = false;

function subscribeSeen(fn: () => void): () => void {
  seenListeners.add(fn);
  return () => {
    seenListeners.delete(fn);
  };
}

function readSeen(): boolean {
  if (seenInMemory) return true;
  try {
    return localStorage.getItem(STORAGE_KEYS.hasSeenOnboarding) !== null;
  } catch {
    // Can't read storage — err on the side of not nagging.
    return true;
  }
}

function markSeen() {
  seenInMemory = true;
  try {
    localStorage.setItem(STORAGE_KEYS.hasSeenOnboarding, 'true');
  } catch {
    /* degrade to the in-memory flag. */
  }
  for (const fn of [...seenListeners]) fn();
}

export default function OnboardingOverlay() {
  const hasSeen = useSyncExternalStore(subscribeSeen, readSeen, () => true);

  const dismiss = () => {
    markSeen();
  };

  if (hasSeen) return null;

  return (
    <div className='fixed inset-0 z-50 pointer-events-none'>
      {/* Subtle dark overlay */}
      <div
        className='absolute inset-0 overlay-soft pointer-events-auto'
        onClick={dismiss}
      />

      {/* Left hint - Filters */}
      <div className='absolute left-4 top-1/2 -translate-y-1/2 pointer-events-auto'>
        <div className='surface-card border border-app rounded-lg shadow-lg p-4 max-w-[200px]'>
          <div className='flex items-center gap-2 mb-2'>
            <Filter size={16} className='text-stone-600' />
            <span className='font-medium text-stone-900 text-sm'>Filters</span>
          </div>
          <p className='text-xs text-stone-500'>
            Filter by journals, author, institution, and year
          </p>
        </div>
        <div className='w-8 h-0.5 bg-[var(--border-strong)] ml-4 mt-2' />
      </div>

      {/* Top hint - Search */}
      <div className='absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto'>
        <div className='surface-card border border-app rounded-lg shadow-lg p-4 max-w-[240px] text-center'>
          <div className='flex items-center justify-center gap-2 mb-2'>
            <Search size={16} className='text-stone-600' />
            <span className='font-medium text-stone-900 text-sm'>Search</span>
          </div>
          <p className='text-xs text-stone-500'>
            Type a query in the search bar to find papers related to your
            keywords
          </p>
        </div>
        <div className='w-0.5 h-6 bg-[var(--border-strong)] mx-auto mt-2' />
      </div>

      {/* Right hint - Pinned Papers */}
      <div className='absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto'>
        <div className='surface-card border border-app rounded-lg shadow-lg p-4 max-w-[200px]'>
          <div className='flex items-center gap-2 mb-2'>
            <Pin size={16} className='text-stone-600' />
            <span className='font-medium text-stone-900 text-sm'>
              Pinned Papers
            </span>
          </div>
          <p className='text-xs text-stone-500'>
            Save papers, group them, and add notes / keywords
          </p>
        </div>
        <div className='w-8 h-0.5 bg-[var(--border-strong)] mr-4 mt-2 ml-auto' />
      </div>

      {/* Bottom hint - Report bad data. Frames OpenAlex contribution
          as a first-class part of the workflow, not a hidden power
          user feature. Anchored at the bottom-centre so it's
          unmistakable but doesn't crowd the three primary hints. */}
      <div className='absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto'>
        <div className='surface-card border border-app rounded-lg shadow-lg p-4 max-w-[280px] text-center'>
          <div className='flex items-center justify-center gap-2 mb-2'>
            <Flag size={16} className='text-stone-600' />
            <span className='font-medium text-stone-900 text-sm'>
              Spot bad data?
            </span>
          </div>
          <p className='text-xs text-stone-500 leading-relaxed'>
            Click the small flag on any paper to report errors to OpenAlex —
            the open dataset everyone uses gets better when researchers
            contribute back.
          </p>
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={dismiss}
        className='absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto button-primary px-6 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2'
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
