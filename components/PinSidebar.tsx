'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, Search, ChevronRight, Loader2, BookOpen, Library } from 'lucide-react';
import { usePins } from '@/contexts/PinContext';
import { Paper, MAX_PINS } from '@/types/interfaces';
import PaperCard from './ui/PaperCard';

interface PinSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onFindingCites?: (paperId: string, pinnedIds: string[]) => void;
}

export default function PinSidebar({
  isOpen,
  onToggle,
  onFindingCites,
}: PinSidebarProps) {
  const router = useRouter();
  const { pinnedPapers, pinnedIds, clearPins, isLoading } = usePins();

  const [loadingCitingAll, setLoadingCitingAll] = useState(false);
  const [loadingReferencesAll, setLoadingReferencesAll] = useState(false);

  // Build URL params that preserve pins
  const preserveParams =
    pinnedIds.length > 0 ? `pinned=${pinnedIds.join(',')}` : '';

  const handleSearchCiting = (paper: Paper) => {
    const paperId = paper.id.split('/').pop() || '';
    if (onFindingCites) {
      onFindingCites(paperId, pinnedIds);
    }
  };

  const handleSearchReferences = (paper: Paper) => {
    const paperId = paper.id.replace('https://openalex.org/', '');
    const params = new URLSearchParams();
    params.set('referencedBy', paperId);
    params.set('sort', 'cited_by_count:desc');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
  };

  const handleSearchCitingAll = () => {
    if (pinnedIds.length < 2) return;
    const params = new URLSearchParams();
    params.set('citingAll', pinnedIds.join(','));
    router.push(`/search?${params.toString()}`);
  };

  const handleSearchReferencesAll = () => {
    if (pinnedIds.length < 2) return;
    const params = new URLSearchParams();
    params.set('referencesAll', pinnedIds.join(','));
    params.set('sort', 'cited_by_count:desc');
    router.push(`/search?${params.toString()}`);
  };

  // Collapsed state - just show toggle button
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className='fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-white border border-r-0 border-stone-200 rounded-l-lg p-2 shadow-sm hover:bg-stone-50 transition'
        title={`Pinned papers (${pinnedPapers.length})`}
      >
        <div className='flex flex-col items-center gap-1'>
          <Pin
            size={18}
            className={
              pinnedPapers.length > 0
                ? 'fill-amber-500 text-amber-500'
                : 'text-stone-400'
            }
          />
          {pinnedPapers.length > 0 && (
            <span className='text-xs font-medium text-stone-600'>
              {pinnedPapers.length}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <aside className='w-80 bg-white border-l border-stone-200 flex flex-col h-full overflow-hidden'>
      {/* Header */}
      <div className='p-4 border-b border-stone-200 flex-shrink-0'>
        <div className='flex items-center justify-between mb-2'>
          <h3 className='text-sm font-semibold text-stone-900 flex items-center gap-2'>
            <Pin size={14} className='fill-stone-700' />
            Pinned Papers ({pinnedPapers.length}/{MAX_PINS})
          </h3>
          <button
            onClick={onToggle}
            className='p-1 hover:bg-stone-100 rounded transition'
            title='Close sidebar'
          >
            <ChevronRight size={16} className='text-stone-500' />
          </button>
        </div>

        {pinnedPapers.length > 0 && (
          <button
            onClick={clearPins}
            className='text-xs text-stone-500 hover:text-stone-700 transition'
          >
            Clear all
          </button>
        )}
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4'>
        {isLoading ? (
          <div className='flex items-center justify-center py-8'>
            <Loader2 className='animate-spin text-stone-400' size={24} />
          </div>
        ) : pinnedPapers.length === 0 ? (
          <div className='text-center py-8 text-stone-500 text-sm'>
            <Pin size={24} className='mx-auto mb-2 text-stone-300' />
            <p>No papers pinned yet.</p>
            <p className='text-xs mt-1'>
              Click the pin icon on any paper to add it here.
            </p>
          </div>
        ) : (
          <div className='space-y-3'>
            {pinnedPapers.map((paper) => (
              <div key={paper.id} className='relative group'>
                <PaperCard
                  paper={paper}
                  variant='pinned'
                  showPinButton={true}
                  preserveParams={preserveParams}
                />

                {/* Action buttons */}
                <div className='mt-1 flex gap-1'>
                  {/* Find citing papers (forward citations) */}
                  <button
                    onClick={() => handleSearchCiting(paper)}
                    className='flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition'
                    title='Find papers that cite this paper'
                  >
                    <Search size={12} />
                    Citing
                  </button>

                  {/* Find references (backward citations) */}
                  <button
                    onClick={() => handleSearchReferences(paper)}
                    className='flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition'
                    title='Find papers cited by this paper'
                  >
                    <BookOpen size={12} />
                    References
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Multi-paper actions */}
        {pinnedPapers.length >= 2 && (
          <div className='mt-6 pt-4 border-t border-stone-200 space-y-3'>
            {/* Find papers citing ALL */}
            <button
              onClick={handleSearchCitingAll}
              disabled={loadingCitingAll}
              className='w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition text-sm font-medium disabled:opacity-50'
            >
              {loadingCitingAll ? (
                <Loader2 className='animate-spin' size={16} />
              ) : (
                <Search size={16} />
              )}
              Papers citing ALL ({pinnedPapers.length})
            </button>

            {/* Find common references */}
            <button
              onClick={handleSearchReferencesAll}
              disabled={loadingReferencesAll}
              className='w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-green-700 text-white rounded-lg hover:bg-green-600 transition text-sm font-medium disabled:opacity-50'
            >
              {loadingReferencesAll ? (
                <Loader2 className='animate-spin' size={16} />
              ) : (
                <Library size={16} />
              )}
              Common references ({pinnedPapers.length})
            </button>

            <p className='text-xs text-stone-500 text-center'>
              Find papers cited by all {pinnedPapers.length} pinned papers
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}