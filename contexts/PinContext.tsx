'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { Paper, MAX_PINS } from '@/types/interfaces';

// Utility to normalize IDs: remove full URL if present
function normalizeId(id: string) {
  return id.replace('https://openalex.org/', '');
}

interface PinContextType {
  pinnedPapers: Paper[];
  pinnedIds: string[];
  isPinned: (id: string) => boolean;
  togglePin: (paper: Paper) => void;
  removePin: (id: string) => void;
  clearPins: () => void;
  isLoading: boolean;
}

const PinContext = createContext<PinContextType | null>(null);

export function PinProvider({ children }: { children: React.ReactNode }) {
  const [pinnedPapers, setPinnedPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage
  useEffect(() => {
    const raw = localStorage.getItem('pinned-papers');
    if (raw) {
      try {
        const parsed: Paper[] = JSON.parse(raw).map((p: Paper) => ({
          ...p,
          id: normalizeId(p.id), // normalize IDs on load
        }));
        setPinnedPapers(parsed);
      } catch {
        setPinnedPapers([]);
      }
    }
    setIsLoading(false);
  }, []);

  // Save to localStorage (normalized IDs)
  useEffect(() => {
    const normalized = pinnedPapers.map((p) => ({ ...p, id: normalizeId(p.id) }));
    localStorage.setItem('pinned-papers', JSON.stringify(normalized));
  }, [pinnedPapers]);

  const pinnedIds = pinnedPapers.map((p) => normalizeId(p.id));

  const isPinned = (id: string) => pinnedIds.includes(normalizeId(id));

  const togglePin = (paper: Paper) => {
    const id = normalizeId(paper.id);
    setPinnedPapers((prev) => {
      // Remove if exists
      if (prev.find((p) => normalizeId(p.id) === id)) {
        return prev.filter((p) => normalizeId(p.id) !== id);
      }
      // Max pins
      if (prev.length >= MAX_PINS) return prev;
      // Add new pinned paper with normalized ID
      return [{ ...paper, id }, ...prev];
    });
  };

  const removePin = (id: string) =>
    setPinnedPapers((prev) => prev.filter((p) => normalizeId(p.id) !== normalizeId(id)));

  const clearPins = () => setPinnedPapers([]);

  return (
    <PinContext.Provider
      value={{ pinnedPapers, pinnedIds, isPinned, togglePin, removePin, clearPins, isLoading }}
    >
      {children}
    </PinContext.Provider>
  );
}

export function usePins() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePins must be used inside <PinProvider>');
  return ctx;
}
