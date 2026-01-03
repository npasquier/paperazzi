export default function buildAbstract(abstractIndex: any): string {
  if (!abstractIndex) return '';

  const words: string[] = [];
  Object.entries(abstractIndex).forEach(([word, positions]: any) => {
    positions.forEach((pos: number) => {
      words[pos] = word;
    });
  });

  return cleanAbstract(words.join(' '));
}

export function cleanAbstract(abstract: string): string {
  if (!abstract) return '';

  // Remove "Abstract" at the beginning (case-insensitive)
  // Also handles variations like "Abstract:", "Abstract.", "ABSTRACT", etc.
  return abstract.replace(/^abstract[\s.:;-]*/i, '').trim();
}
