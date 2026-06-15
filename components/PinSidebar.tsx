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
  AlertTriangle,
} from 'lucide-react';
import { usePins } from '@/contexts/PinContext';
import { Paper, MAX_PINS } from '@/types/interfaces';
import PaperCard from './ui/PaperCard';
import { normalizeId } from '@/utils/normalizeId';
import { collectionPapersKey } from '@/utils/storageKeys';
import { on } from '@/utils/eventBus';
import {
  PIN_COLLECTION_TRANSFER_MIME,
  PIN_LIBRARY_TRANSFER_MIME,
} from '@/utils/pinCollectionTransfer';
import { triggerDownload } from '@/utils/download';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { usePinSelection } from '@/hooks/usePinSelection';
import { usePinDragDrop } from '@/hooks/usePinDragDrop';
import { useDismissablePopover } from '@/hooks/useDismissablePopover';

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

// Tooltip shown when the action-row buttons (Clear all / New group / Export)
// are disabled because the collection has no pinned papers. Native `title`
// tooltips don't fire on disabled buttons, so we render our own hover bubble.
const disabledHintText = 'Please pin a paper in order to activate this feature';
const disabledHintClass =
  'pointer-events-none absolute top-full left-0 mt-1 hidden group-hover:block ' +
  'whitespace-nowrap rounded bg-stone-800 px-2 py-1 text-[10px] text-white shadow-lg z-50';

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
    exportAllCollections,
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
  // Toast for collection actions (move/import/export). Auto-clears.
  const [moveFeedback, setMoveFeedback] = useState<string | null>(null);
  const newCollectionInputRef = useRef<HTMLInputElement>(null);
  const renameCollectionInputRef = useRef<HTMLInputElement>(null);
  // Tiny popover anchored to the export button — lets the user pick
  // between exporting just the active collection (for sharing) or the
  // whole library (for personal backup).
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  // Lightweight info modals explaining the drag-and-drop import flow.
  // `showImportInfo` opens from the Import button; `showExportInfo`
  // pops up right after a successful export to teach the user how to
  // get that .json back into Paperazzi later.
  const [showImportInfo, setShowImportInfo] = useState(false);
  const [showExportInfo, setShowExportInfo] = useState(false);
  // Confirmation modal for collection deletion. Replaces the native
  // window.confirm() — same semantics (cancel / confirm), but rendered
  // in-app so it matches the rest of the UI and can show richer
  // context (count of pins about to be lost). null when no delete is
  // pending.
  const [collectionPendingDelete, setCollectionPendingDelete] = useState<{
    id: string;
    name: string;
    pinCount: number;
    isActive: boolean;
  } | null>(null);

  const activeCollection = collections.find((c) => c.id === activeCollectionId);

  // Close on outside click / Escape. `ignoreDraggables`: a mousedown on
  // a draggable element is most likely the start of a drag — keep the
  // menu open so the user can see the collection drop targets they're
  // about to drag onto.
  const { popoverRef: collectionMenuRef, anchorRef: collectionMenuButtonRef } =
    useDismissablePopover(
      collectionMenuOpen,
      () => {
        setCollectionMenuOpen(false);
        setCreatingCollection(false);
        setNewCollectionName('');
        setEditingCollectionId(null);
        setEditingCollectionName('');
      },
      { ignoreDraggables: true },
    );

  // Same pattern for the export popover, scoped to the smaller menu so
  // the two popovers can coexist without leaking events into each other.
  const { popoverRef: exportMenuRef, anchorRef: exportMenuButtonRef } =
    useDismissablePopover(exportMenuOpen, () => setExportMenuOpen(false));

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

  // Counting pins for the about-to-delete collection: the active one
  // is in memory, every other one needs a localStorage peek. Returns 0
  // on any parse error — a missing count is better than blocking a
  // delete the user already asked for.
  const countPinsInCollection = (id: string): number => {
    if (id === activeCollectionId) return pinnedPapers.length;
    try {
      const raw = localStorage.getItem(collectionPapersKey(id));
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  };

  const handleDeleteCollection = (id: string, name: string) => {
    // Open the in-app confirmation modal instead of window.confirm —
    // matches the rest of the UI and gives us room to show the pin
    // count that's about to be lost.
    setCollectionPendingDelete({
      id,
      name,
      pinCount: countPinsInCollection(id),
      isActive: id === activeCollectionId,
    });
  };

  const confirmDeleteCollection = () => {
    if (!collectionPendingDelete) return;
    const { id, name } = collectionPendingDelete;
    deleteCollection(id);
    setCollectionPendingDelete(null);
    setMoveFeedback(`Deleted "${name}"`);
  };

  // Escape closes the delete-confirmation modal. Click-outside is
  // handled inline by the backdrop's onClick.
  useEffect(() => {
    if (!collectionPendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCollectionPendingDelete(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [collectionPendingDelete]);

  const handleExportCollection = () => {
    const exported = exportActiveCollection();
    if (!exported) {
      setMoveFeedback("Couldn't export that collection");
      setExportMenuOpen(false);
      return;
    }

    triggerDownload(
      exported.contents,
      exported.filename,
      PIN_COLLECTION_TRANSFER_MIME,
    );

    setExportMenuOpen(false);
    setMoveFeedback(`Exported "${exported.name}"`);
    setShowExportInfo(true);
  };

  const handleExportAllCollections = () => {
    const exported = exportAllCollections();
    if (!exported) {
      setMoveFeedback("Couldn't export your library");
      setExportMenuOpen(false);
      return;
    }

    triggerDownload(
      exported.contents,
      exported.filename,
      PIN_LIBRARY_TRANSFER_MIME,
    );

    setExportMenuOpen(false);
    setMoveFeedback(
      exported.collectionCount === 1
        ? 'Exported your library (1 collection)'
        : `Exported your library (${exported.collectionCount} collections)`,
    );
    setShowExportInfo(true);
  };

  // Resize, selection, and drag-drop behavior live in dedicated hooks
  // (hooks/useSidebarResize, hooks/usePinSelection, hooks/usePinDragDrop)
  // — extracted in the 2026-06 L2 decomposition. This component keeps
  // only the group-UI state and the JSX.
  const {
    width: sidebarWidth,
    isResizing,
    handleResizeStart,
  } = useSidebarResize();

  const {
    selectedIds,
    selectedCount,
    getSelectedIds,
    selectionMode,
    setSelectionMode,
    toggleSelection,
    selectAll,
    selectNone,
  } = usePinSelection(pinnedPapers);

  const {
    draggingPaperId,
    dragOverGroupId,
    dropIndicatorPosition,
    dragOverCollectionId,
    setDragOverCollectionId,
    handleDragStart,
    handleDragEnd,
    handleDragOverPaper,
    handleDragOverGroup,
    handleDragLeave,
    handleDropOnPaper,
    handleDropOnGroup,
    handleDropOnCollection,
    draggingGroupId,
    groupDropIndex,
    handleGroupDragStart,
    handleGroupDragEnd,
    handleGroupDragOverContainer,
    handleGroupDrop,
  } = usePinDragDrop({
    movePaperToGroup,
    reorderPapersInGroup,
    reorderGroups,
    getPapersInGroup,
    movePaperToCollection,
    activeCollectionId,
    collectionMenuOpen,
    setCollectionMenuOpen,
    setMoveFeedback,
  });

  // Group UI state. Expansion is seeded from the current group list —
  // kept in sync with later changes by the adjust-state-during-render
  // block below.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.id)),
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const editGroupInputRef = useRef<HTMLInputElement>(null);

  // Re-expand all groups when the group list changes
  // (adjust-state-during-render — see usePinSelection for the pattern).
  const [prevGroups, setPrevGroups] = useState(groups);
  if (prevGroups !== groups) {
    setPrevGroups(groups);
    setExpandedGroups(new Set(groups.map((g) => g.id)));
  }

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

  // Auto-clear move feedback after 2s.
  useEffect(() => {
    if (!moveFeedback) return;
    const t = setTimeout(() => setMoveFeedback(null), 2000);
    return () => clearTimeout(t);
  }, [moveFeedback]);

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
          {/* Single-row header — the collection name doubles as the
              section title. Folding the collection switcher into the
              title row removes a row from the stack of controls
              between the sidebar toggle and the paper cards (a
              recurring user pain point: too much chrome before the
              actual content). The Pin icon plus the visible
              collection name are enough to identify the contents;
              the dedicated "Pinned papers" label was redundant
              inside the pin sidebar. The wrapper is both `relative`
              — so the collection-switcher dropdown menu below can
              continue to position absolutely against this row — and
              flex, so Pin, name, count, close lay out on one line. */}
          <div className='relative flex items-center gap-2'>
            <Pin size={13} className='text-stone-400 flex-shrink-0' />
            <button
              ref={collectionMenuButtonRef}
              onClick={() => setCollectionMenuOpen((v) => !v)}
              // Drag-to-open: while a paper-drag is in flight,
              // dragging over the header reveals the menu so the
              // user can drop onto a destination collection.
              // preventDefault marks this as a valid drag region;
              // drops are accepted on individual collection rows
              // inside the menu, not on this row itself.
              onDragOver={(e) => {
                if (!draggingPaperId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!collectionMenuOpen) setCollectionMenuOpen(true);
              }}
              // Header-title style — the collection name reads as
              // the section title with a subtle disclosure chevron.
              // `flex-1 min-w-0` lets the button absorb the slack
              // between the Pin icon (left) and the count/close
              // cluster (right) while still truncating long names.
              // Hover restores the affordance (text darkens, row
              // picks up surface-muted bg); drag-over swaps in the
              // accent ring so the drop zone stays unambiguous.
              className={`flex-1 min-w-0 inline-flex items-center justify-between gap-1.5 px-1.5 py-1 rounded transition group ${
                draggingPaperId
                  ? 'ring-1 ring-[var(--accent)]'
                  : 'hover:bg-[var(--surface-muted)]'
              }`}
              title={
                draggingPaperId
                  ? 'Hover to reveal collections, then drop on one to move'
                  : 'Switch or manage collections'
              }
              aria-haspopup='menu'
              aria-expanded={collectionMenuOpen}
            >
              <span className='text-sm font-medium text-stone-700 group-hover:text-stone-900 transition truncate min-w-0'>
                {activeCollection?.name ?? 'Library'}
              </span>
              <ChevronDown
                size={12}
                className={`text-stone-400 group-hover:text-stone-600 flex-shrink-0 transition-transform ${
                  collectionMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {pinnedPapers.length > 0 && (
              <span className='text-xs text-stone-400 flex-shrink-0'>
                {pinnedPapers.length}/{MAX_PINS}
              </span>
            )}
            <button
              onClick={onToggle}
              className='p-1 text-stone-400 hover:text-stone-600 rounded transition flex-shrink-0'
              title='Close'
            >
              <ChevronRight size={14} />
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
                            {/* Rename / delete are available on every
                                row, not just the active one — there's
                                no good reason to force the user to
                                switch into a collection just to rename
                                or remove it. e.stopPropagation on each
                                button keeps the row's "switch on
                                click" behaviour from firing
                                underneath. */}
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
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Create-new row, sticky at the bottom of the menu.
                    Import lives globally (drag-and-drop a collection
                    file anywhere on the page) and export sits in the
                    sidebar header now, so this is the only secondary
                    action that still belongs inside the menu. */}
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

          {/* Top action row. "Export" sits alongside Clear all and
              New group rather than buried in the collection menu —
              users export far more often than they switch collections,
              so it deserves the visible spot. The popover offers two
              destinations: just this collection (shareable) or the
              whole library (personal backup). */}
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]'>
            <span className='relative group inline-flex'>
              <button
                onClick={clearPins}
                disabled={pinnedPapers.length === 0}
                className='text-stone-400 hover:text-stone-600 transition disabled:text-stone-300 disabled:cursor-not-allowed disabled:pointer-events-none'
              >
                Clear all
              </button>
              {pinnedPapers.length === 0 && (
                <span className={disabledHintClass}>{disabledHintText}</span>
              )}
            </span>
            <span className='relative group inline-flex'>
              <button
                onClick={() => setShowNewGroupInput(true)}
                disabled={pinnedPapers.length === 0}
                className='inline-flex items-center gap-1 text-stone-500 hover:text-stone-700 transition disabled:text-stone-300 disabled:cursor-not-allowed disabled:pointer-events-none'
              >
                <FolderPlus size={12} />
                New group
              </button>
              {pinnedPapers.length === 0 && (
                <span className={disabledHintClass}>{disabledHintText}</span>
              )}
            </span>
            <div className='relative group'>
              <button
                ref={exportMenuButtonRef}
                onClick={() => setExportMenuOpen((v) => !v)}
                disabled={pinnedPapers.length === 0}
                className='inline-flex items-center gap-1 text-stone-500 hover:text-stone-700 transition disabled:text-stone-300 disabled:cursor-not-allowed disabled:pointer-events-none'
                title={
                  pinnedPapers.length === 0 ? undefined : 'Export collection or full library'
                }
                aria-haspopup='menu'
                aria-expanded={exportMenuOpen}
              >
                <Download size={12} />
                Export
                <ChevronDown
                  size={11}
                  className={`transition-transform ${
                    exportMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {exportMenuOpen && (
                <div
                  ref={exportMenuRef}
                  role='menu'
                  aria-label='Export'
                  className='absolute right-0 top-full mt-1 surface-panel border border-app rounded-md shadow-lg z-50 overflow-hidden min-w-[12rem]'
                >
                  <button
                    onClick={handleExportCollection}
                    disabled={pinnedPapers.length === 0}
                    className='w-full text-left px-3 py-2 text-[11px] text-stone-700 hover:bg-[var(--surface-muted)] disabled:text-stone-300 disabled:cursor-not-allowed transition flex items-center gap-2'
                    title={
                      pinnedPapers.length === 0
                        ? 'This collection is empty'
                        : 'Export this collection to a shareable file'
                    }
                  >
                    <Download size={12} className='flex-shrink-0' />
                    <span className='flex-1 truncate'>
                      {activeCollection?.name
                        ? `This collection (${activeCollection.name})`
                        : 'This collection'}
                    </span>
                  </button>
                  <button
                    onClick={handleExportAllCollections}
                    className='w-full text-left px-3 py-2 text-[11px] text-stone-700 hover:bg-[var(--surface-muted)] transition flex items-center gap-2 border-t border-app'
                    title='Export every collection as a single backup file'
                  >
                    <Library size={12} className='flex-shrink-0' />
                    <span className='flex-1'>
                      All collections ({collections.length})
                    </span>
                  </button>
                </div>
              )}
              {pinnedPapers.length === 0 && (
                <span className={disabledHintClass}>{disabledHintText}</span>
              )}
            </div>
            <button
              onClick={() => setShowImportInfo(true)}
              className='inline-flex items-center gap-1 text-stone-500 hover:text-stone-700 transition'
              title='How to import an exported collection'
            >
              <Upload size={12} />
              Import
            </button>
          </div>

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

      {/* Delete-collection confirmation modal. Rendered as a sibling
          of the sidebar (not inside the menu) so it sits on top of
          everything via z-index, and so it survives the menu closing
          underneath it. Backdrop click + Escape both cancel; only
          the explicit "Delete collection" button removes anything. */}
      {collectionPendingDelete && (
        <div
          className='fixed inset-0 overlay-soft flex items-center justify-center z-[60]'
          onClick={() => setCollectionPendingDelete(null)}
          role='dialog'
          aria-modal='true'
          aria-labelledby='collection-delete-title'
        >
          <div
            className='surface-card rounded-lg border border-app p-5 max-w-sm w-full mx-4 shadow-lg'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-start gap-3'>
              <div className='flex-shrink-0 mt-0.5 text-danger'>
                <AlertTriangle size={18} />
              </div>
              <div className='min-w-0 flex-1'>
                <h3
                  id='collection-delete-title'
                  className='text-sm font-semibold text-stone-900'
                >
                  Delete collection?
                </h3>
                <p className='mt-1.5 text-xs text-stone-600'>
                  &ldquo;
                  <span className='font-medium text-stone-800'>
                    {collectionPendingDelete.name}
                  </span>
                  &rdquo; will be removed
                  {collectionPendingDelete.pinCount > 0 ? (
                    <>
                      {' '}along with its{' '}
                      <span className='font-medium text-stone-800'>
                        {collectionPendingDelete.pinCount}
                      </span>{' '}
                      pinned{' '}
                      {collectionPendingDelete.pinCount === 1
                        ? 'paper'
                        : 'papers'}
                    </>
                  ) : null}
                  . This can&rsquo;t be undone.
                </p>
                {collectionPendingDelete.isActive && (
                  <p className='mt-2 text-[11px] text-stone-500'>
                    This is your active collection — Paperazzi will switch
                    you to another one afterwards.
                  </p>
                )}
              </div>
            </div>

            <div className='mt-4 flex justify-end gap-2'>
              <button
                onClick={() => setCollectionPendingDelete(null)}
                className='px-3 py-1.5 text-xs button-ghost rounded transition'
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCollection}
                autoFocus
                className='px-3 py-1.5 text-xs button-danger rounded transition'
              >
                Delete collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import explainer. There's no in-app file picker — importing is
          purely drag-and-drop (handled globally by CollectionImportDropzone),
          so this modal just teaches the gesture. */}
      {showImportInfo && (
        <div
          className='fixed inset-0 overlay-soft flex items-center justify-center z-[60]'
          onClick={() => setShowImportInfo(false)}
          role='dialog'
          aria-modal='true'
          aria-labelledby='import-info-title'
        >
          <div
            className='surface-card rounded-lg border border-app p-5 max-w-sm w-full mx-4 shadow-lg'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-start gap-3'>
              <div className='flex-shrink-0 mt-0.5 text-[var(--accent-foreground)]'>
                <Upload size={18} />
              </div>
              <div className='min-w-0 flex-1'>
                <h3
                  id='import-info-title'
                  className='text-sm font-semibold text-stone-900'
                >
                  Import a collection
                </h3>
                <p className='mt-1.5 text-xs text-stone-600 leading-relaxed'>
                  Just drag and drop your exported{' '}
                  <span className='font-medium text-stone-800'>.json</span> file
                  anywhere onto this page and Paperazzi will load the collection
                  for you.
                </p>
              </div>
            </div>

            <div className='mt-4 flex justify-end'>
              <button
                onClick={() => setShowImportInfo(false)}
                autoFocus
                className='px-3 py-1.5 text-xs button-primary rounded transition'
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export confirmation explainer — fires once right after a
          successful export so the user knows the .json they just
          downloaded can be brought back via drag-and-drop. */}
      {showExportInfo && (
        <div
          className='fixed inset-0 overlay-soft flex items-center justify-center z-[60]'
          onClick={() => setShowExportInfo(false)}
          role='dialog'
          aria-modal='true'
          aria-labelledby='export-info-title'
        >
          <div
            className='surface-card rounded-lg border border-app p-5 max-w-sm w-full mx-4 shadow-lg'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-start gap-3'>
              <div className='flex-shrink-0 mt-0.5 text-[var(--accent-foreground)]'>
                <Download size={18} />
              </div>
              <div className='min-w-0 flex-1'>
                <h3
                  id='export-info-title'
                  className='text-sm font-semibold text-stone-900'
                >
                  Export saved
                </h3>
                <p className='mt-1.5 text-xs text-stone-600 leading-relaxed'>
                  Your{' '}
                  <span className='font-medium text-stone-800'>.json</span> file
                  has been downloaded. To open it again later, just drag and
                  drop it anywhere onto this page — Paperazzi will restore the
                  collection automatically.
                </p>
              </div>
            </div>

            <div className='mt-4 flex justify-end'>
              <button
                onClick={() => setShowExportInfo(false)}
                autoFocus
                className='px-3 py-1.5 text-xs button-primary rounded transition'
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
