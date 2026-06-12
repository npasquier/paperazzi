// Unit tests for the pure URL-construction / mapping helpers behind
// /api/search. These are the functions whose output goes verbatim into
// upstream OpenAlex URLs, so shape regressions here turn into opaque
// upstream 400s in production.

import { describe, expect, it } from 'vitest';
import {
  buildFilters,
  buildSort,
  mapToPapers,
  toFullId,
} from '@/app/api/search/lib/format';
import type { OpenAlexWork } from '@/types/openalex';

const emptyFilters = {
  journals: [],
  authors: [],
  topics: [],
  institutions: [],
  publicationType: '',
  from: null,
  to: null,
};

describe('toFullId', () => {
  it('prefixes bare ids', () => {
    expect(toFullId('W123')).toBe('https://openalex.org/W123');
  });
  it('leaves full URLs alone', () => {
    expect(toFullId('https://openalex.org/W123')).toBe(
      'https://openalex.org/W123',
    );
  });
});

describe('buildFilters', () => {
  it('returns no filters for empty params', () => {
    expect(buildFilters(emptyFilters)).toEqual([]);
  });

  it('ORs journals into one ISSN clause', () => {
    expect(
      buildFilters({ ...emptyFilters, journals: ['1234-5678', '9999-0000'] }),
    ).toEqual(['primary_location.source.issn:1234-5678|9999-0000']);
  });

  it('ANDs authors as separate clauses (intersection semantics)', () => {
    expect(
      buildFilters({ ...emptyFilters, authors: ['A1', 'A2'] }),
    ).toEqual([
      'authorships.author.id:https://openalex.org/A1',
      'authorships.author.id:https://openalex.org/A2',
    ]);
  });

  it('lets the working-paper source whitelist win over journals', () => {
    const filters = buildFilters({
      ...emptyFilters,
      journals: ['1234-5678'],
      workingPaperSourceIds: ['S1', 'S2'],
    });
    expect(filters).toEqual(['primary_location.source.id:S1|S2']);
  });

  it('builds the year-range clause from from/to', () => {
    expect(buildFilters({ ...emptyFilters, from: '2019', to: '2021' })).toEqual(
      ['publication_year:2019-2021'],
    );
    expect(buildFilters({ ...emptyFilters, from: '2019' })).toEqual([
      'publication_year:2019-',
    ]);
    expect(buildFilters({ ...emptyFilters, to: '2021' })).toEqual([
      'publication_year:-2021',
    ]);
  });

  it('adds cites and openalex_id clauses', () => {
    expect(
      buildFilters({ ...emptyFilters, citing: 'W9', workIds: ['W1', 'W2'] }),
    ).toEqual(['openalex_id:W1|W2', 'cites:https://openalex.org/W9']);
  });
});

describe('buildSort', () => {
  it('emits explicit non-default sorts', () => {
    expect(buildSort('cited_by_count:desc', true)).toBe(
      '&sort=cited_by_count:desc',
    );
  });
  it('defaults to relevance (empty) when there is a query', () => {
    expect(buildSort('relevance_score', true)).toBe('');
  });
  it('falls back to publication date for unfiltered listings', () => {
    expect(buildSort('relevance_score', false)).toBe(
      '&sort=publication_date:desc',
    );
  });
});

describe('mapToPapers', () => {
  it('trims works to the client Paper shape and normalizes ids', () => {
    const work = {
      id: 'https://openalex.org/W1',
      title: '<i>Fancy</i> title',
      authorships: [{ author: { display_name: 'Ada' } }],
      publication_year: 2020,
      primary_location: {
        source: { display_name: 'AER', issn: ['1234-5678'] },
        pdf_url: null,
      },
      doi: 'https://doi.org/10.1/x',
      cited_by_count: 7,
      referenced_works_count: 2,
      referenced_works: ['https://openalex.org/W2', 'W3'],
      abstract_inverted_index: { Hello: [0], world: [1] },
    } as unknown as OpenAlexWork;

    const [p] = mapToPapers([work]);
    expect(p.title).toBe('Fancy title'); // HTML stripped
    expect(p.authors).toEqual(['Ada']);
    expect(p.journal_name).toBe('AER');
    expect(p.abstract).toBe('Hello world');
    expect(p.referenced_works).toEqual(['W2', 'W3']); // prefixes stripped
  });

  it('survives minimal works without optional fields', () => {
    const [p] = mapToPapers([{ id: 'W1' } as unknown as OpenAlexWork]);
    expect(p.journal_name).toBe('Unknown');
    expect(p.authors).toEqual([]);
    expect(p.referenced_works).toEqual([]);
  });
});
