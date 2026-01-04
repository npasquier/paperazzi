export default function cleanHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}