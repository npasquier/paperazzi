'use client';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useSyncExternalStore,
} from 'react';

// Drop-in `useState` replacement for boolean preferences that should
// survive across sessions. The signature matches
// React.Dispatch<SetStateAction<boolean>> so existing call sites
// (`setX(true)`, `setX((v) => !v)`) keep working.
//
// Implementation: `useSyncExternalStore` with localStorage as the
// external store. This is the React-sanctioned pattern for state that
// lives outside React — it replaces the old read-in-effect approach,
// which the React 19 compiler lint flags (`set-state-in-effect`) and
// which double-rendered every consumer on mount.
//
// SSR-safe: `getServerSnapshot` returns `defaultValue`, and React keeps
// using it for the first client render so hydration matches; the
// persisted value appears right after hydration (same brief
// default→persisted flash as before, acceptable for panel state).
//
// Bonus over the old version: two components reading the same key now
// stay in sync (shared per-key listeners), and so do other tabs (via
// the native `storage` event).
//
// Storage failures (private mode, quota, disabled storage) degrade to
// an in-memory store so toggles still work for the session.

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

/** In-memory fallback when localStorage is unavailable. Also written on
 *  successful localStorage writes so the two never disagree. */
const memoryStore = new Map<string, boolean>();

function notify(key: string) {
  const set = listeners.get(key);
  if (!set) return;
  // Snapshot so a listener unsubscribing mid-iteration is safe.
  for (const fn of [...set]) fn();
}

function subscribeTo(key: string, fn: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  // The native `storage` event fires in OTHER tabs when this key
  // changes there — subscribing to it gives cross-tab sync for free.
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    set.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

function readValue(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    /* localStorage may throw in private mode or with restricted permissions. */
  }
  const inMemory = memoryStore.get(key);
  return inMemory !== undefined ? inMemory : fallback;
}

export function usePersistedBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const subscribe = useCallback(
    (fn: Listener) => subscribeTo(key, fn),
    [key],
  );

  const value = useSyncExternalStore(
    subscribe,
    () => readValue(key, defaultValue),
    () => defaultValue,
  );

  const setValue: Dispatch<SetStateAction<boolean>> = useCallback(
    (next) => {
      const prev = readValue(key, defaultValue);
      const computed =
        typeof next === 'function'
          ? (next as (p: boolean) => boolean)(prev)
          : next;
      memoryStore.set(key, computed);
      try {
        window.localStorage.setItem(key, String(computed));
      } catch {
        /* degrade to the in-memory store — see module docstring. */
      }
      notify(key);
    },
    [key, defaultValue],
  );

  return [value, setValue];
}
