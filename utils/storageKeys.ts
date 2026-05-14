// Single source of truth for every localStorage key Paperazzi uses.
//
// Why centralize:
//   1. Keys can't be typo'd silently — any drift breaks at compile time.
//   2. The StorageModal can iterate this catalog rather than maintain a
//      hand-curated `FIXED_KEYS` array that drifts out of sync.
//   3. New preferences land in one place; future migration / namespacing
//      changes touch one file instead of grepping the codebase.
//
// Key naming: legacy keys (filterPresets, pinned-papers, etc.) keep their
// original names for backward compatibility — renaming them would orphan
// every existing user's data. New keys use the `paperazzi:` prefix so they
// can't collide with anything outside the app.

/** Fixed keys: a constant string per slot. */
export const STORAGE_KEYS = {
  // Filter presets in the panel (named query + filter snapshot).
  filterPresets: 'filterPresets',
  // Saved journal-filter presets (Wide / Specific selections).
  journalPresets: 'journal-filter-presets',
  // User-customised RankingScheme. Absent → use the built-in CNRS baseline.
  // Holds the entire scheme as JSON (tiers, domains, journals, presets).
  rankingScheme: 'paperazzi:rankingScheme',
  // Legacy pin-context keys. Kept here only so the migration step in
  // PinContext can find and clean them up; new code reads/writes the
  // per-collection keys built by `collectionPapersKey` / `collectionGroupsKey`.
  pinnedPapers: 'pinned-papers',
  pinGroups: 'pin-groups',
  // Pin collections (named libraries of pinned papers + groups). The
  // index records every collection's metadata + which one is active;
  // the actual papers / groups live in per-collection keys composed by
  // the helpers below — that way edits only rewrite the active
  // collection, not the whole world.
  collectionsIndex: 'paperazzi:collections-index',
  // Right-side pin sidebar width (px), drag-resizable.
  pinSidebarWidth: 'pinSidebarWidth',
  // First-run onboarding overlay dismissal flag.
  hasSeenOnboarding: 'hasSeenOnboarding',
  // Panel open/closed preferences (set via usePersistedBoolean).
  filterPanelOpen: 'paperazzi:filterPanelOpen',
  pinSidebarOpen: 'paperazzi:pinSidebarOpen',
  // Lightweight history of OpenAlex usage snapshots captured by the
  // usage dashboard modal so we can render a recent trend line.
  openAlexUsageHistory: 'paperazzi:openalex-usage-history',
} as const;

/** Type of any fixed key value above. Useful for narrow consumers. */
export type FixedStorageKey =
  (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Dynamic-keyed records (per-paper flags, per-author flags, …). These
 * helpers compose the canonical key — never concatenate the prefix
 * inline, so one place enforces the format.
 */
export const STORAGE_KEY_PREFIXES = {
  /** Paper "reported as already-read" flags. */
  reportedPaper: 'reported-',
  /**
   * Author "reported" flags. Note this prefix is a strict superset of
   * `reportedPaper` — code that sweeps by prefix must check
   * `reported-author-` *before* `reported-` so author flags aren't
   * misclassified as paper flags.
   */
  reportedAuthor: 'reported-author-',
  /** Per-collection pin/group blobs. See `collectionPapersKey`. */
  collection: 'paperazzi:collection:',
} as const;

/** Compose the storage key for a given paper's "reported" flag. */
export function reportedPaperKey(workId: string): string {
  return `${STORAGE_KEY_PREFIXES.reportedPaper}${workId}`;
}

/** Compose the storage key for a given author's "reported" flag. */
export function reportedAuthorKey(authorId: string): string {
  return `${STORAGE_KEY_PREFIXES.reportedAuthor}${authorId}`;
}

/**
 * Compose the storage key for a collection's pinned papers blob.
 * Schema: `paperazzi:collection:<id>:papers`. The id is opaque to the
 * key format — we just need it to be consistent between read and write.
 */
export function collectionPapersKey(collectionId: string): string {
  return `${STORAGE_KEY_PREFIXES.collection}${collectionId}:papers`;
}

/** Compose the storage key for a collection's group definitions. */
export function collectionGroupsKey(collectionId: string): string {
  return `${STORAGE_KEY_PREFIXES.collection}${collectionId}:groups`;
}

/**
 * Returns true iff `key` is one of the per-collection pin/group keys.
 * Used by the StorageModal's "erase all" sweep so deleted users get
 * a clean slate without us having to enumerate collections.
 */
export function isCollectionKey(key: string): boolean {
  return key.startsWith(STORAGE_KEY_PREFIXES.collection);
}

/**
 * Every fixed key as an array — handy for the StorageModal's "Erase all"
 * sweep so it can't go out of sync with new keys added above.
 */
export const ALL_FIXED_KEYS: readonly string[] =
  Object.values(STORAGE_KEYS);

/**
 * Returns true iff `key` is anything Paperazzi has authored —
 * either a fixed key from the catalog above, or a wildcard key
 * matching one of our prefixes (collection blobs, reported flags).
 *
 * Centralised so the full-backup export and the "Erase all" sweep
 * can use the same predicate without keeping two lists in sync.
 */
export function isPaperazziStorageKey(key: string): boolean {
  if ((ALL_FIXED_KEYS as readonly string[]).includes(key)) return true;
  // The reportedAuthor prefix is a strict superset of reportedPaper —
  // either match means "ours". Same for the collection prefix.
  if (key.startsWith(STORAGE_KEY_PREFIXES.reportedPaper)) return true;
  if (isCollectionKey(key)) return true;
  return false;
}

/**
 * Read every Paperazzi-related localStorage entry into a plain
 * object. Values are returned verbatim (the raw stored string), so
 * the result round-trips through JSON without us needing to know
 * each value's schema.
 *
 * Safe to call on the server — returns `{}` when localStorage is
 * unavailable.
 */
export function snapshotAllPaperazziStorage(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!isPaperazziStorageKey(k)) continue;
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
  } catch {
    // localStorage may be disabled — return whatever we collected.
  }
  return out;
}

/**
 * Replace every Paperazzi-authored localStorage entry with the
 * given snapshot. Pre-existing Paperazzi keys are removed first so
 * the post-restore state matches the snapshot exactly (no orphans
 * from the previous session leaking in).
 *
 * Non-Paperazzi keys (e.g. cookies banners, third-party analytics)
 * are left untouched — we only own our own namespace.
 */
export function restoreAllPaperazziStorage(
  entries: Record<string, string>,
): void {
  if (typeof window === 'undefined') return;
  // Step 1: clear our existing keys. Read keys first, then remove
  // (mutating localStorage during iteration would shift the index).
  const ourKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isPaperazziStorageKey(k)) ourKeys.push(k);
  }
  for (const k of ourKeys) localStorage.removeItem(k);

  // Step 2: write the snapshot. Skip keys we don't recognise — a
  // hostile or stale backup shouldn't get to plant arbitrary keys
  // in our namespace. We're permissive on values (any string).
  for (const [k, v] of Object.entries(entries)) {
    if (!isPaperazziStorageKey(k)) continue;
    try {
      localStorage.setItem(k, v);
    } catch (err) {
      // Quota exceeded mid-restore — log and continue so we still
      // populate what we can.
      console.error(`[storageKeys] failed to write ${k}`, err);
    }
  }
}
