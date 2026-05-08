'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { MAX_PINS, Paper, PinGroup } from '@/types/interfaces';
import buildAbstract from '@/utils/abstract';
import cleanHtml from '@/utils/cleanHtml';
import { normalizeId } from '@/utils/normalizeId';
import {
  buildCollectionTransfer,
  buildCollectionTransferFilename,
  ImportedPinCollection,
  serializeCollectionTransfer,
} from '@/utils/pinCollectionTransfer';
import {
  STORAGE_KEYS,
  collectionPapersKey,
  collectionGroupsKey,
} from '@/utils/storageKeys';

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

/** Index record persisted under STORAGE_KEYS.collectionsIndex. */
interface CollectionsIndex {
  /** Schema version for forward-compatible migrations. */
  version: 1;
  activeId: string;
  collections: Collection[];
}

const SCHEMA_VERSION = 1;
/** Soft cap to keep storage and UI manageable. */
const MAX_COLLECTIONS = 20;
const DEFAULT_COLLECTION_NAME = 'Library';
/**
 * Coalesce-window for active-collection writes. Drag-reorder fires many
 * state updates per gesture; without this, each one would JSON.stringify +
 * setItem the full pin list. 150ms is short enough that a tab close
 * won't realistically catch un-flushed edits — and `pagehide` /
 * `visibilitychange` flush belt-and-braces.
 */
const WRITE_DEBOUNCE_MS = 150;

interface ExportCollectionResult {
  name: string;
  filename: string;
  contents: string;
}

type ImportCollectionResult =
  | {
      status: 'ok';
      collectionId: string;
      name: string;
      importedPaperCount: number;
      importedGroupCount: number;
    }
  | { status: 'cap-reached' };

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

  // Collection management.
  collections: Collection[];
  activeCollectionId: string;
  switchCollection: (id: string) => void;
  /** Returns the new collection id (or null if the cap is hit). */
  createCollection: (name: string) => string | null;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  /**
   * Move a single paper from the active collection to another. Returns
   * a result so the caller can show the right feedback:
   *   'ok'         — paper moved.
   *   'noop'       — target is the active collection (drop on self).
   *   'not-found'  — paper isn't in the active collection.
   *   'target-full'— target collection is at MAX_PINS.
   *   'invalid'    — targetCollectionId doesn't exist.
   */
  movePaperToCollection: (
    paperId: string,
    targetCollectionId: string,
  ) => 'ok' | 'noop' | 'not-found' | 'target-full' | 'invalid';
  /** True when adding more collections would exceed MAX_COLLECTIONS. */
  collectionsAtCap: boolean;
  exportActiveCollection: () => ExportCollectionResult | null;
  importCollection: (
    collection: ImportedPinCollection,
  ) => ImportCollectionResult;
}

const PinContext = createContext<PinContextType | null>(null);

// ── Storage helpers ────────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // QuotaExceeded etc. — log and continue rather than crashing the app.
    console.error(`[PinContext] failed to write ${key}`, err);
  }
}

function loadCollection(id: string): { papers: Paper[]; groups: PinGroup[] } {
  const papers = readJSON<Paper[]>(collectionPapersKey(id), []);
  const groups = readJSON<PinGroup[]>(collectionGroupsKey(id), []);
  return {
    papers: papers.map((p) => ({ ...p, id: normalizeId(p.id) })),
    groups,
  };
}

function persistIndex(index: CollectionsIndex): void {
  writeJSON(STORAGE_KEYS.collectionsIndex, index);
}

/**
 * One-time migration from the legacy single-bucket keys
 * (`pinned-papers` / `pin-groups`) into the new collections layout.
 *
 * Idempotent: presence of `collectionsIndex` is the marker that the
 * migration has already run, so re-mounting the provider on a tab
 * with up-to-date storage is a no-op.
 *
 * Returns the bootstrapped index. Always returns *something* — even a
 * brand-new install gets an empty default collection so the rest of
 * the context can assume there's always one active collection.
 */
