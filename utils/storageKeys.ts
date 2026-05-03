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
  // Pin context — pinned paper records and group definitions.
  pinnedPapers: 'pinned-papers',
  pinGroups: 'pin-groups',
  // Right-side pin sidebar width (px), drag-resizable.
  pinSidebarWidth: 'pinSidebarWidth',
  // First-run onboarding overlay dismissal flag.
  hasSeenOnboarding: 'hasSeenOnboarding',
  // Panel open/closed preferences (set via usePersistedBoolean).
  filterPanelOpen: 'paperazzi:filterPanelOpen',
  pinSidebarOpen: 'paperazzi:pinSidebarOpen',
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
 * Every fixed key as an array — handy for the StorageModal's "Erase all"
 * sweep so it can't go out of sync with new keys added above.
 */
export const ALL_FIXED_KEYS: readonly string[] =
  Object.values(STORAGE_KEYS);
