export function normalizeId(id: string) {
  // Remove "https://openalex.org/" if present
  return id.replace('https://openalex.org/', '');
}
