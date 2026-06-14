'use client';

// Shared state for the GLOBAL search "hide non-articles" filter.
//
// It's deliberately quiet: on by default, no banner in the results — the only
// affordance is a small collapsible in the FilterPanel. The FilterPanel edits
// it; SearchResults reads it and filters the rendered list. They stay in sync
// through the `search-noise-changed` event (each component keeps its own copy
// and updates on emit), and the choice persists in localStorage.
//
// Reuses the same NOISE_RULES as the curation tool so "non-article" means the
// same thing in both places.

import { useEffect, useState } from 'react';
import { emit, on } from '@/utils/eventBus';
import {
  NOISE_RULES,
  defaultNoiseHidden,
  isHiddenNoise,
  type NoiseTarget,
} from '@/utils/noiseFilters';

const KEY = 'paperazzi-search-noise-v1';

export interface SearchNoiseState {
  enabled: boolean;
  hidden: Record<string, boolean>;
}

function defaultState(): SearchNoiseState {
  return { enabled: true, hidden: defaultNoiseHidden() };
}

function read(): SearchNoiseState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SearchNoiseState>;
      return {
        enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
        hidden: { ...defaultNoiseHidden(), ...(s.hidden ?? {}) },
      };
    }
  } catch {
    /* corrupt — fall through to default */
  }
  return defaultState();
}

function write(s: SearchNoiseState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — non-fatal */
  }
  emit('search-noise-changed', s);
}

export function useSearchNoiseFilter() {
  // Start from the SSR-safe default; hydrate from localStorage on mount to
  // avoid a server/client markup mismatch.
  const [state, setState] = useState<SearchNoiseState>(defaultState);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setState(read());
    return on('search-noise-changed', (s) => setState(s));
  }, []);

  const apply = (next: SearchNoiseState) => {
    setState(next);
    write(next);
  };

  return {
    enabled: state.enabled,
    hidden: state.hidden,
    setEnabled: (enabled: boolean) => apply({ ...state, enabled }),
    setRule: (id: string, hide: boolean) =>
      apply({ ...state, hidden: { ...state.hidden, [id]: hide } }),
    setAll: (hide: boolean) =>
      apply({
        ...state,
        hidden: Object.fromEntries(
          NOISE_RULES.map((r) => [r.id, hide]),
        ) as Record<string, boolean>,
      }),
  };
}

/** Apply the filter to a list of noise targets (papers). */
export function filterSearchNoise<T extends NoiseTarget>(
  items: T[],
  state: SearchNoiseState,
): T[] {
  if (!state.enabled) return items;
  return items.filter((i) => !isHiddenNoise(i, state.hidden));
}
