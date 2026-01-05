'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pin,
  Search,
  ChevronRight,
  ChevronDown,
  Loader2,
  BookOpen,
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

interface PinSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function PinSidebar({ isOpen, onToggle }: PinSidebarProps) {
  const router = useRouter();
  const {
    pinnedPapers,
    pinnedIds,
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
    null
  );
  const [draggingFromIndex, setDraggingFromIndex] = useState<number | null>(
    null
  );
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<{
    groupId: string | null;
    index: number;
  } | null>(null);

  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const editGroupInputRef = useRef<HTMLInputElement>(null);

  const normalizeId = (id: string) => id.replace('https://openalex.org/', '');

  useEffect(() => {
    setSelectedIds(new Set(pinnedPapers.map((p) => normalizeId(p.id))));
  }, [pinnedPapers]);

  useEffect(() => {
    setExpandedGroups(new Set(groups.map((g) => g.id)));
  }, [groups.length]);

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
  const preserveParams =
    pinnedIds.length > 0 ? `pinned=${pinnedIds.join(',')}` : '';

  // Handlers
  const handleSearchCiting = (paper: Paper) => {
    const paperId = normalizeId(paper.id);
    const params = new URLSearchParams();
    params.set('citing', paperId);
    params.set('sort', 'cited_by_count:desc');
    params.set('page', '1');
    router.push(`/search?${params.toString()}`);
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
    index: number
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
    targetIndex: number
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
    index: number
  ) => {
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
          <div className='h-0.5 bg-stone-400 -mt-1 mb-1 rounded-full' />
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
                selectionMode && isSelected ? 'ring-1 ring-stone-300' : ''
              }`}
            >
              <PaperCard
                paper={paper}
                variant='pinned'
                showPinButton={!selectionMode}
                preserveParams={preserveParams}
              />

              {!selectionMode && (
                <div className='mt-1 flex gap-1'>
                  <button
                    onClick={() => handleSearchCiting(paper)}
                    className='flex-1 flex items-center justify-center gap-1 py-1 text-xs text-stone-400 hover:text-stone-600 transition'
                    title='Find papers that cite this paper'
                  >
                    <Search size={10} />
                    Citing
                  </button>
                  <button
                    onClick={() => handleSearchReferences(paper)}
                    className='flex-1 flex items-center justify-center gap-1 py-1 text-xs text-stone-400 hover:text-stone-600 transition'
                    title='Find papers cited by this paper'
                  >
                    <BookOpen size={10} />
                    Refs
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showDropIndicatorBelow && (
          <div className='h-0.5 bg-stone-400 mt-1 -mb-1 rounded-full' />
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
      <div
        key={groupId}
        className={`transition rounded ${isDragOver ? 'bg-stone-50' : ''}`}
        onDragOver={(e) => handleDragOverGroup(e, groupId)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDropOnGroup(e, groupId)}
      >
        <div className='group flex items-center gap-1 py-2'>
          <button
            onClick={() => toggleGroupExpanded(groupId)}
            className='p-0.5 hover:bg-stone-100 rounded transition'
          >
            {isExpanded ? (
              <ChevronDown size={12} className='text-stone-400' />
            ) : (
              <ChevronRight size={12} className='text-stone-400' />
            )}
          </button>

          {isEditing ? (
            <div className='flex-1 flex items-center gap-1'>
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
                className='flex-1 px-2 py-0.5 text-xs border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-300'
              />
              <button
                onClick={() => handleRenameGroup(groupId)}
                className='p-0.5 text-stone-500 hover:text-stone-700'
              >
                <Check size={12} />
              </button>
              <button
                onClick={() => {
                  setEditingGroupId(null);
                  setEditingName('');
                }}
                className='p-0.5 text-stone-400 hover:text-stone-600'
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <span className='flex-1 text-xs text-stone-500'>{groupName}</span>
              <span className='text-xs text-stone-300'>{papers.length}</span>
              <div className='flex items-center opacity-0 group-hover:opacity-100 transition'>
                <button
                  onClick={() => {
                    setEditingGroupId(groupId);
                    setEditingName(groupName);
                  }}
                  className='p-0.5 text-stone-300 hover:text-stone-500'
                  title='Rename'
                >
                  <Edit2 size={10} />
                </button>
                <button
                  onClick={() => deleteGroup(groupId)}
                  className='p-0.5 text-stone-300 hover:text-red-500'
                  title='Delete'
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </>
          )}
        </div>

        {isExpanded && (
          <div className='pl-5 space-y-2 pb-2'>
            {papers.length === 0 ? (
              <p className='text-xs text-stone-300 py-1'>Drag papers here</p>
            ) : (
              papers.map((paper, index) =>
                renderPaperItem(paper, groupId, index)
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
        className='fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-white border border-r-0 border-stone-200 rounded-l-lg p-2 shadow-sm hover:bg-stone-50 transition'
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
    <aside className='w-72 bg-white border-l border-stone-200 flex flex-col h-full overflow-hidden'>
      {/* Header */}
      <div className='px-4 py-3 border-b border-stone-200 flex-shrink-0'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Pin size={14} className='text-stone-400' />
            <span className='text-sm font-medium text-stone-700'>Pinned</span>
            {pinnedPapers.length > 0 && (
              <span className='text-xs text-stone-400'>
                {pinnedPapers.length}/{MAX_PINS}
              </span>
            )}
          </div>
          <button
            onClick={onToggle}
            className='p-1 hover:bg-stone-100 rounded transition'
            title='Close'
          >
            <ChevronRight size={14} className='text-stone-400' />
          </button>
        </div>

        {pinnedPapers.length > 0 && (
          <div className='flex items-center justify-between mt-2'>
            <button
              onClick={clearPins}
              className='text-xs text-stone-400 hover:text-stone-600 transition'
            >
              Clear
            </button>
            <div className='flex items-center gap-1'>
              {pinnedPapers.length >= 2 && (
                <button
                  onClick={() => setSelectionMode((v) => !v)}
                  className={`text-xs px-2 py-0.5 rounded transition ${
                    selectionMode
                      ? 'bg-stone-700 text-white'
                      : 'text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  {selectionMode ? 'Done' : 'Select'}
                </button>
              )}
              <button
                onClick={() => setShowNewGroupInput(true)}
                className='p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition'
                title='New group'
              >
                <FolderPlus size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Selection controls */}
        {selectionMode && pinnedPapers.length >= 2 && (
          <div className='mt-2 pt-2 border-t border-stone-100 flex items-center justify-between'>
            <span className='text-xs text-stone-500'>
              {selectedCount} selected
            </span>
            <div className='flex gap-2 text-xs'>
              <button
                onClick={selectAll}
                className='text-stone-500 hover:text-stone-700'
              >
                All
              </button>
              <span className='text-stone-200'>|</span>
              <button
                onClick={selectNone}
                className='text-stone-400 hover:text-stone-600'
              >
                None
              </button>
            </div>
          </div>
        )}

        {/* New group input */}
        {showNewGroupInput && (
          <div className='mt-2 pt-2 border-t border-stone-100 flex items-center gap-1'>
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
              className='flex-1 px-2 py-1 text-xs border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300'
            />
            <button
              onClick={handleCreateGroup}
              className='p-1 text-stone-500 hover:text-stone-700'
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => {
                setShowNewGroupInput(false);
                setNewGroupName('');
              }}
              className='p-1 text-stone-400 hover:text-stone-600'
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto px-4 py-3'>
        {isLoading ? (
          <div className='flex items-center justify-center py-8'>
            <Loader2 className='animate-spin text-stone-300' size={20} />
          </div>
        ) : pinnedPapers.length === 0 ? (
          <div className='text-center py-8'>
            <p className='text-xs text-stone-400'>No papers pinned</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {/* Groups */}
            {groups.map((group) =>
              renderGroup(group.id, group.name, getPapersInGroup(group.id))
            )}

            {/* Separator */}
            {hasGroups && ungroupedPapers.length > 0 && (
              <div className='border-t border-dashed border-stone-200 my-3' />
            )}

            {/* Ungrouped */}
            {ungroupedPapers.length > 0 && (
              <div
                className={`space-y-2 transition rounded ${
                  dragOverGroupId === 'ungrouped' && !dropIndicatorPosition
                    ? 'bg-stone-50 p-2 -m-2'
                    : ''
                }`}
                onDragOver={(e) => handleDragOverGroup(e, 'ungrouped')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDropOnGroup(e, null)}
              >
                {ungroupedPapers.map((paper, index) =>
                  renderPaperItem(paper, null, index)
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {pinnedPapers.length >= 2 && (
        <div className='px-4 py-3 border-t border-stone-100 space-y-2'>
          <button
            onClick={handleSearchCitingAll}
            disabled={selectedCount < 2}
            className='w-full flex items-center justify-center gap-2 px-3 py-2 border border-stone-200 text-stone-600 rounded hover:bg-stone-50 transition text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed'
          >
            <Search size={12} />
            Citing all
            {selectedCount >= 2 && (
              <span className='text-stone-400'>({selectedCount})</span>
            )}
          </button>

          <button
            onClick={handleSearchReferencesAll}
            disabled={selectedCount < 2}
            className='w-full flex items-center justify-center gap-2 px-3 py-2 border border-stone-200 text-stone-600 rounded hover:bg-stone-50 transition text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed'
          >
            <Library size={12} />
            Common refs
            {selectedCount >= 2 && (
              <span className='text-stone-400'>({selectedCount})</span>
            )}
          </button>

          {selectionMode && selectedCount < 2 && (
            <p className='text-xs text-stone-400 text-center'>
              Select at least 2
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
