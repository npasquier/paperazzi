'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pin,
  Search,
  ChevronRight,
  ChevronDown,
  Loader2,
  Library,
  CheckSquare,
  Square,
  FolderPlus,
  Trash2,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { usePins } from '@/contexts/PinContext';
import { Paper, MAX_PINS } from '@/types/interfaces';
import PaperCard from './ui/PaperCard';
import { STORAGE_KEYS } from '@/utils/storageKeys';

// Warm, library-friendly palette for pin groups. The hues stay distinct, but
// they sit closer to the parchment/teal app theme than the old bright rainbow.
const GROUP_COLOR_PALETTE = [
  '#b66443', // terracotta
  '#6f8a3a', // moss
  '#3e79a6', // denim
  '#8b5a93', // plum
  '#b7842f', // ochre
  '#3d8077', // deep teal
  '#a05368', // dusty rose
  '#5e6f96', // slate indigo
];

// Deterministic group → color mapping. Hashing the group id (instead of using
// its index) keeps the color stable when groups are reordered.
function getGroupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) | 0;
  }
  return GROUP_COLOR_PALETTE[Math.abs(hash) % GROUP_COLOR_PALETTE.length];
}

interface PinSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onAuthorSearch?: (authorName: string) => void;
}

export default function PinSidebar({
  isOpen,
  onToggle,
  onAuthorSearch,
}: PinSidebarProps) {
  const router = useRouter();
  const {
    pinnedPapers,
    groups,
    clearPins,
    isLoading,
    createGroup,
    renameGroup,
    deleteGroup,
    movePaperToGroup,
    reorderPapersInGroup,
    getUngroupedPapers,
    getPapersInGroup,
  } = usePins();

  // Resize state
  const MIN_WIDTH = 360;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 360;
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.pinSidebarWidth);
    if (saved) setSidebarWidth(parseInt(saved, 10));
  }, []);
  const [isResizing, setIsResizing] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Group UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Drag state
  const [draggingPaperId, setDraggingPaperId] = useState<string | null>(null);
  const [draggingFromGroup, setDraggingFromGroup] = useState<string | null>(
    null,
  );
  const [draggingFromIndex, setDraggingFromIndex] = useState<number | null>(
    null,
  );
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<{
    groupId: string | null;
    index: number;
  } | null>(null);

  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const editGroupInputRef = useRef<HTMLInputElement>(null);

  const normalizeId = (id: string) => id.replace('https://openalex.org/', '');

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate new width (distance from right edge of viewport)
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        // Save to localStorage
        localStorage.setItem(
          STORAGE_KEYS.pinSidebarWidth,
          sidebarWidth.toString(),
        );
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, sidebarWidth]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    setSelectedIds(new Set(pinnedPapers.map((p) => normalizeId(p.id))));
  }, [pinnedPapers]);

  useEffect(() => {
    setExpandedGroups(new Set(groups.map((g) => g.id)));
  }, [groups]);

  useEffect(() => {
    if (showNewGroupInput && newGroupInputRef.current) {
      newGroupInputRef.current.focus();
    }
  }, [showNewGroupInput]);

  useEffect(() => {
    if (editingGroupId && editGroupInputRef.current) {
      editGroupInputRef.current.focus();
    }
  }, [editingGroupId]);

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

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
  const getSelectedIds = () => Array.from(selectedIds);
  // Handlers
  const handleSearchCiting = useCallback(
    (paper: Paper) => {
      const paperId = normalizeId(paper.id);
      const params = new URLSearchParams();
      params.set('citing', paperId);
      params.set('sort', 'cited_by_count:desc');
      params.set('page', '1');
      router.push(`/search?${params.toString()}`);
    },
    [router],
  );

  const handleSearchReferences = useCallback(
    (paper: Paper) => {
      const paperId = normalizeId(paper.id);
      const params = new URLSearchParams();
      params.set('referencedBy', paperId);
      params.set('sort', 'cited_by_count:desc');
      params.set('page', '1');
      router.push(`/search?${params.toString()}`);
    },
    [router],
  );

  useEffect(() => {
    const handleCitingClick = (e: Event) => {
      const customEvent = e as CustomEvent;
      const paper = customEvent.detail.paper;
      handleSearchCiting(paper);
    };

    const handleRefsClick = (e: Event) => {
      const customEvent = e as CustomEvent;
      const paper = customEvent.detail.paper;
      handleSearchReferences(paper);
    };

    window.addEventListener('paper-citing-click', handleCitingClick);
    window.addEventListener('paper-refs-click', handleRefsClick);

    return () => {
      window.removeEventListener('paper-citing-click', handleCitingClick);
      window.removeEventListener('paper-refs-click', handleRefsClick);
    };
  }, [handleSearchCiting, handleSearchReferences]);

  const handleSearchCitingAll = () => {
    const ids = getSelectedIds();
    if (ids.length < 2) return;
    const params = new URLSearchParams();
    params.set('citingAll', ids.join(','));
    params.set('sort', 'cited_by_count:desc');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
  };

  const handleSearchReferencesAll = () => {
    const ids = getSelectedIds();
    if (ids.length < 2) return;
    const params = new URLSearchParams();
    params.set('referencesAll', ids.join(','));
    params.set('sort', 'cited_by_count:desc');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
  };

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      const groupId = createGroup(newGroupName.trim());
      setExpandedGroups((prev) => new Set([...prev, groupId]));
      setNewGroupName('');
      setShowNewGroupInput(false);
    }
  };

  const handleRenameGroup = (groupId: string) => {
    if (editingName.trim()) {
      renameGroup(groupId, editingName.trim());
    }
    setEditingGroupId(null);
    setEditingName('');
  };

  // Enhanced drag handlers
  const handleDragStart = (
    e: React.DragEvent,
    paperId: string,
    groupId: string | null,
    index: number,
  ) => {
    const normalizedId = normalizeId(paperId);
    setDraggingPaperId(normalizedId);
    setDraggingFromGroup(groupId);
    setDraggingFromIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingPaperId(null);
    setDraggingFromGroup(null);
    setDraggingFromIndex(null);
    setDragOverGroupId(null);
    setDropIndicatorPosition(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOverPaper = (
    e: React.DragEvent,
    targetGroupId: string | null,
    targetIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY;
    const paperMiddle = rect.top + rect.height / 2;
    const isBelow = mouseY > paperMiddle;

    // Calculate the actual drop index
    let dropIndex = isBelow ? targetIndex + 1 : targetIndex;

    // If dragging within the same group and dropping after the dragged item,
    // adjust the index
    if (
      draggingFromGroup === targetGroupId &&
      draggingFromIndex !== null &&
      dropIndex > draggingFromIndex
    ) {
      dropIndex--;
    }

    setDropIndicatorPosition({
      groupId: targetGroupId,
      index: dropIndex,
    });
  };

  const handleDragOverGroup = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the container, not a child
    if (e.currentTarget === e.target) {
      setDragOverGroupId(null);
      setDropIndicatorPosition(null);
    }
  };

  const handleDropOnPaper = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggingPaperId || !dropIndicatorPosition) return;

    const { groupId: targetGroupId, index: targetIndex } =
      dropIndicatorPosition;

    // Case 1: Reordering within the same group/section
    if (draggingFromGroup === targetGroupId && draggingFromIndex !== null) {
      if (draggingFromIndex !== targetIndex) {
        reorderPapersInGroup(targetGroupId, draggingFromIndex, targetIndex);
      }
    }
    // Case 2: Moving to a different group
    else {
      movePaperToGroup(draggingPaperId, targetGroupId);
      // If we want to place it at a specific position in the target group,
      // we need to move it first, then reorder
      if (targetGroupId !== null) {
        // Get the current papers in the target group
        const targetPapers = getPapersInGroup(targetGroupId);
        // The paper will be added at the end, so we need to move it to the target index
        setTimeout(() => {
          reorderPapersInGroup(targetGroupId, targetPapers.length, targetIndex);
        }, 0);
      }
    }

    setDraggingPaperId(null);
    setDraggingFromGroup(null);
    setDraggingFromIndex(null);
    setDragOverGroupId(null);
    setDropIndicatorPosition(null);
  };

  const handleDropOnGroup = (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    if (draggingPaperId) {
      movePaperToGroup(draggingPaperId, groupId);
    }
    setDraggingPaperId(null);
    setDraggingFromGroup(null);
    setDraggingFromIndex(null);
    setDragOverGroupId(null);
    setDropIndicatorPosition(null);
  };

  // Render paper item
  const renderPaperItem = (
    paper: Paper,
    groupId: string | null,
    index: number,
  ) => {
    const groupColor = groupId ? getGroupColor(groupId) : undefined;
    const normalizedId = normalizeId(paper.id);
    const isSelected = selectedIds.has(normalizedId);
    const isDragging = draggingPaperId === normalizedId;
    const showDropIndicatorAbove =
      dropIndicatorPosition?.groupId === groupId &&
      dropIndicatorPosition?.index === index;
    const showDropIndicatorBelow =
      dropIndicatorPosition?.groupId === groupId &&
      dropIndicatorPosition?.index === index + 1;

    return (
      <div key={paper.id} className='relative'>
        {showDropIndicatorAbove && (
          <div className='h-0.5 bg-[var(--border-strong)] -mt-1 mb-1 rounded-full' />
        )}

        <div
          className={`relative transition-opacity ${
            isDragging ? 'opacity-30' : ''
          } ${!selectionMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
          draggable={!selectionMode}
          onDragStart={(e) => handleDragStart(e, paper.id, groupId, index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverPaper(e, groupId, index)}
          onDrop={handleDropOnPaper}
        >
          <div className='flex items-start gap-2'>
            {selectionMode && (
              <button
                onClick={() => toggleSelection(paper.id)}
                className={`mt-2 p-0.5 rounded transition flex-shrink-0 ${
                  isSelected
                    ? 'text-stone-700'
                    : 'text-stone-300 hover:text-stone-500'
                }`}
              >
                {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
            )}

            <div
              className={`flex-1 rounded transition ${
                selectionMode && isSelected
                  ? 'ring-1 ring-[var(--accent-border)]'
                  : ''
              }`}
            >
              <PaperCard
                paper={paper}
                variant='pinned'
                showPinButton={!selectionMode}
                onAuthorClick={onAuthorSearch}
                groupColor={groupColor}
                disablePrimaryOpen={selectionMode}
              />
            </div>
          </div>
        </div>

        {showDropIndicatorBelow && (
          <div className='h-0.5 bg-[var(--border-strong)] mt-1 -mb-1 rounded-full' />
        )}
      </div>
    );
  };

  // Render group
  const renderGroup = (groupId: string, groupName: string, papers: Paper[]) => {
    const isExpanded = expandedGroups.has(groupId);
    const isEditing = editingGroupId === groupId;
    const isDragOver = dragOverGroupId === groupId && !dropIndicatorPosition;

    return (
      <div key={groupId} className='mb-4'>
        {/* Group Header */}
        <div
          className={`group flex items-center gap-2 py-1 px-1.5 -mx-1.5 rounded-md transition ${
            isDragOver ? 'surface-muted' : 'hover:bg-[var(--surface-muted)]'
          }`}
          onDragOver={(e) => handleDragOverGroup(e, groupId)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDropOnGroup(e, groupId)}
        >
          <button
            onClick={() => toggleGroupExpanded(groupId)}
            className='p-0.5 text-stone-400 hover:text-stone-600 rounded transition flex-shrink-0'
          >
            {isExpanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )}
          </button>

          {isEditing ? (
            <div className='flex-1 flex items-center gap-1.5'>
              <input
                ref={editGroupInputRef}
                type='text'
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameGroup(groupId);
                  if (e.key === 'Escape') {
                    setEditingGroupId(null);
                    setEditingName('');
                  }
                }}
                className='flex-1 px-2 py-1 text-[11px] border border-app rounded-md bg-transparent focus-accent'
              />
              <button
                onClick={() => handleRenameGroup(groupId)}
                className='p-0.5 text-stone-500 hover:text-stone-700'
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => {
                  setEditingGroupId(null);
                  setEditingName('');
                }}
                className='p-0.5 text-stone-400 hover:text-stone-600'
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              <span
                className='inline-block w-1.5 h-1.5 rounded-full flex-shrink-0'
                style={{ backgroundColor: getGroupColor(groupId) }}
                aria-hidden='true'
              />
              <span className='flex-1 min-w-0 truncate text-[11px] font-medium text-stone-700'>
                {groupName}
              </span>
              <span className='text-[11px] text-stone-400'>
                {papers.length}
              </span>
              <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition'>
                <button
                  onClick={() => {
                    setEditingGroupId(groupId);
                    setEditingName(groupName);
                  }}
                  className='p-0.5 text-stone-400 hover:text-stone-600 transition'
                  title='Rename'
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={() => deleteGroup(groupId)}
                  className='p-0.5 text-stone-400 hover:text-danger transition'
                  title='Delete'
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </>
          )}
        </div>

        {isExpanded && (
          <div className='mt-1.5 space-y-1.5'>
            {papers.length === 0 ? (
              <p className='text-[11px] text-stone-400 italic py-1 pl-4'>
                Drag papers here
              </p>
            ) : (
              papers.map((paper, index) =>
                renderPaperItem(paper, groupId, index),
              )
            )}
          </div>
        )}
      </div>
    );
  };

  // Collapsed state
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className='fixed right-0 top-1/2 -translate-y-1/2 z-40 surface-panel border border-app border-r-0 rounded-l-lg p-2 shadow-sm hover:bg-[var(--surface-muted)] transition'
        title={`Pinned (${pinnedPapers.length})`}
      >
        <div className='flex flex-col items-center gap-1'>
          <Pin
            size={16}
            className={
              pinnedPapers.length > 0 ? 'text-stone-600' : 'text-stone-300'
            }
          />
          {pinnedPapers.length > 0 && (
            <span className='text-xs text-stone-500'>
              {pinnedPapers.length}
            </span>
          )}
        </div>
      </button>
    );
  }

  const ungroupedPapers = getUngroupedPapers();
  const hasGroups = groups.length > 0;

  return (
    <>
      {/* Resizable Sidebar */}
      <aside
        className='surface-panel border-l border-app flex flex-col h-full overflow-hidden relative'
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart}
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group hover:bg-[var(--border-strong)] transition-colors ${
            isResizing ? 'bg-[var(--foreground-soft)]' : ''
          }`}
        >
          <div className='absolute left-0 top-0 bottom-0 w-3 -translate-x-1' />
        </div>

        {/* Header */}
        <div className='px-4 pt-4 pb-3 border-b border-app flex-shrink-0 space-y-3'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <Pin size={13} className='text-stone-400' />
                <span className='text-sm font-medium text-stone-700'>
                  Pinned papers
                </span>
                {pinnedPapers.length > 0 && (
                  <span className='text-xs text-stone-400'>
                    ({pinnedPapers.length}/{MAX_PINS})
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onToggle}
              className='p-1 text-stone-400 hover:text-stone-600 rounded transition'
              title='Close'
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {pinnedPapers.length > 0 && (
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]'>
              <button
                onClick={clearPins}
                className='text-stone-400 hover:text-stone-600 transition'
              >
                Clear all
              </button>
              <button
                onClick={() => setShowNewGroupInput(true)}
                className='inline-flex items-center gap-1 text-stone-500 hover:text-stone-700 transition'
                title='New group'
              >
                <FolderPlus size={12} />
                New group
              </button>
            </div>
          )}

          {selectionMode && pinnedPapers.length >= 2 && (
            <div className='flex items-center gap-3 text-[11px] text-stone-500'>
              <span>{selectedCount} selected</span>
              <button
                onClick={selectAll}
                className='text-stone-500 hover:text-stone-700 transition'
              >
                All
              </button>
              <button
                onClick={selectNone}
                className='text-stone-400 hover:text-stone-600 transition'
              >
                None
              </button>
            </div>
          )}

          {showNewGroupInput && (
            <div className='flex items-center gap-1.5 pt-1'>
              <input
                ref={newGroupInputRef}
                type='text'
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateGroup();
                  if (e.key === 'Escape') {
                    setShowNewGroupInput(false);
                    setNewGroupName('');
                  }
                }}
                placeholder='Group name'
                className='flex-1 px-2 py-1 text-[11px] border border-app rounded-md bg-transparent focus-accent'
              />
              <button
                onClick={handleCreateGroup}
                className='p-0.5 text-stone-500 hover:text-stone-700'
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => {
                  setShowNewGroupInput(false);
                  setNewGroupName('');
                }}
                className='p-0.5 text-stone-400 hover:text-stone-600'
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        <div className='app-scrollbar flex-1 overflow-y-auto px-4 py-4'>
          {isLoading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='animate-spin text-stone-300' size={20} />
            </div>
          ) : pinnedPapers.length === 0 ? (
            <div className='text-center py-10'>
              <p className='text-xs text-stone-400'>No papers pinned yet</p>
              <p className='text-[11px] text-stone-400 mt-1'>
                Use the pin button from search results to build a reading list.
              </p>
            </div>
          ) : (
            <div className='space-y-4'>
              {groups.map((group, index) =>
                renderGroup(group.id, group.name, getPapersInGroup(group.id)),
              )}

              {hasGroups && ungroupedPapers.length > 0 && (
                <div className='pt-1'>
                  <p className='text-[10px] uppercase tracking-[0.12em] text-stone-400 mb-2'>
                    Ungrouped
                  </p>
                </div>
              )}

              {ungroupedPapers.length > 0 && (
                <div
                  className={`space-y-1.5 transition rounded ${
                    dragOverGroupId === 'ungrouped' && !dropIndicatorPosition
                      ? 'surface-muted p-2 -m-2'
                      : ''
                  }`}
                  onDragOver={(e) => handleDragOverGroup(e, 'ungrouped')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropOnGroup(e, null)}
                >
                  {ungroupedPapers.map((paper, index) =>
                    renderPaperItem(paper, null, index),
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {pinnedPapers.length >= 2 && (
          <div className='px-4 py-3 border-t border-app'>
            <div className='flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-stone-400'>
              <span>Selection</span>
              <span>{selectedCount} selected</span>
            </div>

            <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]'>
              <button
                onClick={() => setSelectionMode((v) => !v)}
                className={`transition ${
                  selectionMode
                    ? 'text-stone-700'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {selectionMode ? 'Done selecting' : 'Select papers'}
              </button>

              <button
                onClick={handleSearchCitingAll}
                disabled={selectedCount < 2}
                className='inline-flex items-center gap-1 text-stone-600 hover:text-stone-800 transition disabled:text-stone-300 disabled:cursor-not-allowed'
              >
                <Search size={11} />
                Citing all
              </button>

              <button
                onClick={handleSearchReferencesAll}
                disabled={selectedCount < 2}
                className='inline-flex items-center gap-1 text-stone-600 hover:text-stone-800 transition disabled:text-stone-300 disabled:cursor-not-allowed'
              >
                <Library size={11} />
                Common refs
              </button>

              {selectionMode && selectedCount < 2 && (
                <span className='text-stone-400'>Select at least 2</span>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
