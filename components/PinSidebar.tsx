'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pin, Search, X, ChevronRight, Loader2 } from 'lucide-react';
import { usePins } from '@/contexts/PinContext';
import { Paper, MAX_PINS } from '@/types/interfaces';
// import { fetchPapersCitingAll } from '@/lib/api';
import PaperCard from './ui/PaperCard';

interface PinSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function PinSidebar({ isOpen, onToggle }: PinSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pinnedPapers, pinnedIds, removePin, clearPins, isLoading } = usePins();
  
  const [citingAllResults, setCitingAllResults] = useState<Paper[]>([]);
  const [citingAllTotal, setCitingAllTotal] = useState(0);
  const [loadingCitingAll, setLoadingCitingAll] = useState(false);
  const [showCitingAll, setShowCitingAll] = useState(false);
  
  // Build URL params that preserve pins
  const preserveParams = pinnedIds.length > 0 ? `pinned=${pinnedIds.join(',')}` : '';
  
  // Search for papers citing a single pinned paper
  const handleSearchCiting = (paper: Paper) => {
    const paperId = paper.id.split('/').pop();
    // Navigate to search page with filter for papers citing this one
    const params = new URLSearchParams();
    // We'll use a special query format that the search can understand
    params.set('citing', paperId || '');
    if (pinnedIds.length > 0) {
      params.set('pinned', pinnedIds.join(','));
    }
    router.push(`/search?${params.toString()}`);
  };
  
  // Search for papers citing ALL pinned papers
  const handleSearchCitingAll = async () => {
    if (pinnedIds.length < 2) return;
    
    setLoadingCitingAll(true);
    setShowCitingAll(true);
    
    // try {
    //   const { papers, total } = await fetchPapersCitingAll(pinnedIds);
    //   setCitingAllResults(papers);
    //   setCitingAllTotal(total);
    // } catch (error) {
    //   console.error('Failed to fetch papers citing all:', error);
    // } finally {
    //   setLoadingCitingAll(false);
    // }
  };
  
  // Collapsed state - just show toggle button
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-white border border-r-0 border-stone-200 rounded-l-lg p-2 shadow-sm hover:bg-stone-50 transition"
        title={`Pinned papers (${pinnedPapers.length})`}
      >
        <div className="flex flex-col items-center gap-1">
          <Pin size={18} className={pinnedPapers.length > 0 ? 'fill-amber-500 text-amber-500' : 'text-stone-400'} />
          {pinnedPapers.length > 0 && (
            <span className="text-xs font-medium text-stone-600">{pinnedPapers.length}</span>
          )}
        </div>
      </button>
    );
  }
  
  return (
    <aside className="w-80  bg-white border-l border-stone-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <Pin size={14} className="fill-stone-700" />
            Pinned Papers ({pinnedPapers.length}/{MAX_PINS})
          </h3>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-stone-100 rounded transition"
            title="Close sidebar"
          >
            <ChevronRight size={16} className="text-stone-500" />
          </button>
        </div>
        
        {pinnedPapers.length > 0 && (
          <button
            onClick={clearPins}
            className="text-xs text-stone-500 hover:text-stone-700 transition"
          >
            Clear all
          </button>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-stone-400" size={24} />
          </div>
        ) : pinnedPapers.length === 0 ? (
          <div className="text-center py-8 text-stone-500 text-sm">
            <Pin size={24} className="mx-auto mb-2 text-stone-300" />
            <p>No papers pinned yet.</p>
            <p className="text-xs mt-1">Click the pin icon on any paper to add it here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pinnedPapers.map((paper) => (
              <div key={paper.id} className="relative group">
                <PaperCard
                  paper={paper}
                  variant="pinned"
                  showPinButton={true}
                  preserveParams={preserveParams}
                />
                
                {/* Search citing button */}
                <button
                  onClick={() => handleSearchCiting(paper)}
                  className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition"
                  title="Find papers that cite this paper"
                >
                  <Search size={12} />
                  Find citing papers
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Find papers citing ALL */}
        {pinnedPapers.length >= 2 && (
          <div className="mt-6 pt-4 border-t border-stone-200">
            <button
              onClick={handleSearchCitingAll}
              disabled={loadingCitingAll}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition text-sm font-medium disabled:opacity-50"
            >
              {loadingCitingAll ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Search size={16} />
              )}
              Find papers citing ALL ({pinnedPapers.length})
            </button>
            <p className="text-xs text-stone-500 text-center mt-2">
              Papers that cite all {pinnedPapers.length} pinned papers
            </p>
          </div>
        )}
        
        {/* Citing All Results */}
        {showCitingAll && (
          <div className="mt-4 pt-4 border-t border-stone-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-stone-900">
                Citing All ({citingAllTotal})
              </h4>
              <button
                onClick={() => {
                  setShowCitingAll(false);
                  setCitingAllResults([]);
                }}
                className="p-1 hover:bg-stone-100 rounded transition"
              >
                <X size={14} className="text-stone-500" />
              </button>
            </div>
            
            {loadingCitingAll ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="animate-spin text-stone-400" size={20} />
              </div>
            ) : citingAllResults.length === 0 ? (
              <p className="text-sm text-stone-500 text-center py-4">
                No papers found that cite all pinned papers.
              </p>
            ) : (
              <div className="space-y-2">
                {citingAllResults.slice(0, 10).map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    variant="pinned"
                    showPinButton={true}
                    preserveParams={preserveParams}
                  />
                ))}
                {citingAllTotal > 10 && (
                  <p className="text-xs text-stone-500 text-center pt-2">
                    Showing 10 of {citingAllTotal} results
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}