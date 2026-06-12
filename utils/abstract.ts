// Upper bound on accepted word positions. Real abstracts are a few
// hundred words, so the bound is generous. It matters because
// `words[pos] = word` with an unvalidated pos builds a sparse array — a
// corrupt or hostile index containing `pos = 1e9` would make
// `join(' ')` attempt a ~GB string server-side.
const MAX_ABSTRACT_POSITION = 10_000;

// Accepts `unknown` because the inverted index comes straight from
// untyped OpenAlex JSON (the OpenAlexWork type stores it as `unknown`).
// We narrow defensively rather than trust the shape.
export default function buildAbstract(abstractIndex: unknown): string {
  if (!abstractIndex || typeof abstractIndex !== 'object') return '';

  const words: string[] = [];
  for (const [word, positions] of Object.entries(
    abstractIndex as Record<string, unknown>,
  )) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (
        typeof pos === 'number' &&
        Number.isInteger(pos) &&
        pos >= 0 &&
        pos < MAX_ABSTRACT_POSITION
      ) {
        words[pos] = word;
      }
    }
  }

  return cleanAbstract(words.join(' '));
}

export function cleanAbstract(abstract: string): string {
  if (!abstract) return '';

  // Remove "Abstract" at the beginning (case-insensitive)
  // Also handles variations like "Abstract:", "Abstract.", "ABSTRACT", etc.
  return abstract.replace(/^abstract[\s.:;-]*/i, '').trim();
}
