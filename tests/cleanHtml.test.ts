import { describe, expect, it } from 'vitest';
import cleanHtml from '@/utils/cleanHtml';

describe('cleanHtml', () => {
  it('returns empty string for nullish input', () => {
    expect(cleanHtml(null)).toBe('');
    expect(cleanHtml(undefined)).toBe('');
    expect(cleanHtml('')).toBe('');
  });

  it('strips HTML tags', () => {
    expect(cleanHtml('<i>Fancy</i> title')).toBe('Fancy title');
  });

  it('strips double-encoded markup tags instead of decoding them', () => {
    expect(cleanHtml('&lt;i&gt;Fancy&lt;/i&gt; title')).toBe('Fancy title');
    expect(cleanHtml('CO&lt;sub&gt;2&lt;/sub&gt; uptake')).toBe('CO2 uptake');
    expect(cleanHtml('line&lt;br/&gt;break')).toBe('linebreak');
  });

  it('preserves encoded comparison operators (not real tags)', () => {
    expect(cleanHtml('p &lt; 0.05 and n &gt; 100')).toBe('p < 0.05 and n > 100');
  });

  it('decodes &amp; so "R&amp;D" renders as "R&D"', () => {
    expect(cleanHtml('R&amp;D spending')).toBe('R&D spending');
  });

  it('decodes other common named entities', () => {
    expect(cleanHtml('a &lt; b &gt; c &quot;q&quot; &apos;a&apos;')).toBe(
      'a < b > c "q" \'a\'',
    );
    expect(cleanHtml('non&nbsp;breaking')).toBe('non breaking');
  });

  it('decodes numeric entities (decimal and hex)', () => {
    expect(cleanHtml('R&#38;D')).toBe('R&D');
    expect(cleanHtml('R&#x26;D')).toBe('R&D');
    expect(cleanHtml('em&#8212;dash')).toBe('em—dash');
  });

  it('does a single pass and leaves unknown entities verbatim', () => {
    // already-decoded text is untouched, no double-decoding
    expect(cleanHtml('R&D')).toBe('R&D');
    expect(cleanHtml('&notanentity;')).toBe('&notanentity;');
  });

  it('normalizes whitespace', () => {
    expect(cleanHtml('  a   b\n c ')).toBe('a b c');
  });
});
