// Application-wide typed event bus.
//
// Replaces the ad-hoc `window.dispatchEvent(new CustomEvent('foo', { detail }))`
// pattern that was used to wire cross-tree component communication
// (citation drill-downs, navbar chips, the celebration overlay, etc.).
//
// Why a bus instead of raw window events:
//   1. Event names are typed — typos fail at compile time instead of
//      silently no-op'ing at runtime.
//   2. Each event's `detail` shape is enforced at both the dispatch site
//      and the listener — no more `(e as CustomEvent).detail.foo as Bar`
//      casts at every receiver.
//   3. `on()` returns its own unsubscribe fn, so a useEffect cleanup is
//      one line: `return on('x', handler)` instead of pairing
//      add/removeEventListener.
//
// Usage:
//   emit('paper-citing-click', { paper });
//   useEffect(() => on('paper-citing-click', ({ paper }) => { ... }), []);
//
// Out of scope: native DOM events (keydown, mousemove, resize, …) keep
// using addEventListener — they aren't ours to centralize.

import type {
  Paper,
  SelectedAuthor,
  SelectedJournal,
} from '@/types/interfaces';

/**
 * Map of every cross-component event the app uses, with the exact shape
 * of its `detail` payload. Adding a new event is a one-line change here
 * plus the call sites; everything else (typo detection, payload shape,
 * unsubscribe) flows from this map.
 *
 * `undefined` means the event carries no payload — emit it with no args.
 */
export type AppEvents = {
  /** A "X cites" link was clicked. Drives the citing-papers drill-down view. */
  'paper-citing-click': { paper: Paper };
  /** A "X refs" link was clicked. Drives the references drill-down view. */
  'paper-refs-click': { paper: Paper };
  /** A "see network" link was clicked. Switches the main pane to the graph. */
  'paper-network-click': { paper: Paper };
  /**
   * A paper or an author was reported as wrong/missing data. Listeners only
   * need to know *something* was reported (we play a celebration overlay);
   * the optional ids are kept for future analytics or undo.
   *   - paperId is sent by PaperCard's report toggle.
   *   - authorId is sent by SearchResults' author panel report toggle.
   */
  'paper-reported': { paperId?: string; authorId?: string };
  /**
   * The resolved author filter list changed (after URL → state sync).
   * The navbar mirrors this into its chip facade so chips reflect what's
   * actually filtering the results.
   */
  'paperazzi-authors-changed': { authors: SelectedAuthor[] };
  /** Same idea for journals — keeps navbar journal chips in sync with URL. */
  'paperazzi-journals-changed': { journals: SelectedJournal[] };
  /**
   * The navbar's search bar was submitted. PaperazziApp owns the URL push
   * (it's the only place that knows the full filter state), so the navbar
   * just hands over the bar contents and lets the app resolve & navigate.
   */
  'navbar-search': {
    query: string;
    semantic: boolean;
    chipAuthors: Array<{ id: string; name?: string }>;
    chipJournals: Array<{ issn: string; name?: string }>;
  };
  /**
   * The navbar's clear-all (X) button was pressed. PaperazziApp listens so
   * it can wipe non-URL filter state (econFilter, journalFilterMode); the
   * navbar itself handles the URL navigation.
   */
  'paperazzi-reset-search': undefined;
  /**
   * Broadcast whenever the wide-mode econ filter toggles. The navbar uses
   * this to decide whether the Semantic toggle should be disabled, since
   * the econ filter lives in component state (not URL params) and the
   * navbar has no other way to detect it.
   */
  'semantic-conflict-econ': { econActive: boolean };
};

type EventName = keyof AppEvents;
type Listener<K extends EventName> = (detail: AppEvents[K]) => void;

// Internal storage. The any-cast at the boundary is intentional — the
// public `on`/`emit` API is fully typed; only the internal Map loses the
// per-event detail type, which is unavoidable when storing heterogeneous
// listeners in one structure.
type AnyListener = (detail: unknown) => void;
const listeners = new Map<EventName, Set<AnyListener>>();

/**
 * Dispatch an event. Listeners are called synchronously in registration
 * order. A handler that throws is logged but doesn't break sibling
 * handlers — same forgiving behavior as native `dispatchEvent`.
 */
export function emit<K extends EventName>(
  name: K,
  ...args: AppEvents[K] extends undefined ? [] : [detail: AppEvents[K]]
): void {
  const set = listeners.get(name);
  if (!set || set.size === 0) return;
  const detail = args[0] as AppEvents[K];
  // Snapshot the set so a handler that unsubscribes itself (or a sibling)
  // mid-iteration doesn't skip the next listener or throw on the live Set.
  for (const fn of [...set]) {
    try {
      (fn as Listener<K>)(detail);
    } catch (err) {
      console.error(`[eventBus] handler for "${name}" threw`, err);
    }
  }
}

/**
 * Subscribe to an event. Returns an unsubscribe function — return it
 * directly from useEffect to clean up on unmount:
 *
 *   useEffect(() => on('paper-citing-click', ({ paper }) => …), []);
 */
export function on<K extends EventName>(
  name: K,
  fn: Listener<K>,
): () => void {
  let set = listeners.get(name);
  if (!set) {
    set = new Set<AnyListener>();
    listeners.set(name, set);
  }
  set.add(fn as AnyListener);
  return () => {
    set!.delete(fn as AnyListener);
  };
}
