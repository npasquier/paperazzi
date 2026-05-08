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
  GripVertical,
  Plus,
  Download,
  Upload,
} from 'lucide-react';
import { usePins } from '@/contexts/PinContext';
import { Paper, MAX_PINS } from '@/types/interfaces';
import PaperCard from './ui/PaperCard';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { on } from '@/utils/eventBus';
import {
  PIN_COLLECTION_TRANSFER_MIME,
  readCollectionImportFile,
} from '@/utils/pinCollectionTransfer';

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
    reorderGroups,
    getUngroupedPapers,
    getPapersInGroup,
    collections,
    activeCollectionId,
    switchCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    movePaperToCollection,
    collectionsAtCap,
    exportActiveCollection,
    importCollection,
  } = usePins();

  // Collection switcher (small popover at top of header). Three sub-states:
  //   menuOpen — list of collections + create
  //   creating — inline input for "New collection name"
  //   editingCollectionId !== null — inline input for renaming the active
  // We close on outside-click / Escape, same as the FilterPanel popovers.
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null,
  );
  const [editingCollectionName, setEditingCollectionName] = useState('');
  // Highlights the collection row the user is currently dragging a paper
  // over. Cleared on dragleave/drop/dragend.
  const [dragOverCollectionId, setDragOverCollectionId] = useState<
    string | null
  >(null);
  // Remembers whether the switcher menu was already open when a paper-drag
  // began. If we auto-opened it for the drag, we close it after the drop;
  // if the user opened it deliberately first, we leave it as-is.
  const wasMenuOpenBeforeDragRef = useRef(false);
  // Toast for collection actions (move/import/export). Auto-clears.
  const [moveFeedback, setMoveFeedback] = useState<string | null>(null);
  const collectionMenuRef = useRef<HTMLDivElement>(null);
  const collectionMenuButtonRef = useRef<HTMLButtonElement>(null);
  const newCollectionInputRef = useRef<HTMLInputElement>(null);
  const renameCollectionInputRef = useRef<HTMLInputElement>(null);
  const importCollectionInputRef = useRef<HTMLInputElement>(null);
  const [isImportingCollection, setIsImportingCollection] = useState(false);

  const activeCollection = collections.find((c) => c.id === activeCollectionId);

  // Close on outside click / Escape — same UX as the other popovers.
  useEffect(() => {
    if (!collectionMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      // A mousedown on a draggable element is most likely the start of
      // a drag — keep the menu open so the user can see the collection
      // drop targets they're about to drag onto.
      if (t?.closest('[draggable="true"]')) return;
      if (
        collectionMenuRef.current &&
        t &&
        !collectionMenuRef.current.contains(t) &&
        collectionMenuButtonRef.current &&
        !collectionMenuButtonRef.current.contains(t)
      ) {
        setCollectionMenuOpen(false);
        setCreatingCollection(false);
        setNewCollectionName('');
        setEditingCollectionId(null);
        setEditingCollectionName('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCollectionMenuOpen(false);
        setCreatingCollection(false);
        setEditingCollectionId(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [collectionMenuOpen]);

  // Auto-focus the inline inputs when they appear.
  useEffect(() => {
    if (creatingCollection) newCollectionInputRef.current?.focus();
  }, [creatingCollection]);
  useEffect(() => {
    if (editingCollectionId) renameCollectionInputRef.current?.focus();
  }, [editingCollectionId]);

  const submitNewCollection = () => {
    const name = newCollectionName.trim();
    if (!name) {
      setCreatingCollection(false);
      return;
    }
    const id = createCollection(name);
    setCreatingCollection(false);
    setNewCollectionName('');
    if (id) {
      // Successful create switches us to the new (empty) collection.
      // Close the menu so the user lands in their new workspace.
      setCollectionMenuOpen(false);
    }
  };

  const submitRenameCollection = () => {
    if (!editingCollectionId) return;
    const name = editingCollectionName.trim();
    if (name) renameCollection(editingCollectionId, name);
    setEditingCollectionId(null);
    setEditingCollectionName('');
  };

  const handleDeleteCollection = (id: string, name: string) => {
    // Confirm before nuking — collections can hold up to 30 pins each.
    const ok = window.confirm(
      `Delete collection "${name}"? This will remove ${
        id === activeCollectionId ? 'the active' : 'this'
      } library and all its pins. This can't be undone.`,
    );
    if (!ok) return;
    deleteCollection(id);
  };

  const handleExportCollection = () => {
    const exported = exportActiveCollection();
    if (!exported) {
      setMoveFeedback("Couldn't export that collection");
      return;
    }

    const blob = new Blob([exported.contents], {
      type: PIN_COLLECTION_TRANSFER_MIME,
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exported.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);

    setCollectionMenuOpen(false);
    setMoveFeedback(`Exported "${exported.name}"`);
  };

  const handleImportCollectionFile = async (file: File) => {
    setIsImportingCollection(true);
    try {
      const parsed = await readCollectionImportFile(file);
      if (!parsed.ok) {
        setMoveFeedback(parsed.error);
        return;
      }

      const result = importCollection(parsed.data);
      if (result.status === 'cap-reached') {
        setMoveFeedback('Delete a collection before importing another one');
        return;
      }

      setCollectionMenuOpen(false);
      setCreatingCollection(false);
      setNewCollectionName('');
      setEditingCollectionId(null);
      setEditingCollectionName('');
      setMoveFeedback(`Imported "${result.name}"`);
    } catch (err) {
      console.error('[PinSidebar] import failed', err);
      setMoveFeedback("Couldn't import that collection");
    } finally {
      setIsImportingCollection(false);
    }
  };

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

  // Group drag state (separate from paper drag so they don't interfere)
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [draggingGroupIndex, setDraggingGroupIndex] = useState<number | null>(
    null,
  );
  const [groupDropIndex, setGroupDropIndex] = useState<number | null>(null);

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
    const offCiting = on('paper-citing-click', ({ paper }) => {
      handleSearchCiting(paper);
    });
    const offRefs = on('paper-refs-click', ({ paper }) => {
      handleSearchReferences(paper);
    });
    return () => {
      offCiting();
      offRefs();
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
    // We don't auto-open the switcher here — that flashed the menu
    // for every drag, including pure within-group reorders. Instead,
    // dragging the paper OVER the switcher pill opens it (see the
    // pill's onDragOver below). The ref still matters: it lets
    // dragend decide whether to close a menu the user opened
    // deliberately vs. one that opened only because of the drag.
    wasMenuOpenBeforeDragRef.current = collectionMenuOpen;
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingPaperId(null);
    setDraggingFromGroup(null);
    setDraggingFromIndex(null);
    setDragOverGroupId(null);
    setDropIndicatorPosition(null);
    setDragOverCollectionId(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    // Close the switcher if we auto-opened it for this drag. If the
    // user had it open before, leave it.
    if (!wasMenuOpenBeforeDragRef.current) {
      setCollectionMenuOpen(false);
    }
  };

  // Drop a paper onto a non-active collection in the switcher menu.
  // Persists the move via PinContext and surfaces a small toast for
  // success / target-full / unexpected failures.
  const handleDropOnCollection = (
    e: React.DragEvent,
    targetCollectionId: string,
    targetName: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCollectionId(null);
    if (!draggingPaperId) return;
    if (targetCollectionId === activeCollectionId) return;
    const result = movePaperToCollection(draggingPaperId, targetCollectionId);
    if (result === 'ok') {
      setMoveFeedback(`Moved to "${targetName}"`);
    } else if (result === 'target-full') {
      setMoveFeedback(`"${targetName}" is full`);
    } else if (result === 'not-found' || result === 'invalid') {
      setMoveFeedback("Couldn't move that paper");
    }
    // Reset the rest of the drag state — handleDragEnd usually fires
    // after this but does so on the ORIGIN element, which can be the
    // half-faded paper card; clearing here is defensive belt + braces.
    setDraggingPaperId(null);
    setDraggingFromGroup(null);
    setDraggingFromIndex(null);
    setDropIndicatorPosition(null);
  };

  // Auto-clear move feedback after 2s.
  useEffect(() => {
    if (!moveFeedback) return;
    const t = setTimeout(() => setMoveFeedback(null), 2000);
    return () => clearTimeout(t);
  }, [moveFeedback]);

  const handleDragOverPaper = (
    e: React.DragEvent,
    targetGroupId: string | null,
    targetIndex: number,
  ) => {
    // A group reorder drag is in progress; don't react as if a paper is being
    // dropped here.
    if (draggingGroupId) return;
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
    // Don't compete with the group-reorder drag.
    if (draggingGroupId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  };

  // Group drag handlers
  const handleGroupDragStart = (
    e: React.DragEvent,
    groupId: string,
    index: number,
  ) => {
    // Don't start a group drag if the user is interacting with a button or
    // input inside the header (rename, delete, expand, name input).
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input')) {
      e.preventDefault();
      return;
    }
    setDraggingGroupId(groupId);
    setDraggingGroupIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Tag the payload so any external drop targets can ignore it.
    e.dataTransfer.setData('application/x-pin-group', groupId);
  };

  const handleGroupDragEnd = () => {
    setDraggingGroupId(null);
    setDraggingGroupIndex(null);
    setGroupDropIndex(null);
  };

  // The entire group container is the drop target so the user has a generous
  // hit area, not just the slim header strip. We split each container into a
  // top half ("drop above") and a bottom half ("drop below").
  //
  // We track the drop position as a *visual gap* — gap N means "between the
  // N-1th and Nth visible group" (gap 0 = above the first group, gap
  // groups.length = below the last). This lines up cleanly with the indicator
  // we render, since the dragged group is still visible (faded) in its
  // original position during the drag.
  const handleGroupDragOverContainer = (
    e: React.DragEvent,
    targetVisualIndex: number,
  ) => {
    if (draggingGroupId === null || draggingGroupIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const middle = rect.top + rect.height / 2;
    const isBelow = e.clientY > middle;
    const gap = isBelow ? targetVisualIndex + 1 : targetVisualIndex;

    // Gaps immediately above or below the dragged group are no-ops — suppress
    // the indicator there.
    if (gap === draggingGroupIndex || gap === draggingGroupIndex + 1) {
      setGroupDropIndex(null);
    } else {
      setGroupDropIndex(gap);
    }
  };

  const handleGroupDrop = (e: React.DragEvent) => {
    if (
      draggingGroupId === null ||
      draggingGroupIndex === null ||
      groupDropIndex === null
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // Convert visual gap → post-removal array index for reorderGroups.
    const postRemovalIndex =
      groupDropIndex > draggingGroupIndex
        ? groupDropIndex - 1
        : groupDropIndex;
    if (postRemovalIndex !== draggingGroupIndex) {
      reorderGroups(draggingGroupIndex, postRemovalIndex);
    }
    setDraggingGroupId(null);
    setDraggingGroupIndex(null);
    setGroupDropIndex(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the container, not a child
    if (e.currentTarget === e.target) {
      setDragOverGroupId(null);
      setDropIndicatorPosition(null);
    }
  };

  const handleDropOnPaper = (e: React.DragEvent) => {
    // A group reorder is in progress; let the event bubble up to the group
    // container's onDrop instead of swallowing it here.
    if (draggingGroupId) return;
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
    // A group reorder is in progress; let the event bubble up to the group
    // container's onDrop instead of swallowing it here.
    if (draggingGroupId) return;
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
  const renderGroup = (
    groupId: string,
    groupName: string,
    papers: Paper[],
    groupIndex: number,
    isLastGroup: boolean,
  ) => {
    const isExpanded = expandedGroups.has(groupId);
    const isEditing = editingGroupId === groupId;
    const isDragOver =
      dragOverGroupId === groupId && !dropIndicatorPosition && !draggingGroupId;
    const isBeingDraggedAsGroup = draggingGroupId === groupId;
    const isGroupDragInProgress = draggingGroupId !== null;
    const showGroupIndicatorAbove =
      isGroupDragInProgress && groupDropIndex === groupIndex;
    // Only the last group is responsible for rendering the trailing indicator;
    // every other "between groups" position is covered by the next group's
    // "above" indicator.
    const showGroupIndicatorBelow =
      isGroupDragInProgress &&
      isLastGroup &&
      groupDropIndex === groupIndex + 1;

    return (
      <div
        key={groupId}
        className={`mb-4 transition-opacity ${
          isBeingDraggedAsGroup ? 'opacity-30' : ''
        }`}
        onDragOver={(e) => {
          if (draggingGroupId) handleGroupDragOverContainer(e, groupIndex);
        }}
        onDrop={(e) => {
          if (draggingGroupId) handleGroupDrop(e);
        }}
      >
        {showGroupIndicatorAbove && (
          <div className='h-0.5 bg-[var(--border-strong)] mb-1.5 rounded-full' />
        )}

        {/* Group Header */}
        <div
          className={`group flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md transition ${
            isDragOver ? 'surface-muted' : 'hover:bg-[var(--surface-muted)]'
          } ${!isEditing ? 'cursor-grab active:cursor-grabbing' : ''}`}
          draggable={!isEditing}
          onDragStart={(e) => handleGroupDragStart(e, groupId, groupIndex)}
          onDragEnd={handleGroupDragEnd}
          onDragOver={(e) => handleDragOverGroup(e, groupId)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDropOnGroup(e, groupId)}
        >
          <span
            className='text-stone-300 group-hover:text-stone-500 transition flex-shrink-0'
            aria-hidden='true'
            title='Drag to reorder'
          >
            <GripVertical size={13} />
          </span>

          <button
            onClick={() => toggleGroupExpanded(groupId)}
            className='p-0.5 text-stone-400 hover:text-stone-600 rounded transition flex-shrink-0'
          >
            {isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
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
                className='inline-block w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white/40'
                style={{ backgroundColor: getGroupColor(groupId) }}
                aria-hidden='true'
              />
              <span className='flex-1 min-w-0 truncate text-xs font-semibold capitalize tracking-wide text-stone-800'>
                {groupName}
              </span>
              <span className='text-[11px] tabular-nums text-stone-400'>
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

        {showGroupIndicatorBelow && (
          <div className='h-0.5 bg-[var(--border-strong)] mt-1.5 rounded-full' />
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
      <input
        ref={importCollectionInputRef}
        type='file'
        accept={`${PIN_COLLECTION_TRANSFER_MIME},application/json,.json`}
        className='hidden'
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          await handleImportCollectionFile(file);
        }}
      />

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
          {/* Collection switcher — shows the active library name as a
              clickable pill that opens a small menu. The menu lets the
              user pick another collection, create a new one, rename the
              active one, or delete it. Modal-free so it stays out of
              the way during normal pinning workflow. */}
          <div className='relative'>
            <button
              ref={collectionMenuButtonRef}
              onClick={() => setCollectionMenuOpen((v) => !v)}
              // Drag-to-open: while a paper-drag is in flight, dragging
              // it over the pill opens the menu so the user can drop
              // onto a destination row. preventDefault tells the
              // browser this is a valid drag region (without it the
              // dragover never reaches us cleanly). We don't accept
              // drops on the pill itself — only on collection rows
              // inside the menu — so no onDrop here; the pill is just
              // a "reveal" gesture.
              onDragOver={(e) => {
                if (!draggingPaperId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!collectionMenuOpen) setCollectionMenuOpen(true);
              }}
              className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border surface-card transition text-left ${
                draggingPaperId
                  ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                  : 'border-app hover:border-[var(--border-strong)]'
              }`}
              title={
                draggingPaperId
                  ? 'Hover to reveal collections, then drop on one to move'
                  : 'Switch or manage collections'
              }
              aria-haspopup='menu'
              aria-expanded={collectionMenuOpen}
            >
              <span className='flex items-center gap-2 min-w-0'>
                <Library size={13} className='text-stone-500 flex-shrink-0' />
                <span className='text-xs font-medium text-stone-700 truncate'>
                  {activeCollection?.name ?? 'Library'}
                </span>
              </span>
              <ChevronDown
                size={12}
                className={`text-stone-400 flex-shrink-0 transition-transform ${
                  collectionMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {collectionMenuOpen && (
              <div
                ref={collectionMenuRef}
                role='menu'
                aria-label='Collections'
                className='absolute left-0 right-0 top-full mt-1 surface-panel border border-app rounded-md shadow-lg z-50 overflow-hidden'
              >
                <ul className='max-h-64 overflow-y-auto py-1'>
                  {collections.map((c) => {
                    const isActive = c.id === activeCollectionId;
                    const isEditing = editingCollectionId === c.id;
                    return (
                      <li key={c.id}>
                        {isEditing ? (
                          <div className='flex items-center gap-1 px-2 py-1.5'>
                            <input
                              ref={renameCollectionInputRef}
                              type='text'
                              value={editingCollectionName}
                              onChange={(e) =>
                                setEditingCollectionName(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRenameCollection();
                                if (e.key === 'Escape') {
                                  setEditingCollectionId(null);
                                  setEditingCollectionName('');
                                }
                              }}
                              className='flex-1 px-1.5 py-0.5 text-xs border border-app rounded bg-transparent focus-accent'
                            />
                            <button
                              onClick={submitRenameCollection}
                              className='p-1 text-stone-500 hover:text-stone-800 rounded'
                              title='Save'
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCollectionId(null);
                                setEditingCollectionName('');
                              }}
                              className='p-1 text-stone-400 hover:text-stone-600 rounded'
                              title='Cancel'
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div
                            // While a paper drag is in flight, every
                            // non-active row is also a drop target —
                            // dropping a paper here moves it to that
                            // collection. preventDefault on dragover
                            // is what tells the browser to allow the
                            // drop; without it, onDrop never fires.
                            onDragOver={(e) => {
                              if (!draggingPaperId || isActive) return;
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverCollectionId !== c.id) {
                                setDragOverCollectionId(c.id);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverCollectionId === c.id) {
                                setDragOverCollectionId(null);
                              }
                            }}
                            onDrop={(e) =>
                              handleDropOnCollection(e, c.id, c.name)
                            }
                            className={`group flex items-center gap-1 px-2 py-1.5 text-xs transition ${
                              isActive
                                ? 'bg-[var(--surface-muted)] text-stone-900 font-medium'
                                : dragOverCollectionId === c.id
                                  ? 'bg-[var(--accent-soft,var(--surface-muted))] text-stone-900 ring-1 ring-[var(--accent)]'
                                  : 'text-stone-700 hover:bg-[var(--surface-muted)]'
                            }`}
                          >
                            <button
                              onClick={() => {
                                if (!isActive) switchCollection(c.id);
                                setCollectionMenuOpen(false);
                              }}
                              className='flex-1 min-w-0 text-left truncate'
                              title={
                                isActive
                                  ? 'Active'
                                  : draggingPaperId
                                    ? `Drop to move to ${c.name}`
                                    : `Switch to ${c.name}`
                              }
                            >
                              {c.name}
                            </button>
                            {/* Rename / delete only on the active row to
                                keep the list visually calm; switching
                                first then editing is one extra click but
                                avoids accidental edits on hover. */}
                            {isActive && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCollectionId(c.id);
                                    setEditingCollectionName(c.name);
                                  }}
                                  className='p-1 text-stone-400 hover:text-stone-700 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition'
                                  title='Rename collection'
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCollection(c.id, c.name);
                                  }}
                                  className='p-1 text-stone-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition'
                                  title='Delete collection'
                                >
                                  <Trash2 size={11} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Create-new row, sticky at the bottom of the menu. */}
                <div className='border-t border-app px-2 py-1.5'>
                  {creatingCollection ? (
                    <div className='flex items-center gap-1'>
                      <input
                        ref={newCollectionInputRef}
                        type='text'
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitNewCollection();
                          if (e.key === 'Escape') {
                            setCreatingCollection(false);
                            setNewCollectionName('');
                          }
                        }}
                        placeholder='New collection name'
                        className='flex-1 px-1.5 py-0.5 text-xs border border-app rounded bg-transparent focus-accent'
                      />
                      <button
                        onClick={submitNewCollection}
                        className='p-1 text-stone-500 hover:text-stone-800 rounded'
                        title='Create'
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => {
                          setCreatingCollection(false);
                          setNewCollectionName('');
                        }}
                        className='p-1 text-stone-400 hover:text-stone-600 rounded'
                        title='Cancel'
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingCollection(true)}
                      disabled={collectionsAtCap}
                      className='w-full inline-flex items-center gap-1.5 px-1 py-0.5 text-xs text-stone-600 hover:text-stone-900 disabled:opacity-50 disabled:cursor-not-allowed transition'
                      title={
                        collectionsAtCap
                          ? 'Maximum collections reached'
                          : 'Create a new empty collection'
                      }
                    >
                      <Plus size={12} />
                      New collection
                    </button>
                  )}
                </div>

                <div className='border-t border-app px-2 py-1.5 grid grid-cols-2 gap-1.5'>
                  <button
                    onClick={() => importCollectionInputRef.current?.click()}
                    disabled={collectionsAtCap || isImportingCollection}
                    className='inline-flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] button-ghost disabled:opacity-50 disabled:cursor-not-allowed transition'
                    title={
                      collectionsAtCap
                        ? 'Maximum collections reached'
                        : 'Import a shared collection file'
                    }
                  >
                    {isImportingCollection ? (
                      <Loader2 size={12} className='animate-spin' />
                    ) : (
                      <Upload size={12} />
                    )}
                    Import file
                  </button>

                  <button
                    onClick={handleExportCollection}
                    className='inline-flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] button-ghost transition'
                    title='Export this collection to a shareable file'
                  >
                    <Download size={12} />
                    Export file
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tiny status pill for the cross-collection move outcome.
              Auto-clears after 2s; placed in-flow (not absolutely
              positioned) so it pushes the rest of the header down a
              line rather than covering it. */}
          {moveFeedback && (
            <div
              role='status'
              aria-live='polite'
              className='text-[11px] text-stone-600 px-2 py-1 surface-subtle rounded-md border border-app'
            >
              {moveFeedback}
            </div>
          )}

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
                renderGroup(
                  group.id,
                  group.name,
                  getPapersInGroup(group.id),
                  index,
                  index === groups.length - 1,
                ),
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
