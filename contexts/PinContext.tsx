'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  MAX_PAPER_COMMENT_LENGTH,
  MAX_PAPER_KEYWORD_LENGTH,
  MAX_PAPER_KEYWORDS,
  MAX_PINS,
  Paper,
  PinGroup,
} from '@/types/interfaces';
import buildAbstract from '@/utils/abstract';
import cleanHtml from '@/utils/cleanHtml';
import { normalizeId } from '@/utils/normalizeId';
import { openAlexFetch } from '@/utils/openAlexClient';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import {
  CollectionsIndex,
  DEFAULT_COLLECTION_NAME,
  SCHEMA_VERSION,
  ensureBootstrapped,
  readJSON,
} from '@/utils/pinStorage';
import { collectionPapersKey, collectionGroupsKey } from '@/utils/storageKeys';
import { usePinStorage } from '@/hooks/usePinStorage';
import { useCollectionManager } from '@/hooks/useCollectionManager';
import type {
  ExportCollectionResult,
  ExportLibraryResult,
  ImportCollectionResult,
  ImportLibraryResult,
} from '@/hooks/useCollectionManager';
import type { ImportedPinCollection } from '@/utils/pinCollectionTransfer';

/**
 * A user-named library of pinned papers + groups. Each collection is
 * an isolated workspace — switching between them swaps everything in
 * the sidebar, but state from the inactive collections stays put.
 */
