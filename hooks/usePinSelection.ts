'use client';

// Multi-select state over the pinned-paper list, extracted from
// PinSidebar (2026-06 audit, L2 decomposition). Selection semantics:
// everything starts selected, and any change to the pin list resets
// the selection back to "all" (a pin added mid-selection should be
// part of an ensuing citingAll/referencesAll search by default).

import { useState } from 'react';
import type { Paper } from '@/types/interfaces';
import { normalizeId } from '@/utils/normalizeId';

export function usePinSelection(pinnedPapers: Paper[]) {
  // Seeded from the current pin list — kept in sync with later changes
  // by the adjust-state-during-render block below.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(pinnedPapers.map((p) => normalizeId(p.id))),
  );
  const [selectionMode, setSelectionMode] = useState(false);

  // Reset selection to "all pinned" when the pin list changes.
  // Adjust-state-during-render (React's documented replacement for
  // setState-in-effect when deriving state from props): track the
  // previous reference and reconcile inline, avoiding the extra
  // render-commit-render cycle of a useEffect version. See
  // https://react.dev/learn/you-might-not-need-an-effect
  const [prevPinnedPapers, setPrevPinnedPapers] = useState(pinnedPapers);
  if (prevPinnedPapers !== pinnedPapers) {
    setPrevPinnedPapers(pinnedPapers);
    setSelectedIds(new Set(pinnedPapers.map((p) => normalizeId(p.id))));
  }

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

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    getSelectedIds: () => Array.from(selectedIds),
    selectionMode,
    setSelectionMode,
    toggleSelection,
    selectAll,
    selectNone,
  };
}
