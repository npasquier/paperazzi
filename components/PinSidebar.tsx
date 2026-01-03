'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pin,
  Search,
  ChevronRight,
  Loader2,
  BookOpen,
  Library,
  CheckSquare,
  Square,
  CheckCircle2,
} from 'lucide-react';
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

  // Selection state - by default all are selected
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Sync selectedIds when pinnedPapers change
  useEffect(() => {
    setSelectedIds(new Set(pinnedPapers.map((p) => p.id.replace('https://openalex.org/', ''))));
  }, [pinnedPapers]);

  const normalizeId = (id: string) => id.replace('https://openalex.org/', '');

  const toggleSelection = (paperId: string) => {
    const normalizedId = normalizeId(paperId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(normalizedId)) {
        next.delete(normalizedId);
      } else {
        next.add(normalizedId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(pinnedPapers.map((p) => normalizeId(p.id))));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === pinnedPapers.length;

  // Get array of selected IDs
  const getSelectedIds = () => Array.from(selectedIds);

  // Build URL params that preserve pins
  const preserveParams =
    pinnedIds.length > 0 ? `pinned=${pinnedIds.join(',')}` : '';

  const handleSearchCiting = (paper: Paper) => {
    const paperId = normalizeId(paper.id);
    if (onFindingCites) {
      onFindingCites(paperId, pinnedIds);
    }
  };

  const handleSearchReferences = (paper: Paper) => {
    const paperId = normalizeId(paper.id);
    const params = new URLSearchParams();
    params.set('referencedBy', paperId);
    params.set('sort', 'cited_by_count:desc');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
  };

  const handleSearchCitingAll = () => {
    const ids = getSelectedIds();
    if (ids.length < 2) return;
    const params = new URLSearchParams();
    params.set('citingAll', ids.join(','));
    router.push(`/search?${params.toString()}`);
  };

  const handleSearchReferencesAll = () => {
    const ids = getSelectedIds();
    if (ids.length < 2) return;
    const params = new URLSearchParams();
    params.set('referencesAll', ids.join(','));
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
          <div className='flex items-center justify-between'>
            <button
              onClick={clearPins}
              className='text-xs text-stone-500 hover:text-stone-700 transition'
            >
              Clear all
            </button>

            {pinnedPapers.length >= 2 && (
              <button
                onClick={() => setSelectionMode((v) => !v)}
                className={`text-xs px-2 py-1 rounded transition ${
                  selectionMode
                    ? 'bg-stone-800 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {selectionMode ? 'Done' : 'Select'}
              </button>
            )}
          </div>
        )}

        {/* Selection controls */}
        {selectionMode && pinnedPapers.length >= 2 && (
          <div className='mt-3 pt-3 border-t border-stone-100 flex items-center justify-between'>
            <span className='text-xs text-stone-600'>
              {selectedCount} of {pinnedPapers.length} selected
            </span>
            <div className='flex gap-2'>
              <button
                onClick={selectAll}
                className='text-xs text-blue-600 hover:text-blue-800'
              >
                All
              </button>
              <span className='text-stone-300'>|</span>
              <button
                onClick={selectNone}
                className='text-xs text-stone-500 hover:text-stone-700'
              >
                None
              </button>
            </div>
          </div>
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
            {pinnedPapers.map((paper) => {
              const normalizedId = normalizeId(paper.id);
              const isSelected = selectedIds.has(normalizedId);

              return (
                <div key={paper.id} className='relative group'>
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <button
                      onClick={() => toggleSelection(paper.id)}
                      className={`absolute -left-1 top-2 z-10 p-0.5 rounded transition ${
                        isSelected
                          ? 'text-stone-800'
                          : 'text-stone-300 hover:text-stone-500'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  )}

                  <div className={selectionMode ? 'ml-6' : ''}>
                    <div
                      className={`rounded-lg transition ${
                        selectionMode && isSelected
                          ? 'ring-2 ring-stone-300'
                          : ''
                      }`}
                    >
                      <PaperCard
                        paper={paper}
                        variant='pinned'
                        showPinButton={!selectionMode}
                        preserveParams={preserveParams}
                      />
                    </div>

                    {/* Action buttons - hide in selection mode */}
                    {!selectionMode && (
                      <div className='mt-1 flex gap-1'>
                        <button
                          onClick={() => handleSearchCiting(paper)}
                          className='flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition'
                          title='Find papers that cite this paper'
                        >
                          <Search size={12} />
                          Citing
                        </button>

                        <button
                          onClick={() => handleSearchReferences(paper)}
                          className='flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition'
                          title='Find papers cited by this paper'
                        >
                          <BookOpen size={12} />
                          References
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Multi-paper actions */}
        {pinnedPapers.length >= 2 && (
          <div className='mt-6 pt-4 border-t border-stone-200 space-y-3'>
            {/* Find papers citing ALL selected */}
            <button
              onClick={handleSearchCitingAll}
              disabled={selectedCount < 2}
              className='w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <Search size={16} />
              Papers citing ALL
              {selectionMode && selectedCount >= 2 && (
                <span className='bg-white/20 px-1.5 py-0.5 rounded text-xs'>
                  {selectedCount}
                </span>
              )}
            </button>

            {/* Find common references */}
            <button
              onClick={handleSearchReferencesAll}
              disabled={selectedCount < 2}
              className='w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-green-700 text-white rounded-lg hover:bg-green-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <Library size={16} />
              Common references
              {selectionMode && selectedCount >= 2 && (
                <span className='bg-white/20 px-1.5 py-0.5 rounded text-xs'>
                  {selectedCount}
                </span>
              )}
            </button>

            <p className='text-xs text-stone-500 text-center'>
              {selectionMode
                ? selectedCount < 2
                  ? 'Select at least 2 papers'
                  : `Using ${selectedCount} selected papers`
                : `Using all ${pinnedPapers.length} pinned papers`}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}