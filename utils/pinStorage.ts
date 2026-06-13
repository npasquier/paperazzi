/**
 * Pure storage helpers for the PinContext collections layer.
 * No React dependencies — safe to import from hooks and tests alike.
 */

import type { Paper, PinGroup } from '@/types/interfaces';
import type { Collection } from '@/contexts/PinContext';
import { normalizeId } from '@/utils/normalizeId';
import {
  STORAGE_KEYS,
  collectionPapersKey,
  collectionGroupsKey,
} from '@/utils/storageKeys';

// ── Schema constants ───────────────────────────────────────────────────

export const SCHEMA_VERSION = 1;
/** Soft cap to keep storage and UI manageable. */
export const MAX_COLLECTIONS = 20;
export const DEFAULT_COLLECTION_NAME = 'Library';
/**
 * Coalesce-window for active-collection writes. Drag-reorder fires many
 * state updates per gesture; without this, each one would JSON.stringify +
 * setItem the full pin list. 150ms is short enough that a tab close
 * won't realistically catch un-flushed edits — `pagehide` /
 * `visibilitychange` flush belt-and-braces.
 */
export const WRITE_DEBOUNCE_MS = 150;

// ── Types ──────────────────────────────────────────────────────────────

/** Index record persisted under STORAGE_KEYS.collectionsIndex. */
export interface CollectionsIndex {
  /** Schema version for forward-compatible migrations. */
  version: 1;
  activeId: string;
  collections: Collection[];
}

// ── Low-level read / write ─────────────────────────────────────────────

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // QuotaExceeded etc. — log and continue rather than crashing the app.
    console.error(`[PinContext] failed to write ${key}`, err);
  }
}

// ── Collection-level helpers ───────────────────────────────────────────

export function loadCollection(id: string): { papers: Paper[]; groups: PinGroup[] } {
  const papers = readJSON<Paper[]>(collectionPapersKey(id), []);
  const groups = readJSON<PinGroup[]>(collectionGroupsKey(id), []);
  return {
    papers: papers.map((p) => ({ ...p, id: normalizeId(p.id) })),
    groups,
  };
}

export function persistIndex(index: CollectionsIndex): void {
  writeJSON(STORAGE_KEYS.collectionsIndex, index);
}

function persistAndReturn(index: CollectionsIndex): CollectionsIndex {
  persistIndex(index);
  return index;
}

// ── Bootstrap / migration ──────────────────────────────────────────────

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
export function ensureBootstrapped(): CollectionsIndex {
  const existing = readJSON<CollectionsIndex | null>(
    STORAGE_KEYS.collectionsIndex,
    null,
  );
  if (existing && existing.collections.length > 0) {
    // Defensive: if activeId points at a collection that's been removed
    // externally (e.g. user fiddled with localStorage), fall back to the first.
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
  // was anything to move — saves two writes for fresh users).
  if (legacyPapers.length > 0) {
    writeJSON(collectionPapersKey(id), legacyPapers);
  }
  if (legacyGroups.length > 0) {
    writeJSON(collectionGroupsKey(id), legacyGroups);
  }

  // Drop legacy keys so the StorageModal stays clean.
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

// ── Import helpers ─────────────────────────────────────────────────────

/**
 * Derive a display name for an imported collection that doesn't conflict
 * with any existing collection name. Appends "(imported)" and then a
 * numeric suffix if needed.
 */
export function buildImportedCollectionName(
  preferredName: string,
  existingCollections: Collection[],
): string {
  const trimmed = preferredName.trim() || 'Imported collection';
  const existingNames = new Set(
    existingCollections.map((c) => c.name.trim().toLowerCase()),
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
