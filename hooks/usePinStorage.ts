'use client';

/**
 * Debounced-write machinery for the active pin collection.
 *
 * Coalesces rapid state updates (drag-reorder, multi-step group moves) into a
 * single localStorage write per WRITE_DEBOUNCE_MS quiet window. Also installs
 * pagehide / visibilitychange flush so edits survive tab closes.
 *
 * Returns:
 *   flushPending        — synchronously drain any queued write (call before
 *                         switching collections, or on unmount).
 *   cancelPendingFor    — if the queued write targets a specific collection id,
 *                         drop it without writing (used by deleteCollection and
 *                         the multi-tab sync fallback path). Returns true if a
 *                         pending write was cancelled.
 *   pinnedRef           — always holds the latest pinnedPapers (used by
 *                         collection callbacks to read state without stale closures).
 *   groupsRef           — same for groups.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Paper, PinGroup } from '@/types/interfaces';
import { normalizeId } from '@/utils/normalizeId';
import { collectionPapersKey, collectionGroupsKey } from '@/utils/storageKeys';
import { WRITE_DEBOUNCE_MS } from '@/utils/pinStorage';

interface Params {
  pinnedPapers: Paper[];
  groups: PinGroup[];
  isLoading: boolean;
  activeId: string;
}

export interface PinStorageHandle {
  flushPending: () => void;
  /**
   * If there is a pending write queued for `id`, drop it without writing.
   * Returns true iff a pending write was cancelled.
   */
  cancelPendingFor: (id: string) => boolean;
  pinnedRef: React.RefObject<Paper[]>;
  groupsRef: React.RefObject<PinGroup[]>;
}

export function usePinStorage({ pinnedPapers, groups, isLoading, activeId }: Params): PinStorageHandle {
  // Live mirrors of state — used by management callbacks that need the
  // current value without depending on stale React closures.
  const pinnedRef = useRef<Paper[]>([]);
  const groupsRef = useRef<PinGroup[]>([]);
  useEffect(() => {
    pinnedRef.current = pinnedPapers;
  }, [pinnedPapers]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // pendingRef captures the latest state we've been asked to persist.
  // The timer fires after WRITE_DEBOUNCE_MS of inactivity, at which point
  // flushPending serializes and writes — but only if the JSON differs from
  // what's already on disk (cheap deep-compare via stringify). The compare
  // also breaks the cross-tab ping-pong loop: a `storage` event from
  // another tab updates our state to match disk; the queued write at flush
  // time sees in-memory == disk and skips, so we don't re-emit a `storage`
  // event ourselves.
  const pendingRef = useRef<{
    papers: Paper[];
    groups: PinGroup[];
    activeId: string;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Drain pendingRef synchronously: writes papers + groups for the pending
   * activeId, but only if the JSON differs from what's on disk.
   *
   * Safe to call when nothing is pending — it just clears the timer and returns.
   * Used as the "settle the active collection" primitive by switch/create/delete
   * and by the unmount/pagehide paths.
   */
  const flushPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    const papersJSON = JSON.stringify(
      pending.papers.map((p) => ({ ...p, id: normalizeId(p.id) })),
    );
    const groupsJSON = JSON.stringify(pending.groups);

    if (localStorage.getItem(collectionPapersKey(pending.activeId)) !== papersJSON) {
      try {
        localStorage.setItem(collectionPapersKey(pending.activeId), papersJSON);
      } catch (err) {
        console.error('[PinContext] write papers failed', err);
      }
    }
    if (localStorage.getItem(collectionGroupsKey(pending.activeId)) !== groupsJSON) {
      try {
        localStorage.setItem(collectionGroupsKey(pending.activeId), groupsJSON);
      } catch (err) {
        console.error('[PinContext] write groups failed', err);
      }
    }
  }, []);

  /**
   * Drop a queued write without writing, but only if it targets `id`.
   * Used by deleteCollection (don't re-create just-deleted keys) and by
   * the multi-tab sync fallback (our active collection was deleted elsewhere).
   */
  const cancelPendingFor = useCallback((id: string): boolean => {
    if (pendingRef.current?.activeId !== id) return false;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return true;
  }, []);

  // Queue + restart the debounce on every state change.
  useEffect(() => {
    if (isLoading) return;
    pendingRef.current = { papers: pinnedPapers, groups, activeId };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushPending, WRITE_DEBOUNCE_MS);
  }, [pinnedPapers, groups, isLoading, activeId, flushPending]);

  // Flush on tab close / page hide. `pagehide` is more reliable than
  // `beforeunload` (especially on mobile Safari). `visibilitychange` covers
  // the "user backgrounded the tab and the OS reaped it later" case.
  useEffect(() => {
    const onPageHide = () => flushPending();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flushPending();
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushPending]);

  return { flushPending, cancelPendingFor, pinnedRef, groupsRef };
}
