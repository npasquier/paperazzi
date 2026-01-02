'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { Paper, MAX_PINS } from '@/types/interfaces';

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

  useEffect(() => {
    const raw = localStorage.getItem('pinned-papers');
    if (raw) setPinnedPapers(JSON.parse(raw));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('pinned-papers', JSON.stringify(pinnedPapers));
  }, [pinnedPapers]);

  const pinnedIds = pinnedPapers.map((p) => p.id);

  const isPinned = (id: string) => pinnedIds.includes(id);

  const togglePin = (paper: Paper) => {
    setPinnedPapers((prev) => {
      if (prev.find((p) => p.id === paper.id)) {
        return prev.filter((p) => p.id !== paper.id);
      }
      if (prev.length >= MAX_PINS) return prev;
      return [paper, ...prev];
    });
  };

  const removePin = (id: string) =>
    setPinnedPapers((prev) => prev.filter((p) => p.id !== id));

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
