'use client';

/**
 * Chip state for the NavBar search bar (author / journal / institution pills),
 * the event-bus listeners that sync them from PaperazziApp, and the composite
 * "dirty" signal that turns the submit button green.
 *
 * Extracted from NavBarContent so the autocomplete and layout code can stay
 * focused. The chip setters are returned so useNavBarAutocomplete can add
 * chips when the user picks a suggestion.
 */

import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { Institution, SelectedAuthor, SelectedJournal } from '@/types/interfaces';
import { on } from '@/utils/eventBus';

interface Return {
  chips: SelectedAuthor[];
  setChips: Dispatch<SetStateAction<SelectedAuthor[]>>;
  journalChips: SelectedJournal[];
  setJournalChips: Dispatch<SetStateAction<SelectedJournal[]>>;
  institutionChips: Institution[];
  setInstitutionChips: Dispatch<SetStateAction<Institution[]>>;
  // True iff FilterPanel has uncommitted changes (arrives via event bus).
  filtersDirty: boolean;
  // True iff any of: query text, chip lists, or filter panel differ from
  // what's currently committed to the URL. Drives the green submit button.
  isDirty: boolean;
  removeAuthorChip: (id: string) => void;
  removeJournalChip: (issn: string) => void;
  removeInstitutionChip: (id: string) => void;
}

export function useNavBarChips(
  searchParams: ReadonlyURLSearchParams,
  isSearchPage: boolean,
  query: string,
): Return {
  const [chips, setChips] = useState<SelectedAuthor[]>([]);
  const [journalChips, setJournalChips] = useState<SelectedJournal[]>([]);
  const [institutionChips, setInstitutionChips] = useState<Institution[]>([]);
  // True iff the user has edited filters in the panel without committing.
  const [filtersDirty, setFiltersDirty] = useState(false);

  // Mirror chip state from PaperazziApp. The app broadcasts these events
  // after each syncFromURL so our chip display matches the committed URL.
  useEffect(() => {
    const offAuthors = on('paperazzi-authors-changed', ({ authors }) => {
      setChips(authors || []);
    });
    const offJournals = on('paperazzi-journals-changed', ({ journals }) => {
      setJournalChips(journals || []);
    });
    const offInstitutions = on('paperazzi-institutions-changed', ({ institutions }) => {
      setInstitutionChips(institutions || []);
    });
    const offDirty = on('paperazzi-filters-dirty', ({ isDirty }) => {
      setFiltersDirty(isDirty);
    });
    return () => {
      offAuthors();
      offJournals();
      offInstitutions();
      offDirty();
    };
  }, []);

  // True iff the input text differs from the URL's current `q=` param.
  const queryDirty = isSearchPage && query !== (searchParams.get('q') || '');

  // True iff the navbar's chip lists differ from the URL's committed params.
  // Derived from the URL rather than a separate flag so it self-resets after
  // each commit without needing an explicit clear.
  const chipsDirty =
    isSearchPage &&
    (() => {
      const eq = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const s = new Set(a);
        return b.every((x) => s.has(x));
      };
      const urlAuthors = (searchParams.get('authors') || '').split(',').filter(Boolean);
      const urlJournals = (searchParams.get('journals') || '').split(',').filter(Boolean);
      const urlInstitutions = (searchParams.get('institutions') || '').split(',').filter(Boolean);
      return (
        !eq(chips.map((c) => c.id), urlAuthors) ||
        !eq(journalChips.map((c) => c.issn), urlJournals) ||
        !eq(institutionChips.map((c) => c.id), urlInstitutions)
      );
    })();

  const isDirty = filtersDirty || queryDirty || chipsDirty;

  // Chip removal is local state only. Dirty signal is derived from the URL
  // via chipsDirty, so no manual flag is needed. Changes accumulate until
  // the user commits with Enter or the search button.
  const removeAuthorChip = (id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
  };
  const removeJournalChip = (issn: string) => {
    setJournalChips((prev) => prev.filter((j) => j.issn !== issn));
  };
  const removeInstitutionChip = (id: string) => {
    setInstitutionChips((prev) => prev.filter((i) => i.id !== id));
  };

  return {
    chips,
    setChips,
    journalChips,
    setJournalChips,
    institutionChips,
    setInstitutionChips,
    filtersDirty,
    isDirty,
    removeAuthorChip,
    removeJournalChip,
    removeInstitutionChip,
  };
}
