export const MAX_PINS = 10;
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
}
