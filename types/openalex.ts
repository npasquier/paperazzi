// Minimal typing of the OpenAlex API surface this app touches. Not an
// exhaustive mapping of OpenAlex's schema — only the fields we actually
// read from the /works and /authors endpoints. Optional everywhere because
// OpenAlex regularly omits fields it doesn't have data for, and the
// codebase already defends against missing branches.
//
// If a field starts being read elsewhere, add it here rather than reaching
// for `any`. That's the whole point of having this file.
//
// Reference: https://docs.openalex.org/api-entities/works/work-object

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  works_count?: number;
  cited_by_count?: number;
  last_known_institution?: { display_name?: string };
  affiliations?: Array<{ institution?: { display_name?: string } }>;
}

export interface OpenAlexAuthorship {
  author: { id: string; display_name: string };
  raw_author_name?: string;
  institutions?: Array<{ id: string; display_name: string }>;
}

export interface OpenAlexSource {
  display_name?: string;
  issn?: string[];
}

export interface OpenAlexLocation {
  source?: OpenAlexSource;
  pdf_url?: string | null;
  landing_page_url?: string | null;
  is_oa?: boolean;
}

/**
 * OpenAlex's reconstructed-on-the-fly work record. Many of these are
 * optional in practice — older or thinly-indexed papers can be missing
 * authorships, abstract, primary_location, etc. The mapper in
 * app/api/search/route.ts already guards the access paths.
 */
export interface OpenAlexWork {
  id: string;
  title?: string | null;
  display_name?: string | null;
  doi?: string | null;
  publication_year?: number;
  publication_date?: string;
  cited_by_count?: number;
  referenced_works_count?: number;
  referenced_works?: string[];
  authorships?: OpenAlexAuthorship[];
  primary_location?: OpenAlexLocation;
  // OpenAlex's abstract is stored as a {word: [positions]} inverted index.
  // utils/abstract.ts reconstructs the prose form. Stored as `unknown` here
  // so callers must explicitly route it through the reconstruction helper.
  abstract_inverted_index?: unknown;
}

/** Standard list-endpoint envelope. Generic over the entity type. */
export interface OpenAlexResultsPage<T> {
  results?: T[];
  meta?: {
    count?: number;
    page?: number;
    per_page?: number;
    db_response_time_ms?: number;
  };
}
