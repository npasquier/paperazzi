// Pure formatting and URL-construction helpers for the OpenAlex API.
// Everything here is deterministic, side-effect-free, and trivial to unit
// test in isolation.

import buildAbstract from '@/utils/abstract';
import type { OpenAlexWork } from '@/types/openalex';

/** Strip HTML tags + collapse whitespace from a free-text field. */
export function cleanHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip the OpenAlex URL prefix from an entity ID, leaving the bare W123…. */
export function normalizeId(id: string): string {
  return id.replace('https://openalex.org/', '');
}

/** Add the OpenAlex URL prefix to a bare ID (no-op if already prefixed). */
export function toFullId(id: string): string {
  return id.startsWith('https://') ? id : `https://openalex.org/${id}`;
}

/**
 * Build the &filter= clauses for an OpenAlex /works call from the typed
 * filter inputs. Returns the array of filter strings (caller joins them
 * with commas).
 */
export function buildFilters(params: {
  journals: string[];
  authors: string[];
  topics: string[];
  institutions: string[];
  publicationType: string;
  from: string | null;
  to: string | null;
  citing?: string | null;
  workIds?: string[];
}): string[] {
  const filters: string[] = [];

  if (params.workIds?.length) {
    filters.push(`openalex_id:${params.workIds.join('|')}`);
  }
  if (params.citing) {
    filters.push(`cites:${toFullId(params.citing)}`);
  }
  if (params.journals.length) {
    filters.push(`primary_location.source.issn:${params.journals.join('|')}`);
  }
  if (params.authors.length) {
    params.authors.forEach((id) => {
      filters.push(`authorships.author.id:${toFullId(id)}`);
    });
  }
  if (params.topics.length) {
    filters.push(`topics.id:${params.topics.map(toFullId).join('|')}`);
  }
  if (params.institutions.length) {
    filters.push(
      `authorships.institutions.id:${params.institutions.map(toFullId).join('|')}`,
    );
  }
  if (params.publicationType) {
    filters.push(`type:${params.publicationType}`);
  }
  if (params.from || params.to) {
    filters.push(`publication_year:${params.from || ''}-${params.to || ''}`);
  }

  return filters;
}

/**
 * Build the &sort= URL fragment. Returns empty string when the default
 * (relevance for queries, publication_date for unfiltered listings) is
 * appropriate.
 */
export function buildSort(sort: string, hasQuery: boolean): string {
  if (sort && sort !== 'relevance_score') {
    return `&sort=${sort}`;
  } else if (!hasQuery) {
    return '&sort=publication_date:desc';
  }
  return '';
}

/**
 * Map raw OpenAlex Work objects to the trimmed Paper shape consumed by
 * the client. Drops large fields the UI doesn't need (raw inverted index
 * → reconstructed abstract; URL-prefixed referenced_works → bare IDs).
 */
export function mapToPapers(results: OpenAlexWork[]) {
  return results.map((w) => ({
    id: w.id,
    title: cleanHtml(w.title ?? ''),
    authors: w.authorships?.map((a) => a.author.display_name) || [],
    publication_year: w.publication_year,
    journal_name: w.primary_location?.source?.display_name || 'Unknown',
    doi: w.doi,
    pdf_url: w.primary_location?.pdf_url,
    cited_by_count: w.cited_by_count,
    referenced_works_count: w.referenced_works_count || 0,
    abstract: buildAbstract(w.abstract_inverted_index),
    issns: w.primary_location?.source?.issn || [],
    // Normalised OpenAlex IDs (no URL prefix) so client-side edge lookups
    // can match against paper.id without per-call massaging.
    referenced_works: (w.referenced_works || []).map(normalizeId),
  }));
}
