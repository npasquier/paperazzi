// Tests for abstract reconstruction from OpenAlex inverted indexes,
// including the audit hardening (M6): hostile/corrupt position values
// must not be able to allocate a multi-GB sparse array server-side.

import { describe, expect, it } from 'vitest';
import buildAbstract, { cleanAbstract } from '@/utils/abstract';

describe('buildAbstract', () => {
  it('reconstructs word order from the inverted index', () => {
    expect(
      buildAbstract({ brown: [2], quick: [1], The: [0], fox: [3] }),
    ).toBe('The quick brown fox');
  });

  it('handles repeated words at multiple positions', () => {
    expect(buildAbstract({ the: [0, 2], cat: [1], mat: [3] })).toBe(
      'the cat the mat',
    );
  });

  it('returns empty string for non-object inputs', () => {
    expect(buildAbstract(null)).toBe('');
    expect(buildAbstract(undefined)).toBe('');
    expect(buildAbstract('abstract')).toBe('');
    expect(buildAbstract(42)).toBe('');
  });

  it('ignores malformed position lists', () => {
    expect(buildAbstract({ ok: [0], bad: 'x', worse: [null, 'y'] })).toBe(
      'ok',
    );
  });

  // M6 regression: a hostile index with pos = 1e9 used to build a
  // ~1e9-slot sparse array; join(' ') would then try to materialize a
  // gigabyte-scale string. Out-of-range positions are now dropped.
  it('drops absurd, negative, and non-integer positions', () => {
    const out = buildAbstract({
      legit: [0],
      hostile: [1_000_000_000],
      negative: [-5],
      fractional: [1.5],
    });
    expect(out).toBe('legit');
  });
});

describe('cleanAbstract', () => {
  it('strips a leading "Abstract" label in its common variants', () => {
    expect(cleanAbstract('Abstract: We study…')).toBe('We study…');
    expect(cleanAbstract('ABSTRACT. We study…')).toBe('We study…');
    expect(cleanAbstract('abstract We study…')).toBe('We study…');
  });
  it('leaves mid-text occurrences alone', () => {
    expect(cleanAbstract('This abstract notion')).toBe(
      'This abstract notion',
    );
  });
});
