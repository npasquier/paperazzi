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
  GripVertical,
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
    getUngroupedPapers,
    getPapersInGroup,
  } = usePins();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Group UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['ungrouped'])
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Drag state
  const [draggingPaperId, setDraggingPaperId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const editGroupInputRef = useRef<HTMLInputElement>(null);

  const normalizeId = (id: string) => id.replace('https://openalex.org/', '');

  // Sync selectedIds when pinnedPapers change
  useEffect(() => {
    setSelectedIds(new Set(pinnedPapers.map((p) => normalizeId(p.id))));
  }, [pinnedPapers]);

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

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, paperId: string) => {
    setDraggingPaperId(normalizeId(paperId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingPaperId(null);
    setDragOverGroupId(null);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  };

  const handleDragLeave = () => {
    setDragOverGroupId(null);
  };

  const handleDrop = (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    if (draggingPaperId) {
      movePaperToGroup(draggingPaperId, groupId);
    }
    setDraggingPaperId(null);
    setDragOverGroupId(null);
  };

  // Render a paper item
  const renderPaperItem = (paper: Paper) => {
    const normalizedId = normalizeId(paper.id);
    const isSelected = selectedIds.has(normalizedId);
    const isDragging = draggingPaperId === normalizedId;

    return (
      <div
        key={paper.id}
        className={`relative group ${isDragging ? 'opacity-50' : ''}`}
        draggable={!selectionMode}
        onDragStart={(e) => handleDragStart(e, paper.id)}
        onDragEnd={handleDragEnd}
      >
        <div className='flex items-start gap-1'>
          {/* Drag handle or selection checkbox */}
          {selectionMode ? (
            <button
              onClick={() => toggleSelection(paper.id)}
              className={`mt-2 p-0.5 rounded transition flex-shrink-0 ${
                isSelected
                  ? 'text-stone-800'
                  : 'text-stone-300 hover:text-stone-500'
              }`}
            >
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
          ) : (
            <div className='mt-2 cursor-grab text-stone-300 hover:text-stone-500 flex-shrink-0'>
              <GripVertical size={16} />
            </div>
          )}

          <div
            className={`flex-1 rounded-lg transition ${
              selectionMode && isSelected ? 'ring-2 ring-stone-300' : ''
            }`}
          >
            <PaperCard
              paper={paper}
              variant='pinned'
              showPinButton={!selectionMode}
              preserveParams={preserveParams}
            />

            {/* Action buttons */}
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
      </div>
    );
  };

  // Render a group section
  const renderGroup = (
    groupId: string,
    groupName: string,
    papers: Paper[],
    isUngrouped = false
  ) => {
    const isExpanded = expandedGroups.has(groupId);
    const isEditing = editingGroupId === groupId;
    const isDragOver = dragOverGroupId === groupId;

    return (
      <div
        key={groupId}
        className={`border rounded-lg overflow-hidden transition ${
          isDragOver
            ? 'border-stone-400 bg-stone-100'
            : 'border-stone-200 bg-white'
        }`}
        onDragOver={(e) => handleDragOver(e, groupId)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, isUngrouped ? null : groupId)}
      >
        {/* Group header */}
        <div className='group flex items-center gap-2 p-2 bg-stone-50 border-b border-stone-200'>
          <button
            onClick={() => toggleGroupExpanded(groupId)}
            className='p-0.5 hover:bg-stone-200 rounded transition'
          >
            {isExpanded ? (
              <ChevronDown size={16} className='text-stone-500' />
            ) : (
              <ChevronRight size={16} className='text-stone-500' />
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
                className='flex-1 px-2 py-0.5 text-sm border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-400'
              />
              <button
                onClick={() => handleRenameGroup(groupId)}
                className='p-1 text-green-600 hover:bg-green-50 rounded'
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => {
                  setEditingGroupId(null);
                  setEditingName('');
                }}
                className='p-1 text-stone-500 hover:bg-stone-100 rounded'
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <span className='flex-1 text-sm font-medium text-stone-700'>
                {groupName}
              </span>
              <span className='text-xs text-stone-400'>{papers.length}</span>

              {!isUngrouped && (
                <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition'>
                  <button
                    onClick={() => {
                      setEditingGroupId(groupId);
                      setEditingName(groupName);
                    }}
                    className='p-1 text-stone-500 hover:bg-stone-200 rounded'
                    title='Rename group'
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => deleteGroup(groupId)}
                    className='p-1 text-red-500 hover:bg-red-50 rounded'
                    title='Delete group'
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Group content */}
        {isExpanded && (
          <div className='p-2 space-y-2'>
            {papers.length === 0 ? (
              <p className='text-xs text-stone-400 text-center py-2'>
                {isUngrouped ? 'All papers are in groups' : 'Drag papers here'}
              </p>
            ) : (
              papers.map(renderPaperItem)
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

  const ungroupedPapers = getUngroupedPapers();

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

            <div className='flex items-center gap-2'>
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

              <button
                onClick={() => setShowNewGroupInput(true)}
                className='text-xs px-2 py-1 rounded text-stone-600 hover:bg-stone-100 transition flex items-center gap-1'
                title='Create group'
              >
                <FolderPlus size={12} />
              </button>
            </div>
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

        {/* New group input */}
        {showNewGroupInput && (
          <div className='mt-3 pt-3 border-t border-stone-100 flex items-center gap-1'>
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
              placeholder='Group name...'
              className='flex-1 px-2 py-1 text-sm border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-400'
            />
            <button
              onClick={handleCreateGroup}
              className='p-1 text-green-600 hover:bg-green-50 rounded'
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => {
                setShowNewGroupInput(false);
                setNewGroupName('');
              }}
              className='p-1 text-stone-500 hover:bg-stone-100 rounded'
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4 space-y-3'>
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
          <>
            {/* Custom groups */}
            {groups.map((group) =>
              renderGroup(
                group.id,
                group.name,
                getPapersInGroup(group.id),
                false
              )
            )}

            {/* Ungrouped papers */}
            {renderGroup('ungrouped', 'Ungrouped', ungroupedPapers, true)}
          </>
        )}

        {/* Multi-paper actions */}
        {pinnedPapers.length >= 2 && (
          <div className='mt-4 pt-4 border-t border-stone-200 space-y-3'>
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
