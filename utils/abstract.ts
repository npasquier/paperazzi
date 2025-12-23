export default function buildAbstract(abstractIndex: any): string {
  if (!abstractIndex) return 'No abstract available';

  const words: string[] = [];
  Object.entries(abstractIndex).forEach(([word, positions]: any) => {
    positions.forEach((pos: number) => {
      words[pos] = word;
    });
  });
  return words.join(' ');
}
