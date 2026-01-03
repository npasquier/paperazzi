'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { Paper, MAX_PINS } from '@/types/interfaces';
import buildAbstract from '@/utils/abstract';

// Utility to normalize IDs
function normalizeId(id: string) {
  return id.replace('https://openalex.org/', '');
}

export interface PinGroup {
  id: string;
  name: string;
  paperIds: string[];
}

interface PinContextType {
  pinnedPapers: Paper[];
  pinnedIds: string[];
  groups: PinGroup[];
  isPinned: (id: string) => boolean;
  togglePin: (paper: Paper) => void;
  removePin: (id: string) => void;
  clearPins: () => void;
  isLoading: boolean;
  createGroup: (name: string) => string;
  renameGroup: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  movePaperToGroup: (paperId: string, groupId: string | null) => void;
  getUngroupedPapers: () => Paper[];
  getPapersInGroup: (groupId: string) => Paper[];
}

const PinContext = createContext<PinContextType | null>(null);

export function PinProvider({ children }: { children: React.ReactNode }) {
  const [pinnedPapers, setPinnedPapers] = useState<Paper[]>([]);
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage
  useEffect(() => {
    const loadPinnedPapers = async () => {
      const raw = localStorage.getItem('pinned-papers');
      const rawGroups = localStorage.getItem('pin-groups');

      if (rawGroups) {
        try {
          setGroups(JSON.parse(rawGroups));
        } catch {
          setGroups([]);
        }
      }

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

          const orderedPapers = ids
            .map((id) => freshPapers.find((p) => normalizeId(p.id) === id))
            .filter((p): p is Paper => p !== null && p !== undefined);

          setPinnedPapers(orderedPapers);
        } else {
          setPinnedPapers(parsed.map((p) => ({ ...p, id: normalizeId(p.id) })));
        }
      } catch (error) {
        console.error('Failed to load pinned papers:', error);
        setPinnedPapers([]);
      }

      setIsLoading(false);
    };

    loadPinnedPapers();
  }, []);

  // Save papers to localStorage
  useEffect(() => {
    if (!isLoading) {
      const normalized = pinnedPapers.map((p) => ({
        ...p,
        id: normalizeId(p.id),
      }));
      localStorage.setItem('pinned-papers', JSON.stringify(normalized));
    }
  }, [pinnedPapers, isLoading]);

  // Save groups to localStorage
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('pin-groups', JSON.stringify(groups));
    }
  }, [groups, isLoading]);

  // Clean up groups when papers are removed
  useEffect(() => {
    if (!isLoading) {
      const currentIds = new Set(pinnedPapers.map((p) => normalizeId(p.id)));
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          paperIds: group.paperIds.filter((id) => currentIds.has(id)),
        }))
      );
    }
  }, [pinnedPapers, isLoading]);

  const pinnedIds = pinnedPapers.map((p) => normalizeId(p.id));

  const isPinned = (id: string) => pinnedIds.includes(normalizeId(id));

  const togglePin = (paper: Paper) => {
    const id = normalizeId(paper.id);
    setPinnedPapers((prev) => {
      if (prev.find((p) => normalizeId(p.id) === id)) {
        return prev.filter((p) => normalizeId(p.id) !== id);
      }
      if (prev.length >= MAX_PINS) return prev;
      return [{ ...paper, id }, ...prev];
    });
  };

  const removePin = (id: string) => {
    const normalizedId = normalizeId(id);
    setPinnedPapers((prev) =>
      prev.filter((p) => normalizeId(p.id) !== normalizedId)
    );
  };

  const clearPins = () => {
    setPinnedPapers([]);
    setGroups([]);
  };

  const createGroup = (name: string): string => {
    const id = `group-${Date.now()}`;
    setGroups((prev) => [...prev, { id, name, paperIds: [] }]);
    return id;
  };

  const renameGroup = (groupId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g))
    );
  };

  const deleteGroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const movePaperToGroup = (paperId: string, groupId: string | null) => {
    const normalizedPaperId = normalizeId(paperId);

    setGroups((prev) => {
      // Remove from all groups first
      const cleaned = prev.map((g) => ({
        ...g,
        paperIds: g.paperIds.filter((id) => id !== normalizedPaperId),
      }));

      // Add to target group if specified
      if (groupId) {
        return cleaned.map((g) =>
          g.id === groupId
            ? { ...g, paperIds: [...g.paperIds, normalizedPaperId] }
            : g
        );
      }

      return cleaned;
    });
  };

  const getUngroupedPapers = (): Paper[] => {
    const groupedIds = new Set(groups.flatMap((g) => g.paperIds));
    return pinnedPapers.filter((p) => !groupedIds.has(normalizeId(p.id)));
  };

  const getPapersInGroup = (groupId: string): Paper[] => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return [];
    return group.paperIds
      .map((id) => pinnedPapers.find((p) => normalizeId(p.id) === id))
      .filter((p): p is Paper => p !== undefined);
  };

  return (
    <PinContext.Provider
      value={{
        pinnedPapers,
        pinnedIds,
        groups,
        isPinned,
        togglePin,
        removePin,
        clearPins,
        isLoading,
        createGroup,
        renameGroup,
        deleteGroup,
        movePaperToGroup,
        getUngroupedPapers,
        getPapersInGroup,
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