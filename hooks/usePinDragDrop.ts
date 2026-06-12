'use client';

// Drag-and-drop state machine for the pin sidebar, extracted from
// PinSidebar (2026-06 audit, L2 decomposition). Two independent drags
// coexist here and must not interfere:
//
//   • PAPER drag — reorder within a group, move between groups, or
//     drop onto a collection row in the switcher menu.
//   • GROUP drag — reorder whole groups; tracked as a *visual gap*
//     index (gap N = "between the N-1th and Nth visible group").
//
// Every paper-drop handler early-returns while a group drag is active
// (and vice versa the group handlers check their own state), which is
// what keeps the two from competing for the same drop events.

import { useRef, useState } from 'react';
import { normalizeId } from '@/utils/normalizeId';
import type { Paper } from '@/types/interfaces';

interface Options {
  /** From PinContext. */
  movePaperToGroup: (paperId: string, groupId: string | null) => void;
  reorderPapersInGroup: (
    groupId: string | null,
    fromIndex: number,
    toIndex: number,
  ) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;
  getPapersInGroup: (groupId: string) => Paper[];
  movePaperToCollection: (
    paperId: string,
    targetCollectionId: string,
  ) => 'ok' | 'noop' | 'not-found' | 'target-full' | 'invalid';
  activeCollectionId: string;
  /** Collection-switcher interplay (see handleDragStart/-End). */
  collectionMenuOpen: boolean;
  setCollectionMenuOpen: (open: boolean) => void;
  /** Toast for collection move results. */
  setMoveFeedback: (msg: string) => void;
}

export function usePinDragDrop({
  movePaperToGroup,
  reorderPapersInGroup,
  reorderGroups,
  getPapersInGroup,
  movePaperToCollection,
  activeCollectionId,
  collectionMenuOpen,
  setCollectionMenuOpen,
  setMoveFeedback,
}: Options) {
  // Paper drag state
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
  // Highlights the collection row the user is currently dragging a paper
  // over. Cleared on dragleave/drop/dragend.
  const [dragOverCollectionId, setDragOverCollectionId] = useState<
    string | null
  >(null);

  // Group drag state (separate from paper drag so they don't interfere)
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [draggingGroupIndex, setDraggingGroupIndex] = useState<number | null>(
    null,
  );
  const [groupDropIndex, setGroupDropIndex] = useState<number | null>(null);

  // Remembers whether the switcher menu was already open when a paper-drag
  // began. If we auto-opened it for the drag, we close it after the drop;
  // if the user opened it deliberately first, we leave it as-is.
  const wasMenuOpenBeforeDragRef = useRef(false);

  // ── Paper drag ──────────────────────────────────────────────────────

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
    // pill's onDragOver in PinSidebar). The ref still matters: it lets
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

  // ── Group drag ──────────────────────────────────────────────────────

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

  return {
    // Paper drag state + handlers
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
    // Group drag state + handlers
    draggingGroupId,
    groupDropIndex,
    handleGroupDragStart,
    handleGroupDragEnd,
    handleGroupDragOverContainer,
    handleGroupDrop,
  };
}
