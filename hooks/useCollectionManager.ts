'use client';

/**
 * Collection CRUD + export/import callbacks, extracted from PinProvider.
 *
 * All mutating methods operate on `index` (the CollectionsIndex) and thread
 * their changes through setIndex. They never touch React state for the active
 * collection's papers / groups directly — that's the caller's (PinProvider's)
 * responsibility via setPinnedPapers / setGroups.
 */

import { useCallback } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { MAX_PINS, type Paper, type PinGroup } from '@/types/interfaces';
import cleanHtml from '@/utils/cleanHtml';
import { normalizeId } from '@/utils/normalizeId';
import {
  buildCollectionTransfer,
  buildCollectionTransferFilename,
  buildLibraryTransfer,
  buildLibraryTransferFilename,
  buildCollectionCsv,
  buildCollectionCsvFilename,
  buildLibraryCsv,
  buildLibraryCsvFilename,
  type ImportedPinCollection,
  serializeCollectionTransfer,
  serializeLibraryTransfer,
} from '@/utils/pinCollectionTransfer';
import { collectionPapersKey, collectionGroupsKey } from '@/utils/storageKeys';
import {
  MAX_COLLECTIONS,
  DEFAULT_COLLECTION_NAME,
  SCHEMA_VERSION,
  CollectionsIndex,
  loadCollection,
  persistIndex,
  writeJSON,
  buildImportedCollectionName,
} from '@/utils/pinStorage';
import type { Collection } from '@/contexts/PinContext';

// ── Result types (re-exported so consumers don't reach into PinContext) ─

export interface ExportCollectionResult {
  name: string;
  filename: string;
  contents: string;
}

export interface ExportLibraryResult {
  filename: string;
  contents: string;
  collectionCount: number;
}

export type ImportCollectionResult =
  | {
      status: 'ok';
      collectionId: string;
      name: string;
      importedPaperCount: number;
      importedGroupCount: number;
    }
  | { status: 'cap-reached' };

export type ImportLibraryResult =
  | {
      status: 'ok';
      activeCollectionId: string;
      importedCollectionCount: number;
      importedPaperCount: number;
    }
  | { status: 'cap-exceeded'; available: number; required: number }
  | { status: 'empty' };

// ── Hook ──────────────────────────────────────────────────────────────

interface Params {
  index: CollectionsIndex;
  setIndex: Dispatch<SetStateAction<CollectionsIndex>>;
  flushPending: () => void;
  setPinnedPapers: Dispatch<SetStateAction<Paper[]>>;
  setGroups: Dispatch<SetStateAction<PinGroup[]>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  pinnedRef: RefObject<Paper[]>;
  groupsRef: RefObject<PinGroup[]>;
  /** Drop the queued write for a specific collection id without flushing. */
  cancelPendingFor: (id: string) => boolean;
}

export interface CollectionManagerHandle {
  switchCollection: (newId: string) => void;
  createCollection: (name: string) => string | null;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  movePaperToCollection: (
    paperId: string,
    targetCollectionId: string,
  ) => 'ok' | 'noop' | 'not-found' | 'target-full' | 'invalid';
  collectionsAtCap: boolean;
  exportActiveCollection: () => ExportCollectionResult | null;
  exportAllCollections: () => ExportLibraryResult | null;
  exportActiveCollectionCsv: () => ExportCollectionResult | null;
  exportAllCollectionsCsv: () => ExportLibraryResult | null;
  importCollection: (collection: ImportedPinCollection) => ImportCollectionResult;
  importLibrary: (collections: ImportedPinCollection[]) => ImportLibraryResult;
}