export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface PinContextType {
  // Active-collection state (everything below operates on the active one).
  pinnedPapers: Paper[];
  pinnedIds: string[];
  groups: PinGroup[];
  isPinned: (id: string) => boolean;
  togglePin: (paper: Paper) => void;
  removePin: (id: string) => void;
  clearPins: () => void;
  isLoading: boolean;
  createGroup: (name: string) => string;
  renameGroup: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  movePaperToGroup: (paperId: string, groupId: string | null) => void;
  reorderPapersInGroup: (
    groupId: string | null,
    fromIndex: number,
    toIndex: number,
  ) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;
  getUngroupedPapers: () => Paper[];
  getPapersInGroup: (groupId: string) => Paper[];

  // Per-paper user annotations (only meaningful for pinned papers).
  updatePaperComment: (paperId: string, comment: string) => void;
  updatePaperKeywords: (paperId: string, keywords: string[]) => void;

  // Collection management.
  collections: Collection[];
  activeCollectionId: string;
  switchCollection: (id: string) => void;
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

const PinContext = createContext<PinContextType | null>(null);

// ── Provider ──────────────────────────────────────────────────────────

export function PinProvider({ children }: { children: React.ReactNode }) {
  // Index (collections + activeId). We always start from a "pending"
  // placeholder; an effect below upgrades to the real index by reading
  // localStorage post-mount. This guarantees SSR + first client render
  // produce identical HTML (hydration-safe).
  const PENDING_INDEX: CollectionsIndex = {
    version: SCHEMA_VERSION,
    activeId: 'pending',
    collections: [
      { id: 'pending', name: DEFAULT_COLLECTION_NAME, createdAt: 0, updatedAt: 0 },
    ],
  };
  const [index, setIndex] = useState<CollectionsIndex>(PENDING_INDEX);
  const [pinnedPapers, setPinnedPapers] = useState<Paper[]>([]);
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate the real index from localStorage after mount (once).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIndex(ensureBootstrapped());
  }, []);

  // ── Debounced write + refs ────────────────────────────────────────
  const { flushPending, cancelPendingFor, pinnedRef, groupsRef } = usePinStorage({
    pinnedPapers,
    groups,
    isLoading,
    activeId: index.activeId,
  });

  // ── Collection management ─────────────────────────────────────────
  const {
    switchCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    movePaperToCollection,
    collectionsAtCap,
    exportActiveCollection,
    exportAllCollections,
    exportActiveCollectionCsv,
    exportAllCollectionsCsv,
    importCollection,
    importLibrary,
  } = useCollectionManager({
    index,
    setIndex,
    flushPending,
    cancelPendingFor,
    setPinnedPapers,
    setGroups,
    setIsLoading,
    pinnedRef,
    groupsRef,
  });

  // ── Initial load + OpenAlex hydration ─────────────────────────────
  // Pulls the active collection's pins + groups out of localStorage,
  // then asks OpenAlex for fresh metadata (title/cite count/abstract
  // can drift between sessions). Falls back to cached data on network error.
  useEffect(() => {
    if (index.activeId === 'pending') return;
    let cancelled = false;

    const run = async () => {
      const activeId = index.activeId;
      const cached = {
        papers: readJSON<Paper[]>(collectionPapersKey(activeId), []).map((p) => ({
          ...p,
          id: normalizeId(p.id),
        })),
        groups: readJSON<PinGroup[]>(collectionGroupsKey(activeId), []),
      };
      setPinnedPapers(cached.papers);
      setGroups(cached.groups);

      if (cached.papers.length === 0) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const ids = cached.papers.map((p) => normalizeId(p.id));
        const idsFilter = ids.map((id) => `https://openalex.org/${id}`).join('|');
        const res = await openAlexFetch(
          `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=50`,
        );
        if (!res.ok) {
          if (!cancelled) setIsLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        if (data.results) {
          interface OpenAlexAuthor { author: { display_name: string } }
          interface OpenAlexWork {
            id: string;
            title: string | null;
            authorships?: OpenAlexAuthor[];
            publication_year: number;
            primary_location?: { source?: { display_name?: string }; pdf_url?: string };
            doi?: string;
            cited_by_count: number;
            referenced_works_count?: number;
            abstract_inverted_index?: Record<string, number[]> | null;
          }
          const cachedById = new Map<string, Paper>();
          for (const p of cached.papers) cachedById.set(normalizeId(p.id), p);

          const fresh: Paper[] = (data.results as OpenAlexWork[]).map((w) => {
            const id = normalizeId(w.id);
            const cachedPaper = cachedById.get(id);
            return {
              id,
              title: cleanHtml(w.title),
              authors: w.authorships?.map((a) => a.author.display_name) ?? [],
              publication_year: w.publication_year,
              journal_name: w.primary_location?.source?.display_name || 'Unknown',
              doi: w.doi,
              pdf_url: w.primary_location?.pdf_url,
              cited_by_count: w.cited_by_count,
              referenced_works_count: w.referenced_works_count || 0,
              abstract: buildAbstract(w.abstract_inverted_index),
              // Locally-authored fields survive the refresh.
              ...(cachedPaper?.comment !== undefined && { comment: cachedPaper.comment }),
              ...(cachedPaper?.keywords !== undefined && { keywords: cachedPaper.keywords }),
            };
          });
          // Preserve the user's manual order — OpenAlex doesn't honor request order.
          const ordered = ids
            .map((id) => fresh.find((p) => normalizeId(p.id) === id))
            .filter((p): p is Paper => !!p);
          setPinnedPapers(ordered);
        }
      } catch (err) {
        console.error('[PinContext] OpenAlex refresh failed', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [index.activeId]);

  // ── Multi-tab sync via the `storage` event ────────────────────────
  // Browsers fire `storage` in OTHER tabs (never the writer) when
  // localStorage changes. We listen to keep in-memory state in sync
  // without forcing a refresh.
  const activeIdRef = useRef(index.activeId);
  useEffect(() => {
    activeIdRef.current = index.activeId;
  }, [index.activeId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== localStorage) return;
      if (!e.key) return;

      // Index changed in another tab (collection added / renamed / deleted,
      // or active id moved). Merge: take the disk's collections list, keep
      // our own activeId.
      if (e.key === STORAGE_KEYS.collectionsIndex) {
        const fresh = readJSON<CollectionsIndex | null>(STORAGE_KEYS.collectionsIndex, null);
        if (!fresh) return;
        setIndex((current) => {
          const ourActiveStillExists = fresh.collections.some(
            (c) => c.id === current.activeId,
          );
          if (ourActiveStillExists) {
            return { ...fresh, activeId: current.activeId };
          }
          // Our active collection was deleted in another tab. Fall back
          // to the first remaining and load its data.
          const fallback = fresh.collections[0];
          if (!fallback) {
            // No collections left — the deleting tab will have auto-created
            // one, so this is only reachable in a hard race. Stay put.
            return current;
          }
          // Drop any pending write for the gone-active id.
          cancelPendingFor(current.activeId);
          const loaded = {
            papers: readJSON<Paper[]>(collectionPapersKey(fallback.id), []).map(
              (p) => ({ ...p, id: normalizeId(p.id) }),
            ),
            groups: readJSON<PinGroup[]>(collectionGroupsKey(fallback.id), []),
          };
          setPinnedPapers(loaded.papers);
          setGroups(loaded.groups);
          return { ...fresh, activeId: fallback.id };
        });
        return;
      }

      // Active collection's papers/groups changed in another tab.
      const myActiveId = activeIdRef.current;
      if (e.key === collectionPapersKey(myActiveId)) {
        const fresh = readJSON<Paper[]>(e.key, []);
        setPinnedPapers(fresh.map((p) => ({ ...p, id: normalizeId(p.id) })));
      } else if (e.key === collectionGroupsKey(myActiveId)) {
        const fresh = readJSON<PinGroup[]>(e.key, []);
        setGroups(fresh);
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [cancelPendingFor]);

  // ── Clean up groups when papers are removed ───────────────────────
  useEffect(() => {
    if (isLoading) return;
    const currentIds = new Set(pinnedPapers.map((p) => normalizeId(p.id)));
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        paperIds: group.paperIds.filter((id) => currentIds.has(id)),
      })),
    );
  }, [pinnedPapers, isLoading]);

  // ── Pinning / grouping (active collection only) ───────────────────

  const pinnedIds = useMemo(
    () => pinnedPapers.map((p) => normalizeId(p.id)),
    [pinnedPapers],
  );

  const pinnedIdSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const isPinned = useCallback(
    (id: string) => pinnedIdSet.has(normalizeId(id)),
    [pinnedIdSet],
  );

  const togglePin = useCallback((paper: Paper) => {
    const id = normalizeId(paper.id);
    setPinnedPapers((prev) => {
      if (prev.find((p) => normalizeId(p.id) === id)) {
        return prev.filter((p) => normalizeId(p.id) !== id);
      }
      if (prev.length >= MAX_PINS) return prev;
      return [...prev, { ...paper, id, title: cleanHtml(paper.title) }];
    });
  }, []);

  const removePin = useCallback((id: string) => {
    const normalized = normalizeId(id);
    setPinnedPapers((prev) => prev.filter((p) => normalizeId(p.id) !== normalized));
  }, []);

  const clearPins = useCallback(() => {
    setPinnedPapers([]);
    setGroups([]);
  }, []);

  const createGroup = useCallback((name: string): string => {
    const id = `group-${Date.now()}`;
    setGroups((prev) => [...prev, { id, name, paperIds: [] }]);
    return id;
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const movePaperToGroup = useCallback(
    (paperId: string, groupId: string | null) => {
      const normalized = normalizeId(paperId);
      setGroups((prev) => {
        const cleaned = prev.map((g) => ({
          ...g,
          paperIds: g.paperIds.filter((id) => id !== normalized),
        }));
        if (groupId) {
          return cleaned.map((g) =>
            g.id === groupId ? { ...g, paperIds: [...g.paperIds, normalized] } : g,
          );
        }
        return cleaned;
      });
    },
    [],
  );

  const getUngroupedPapers = useCallback((): Paper[] => {
    const groupedIds = new Set(groups.flatMap((g) => g.paperIds));
    return pinnedPapers.filter((p) => !groupedIds.has(normalizeId(p.id)));
  }, [groups, pinnedPapers]);

  const getPapersInGroup = useCallback(
    (groupId: string): Paper[] => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return [];
      return group.paperIds
        .map((id) => pinnedPapers.find((p) => normalizeId(p.id) === id))
        .filter((p): p is Paper => !!p);
    },
    [groups, pinnedPapers],
  );

  const reorderPapersInGroup = useCallback(
    (groupId: string | null, fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;

      if (groupId === null) {
        const ungrouped = getUngroupedPapers();
        const [moved] = ungrouped.splice(fromIndex, 1);
        ungrouped.splice(toIndex, 0, moved);
        const groupedIds = new Set(groups.flatMap((g) => g.paperIds));
        const nonUngrouped = pinnedPapers.filter((p) =>
          groupedIds.has(normalizeId(p.id)),
        );
        setPinnedPapers([...nonUngrouped, ...ungrouped]);
      } else {
        setGroups((prev) =>
          prev.map((g) => {
            if (g.id === groupId) {
              const next = [...g.paperIds];
              const [moved] = next.splice(fromIndex, 1);
              next.splice(toIndex, 0, moved);
              return { ...g, paperIds: next };
            }
            return g;
          }),
        );
      }
    },
    [getUngroupedPapers, groups, pinnedPapers],
  );

  const reorderGroups = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setGroups((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex > prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const updatePaperComment = useCallback(
    (paperId: string, comment: string) => {
      const normalized = normalizeId(paperId);
      const trimmed = comment.trim().slice(0, MAX_PAPER_COMMENT_LENGTH);
      setPinnedPapers((prev) =>
        prev.map((p) => {
          if (normalizeId(p.id) !== normalized) return p;
          if (!trimmed) {
            if (p.comment === undefined) return p;
            const next = { ...p };
            delete next.comment;
            return next;
          }
          if (p.comment === trimmed) return p;
          return { ...p, comment: trimmed };
        }),
      );
    },
    [],
  );

  const updatePaperKeywords = useCallback(
    (paperId: string, keywords: string[]) => {
      const normalized = normalizeId(paperId);
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const raw of keywords) {
        const k = raw.trim().slice(0, MAX_PAPER_KEYWORD_LENGTH);
        if (!k) continue;
        const key = k.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(k);
        if (cleaned.length >= MAX_PAPER_KEYWORDS) break;
      }
      setPinnedPapers((prev) =>
        prev.map((p) => {
          if (normalizeId(p.id) !== normalized) return p;
          if (cleaned.length === 0) {
            if (p.keywords === undefined) return p;
            const next = { ...p };
            delete next.keywords;
            return next;
          }
          const same =
            p.keywords?.length === cleaned.length &&
            p.keywords.every((k, i) => k === cleaned[i]);
          if (same) return p;
          return { ...p, keywords: cleaned };
        }),
      );
    },
    [],
  );

  // ── Memoised context value ────────────────────────────────────────
  const value = useMemo<PinContextType>(
    () => ({
      pinnedPapers,
      pinnedIds,
      groups,
      isPinned,
      togglePin,
      removePin,
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
      updatePaperComment,
      updatePaperKeywords,
      collections: index.collections,
      activeCollectionId: index.activeId,
      switchCollection,
      createCollection,
      renameCollection,
      deleteCollection,
      movePaperToCollection,
      collectionsAtCap,
      exportActiveCollection,
      exportAllCollections,
      exportActiveCollectionCsv,
      exportAllCollectionsCsv,
      importCollection,
      importLibrary,
    }),
    [
      pinnedPapers,
      pinnedIds,
      groups,
      isPinned,
      togglePin,
      removePin,
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
      updatePaperComment,
      updatePaperKeywords,
      index.collections,
      index.activeId,
      switchCollection,
      createCollection,
      renameCollection,
      deleteCollection,
      movePaperToCollection,
      collectionsAtCap,
      exportActiveCollection,
      exportAllCollections,
      exportActiveCollectionCsv,
      exportAllCollectionsCsv,
      importCollection,
      importLibrary,
    ],
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

export function usePins() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePins must be used inside <PinProvider>');
  return ctx;
}
