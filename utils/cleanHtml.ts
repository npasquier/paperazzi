// Named entities that actually show up in OpenAlex/Crossref titles and
// abstracts. Kept deliberately small — numeric entities are handled
// generically below, so this only needs the named ones without a code point.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode HTML character references (named like `&amp;` and numeric like
 * `&#38;` / `&#x26;`) to their literal characters. Runs a single pass, so
 * already-decoded text is left untouched and we never over-decode.
 * Unknown entities are returned verbatim rather than dropped.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code)) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match; // out-of-range code point — leave as-is
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

// Encoded markup tags, e.g. `&lt;i&gt;`, `&lt;/sub&gt;`, `&lt;br/&gt;`.
// OpenAlex/Crossref sometimes double-encode formatting tags, so after the
// raw-tag pass they survive as entity text and would otherwise decode into
// literal `<i>` / `</i>` in the UI. The `[a-z]` requirement right after
// `&lt;` (optionally a slash) means a bare comparison like `a &lt; b &gt; c`
// is NOT matched — only real tag names are stripped, the math is preserved.
const ENCODED_TAG = /&lt;\/?[a-z][a-z0-9]*[^&]*?&gt;/gi;

export default function cleanHtml(text: string | null | undefined): string {
  if (!text) return '';
  return decodeEntities(
    text
      .replace(/<[^>]*>/g, '') // strip raw HTML tags
      .replace(ENCODED_TAG, ''), // strip double-encoded markup tags
  )
    .replace(/\s+/g, ' ') // normalize whitespace (incl. decoded &nbsp;)
    .trim();
}