export function useCollectionManager({
  index,
  setIndex,
  flushPending,
  setPinnedPapers,
  setGroups,
  setIsLoading,
  pinnedRef,
  groupsRef,
  cancelPendingFor,
}: Params): CollectionManagerHandle {

  const switchCollection = useCallback(
    (newId: string) => {
      if (newId === index.activeId) return;
      if (!index.collections.some((c) => c.id === newId)) return;

      // Persist any pending edits to the OLD collection synchronously
      // — both to avoid losing them and to prevent the debounced timer
      // from firing later and clobbering keys we no longer "own".
      flushPending();

      const next = loadCollection(newId);
      setPinnedPapers(next.papers);
      setGroups(next.groups);

      const now = Date.now();
      const updated: CollectionsIndex = {
        ...index,
        activeId: newId,
        collections: index.collections.map((c) =>
          c.id === newId ? { ...c, updatedAt: now } : c,
        ),
      };
      persistIndex(updated);
      setIndex(updated);
    },
    [index, flushPending, setPinnedPapers, setGroups, setIndex],
  );

  const createCollection = useCallback(
    (name: string): string | null => {
      if (index.collections.length >= MAX_COLLECTIONS) return null;
      const trimmed = name.trim() || DEFAULT_COLLECTION_NAME;

      flushPending();

      const id = `c-${Date.now()}`;
      const now = Date.now();
      const next: CollectionsIndex = {
        ...index,
        activeId: id,
        collections: [
          ...index.collections,
          { id, name: trimmed, createdAt: now, updatedAt: now },
        ],
      };
      persistIndex(next);
      setIndex(next);
      setPinnedPapers([]);
      setGroups([]);
      return id;
    },
    [index, flushPending, setIndex, setPinnedPapers, setGroups],
  );

  const renameCollection = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const next: CollectionsIndex = {
        ...index,
        collections: index.collections.map((c) =>
          c.id === id ? { ...c, name: trimmed, updatedAt: Date.now() } : c,
        ),
      };
      persistIndex(next);
      setIndex(next);
    },
    [index, setIndex],
  );

  const deleteCollection = useCallback(
    (id: string) => {
      if (!index.collections.some((c) => c.id === id)) return;

      // Pending-write handling: if the queued write targets the collection
      // we're about to delete, drop it — otherwise the timer would re-create
      // the keys we just removed. Pending writes for OTHER collections should
      // still flush so we don't lose them.
      const cancelled = cancelPendingFor(id);
      if (!cancelled) {
        flushPending();
      }

      // Drop the collection's storage blobs.
      localStorage.removeItem(collectionPapersKey(id));
      localStorage.removeItem(collectionGroupsKey(id));

      const remaining = index.collections.filter((c) => c.id !== id);

      // Always keep at least one collection — auto-create a fresh
      // "Library" if the user just removed the last one.
      if (remaining.length === 0) {
        const newId = `c-${Date.now()}`;
        const now = Date.now();
        const next: CollectionsIndex = {
          version: SCHEMA_VERSION,
          activeId: newId,
          collections: [{ id: newId, name: DEFAULT_COLLECTION_NAME, createdAt: now, updatedAt: now }],
        };
        persistIndex(next);
        setIndex(next);
        setPinnedPapers([]);
        setGroups([]);
        return;
      }

      // If the user deleted the active one, switch to the first remaining.
      if (id === index.activeId) {
        const newActiveId = remaining[0].id;
        const loaded = loadCollection(newActiveId);
        const next: CollectionsIndex = { ...index, activeId: newActiveId, collections: remaining };
        persistIndex(next);
        setIndex(next);
        setPinnedPapers(loaded.papers);
        setGroups(loaded.groups);
      } else {
        const next: CollectionsIndex = { ...index, collections: remaining };
        persistIndex(next);
        setIndex(next);
      }
    },
    [index, flushPending, cancelPendingFor, setIndex, setPinnedPapers, setGroups],
  );

  /**
   * Move one paper from the active collection to another. Persists the target
   * collection's blobs synchronously (it's not the active one, so it's not
   * covered by pendingRef); removes from active state via setPinnedPapers —
   * the debounced write handles persistence of the active collection.
   *
   * Cross-tab: the synchronous `setItem` on the target keys fires a `storage`
   * event in any other tab that has the target active.
   */
  const movePaperToCollection = useCallback(
    (
      paperId: string,
      targetCollectionId: string,
    ): 'ok' | 'noop' | 'not-found' | 'target-full' | 'invalid' => {
      if (targetCollectionId === index.activeId) return 'noop';
      if (!index.collections.some((c) => c.id === targetCollectionId)) return 'invalid';

      const normalized = normalizeId(paperId);
      const paper = pinnedRef.current.find((p) => normalizeId(p.id) === normalized);
      if (!paper) return 'not-found';

      const target = loadCollection(targetCollectionId);
      const alreadyInTarget = target.papers.some((p) => normalizeId(p.id) === normalized);
      if (!alreadyInTarget) {
        if (target.papers.length >= MAX_PINS) return 'target-full';
        target.papers.push({ ...paper, id: normalized });
      }

      writeJSON(
        collectionPapersKey(targetCollectionId),
        target.papers.map((p) => ({ ...p, id: normalizeId(p.id) })),
      );
      writeJSON(collectionGroupsKey(targetCollectionId), target.groups);

      setPinnedPapers((prev) => prev.filter((p) => normalizeId(p.id) !== normalized));

      const next: CollectionsIndex = {
        ...index,
        collections: index.collections.map((c) =>
          c.id === targetCollectionId ? { ...c, updatedAt: Date.now() } : c,
        ),
      };
      persistIndex(next);
      setIndex(next);

      return 'ok';
    },
    [index, pinnedRef, setPinnedPapers, setIndex],
  );

  const exportActiveCollection = useCallback((): ExportCollectionResult | null => {
    const active = index.collections.find((c) => c.id === index.activeId);
    if (!active) return null;

    const payload = buildCollectionTransfer(
      active.name,
      pinnedRef.current,
      groupsRef.current,
    );
    return {
      name: active.name,
      filename: buildCollectionTransferFilename(active.name),
      contents: serializeCollectionTransfer(payload),
    };
  }, [index.collections, index.activeId, pinnedRef, groupsRef]);

  const exportAllCollections = useCallback((): ExportLibraryResult | null => {
    if (index.collections.length === 0) return null;

    // Flush any pending writes so the snapshot we read back from
    // localStorage matches what the user sees on screen for every collection.
    flushPending();

    const bundles = index.collections.map((collection) => {
      // Active collection: prefer in-memory state (most up-to-date).
      // Inactive: read from disk.
      if (collection.id === index.activeId) {
        return { name: collection.name, papers: pinnedRef.current, groups: groupsRef.current };
      }
      const loaded = loadCollection(collection.id);
      return { name: collection.name, papers: loaded.papers, groups: loaded.groups };
    });

    const payload = buildLibraryTransfer(bundles);
    return {
      filename: buildLibraryTransferFilename(),
      contents: serializeLibraryTransfer(payload),
      collectionCount: bundles.length,
    };
  }, [index.collections, index.activeId, flushPending, pinnedRef, groupsRef]);

  // CSV variants — flat, spreadsheet-friendly, one-way exports. Same data
  // sources as the JSON exports above; only the serialisation differs.
  const exportActiveCollectionCsv =
    useCallback((): ExportCollectionResult | null => {
      const active = index.collections.find((c) => c.id === index.activeId);
      if (!active) return null;
      return {
        name: active.name,
        filename: buildCollectionCsvFilename(active.name),
        contents: buildCollectionCsv(
          active.name,
          pinnedRef.current,
          groupsRef.current,
        ),
      };
    }, [index.collections, index.activeId, pinnedRef, groupsRef]);

  const exportAllCollectionsCsv = useCallback((): ExportLibraryResult | null => {
    if (index.collections.length === 0) return null;
    flushPending();

    const bundles = index.collections.map((collection) => {
      if (collection.id === index.activeId) {
        return {
          name: collection.name,
          papers: pinnedRef.current,
          groups: groupsRef.current,
        };
      }
      const loaded = loadCollection(collection.id);
      return { name: collection.name, papers: loaded.papers, groups: loaded.groups };
    });

    return {
      filename: buildLibraryCsvFilename(),
      contents: buildLibraryCsv(bundles),
      collectionCount: bundles.length,
    };
  }, [index.collections, index.activeId, flushPending, pinnedRef, groupsRef]);

  const importCollection = useCallback(
    (collection: ImportedPinCollection): ImportCollectionResult => {
      if (index.collections.length >= MAX_COLLECTIONS) {
        return { status: 'cap-reached' };
      }

      flushPending();

      const id = `c-${Date.now()}`;
      const now = Date.now();
      const name = buildImportedCollectionName(collection.name, index.collections);
      const papers = collection.papers.map((paper) => ({
        ...paper,
        id: normalizeId(paper.id),
        title: cleanHtml(paper.title),
      }));
      const groups = collection.groups.map((group) => ({
        ...group,
        name: group.name.trim() || 'Untitled group',
        paperIds: group.paperIds.map((pid) => normalizeId(pid)),
      }));

      writeJSON(collectionPapersKey(id), papers);
      writeJSON(collectionGroupsKey(id), groups);

      const next: CollectionsIndex = {
        ...index,
        activeId: id,
        collections: [...index.collections, { id, name, createdAt: now, updatedAt: now }],
      };
      persistIndex(next);
      setIndex(next);
      setPinnedPapers(papers);
      setGroups(groups);
      setIsLoading(false);

      return {
        status: 'ok',
        collectionId: id,
        name,
        importedPaperCount: papers.length,
        importedGroupCount: groups.length,
      };
    },
    [index, flushPending, setIndex, setPinnedPapers, setGroups, setIsLoading],
  );

  const importLibrary = useCallback(
    (incoming: ImportedPinCollection[]): ImportLibraryResult => {
      if (incoming.length === 0) return { status: 'empty' };

      const available = MAX_COLLECTIONS - index.collections.length;
      if (incoming.length > available) {
        return { status: 'cap-exceeded', available, required: incoming.length };
      }

      flushPending();

      // Build collection records in one pass, deduping each name against
      // the running list so two entries called "Library" get distinct names.
      // Spacing ids by loop index keeps them unique within a single millisecond.
      const baseTime = Date.now();
      const accumulating: Collection[] = [...index.collections];
      const newRecords: Collection[] = [];
      const writes: Array<{ id: string; papers: Paper[]; groups: PinGroup[] }> = [];

      for (let i = 0; i < incoming.length; i++) {
        const collection = incoming[i];
        const id = `c-${baseTime}-${i}`;
        const name = buildImportedCollectionName(collection.name, accumulating);

        const papers = collection.papers.map((paper) => ({
          ...paper,
          id: normalizeId(paper.id),
          title: cleanHtml(paper.title),
        }));
        const groups = collection.groups.map((group) => ({
          ...group,
          name: group.name.trim() || 'Untitled group',
          paperIds: group.paperIds.map((pid) => normalizeId(pid)),
        }));

        const record: Collection = { id, name, createdAt: baseTime, updatedAt: baseTime };
        accumulating.push(record);
        newRecords.push(record);
        writes.push({ id, papers, groups });
      }

      // Commit per-collection blobs first, then the index — that way a
      // partial failure leaves the index pointing at fully-written collections.
      for (const w of writes) {
        writeJSON(collectionPapersKey(w.id), w.papers);
        writeJSON(collectionGroupsKey(w.id), w.groups);
      }

      const firstNew = newRecords[0];
      const next: CollectionsIndex = {
        ...index,
        activeId: firstNew.id,
        collections: [...index.collections, ...newRecords],
      };
      persistIndex(next);
      setIndex(next);

      // Switch the in-memory state to the first imported collection.
      const firstWrite = writes[0];
      setPinnedPapers(firstWrite.papers);
      setGroups(firstWrite.groups);
      setIsLoading(false);

      const importedPaperCount = writes.reduce((sum, w) => sum + w.papers.length, 0);
      return {
        status: 'ok',
        activeCollectionId: firstNew.id,
        importedCollectionCount: newRecords.length,
        importedPaperCount,
      };
    },
    [index, flushPending, setIndex, setPinnedPapers, setGroups, setIsLoading],
  );

  return {
    switchCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    movePaperToCollection,
    collectionsAtCap: index.collections.length >= MAX_COLLECTIONS,
    exportActiveCollection,
    exportAllCollections,
    exportActiveCollectionCsv,
    exportAllCollectionsCsv,
    importCollection,
    importLibrary,
  };
}

// Re-export buildAbstract usage note: PinContext's OpenAlex hydration still
// uses buildAbstract directly. Keeping it there avoids threading it through here.
