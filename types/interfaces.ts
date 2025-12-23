export interface Journal {
  name: string;
  issn: string;
  domain: string;
  category: number;
}

export interface SelectedJournal {
  name: string;
  issn: string;
}

export interface Filters {
  journals: SelectedJournal[];
  authors: string[];
  dateFrom: string;
  dateTo: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  publication_year: number;
  journal_name: string;
}
