export const MAX_PINS = 30;
export const RESULTS_PER_PAGE = 20;

export interface Journal {
  name: string;
  issn: string;
  domain: string;
  category: number;
}

export interface SelectedJournal {
  issn: string;
  name?: string;
  domain?: string;
  category?: number;
}

export interface SelectedAuthor {
  id: string;
  name?: string;
  orcid?: string;
  worksCount?: number;
  institution?: string;
}

// Add these to your existing interfaces.ts

export interface Topic {
  id: string;
  display_name: string;
  subfield?: {
    id: string;
    display_name: string;
  };
  field?: {
    id: string;
    display_name: string;
  };
  domain?: {
    id: string;
    display_name: string;
  };
}

export interface Institution {
  id: string;
  display_name: string;
  country_code?: string;
  type?: string;
  ror?: string;
}

export interface Filters {
  journals: SelectedJournal[];
  authors: SelectedAuthor[];
  institutions: Institution[];
  publicationType: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  citing?: string;
  citingAll?: string[];
  referencedBy?: string;
  referencesAll?: string[];
  econFilter?: {
    enabled: boolean;
    categories: number[]; // [1,2,3,4] — empty = all
    domains: string[]; // ['GEN','OrgInd',...] — empty = all
    presetId?: string | null; // id of an active built-in or saved preset, if any
    issns?: string[]; // explicit ISSN whitelist (used for ISSN-based presets like Top 5)
  };
  // Which journal-filter source feeds the API. Both subsections retain their
  // state when inactive; only the active one is sent to /api/search.
  journalFilterMode?: 'wide' | 'specific' | 'off';
}

// Snapshot of the Journals subsection state — saved by the user under
// 'journal-filter-presets' in localStorage.
export interface JournalFilterPreset {
  id: string;
  name: string;
  econFilter: NonNullable<Filters['econFilter']>;
  journals: SelectedJournal[];
  mode?: 'wide' | 'specific' | 'off';
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  publication_year: number;
  journal_name: string;
  doi?: string;
  pdf_url?: string;
  cited_by_count: number;
  referenced_works_count?: number;
  abstract: string;
  issns?: string[];
  // OpenAlex IDs of works this paper cites — needed to draw network edges
  // client-side without extra API calls.
  referenced_works?: string[];
}