function ensureBootstrapped(): CollectionsIndex {
  const existing = readJSON<CollectionsIndex | null>(
    STORAGE_KEYS.collectionsIndex,
    null,
  );
  if (existing && existing.collections.length > 0) {
    // Defensive: if activeId points at a collection that's been
    // removed externally (e.g. a user fiddled with localStorage),
    // fall back to the first one.
    if (!existing.collections.some((c) => c.id === existing.activeId)) {
      return persistAndReturn({
        ...existing,
        activeId: existing.collections[0].id,
      });
    }
    return existing;
  }

  // No index yet — either fresh install or pre-collections data.
  const legacyPapers = readJSON<Paper[]>(STORAGE_KEYS.pinnedPapers, []);
  const legacyGroups = readJSON<PinGroup[]>(STORAGE_KEYS.pinGroups, []);

  const id = `c-${Date.now()}`;
  const now = Date.now();
  const collection: Collection = {
    id,
    name: DEFAULT_COLLECTION_NAME,
    createdAt: now,
    updatedAt: now,
  };

  // Move legacy data into the new collection's keys (only if there
  // was actually anything to move — saves two writes for fresh users).
  if (legacyPapers.length > 0) {
    writeJSON(collectionPapersKey(id), legacyPapers);
  }
  if (legacyGroups.length > 0) {
    writeJSON(collectionGroupsKey(id), legacyGroups);
  }

  // Drop the legacy keys so the StorageModal stays clean and we don't
  // re-migrate on the next mount.
  if (legacyPapers.length > 0 || legacyGroups.length > 0) {
    localStorage.removeItem(STORAGE_KEYS.pinnedPapers);
    localStorage.removeItem(STORAGE_KEYS.pinGroups);
  }

  return persistAndReturn({
    version: SCHEMA_VERSION,
    activeId: id,
    collections: [collection],
  });
}

function persistAndReturn(index: CollectionsIndex): CollectionsIndex {
  persistIndex(index);
  return index;
}

function buildImportedCollectionName(
  preferredName: string,
  existingCollections: Collection[],
): string {
  const trimmed = preferredName.trim() || 'Imported collection';
  const existingNames = new Set(
    existingCollections.map((collection) => collection.name.trim().toLowerCase()),
  );
  if (!existingNames.has(trimmed.toLowerCase())) return trimmed;

  const importedBase = `${trimmed} (imported)`;
  if (!existingNames.has(importedBase.toLowerCase())) return importedBase;

  let suffix = 2;
  while (existingNames.has(`${importedBase} ${suffix}`.toLowerCase())) {
    suffix++;
  }
  return `${importedBase} ${suffix}`;
}

// ── Provider ──────────────────────────────────────────────────────────

