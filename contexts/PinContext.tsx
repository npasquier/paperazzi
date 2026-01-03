'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { Paper, MAX_PINS } from '@/types/interfaces';
import buildAbstract from '@/utils/abstract';

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

  // Load from localStorage and refresh data from OpenAlex
  useEffect(() => {
    const loadPinnedPapers = async () => {
      const raw = localStorage.getItem('pinned-papers');
      if (!raw) {
        setIsLoading(false);
        return;
      }

      try {
        const parsed: Paper[] = JSON.parse(raw);
        const ids = parsed.map((p) => normalizeId(p.id));

        if (ids.length === 0) {
          setIsLoading(false);
          return;
        }

        // Fetch fresh data from OpenAlex to ensure all fields are up-to-date
        const idsFilter = ids.map((id) => `https://openalex.org/${id}`).join('|');
        const res = await fetch(
          `https://api.openalex.org/works?filter=openalex_id:${idsFilter}&per-page=50`
        );
        const data = await res.json();

        if (data.results) {
          const freshPapers: Paper[] = data.results.map((w: any) => ({
            id: normalizeId(w.id),
            title: w.title,
            authors: w.authorships?.map((a: any) => a.author.display_name) || [],
            publication_year: w.publication_year,
            journal_name: w.primary_location?.source?.display_name || 'Unknown',
            doi: w.doi,
            pdf_url: w.primary_location?.pdf_url,
            cited_by_count: w.cited_by_count,
            referenced_works_count: w.referenced_works_count || 0,
            abstract: buildAbstract(w.abstract_inverted_index),
          }));

          // Maintain original order from localStorage
          const orderedPapers = ids
            .map((id) => freshPapers.find((p) => normalizeId(p.id) === id))
            .filter((p): p is Paper => p !== null && p !== undefined);

          setPinnedPapers(orderedPapers);
        } else {
          // Fallback to localStorage data if fetch fails
          setPinnedPapers(
            parsed.map((p) => ({
              ...p,
              id: normalizeId(p.id),
            }))
          );
        }
      } catch (error) {
        console.error('Failed to load pinned papers:', error);
        setPinnedPapers([]);
      }

      setIsLoading(false);
    };

    loadPinnedPapers();
  }, []);

  // Save to localStorage (normalized IDs)
  useEffect(() => {
    if (!isLoading) {
      const normalized = pinnedPapers.map((p) => ({
        ...p,
        id: normalizeId(p.id),
      }));
      localStorage.setItem('pinned-papers', JSON.stringify(normalized));
    }
  }, [pinnedPapers, isLoading]);

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
    setPinnedPapers((prev) =>
      prev.filter((p) => normalizeId(p.id) !== normalizeId(id))
    );

  const clearPins = () => setPinnedPapers([]);

  return (
    <PinContext.Provider
      value={{
        pinnedPapers,
        pinnedIds,
        isPinned,
        togglePin,
        removePin,
        clearPins,
        isLoading,
      }}
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