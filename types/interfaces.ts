export interface Journal {
  name: string;
  issn: string;
  domain: string;
  category: number;
}

export interface SelectedJournal {
  issn: string;
  name: string;
  domain?: string;
  category?: number;
}

export interface SelectedAuthor {
  id: string;
  name: string;
  orcid?: string;
  worksCount?: number;
  institution?: string;
}


export interface Filters {
  journals: SelectedJournal[];
  authors: SelectedAuthor[];
  dateFrom: string;
  dateTo: string;
  sortBy: string; 
}

export interface Paper {
  id: string;
  title: string;
  authors: SelectedAuthor[];
  publication_year: number;
  journal_name: string;
  cited_by_count: number;
  doi?: string;
  pdf_url?: string;
  abstract?: any;
}
