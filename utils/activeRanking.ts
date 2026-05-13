// Active RankingScheme resolver.
//
// Single source of truth for "which classification of journals does the app
// use right now": either the user's customised scheme (saved in localStorage
// under STORAGE_KEYS.rankingScheme) or the built-in CNRS baseline.
//
// Why this lives in its own module:
//   1. The user can fork / edit / import / reset, all of which need to
//      atomically swap the active scheme and notify every consumer
//      (FilterPanel, JournalModal, rankings page) in the same tab.
//      `localStorage` only fires `storage` events across tabs, so we add
//      a tiny in-process pub/sub on top.
//   2. The baseline is async-loaded (chunk-split for bundle size). Routing
//      every consumer through one loader keeps the dataset out of the
//      initial JS payload and shares the parse cost across callers.
//
// Storage shape: the entire RankingScheme object, JSON-stringified. The
// validator below is the import path's gatekeeper — anything that ends up
// in localStorage has been validated at least once.
//
// Conventions:
//   - "active scheme" = whichever one the app should use *right now*.
//   - "user override" = the JSON in localStorage (if any).
//   - "baseline"      = the built-in CNRS scheme from `data/cnrsScheme.ts`.

'use client';

import { useEffect, useState } from 'react';
import type {
  Journal,
  RankingDomain,
  RankingPreset,
  RankingScheme,
  RankingTier,
} from '@/types/interfaces';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { loadCnrsScheme, CNRS_SCHEME_ID } from '@/data/cnrsScheme';

// ─── Validation ─────────────────────────────────────────────────────────

/**
 * Defensive runtime validator for the RankingScheme shape. Used on every
 * boundary that ingests untrusted JSON — a hostile or malformed file
 * shouldn't be able to plant garbage in the active scheme. We're permissive
 * about *extra* fields (forward-compat with future versions that add keys)
 * but strict about *required* fields and types.
 */
export function validateRankingScheme(input: unknown): input is RankingScheme {
  if (!input || typeof input !== 'object') return false;
  const o = input as Record<string, unknown>;

  if (o.version !== 1) return false;
  if (typeof o.id !== 'string' || o.id.length === 0) return false;
  if (typeof o.name !== 'string' || o.name.length === 0) return false;
  if (
    o.description !== undefined &&
    typeof o.description !== 'string'
  )
    return false;

  if (!Array.isArray(o.tiers)) return false;
  for (const t of o.tiers as unknown[]) {
    if (!t || typeof t !== 'object') return false;
    const r = t as Record<string, unknown>;
    if (typeof r.key !== 'string' || r.key.length === 0) return false;
    if (r.label !== undefined && typeof r.label !== 'string') return false;
  }

  if (!Array.isArray(o.domains)) return false;
  for (const d of o.domains as unknown[]) {
    if (!d || typeof d !== 'object') return false;
    const r = d as Record<string, unknown>;
    if (typeof r.key !== 'string' || r.key.length === 0) return false;
    if (r.label !== undefined && typeof r.label !== 'string') return false;
  }

  if (!Array.isArray(o.journals)) return false;
  for (const j of o.journals as unknown[]) {
    if (!j || typeof j !== 'object') return false;
    const r = j as Record<string, unknown>;
    if (typeof r.name !== 'string') return false;
    if (typeof r.issn !== 'string') return false;
    if (typeof r.domain !== 'string') return false;
    if (typeof r.tier !== 'string') return false;
  }

  if (o.presets !== undefined) {
    if (!Array.isArray(o.presets)) return false;
    for (const p of o.presets as unknown[]) {
      if (!p || typeof p !== 'object') return false;
      const r = p as Record<string, unknown>;
      if (typeof r.id !== 'string' || r.id.length === 0) return false;
      if (typeof r.name !== 'string' || r.name.length === 0) return false;
      if (
        r.tiers !== undefined &&
        !(Array.isArray(r.tiers) && r.tiers.every((x) => typeof x === 'string'))
      )
        return false;
      if (
        r.domains !== undefined &&
        !(
          Array.isArray(r.domains) && r.domains.every((x) => typeof x === 'string')
        )
      )
        return false;
      if (
        r.issns !== undefined &&
        !(Array.isArray(r.issns) && r.issns.every((x) => typeof x === 'string'))
      )
        return false;
    }
  }

  return true;
}

// ─── Storage ────────────────────────────────────────────────────────────

const STORAGE_KEY = STORAGE_KEYS.rankingScheme;

/**
 * Read the user's saved scheme from localStorage, or null if there isn't
 * one (or the stored blob is malformed — we silently ignore garbage so a
 * corrupted entry doesn't break the app; the user can re-import).
 */
function readUserScheme(): RankingScheme | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validateRankingScheme(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Write a scheme to localStorage (or clear it, when `null` is passed —
 * that's the "Reset to default" path). Notifies every same-tab subscriber
 * so the FilterPanel etc. re-render immediately.
 *
 * Returns false if the write fails (quota exceeded, validator rejects);
 * callers should surface that to the user.
 */
export function saveActiveRanking(scheme: RankingScheme | null): boolean {
  if (typeof window === 'undefined') return false;
  if (scheme !== null && !validateRankingScheme(scheme)) {
    console.error('[activeRanking] refusing to save invalid scheme');
    return false;
  }
  try {
    if (scheme === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scheme));
    }
  } catch (err) {
    console.error('[activeRanking] storage write failed', err);
    return false;
  }
  // Bust caches and notify.
  cachedActive = null;
  snapshot = null;
  for (const cb of [...subscribers]) {
    try {
      cb();
    } catch (err) {
      console.error('[activeRanking] subscriber threw', err);
    }
  }
  return true;
}

