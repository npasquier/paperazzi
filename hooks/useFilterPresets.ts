'use client';

// Saved-search presets + saved journal-filter presets for the filter
// panel, extracted from FilterPanel (2026-06 audit, L2 decomposition).
// Owns the localStorage persistence (including the legacy-shape
// migration on read), the 3-preset cap, and the "active preset"
// highlight — cleared automatically when the live filters diverge from
// the saved snapshot.

import { useEffect, useState } from 'react';
import type { Filters, JournalFilterPreset } from '@/types/interfaces';
import {
  migrateFilters,
  migrateJournalFilterPreset,
} from '@/utils/migrateFilters';
import { STORAGE_KEYS } from '@/utils/storageKeys';

export interface FilterPreset {
  id: string;
  name: string;
  query: string;
  filters: Filters;
}

export const MAX_PRESETS = 3;

export function useFilterPresets({
  filters,
  setFilters,
  query,
  onPresetLoad,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  query: string;
  onPresetLoad?: (preset: FilterPreset) => void;
}) {
  // Saved searches + journal presets. These are loaded from localStorage
  // in a post-mount effect (below) rather than a lazy useState initializer:
  // FilterPanel is part of the server-rendered shell, so reading storage
  // during the initial render made the server (empty) and client (saved)
  // first renders disagree — a hydration mismatch that showed up in the
  // always-visible "Saved searches (N)" count and the journal-presets list.
  // Starting empty keeps both first renders identical; the effect fills
  // them a tick later. Both reads go through the `migrate*` helpers so
  // legacy entries (Journal.category: number, econFilter.categories:
  // number[]) are coerced to the new tier-string shape.
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const [journalPresets, setJournalPresets] = useState<JournalFilterPreset[]>(
    [],
  );
  const [showSaveJournalModal, setShowSaveJournalModal] = useState(false);
  const [journalPresetName, setJournalPresetName] = useState('');
  const [activeJournalPresetId, setActiveJournalPresetId] = useState<
    string | null
  >(null);

  // Hydrate both preset lists from localStorage after mount (see the note
  // on the `presets` declaration above for why this isn't a lazy
  // initializer). Runs once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.filterPresets);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Post-mount storage hydration is intentionally a setState-in-
          // effect (lazy init would cause an SSR hydration mismatch — see
          // the comment above). The compiler lint can't tell this apart
          // from a derivable-state effect, so opt out explicitly.
           
          setPresets(
            (parsed as unknown[])
              .map((p): FilterPreset | null => {
                if (!p || typeof p !== 'object') return null;
                const o = p as Record<string, unknown>;
                if (typeof o.id !== 'string' || typeof o.name !== 'string')
                  return null;
                return {
                  id: o.id,
                  name: o.name,
                  query: typeof o.query === 'string' ? o.query : '',
                  filters: migrateFilters(o.filters),
                };
              })
              .filter((p): p is FilterPreset => p !== null),
          );
        }
      }
    } catch {
      // Corrupt entry — leave presets empty.
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.journalPresets);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Same storage-hydration exception as above.
           
          setJournalPresets(
            (parsed as unknown[])
              .map((p) => migrateJournalFilterPreset(p))
              .filter((p): p is JournalFilterPreset => p !== null),
          );
        }
      }
    } catch {
      // Corrupt entry — leave journal presets empty.
    }
  }, []);

  // ── Saved searches ───────────────────────────────────────────────────

  // Save presets to localStorage whenever they change
  const updatePresets = (newPresets: FilterPreset[]) => {
    setPresets(newPresets);
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEYS.filterPresets,
        JSON.stringify(newPresets),
      );
    }
  };

  const saveCurrentFilters = () => {
    if (!presetName.trim()) return;
    if (presets.length >= MAX_PRESETS) return;
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      query: query,
      filters: { ...filters },
    };
    updatePresets([...presets, newPreset]);
    setPresetName('');
    setShowSaveModal(false);
    setActivePresetId(newPreset.id);
  };

  const loadPreset = (preset: FilterPreset) => {
    setActivePresetId(preset.id);
    if (onPresetLoad) {
      onPresetLoad(preset);
    }
  };

  const deletePreset = (presetId: string) => {
    updatePresets(presets.filter((p) => p.id !== presetId));
    if (activePresetId === presetId) {
      setActivePresetId(null);
    }
  };

  // ── Saved journal filters (Wide + Manual snapshot) ───────────────────

  const updateJournalPresets = (next: JournalFilterPreset[]) => {
    setJournalPresets(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.journalPresets, JSON.stringify(next));
    }
  };

  const saveCurrentJournalFilters = () => {
    if (!journalPresetName.trim()) return;
    if (journalPresets.length >= MAX_PRESETS) return;
    const econ = filters.econFilter || {
      enabled: false,
      tiers: [],
      domains: [],
    };
    const newPreset: JournalFilterPreset = {
      id: Date.now().toString(),
      name: journalPresetName.trim(),
      econFilter: { ...econ },
      journals: filters.journals.map((j) => ({ ...j })),
      mode: filters.journalFilterMode || 'wide',
    };
    updateJournalPresets([...journalPresets, newPreset]);
    setJournalPresetName('');
    setShowSaveJournalModal(false);
    setActiveJournalPresetId(newPreset.id);
  };

  const loadJournalPreset = (preset: JournalFilterPreset) => {
    setActiveJournalPresetId(preset.id);
    setFilters((prev) => ({
      ...prev,
      econFilter: { ...preset.econFilter },
      journals: preset.journals.map((j) => ({ ...j })),
      journalFilterMode: preset.mode || 'wide',
    }));
  };

  const deleteJournalPreset = (id: string) => {
    updateJournalPresets(journalPresets.filter((p) => p.id !== id));
    if (activeJournalPresetId === id) setActiveJournalPresetId(null);
  };

  // Clear the active saved preset whenever current journals/econFilter
  // diverge from its snapshot (e.g. user toggles a domain or adds a journal).
  useEffect(() => {
    if (!activeJournalPresetId) return;
    const preset = journalPresets.find((p) => p.id === activeJournalPresetId);
    if (!preset) {
       
      setActiveJournalPresetId(null);
      return;
    }
    const econNow = filters.econFilter || {
      enabled: false,
      tiers: [],
      domains: [],
    };
    const arrEq = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    const issnsNow = new Set(filters.journals.map((j) => j.issn));
    const issnsP = new Set(preset.journals.map((j) => j.issn));
    const journalsMatch =
      issnsNow.size === issnsP.size &&
      [...issnsNow].every((x) => issnsP.has(x));
    const econMatch =
      econNow.enabled === preset.econFilter.enabled &&
      arrEq(econNow.tiers, preset.econFilter.tiers) &&
      arrEq(econNow.domains, preset.econFilter.domains) &&
      (econNow.presetId || null) === (preset.econFilter.presetId || null);
    const modeMatch =
      (filters.journalFilterMode || 'wide') === (preset.mode || 'wide');
    if (!journalsMatch || !econMatch || !modeMatch)
      setActiveJournalPresetId(null);
    // We intentionally exclude `journalPresets` from deps — list edits
    // (delete/save) are handled by their own setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.journals,
    filters.econFilter,
    filters.journalFilterMode,
    activeJournalPresetId,
  ]);

  return {
    // Saved searches
    presets,
    presetName,
    setPresetName,
    showSaveModal,
    setShowSaveModal,
    activePresetId,
    setActivePresetId,
    saveCurrentFilters,
    loadPreset,
    deletePreset,
    // Saved journal filters
    journalPresets,
    journalPresetName,
    setJournalPresetName,
    showSaveJournalModal,
    setShowSaveJournalModal,
    activeJournalPresetId,
    saveCurrentJournalFilters,
    loadJournalPreset,
    deleteJournalPreset,
  };
}