export function PinProvider({ children }: { children: React.ReactNode }) {
  // Index (collections + activeId). Hydrated synchronously from
  // localStorage on first render so we don't render a "no collections"
  // flash; bootstrap also runs the legacy-keys migration.
  const [index, setIndex] = useState<CollectionsIndex>(() => {
    if (typeof window === 'undefined') {
      // SSR fallback — replaced on hydration.
      return {
        version: SCHEMA_VERSION,
        activeId: 'pending',
        collections: [
          {
            id: 'pending',
            name: DEFAULT_COLLECTION_NAME,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      };
    }
    return ensureBootstrapped();
  });

  const [pinnedPapers, setPinnedPapers] = useState<Paper[]>([]);
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Debounced-write machinery ─────────────────────────────────────
  // pendingRef captures the latest state we've been asked to persist
  // for `activeId`. The timer fires after WRITE_DEBOUNCE_MS of
  // inactivity, at which point flushPending serializes and writes —
  // but only if the JSON differs from what's already on disk
  // (cheap deep-compare via stringify). Deep-compare also breaks the
  // cross-tab ping-pong loop: a `storage` event from another tab
  // updates our state to match disk; the queued write at flush time
  // sees in-memory == disk and skips, so we don't re-emit a `storage`
  // event ourselves.
  const pendingRef = useRef<{
    papers: Paper[];
    groups: PinGroup[];
    activeId: string;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load + OpenAlex hydration ─────────────────────────────
  // Pulls the active collection's pins + groups out of localStorage,
  // then asks OpenAlex for fresh metadata (title/cite count/abstract
  // can drift between sessions). If the network call fails we fall
  // back to the cached local copy so the user never opens an empty
  // sidebar after a flaky load.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const activeId = index.activeId;
      const cached = loadCollection(activeId);
      // Show cached data immediately — refresh comes after.
      setPinnedPapers(cached.papers);
      setGroups(cached.groups);

      if (cached.papers.length === 0) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const ids = cached.papers.map((p) => normalizeId(p.id));
        const idsFilter = ids
          .map((id) => `https://openalex.org/${id}`)
          .join('|');
        const res = await fetch(
          `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=50`,
        );
        const data = await res.json();
        if (cancelled) return;

        if (data.results) {
          // OpenAlex response shape — narrowly typed for the fields we
          // actually consume. The full schema is huge; keeping this
          // local avoids dragging the whole type tree into PinContext.
          interface OpenAlexAuthor {
            author: { display_name: string };
          }
          interface OpenAlexWork {
            id: string;
            title: string | null;
            authorships?: OpenAlexAuthor[];
            publication_year: number;
            primary_location?: {
              source?: { display_name?: string };
              pdf_url?: string;
            };
            doi?: string;
            cited_by_count: number;
            referenced_works_count?: number;
            abstract_inverted_index?: Record<string, number[]> | null;
          }
          const fresh: Paper[] = (data.results as OpenAlexWork[]).map((w) => ({
            id: normalizeId(w.id),
            title: cleanHtml(w.title),
            authors:
              w.authorships?.map((a) => a.author.display_name) ?? [],
            publication_year: w.publication_year,
            journal_name: w.primary_location?.source?.display_name || 'Unknown',
            doi: w.doi,
            pdf_url: w.primary_location?.pdf_url,
            cited_by_count: w.cited_by_count,
            referenced_works_count: w.referenced_works_count || 0,
            abstract: buildAbstract(w.abstract_inverted_index),
          }));
          // Preserve the user's manual order — OpenAlex doesn't
          // honor the request order, so we re-sort by the cached id list.
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
    return () => {
      cancelled = true;
    };
  }, [index.activeId]);

  // ── Persist active collection on edits ────────────────────────────
  // Use refs to track the latest pinned/groups so the management
  // methods (switch/create/delete) can serialize them synchronously
  // without depending on stale closures or pending state updates.
  const pinnedRef = useRef<Paper[]>([]);
  const groupsRef = useRef<PinGroup[]>([]);
  useEffect(() => {
    pinnedRef.current = pinnedPapers;
  }, [pinnedPapers]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  /**
   * Drain pendingRef synchronously: writes papers + groups for the
   * pending activeId, but only if the JSON differs from what's on
   * disk. The deep-compare avoids redundant writes (and prevents
   * cross-tab `storage` ping-pong, see the storage event listener).
   *
   * Safe to call when nothing is pending — it just clears the timer
   * and returns. Used as the unified "settle the active collection"
   * primitive by switch/create/delete and by the unmount/pagehide
   * paths.
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
    if (
      localStorage.getItem(collectionPapersKey(pending.activeId)) !== papersJSON
    ) {
      try {
        localStorage.setItem(collectionPapersKey(pending.activeId), papersJSON);
      } catch (err) {
        console.error('[PinContext] write papers failed', err);
      }
    }
    if (
      localStorage.getItem(collectionGroupsKey(pending.activeId)) !== groupsJSON
    ) {
      try {
        localStorage.setItem(collectionGroupsKey(pending.activeId), groupsJSON);
      } catch (err) {
        console.error('[PinContext] write groups failed', err);
      }
    }
  }, []);

  // Queue + restart the debounce on every state change. Coalesces
  // rapid edits (drag-reorder, multi-step group moves) into a single
  // localStorage write per `WRITE_DEBOUNCE_MS` quiet window.
  useEffect(() => {
    if (isLoading) return;
    pendingRef.current = {
      papers: pinnedPapers,
      groups,
      activeId: index.activeId,
    };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushPending, WRITE_DEBOUNCE_MS);
  }, [pinnedPapers, groups, isLoading, index.activeId, flushPending]);

  // Flush on tab close / page hide. `pagehide` is more reliable than
  // `beforeunload` (especially on mobile Safari, which can kill tabs
  // without ever firing beforeunload). `visibilitychange` covers the
  // "user backgrounded the tab and the OS reaped it later" case.
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

  // ── Multi-tab sync via the `storage` event ───────────────────────
  // Browsers fire `storage` in OTHER tabs (never the writer) when
  // localStorage changes. We listen to keep the in-memory state in
  // each tab in sync without forcing a refresh:
  //   - collectionsIndex: refresh the list of collections, but
  //     PRESERVE this tab's activeId (different tabs can view
  //     different collections in parallel — that's a feature).
  //   - active collection's papers/groups: replace state from disk so
  //     the user sees pins added/removed in another tab.
  //
  // Loop avoidance: when this handler updates state, the write effect
  // queues a write. flushPending's deep-compare sees in-memory ==
  // disk and skips the actual setItem, so we don't ping-pong.
  const activeIdRef = useRef(index.activeId);
  useEffect(() => {
    activeIdRef.current = index.activeId;
  }, [index.activeId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== localStorage) return;
      if (!e.key) return;

      // Index changed in another tab (collection added / renamed /
      // deleted, or active id moved). Merge: take the disk's
      // collections list, keep our own activeId.
      if (e.key === STORAGE_KEYS.collectionsIndex) {
        const fresh = readJSON<CollectionsIndex | null>(
          STORAGE_KEYS.collectionsIndex,
          null,
        );
        if (!fresh) return;
        setIndex((current) => {
          const ourActiveStillExists = fresh.collections.some(
            (c) => c.id === current.activeId,
          );
          if (ourActiveStillExists) {
            return { ...fresh, activeId: current.activeId };
          }
          // Our active collection was deleted in another tab. Fall
          // back to the first remaining and load its data.
          const fallback = fresh.collections[0];
          if (!fallback) {
            // No collections left at all — the deleting tab will
            // have auto-created one (see deleteCollection's safety
            // net), so this branch is only reachable in a hard race.
            // Stay where we are; next storage event will reconcile.
            return current;
          }
          // Drop any pending write for the gone-active id, then
          // load the fallback. Doing the loads inside a setIndex
          // updater is unusual but safe — we only reach here after
          // a confirmed external mutation.
          if (pendingRef.current?.activeId === current.activeId) {
            pendingRef.current = null;
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
          }
          const loaded = loadCollection(fallback.id);
          setPinnedPapers(loaded.papers);
          setGroups(loaded.groups);
          return { ...fresh, activeId: fallback.id };
        });
        return;
      }

      // Active collection's papers/groups changed in another tab.
      // Sync in-memory state so the sidebar updates live.
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
  }, []);

  // Clean up groups when papers are removed. Same effect as before;
  // operates on the active collection only.
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

  // ── Pinning / grouping (operate on active collection only) ────────

  const pinnedIds = pinnedPapers.map((p) => normalizeId(p.id));

  const isPinned = (id: string) => pinnedIds.includes(normalizeId(id));

  const togglePin = (paper: Paper) => {
    const id = normalizeId(paper.id);
    setPinnedPapers((prev) => {
      if (prev.find((p) => normalizeId(p.id) === id)) {
        return prev.filter((p) => normalizeId(p.id) !== id);
      }
      if (prev.length >= MAX_PINS) return prev;
      return [...prev, { ...paper, id, title: cleanHtml(paper.title) }];
    });
  };

  const removePin = (id: string) => {
    const normalized = normalizeId(id);
    setPinnedPapers((prev) =>
      prev.filter((p) => normalizeId(p.id) !== normalized),
    );
  };

  const clearPins = () => {
    setPinnedPapers([]);
    setGroups([]);
  };

  const createGroup = (name: string): string => {
    const id = `group-${Date.now()}`;
    setGroups((prev) => [...prev, { id, name, paperIds: [] }]);
    return id;
  };

  const renameGroup = (groupId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g)),
    );
  };

  const deleteGroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const movePaperToGroup = (paperId: string, groupId: string | null) => {
    const normalized = normalizeId(paperId);
    setGroups((prev) => {
      const cleaned = prev.map((g) => ({
        ...g,
        paperIds: g.paperIds.filter((id) => id !== normalized),
      }));
      if (groupId) {
        return cleaned.map((g) =>
          g.id === groupId
            ? { ...g, paperIds: [...g.paperIds, normalized] }
            : g,
        );
      }
      return cleaned;
    });
  };

  const reorderPapersInGroup = (
    groupId: string | null,
    fromIndex: number,
    toIndex: number,
  ) => {
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
  };

  const reorderGroups = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setGroups((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        toIndex > prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const getUngroupedPapers = (): Paper[] => {
    const groupedIds = new Set(groups.flatMap((g) => g.paperIds));
    return pinnedPapers.filter((p) => !groupedIds.has(normalizeId(p.id)));
  };

  const getPapersInGroup = (groupId: string): Paper[] => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return [];
    return group.paperIds
      .map((id) => pinnedPapers.find((p) => normalizeId(p.id) === id))
      .filter((p): p is Paper => !!p);
  };

  // ── Collection management ─────────────────────────────────────────

  const switchCollection = useCallback(
    (newId: string) => {
      if (newId === index.activeId) return;
      if (!index.collections.some((c) => c.id === newId)) return;

      // Persist any pending edits to the OLD collection synchronously
      // — both to avoid losing them and to prevent the debounced timer
      // from firing later and clobbering keys we no longer "own".
      flushPending();

      // Load NEW. The write effect on the next render will queue a
      // (no-op) write of this same data; flushPending's deep-compare
      // skips the actual setItem.
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
    [index, flushPending],
  );

  const createCollection = useCallback(
    (name: string): string | null => {
      if (index.collections.length >= MAX_COLLECTIONS) return null;
      const trimmed = name.trim() || DEFAULT_COLLECTION_NAME;

      // Persist any pending edits on the previous collection before
      // we swap state and start writing to the new one's keys.
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
      // New collection starts empty.
      setPinnedPapers([]);
      setGroups([]);
      return id;
    },
    [index, flushPending],
  );

  /**
   * Move one paper from the active collection to another. Persists
   * the target collection's blobs synchronously (target is not the
   * active one, so it's not part of pendingRef); removes from active
   * state via setPinnedPapers — the debounced write handles
   * persistence of the active collection.
   *
   * Cross-tab consequence: the synchronous `setItem` on the target
   * keys fires a `storage` event in any other tab that has the
   * target active, which their listener then mirrors into state.
   */
  const movePaperToCollection = useCallback(
    (
      paperId: string,
      targetCollectionId: string,
    ): 'ok' | 'noop' | 'not-found' | 'target-full' | 'invalid' => {
      if (targetCollectionId === index.activeId) return 'noop';
      if (!index.collections.some((c) => c.id === targetCollectionId))
        return 'invalid';

      const normalized = normalizeId(paperId);
      const paper = pinnedRef.current.find(
        (p) => normalizeId(p.id) === normalized,
      );
      if (!paper) return 'not-found';

      // Read target collection from disk and append (or skip if
      // already present — no duplicates within a collection).
      const target = loadCollection(targetCollectionId);
      const alreadyInTarget = target.papers.some(
        (p) => normalizeId(p.id) === normalized,
      );
      if (!alreadyInTarget) {
        if (target.papers.length >= MAX_PINS) return 'target-full';
        target.papers.push({ ...paper, id: normalized });
      }

      // Persist target. We bypass pendingRef (which only ever holds
      // the active collection) by writing directly.
      writeJSON(
        collectionPapersKey(targetCollectionId),
        target.papers.map((p) => ({ ...p, id: normalizeId(p.id) })),
      );
      // Groups are unchanged — but write defensively if disk had a
      // stale value from a previous session.
      writeJSON(collectionGroupsKey(targetCollectionId), target.groups);

      // Remove from active state. The existing groups-cleanup effect
      // will strip the paper id out of any groups it was in. The
      // debounced write will then persist active's new state.
      setPinnedPapers((prev) =>
        prev.filter((p) => normalizeId(p.id) !== normalized),
      );

      // Bump target's updatedAt — useful if we ever sort the
      // switcher by recency.
      const next: CollectionsIndex = {
        ...index,
        collections: index.collections.map((c) =>
          c.id === targetCollectionId
            ? { ...c, updatedAt: Date.now() }
            : c,
        ),
      };
      persistIndex(next);
      setIndex(next);

      return 'ok';
    },
    [index],
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
    [index],
  );

  const deleteCollection = useCallback(
    (id: string) => {
      const target = index.collections.find((c) => c.id === id);
      if (!target) return;

      // Pending-write handling: if the queued write targets the
      // collection we're about to delete, drop it — otherwise the
      // timer would re-create the keys we just removed. Pending
      // writes for OTHER collections (rare but possible if the user
      // somehow triggered this via a non-active path) should still
      // flush so we don't lose them.
      if (pendingRef.current?.activeId === id) {
        pendingRef.current = null;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else {
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
          collections: [
            {
              id: newId,
              name: DEFAULT_COLLECTION_NAME,
              createdAt: now,
              updatedAt: now,
            },
          ],
        };
        persistIndex(next);
        setIndex(next);
        setPinnedPapers([]);
        setGroups([]);
        return;
      }

      // If the user deleted the active one, switch to the first
      // remaining; otherwise just shrink the index.
      if (id === index.activeId) {
        const newActiveId = remaining[0].id;
        const loaded = loadCollection(newActiveId);
        const next: CollectionsIndex = {
          ...index,
          activeId: newActiveId,
          collections: remaining,
        };
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
    [index, flushPending],
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
  }, [index.collections, index.activeId]);

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
        paperIds: group.paperIds.map((paperId) => normalizeId(paperId)),
      }));

      writeJSON(collectionPapersKey(id), papers);
      writeJSON(collectionGroupsKey(id), groups);

      const next: CollectionsIndex = {
        ...index,
        activeId: id,
        collections: [
          ...index.collections,
          {
            id,
            name,
            createdAt: now,
            updatedAt: now,
          },
        ],
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
    [index, flushPending],
  );

  return (
    <PinContext.Provider
      value={{
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
        collections: index.collections,
        activeCollectionId: index.activeId,
        switchCollection,
        createCollection,
        renameCollection,
        deleteCollection,
        movePaperToCollection,
        collectionsAtCap: index.collections.length >= MAX_COLLECTIONS,
        exportActiveCollection,
        importCollection,
      }}
    >
      {children}
    </PinContext.Provider>
  );
}

export function usePins() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePins must be used inside <PinProvider>');
  return ctx;
}
