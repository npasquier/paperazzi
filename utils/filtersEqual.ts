// Field-by-field equality for the Filters shape.
//
// Replaces `JSON.stringify(a) === JSON.stringify(b)` for the dirty-check
// inside PaperazziApp's deferred-commit flow. JSON.stringify is fragile
// in three ways that bit us in practice:
//   - Key insertion order matters. Two objects with the same keys but
//     different insertion orders stringify to different strings even
//     though they're structurally identical.
//   - `undefined` vs. missing key are stringified identically (both
//     skipped) but they often represent different intents — the typed
//     compare below treats them as equal explicitly, so the intent is
//     obvious instead of accidental.
//   - It's quadratic-ish on large objects. The largest field here is
//     `journals` (up to a few dozen entries), but doing it on every
//     render adds up.
//
// The compare below is bounded by the cardinality of each field and
// dispatches on type, so it's predictable and cheap.

import type { Filters } from '@/types/interfaces';

/** Same length + same items by `key(item)` regardless of order. */
function setEq<T>(a: readonly T[], b: readonly T[], key: (t: T) => string): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const seen = new Set<string>();
  for (const item of a) seen.add(key(item));
  for (const item of b) if (!seen.has(key(item))) return false;
  return true;
}

/** Strict array equality by index (order matters). */
function arrEq<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === (b?.length ?? 0);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Treat undefined / null / '' as the same "absent" value. */
function strEq(a: string | undefined | null, b: string | undefined | null): boolean {
  return (a || '') === (b || '');
}

/** Deep-ish equality for the `workingPaperFilter` shape. */
function wpEq(
  a: Filters['workingPaperFilter'],
  b: Filters['workingPaperFilter'],
): boolean {
  const aEnabled = !!a?.enabled;
  const bEnabled = !!b?.enabled;
  if (aEnabled !== bEnabled) return false;
  return arrEq(a?.sourceIds ?? [], b?.sourceIds ?? []);
}

/** Deep-ish equality for the `econFilter` shape. */
function econEq(
  a: Filters['econFilter'],
  b: Filters['econFilter'],
): boolean {
  // Both absent is equal; one absent and the other "disabled empty" is
  // also functionally equal — but we don't normalise here to keep the
  // comparator stupid. Callers always set econFilter explicitly via
  // reconcileEcon, so the absent case only shows up on the very first
  // render and matches itself.
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.enabled !== b.enabled) return false;
  if ((a.presetId || null) !== (b.presetId || null)) return false;
  if (!arrEq(a.tiers, b.tiers)) return false;
  if (!arrEq(a.domains, b.domains)) return false;
  if (!arrEq(a.issns, b.issns)) return false;
  return true;
}

/**
 * Structural equality across every field SearchResults consumes.
 * Returns true iff committing `live` would produce no observable change
 * in the search results vs. `applied`. Order-insensitive for the chip
 * collections (authors/journals/institutions) — moving the same chip
 * around in the UI doesn't change which filter the API sees.
 */
export function filtersEqual(live: Filters, applied: Filters): boolean {
  if (live === applied) return true;
  if (!setEq(live.journals, applied.journals, (j) => j.issn)) return false;
  if (!setEq(live.authors, applied.authors, (a) => a.id)) return false;
  if (!setEq(live.institutions, applied.institutions, (i) => i.id)) return false;
  if (!strEq(live.publicationType, applied.publicationType)) return false;
  if (!strEq(live.dateFrom, applied.dateFrom)) return false;
  if (!strEq(live.dateTo, applied.dateTo)) return false;
  if (!strEq(live.sortBy, applied.sortBy)) return false;
  if (!strEq(live.citing, applied.citing)) return false;
  if (!arrEq(live.citingAll, applied.citingAll)) return false;
  if (!strEq(live.referencedBy, applied.referencedBy)) return false;
  if (!arrEq(live.referencesAll, applied.referencesAll)) return false;
  if ((live.journalFilterMode || 'wide') !== (applied.journalFilterMode || 'wide'))
    return false;
  if (!econEq(live.econFilter, applied.econFilter)) return false;
  if (!wpEq(live.workingPaperFilter, applied.workingPaperFilter)) return false;
  return true;
}
