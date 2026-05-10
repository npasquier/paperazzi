// Backward-compat normalisers for filter state read from localStorage.
//
// The Journal/SelectedJournal/Filters shape changed when journal rankings
// became user-editable — `Journal.category: number` became `Journal.tier:
// string`, and `Filters.econFilter.categories: number[]` became `tiers:
// string[]`. Existing users have presets stored under the old keys; we
// migrate them on read so nobody loses saved filters.
//
// These helpers are deliberately permissive: any malformed entry is
// coerced to a safe default rather than thrown — a corrupt preset
// shouldn't break the panel.

import type {
  Filters,
  JournalFilterPreset,
  SelectedJournal,
} from '@/types/interfaces';

/** Coerce stored SelectedJournal — old data has `category: number`. */
export function migrateSelectedJournal(input: unknown): SelectedJournal {
  const o = (input ?? {}) as Record<string, unknown>;
  const tierFromCategory =
    o.category != null && (typeof o.category === 'number' || typeof o.category === 'string')
      ? String(o.category)
      : undefined;
  return {
    issn: typeof o.issn === 'string' ? o.issn : '',
    name: typeof o.name === 'string' ? o.name : undefined,
    domain: typeof o.domain === 'string' ? o.domain : undefined,
    tier: typeof o.tier === 'string' ? o.tier : tierFromCategory,
  };
}

/** Coerce stored econFilter — old data has `categories: number[]`. */
export function migrateEconFilter(
  input: unknown,
): NonNullable<Filters['econFilter']> {
  const o = (input ?? {}) as Record<string, unknown>;
  const tiers = Array.isArray(o.tiers)
    ? (o.tiers as unknown[]).map((x) => String(x))
    : Array.isArray(o.categories)
      ? (o.categories as unknown[]).map((x) => String(x))
      : [];
  return {
    enabled: !!o.enabled,
    tiers,
    domains: Array.isArray(o.domains)
      ? (o.domains as unknown[]).map((x) => String(x))
      : [],
    presetId: typeof o.presetId === 'string' ? o.presetId : null,
    issns: Array.isArray(o.issns)
      ? (o.issns as unknown[]).map((x) => String(x))
      : undefined,
  };
}

/** Whole-Filters migration — used by the FilterPreset reader. */
export function migrateFilters(input: unknown): Filters {
  const o = (input ?? {}) as Record<string, unknown>;
  return {
    journals: Array.isArray(o.journals)
      ? (o.journals as unknown[]).map(migrateSelectedJournal)
      : [],
    // Authors / institutions don't have legacy field renames — pass through.
    authors: Array.isArray(o.authors) ? (o.authors as Filters['authors']) : [],
    institutions: Array.isArray(o.institutions)
      ? (o.institutions as Filters['institutions'])
      : [],
    publicationType:
      typeof o.publicationType === 'string' ? o.publicationType : '',
    dateFrom: typeof o.dateFrom === 'string' ? o.dateFrom : '',
    dateTo: typeof o.dateTo === 'string' ? o.dateTo : '',
    sortBy:
      typeof o.sortBy === 'string' ? o.sortBy : 'relevance_score',
    citing: typeof o.citing === 'string' ? o.citing : undefined,
    citingAll: Array.isArray(o.citingAll)
      ? (o.citingAll as string[])
      : undefined,
    referencedBy:
      typeof o.referencedBy === 'string' ? o.referencedBy : undefined,
    referencesAll: Array.isArray(o.referencesAll)
      ? (o.referencesAll as string[])
      : undefined,
    econFilter: o.econFilter ? migrateEconFilter(o.econFilter) : undefined,
    journalFilterMode:
      o.journalFilterMode === 'wide' ||
      o.journalFilterMode === 'specific' ||
      o.journalFilterMode === 'off'
        ? o.journalFilterMode
        : undefined,
  };
}

/** Coerce a stored JournalFilterPreset — old shape had categories+category. */
export function migrateJournalFilterPreset(
  input: unknown,
): JournalFilterPreset | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
  return {
    id: o.id,
    name: o.name,
    econFilter: migrateEconFilter(o.econFilter),
    journals: Array.isArray(o.journals)
      ? (o.journals as unknown[]).map(migrateSelectedJournal)
      : [],
    mode:
      o.mode === 'wide' || o.mode === 'specific' || o.mode === 'off'
        ? o.mode
        : undefined,
  };
}