// ─── In-tab pub/sub ─────────────────────────────────────────────────────
//
// localStorage's native `storage` event only fires for *other* tabs. To
// re-render the current tab when the user edits/imports/resets, every
// consumer subscribes here and `saveActiveRanking` notifies them.

const subscribers = new Set<() => void>();

/** Subscribe to active-scheme changes. Returns an unsubscribe fn. */
export function subscribeActiveRanking(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

// ─── Resolution ─────────────────────────────────────────────────────────

/** Memoised promise of the currently-active scheme. */
let cachedActive: Promise<RankingScheme> | null = null;
/** Synchronous snapshot — populated once a load completes. Useful for
 *  imperative paths (URL builders, search resolution) that don't want to
 *  await. Null until at least one load has resolved. */
let snapshot: RankingScheme | null = null;

/**
 * Resolve the active scheme: user override if present and valid, else the
 * baseline. Memoised; bust the cache via `saveActiveRanking`.
 */
export function loadActiveRanking(): Promise<RankingScheme> {
  if (cachedActive) return cachedActive;
  const user = readUserScheme();
  if (user) {
    snapshot = user;
    cachedActive = Promise.resolve(user);
    return cachedActive;
  }
  cachedActive = loadCnrsScheme().then((baseline) => {
    snapshot = baseline;
    return baseline;
  });
  return cachedActive;
}

/**
 * Synchronous accessor — returns the most recently resolved scheme, or
 * null if no load has completed yet. The first caller in a page lifecycle
 * still has to await `loadActiveRanking()`; downstream callers (which
 * happen after components have mounted) can use this to skip the await.
 */
export function getActiveRankingSync(): RankingScheme | null {
  return snapshot;
}

/**
 * True iff the user has a saved override (i.e. they've forked or imported
 * something). Used by the editor UI to decide whether to show "Fork" or
 * "Reset to default".
 */
export function hasUserOverride(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
}

// ─── React hook ─────────────────────────────────────────────────────────

/**
 * React hook — returns the active scheme (or null while it's loading on
 * first render). Re-renders the calling component whenever the scheme
 * changes (in-tab edits, cross-tab via the native `storage` event).
 */
export function useActiveRanking(): RankingScheme | null {
  const [scheme, setScheme] = useState<RankingScheme | null>(() =>
    getActiveRankingSync(),
  );

  useEffect(() => {
    let cancelled = false;

    const reload = () => {
      cachedActive = null;
      snapshot = null;
      loadActiveRanking().then((s) => {
        if (!cancelled) setScheme(s);
      });
    };

    // Initial fetch — always run, never skip on `!snapshot`. The previous
    // guard introduced a StrictMode race: when the dynamic import for the
    // baseline scheme resolved *between* the first effect's cleanup and
    // the second mount's effect, `snapshot` was already populated, so the
    // second effect short-circuited and never called `setScheme`. The
    // first effect's `.then` had been cancelled by then, so the component
    // stayed stuck on `null` indefinitely — visible on /search as a wide
    // filter with only the hardcoded "All" button (no tiers/domains/presets).
    // Calling `loadActiveRanking().then(setScheme)` unconditionally costs
    // one extra microtask when the snapshot is already known and React
    // bails out of the re-render if the value is identical.
    loadActiveRanking().then((s) => {
      if (!cancelled) setScheme(s);
    });

    // Same-tab changes go through saveActiveRanking().
    const off = subscribeActiveRanking(reload);

    // Cross-tab changes fire the native `storage` event.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) reload();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return scheme;
}

// ─── ISSN resolution ────────────────────────────────────────────────────
//
// Used by the search pipeline to turn a (tiers, domains) selection into
// the explicit ISSN whitelist that gets sent to the API. Keeping this
// client-side means the server never has to know which ranking is active.

/**
 * Resolve a tier/domain selection into an ISSN list against the given
 * scheme. Empty arrays mean "no filter on that axis" (i.e. all values
 * pass) — matching the `econFilter` semantics that already shipped.
 */
export function resolveIssns(
  scheme: RankingScheme,
  tiers: readonly string[],
  domains: readonly string[],
): string[] {
  return scheme.journals
    .filter((j) => {
      if (tiers.length > 0 && !tiers.includes(j.tier)) return false;
      if (domains.length > 0 && !domains.includes(j.domain)) return false;
      return true;
    })
    .map((j) => j.issn);
}

/** Same shape as `resolveIssns` but for "how many would match". */
export function countIssns(
  scheme: RankingScheme,
  tiers: readonly string[],
  domains: readonly string[],
): number {
  let n = 0;
  for (const j of scheme.journals) {
    if (tiers.length > 0 && !tiers.includes(j.tier)) continue;
    if (domains.length > 0 && !domains.includes(j.domain)) continue;
    n++;
  }
  return n;
}

// ─── Lookup helpers ─────────────────────────────────────────────────────

/** ISSN → Journal lookup against an explicit scheme. */
export function findJournal(
  scheme: RankingScheme,
  issn: string,
): Journal | undefined {
  return scheme.journals.find((j) => j.issn === issn);
}

/** Map ISSNs → Journal records, dropping unknowns. */
export function mapIssnsToJournals(
  scheme: RankingScheme,
  issns: readonly string[],
): Journal[] {
  const byIssn = new Map(scheme.journals.map((j) => [j.issn, j]));
  return issns
    .map((i) => byIssn.get(i))
    .filter((j): j is Journal => !!j);
}

// ─── Re-exports for convenience ─────────────────────────────────────────

export type {
  Journal,
  RankingDomain,
  RankingPreset,
  RankingScheme,
  RankingTier,
};
export { CNRS_SCHEME_ID };
