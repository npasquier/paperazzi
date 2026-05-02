// Lightweight @author syntax for the search bar.
//
// Users can type "@acemoglu institutions" to filter by author *and* search
// for keywords in one shot. Each `@token` is stripped from the query and
// resolved to an OpenAlex author id via /authors?search=. Multiple mentions
// are AND-ed (intersected) since that's what people usually want for
// co-author lookups.
//
// Resolution failures are returned alongside successes so callers can decide
// whether to surface a "couldn't find author X" hint. The bare-keyword
// fallback (run the original query as text) is the caller's responsibility.

import { SelectedAuthor } from '@/types/interfaces';

// Match @ followed by a name token: starts with a letter, can include
// letters, digits, and hyphens (e.g. @lopez-garcia). Requires the @ to be at
// the start of the string OR preceded by whitespace, so "foo@bar" inside an
// email-like blob isn't accidentally treated as a mention. Word-boundary at
// the end stops matches at punctuation like apostrophes.
const MENTION_RE = /(?:^|\s)@([A-Za-z][A-Za-z0-9-]{1,})\b/g;

export function extractMentions(query: string): {
  cleanQuery: string;
  mentions: string[];
} {
  const mentions: string[] = [];
  const cleanQuery = query
    .replace(MENTION_RE, (_match, name) => {
      mentions.push(name);
      // Replace the consumed token (and its leading whitespace, if any) with
      // a single space so adjacent words don't run together: "a @b c" → "a  c"
      // → collapsed below to "a c".
      return ' ';
    })
    .trim()
    .replace(/\s+/g, ' ');
  return { cleanQuery, mentions };
}

// Resolve a list of name tokens to OpenAlex authors.
//
// Resolution priority per token:
//   1. `cache` (case-insensitive) — populated by the navbar's autocomplete
//      when the user explicitly picks an author from the dropdown. This is
//      the *correct* answer; we trust it and skip the API call entirely.
//   2. /authors?search=<token>&per-page=1 — silent fallback for tokens the
//      user typed but never picked from the dropdown (e.g. they hit Enter
//      before the suggestions appeared, or they're using a name that's
//      unambiguous enough they never bothered to pick).
//
// Common-name disambiguation (e.g. "smith") relies on the cache path: the
// silent fallback can and will pick the wrong person for ambiguous names,
// which is why the navbar's autocomplete exists.
export async function resolveMentions(
  mentions: string[],
  cache?: Map<string, { id: string; name?: string }>,
): Promise<{ resolved: SelectedAuthor[]; unresolved: string[] }> {
  const resolved: SelectedAuthor[] = [];
  const unresolved: string[] = [];

  await Promise.all(
    mentions.map(async (name) => {
      const hit = cache?.get(name.toLowerCase());
      if (hit) {
        resolved.push({ id: hit.id, name: hit.name });
        return;
      }
      try {
        const url = `https://api.openalex.org/authors?search=${encodeURIComponent(
          name,
        )}&per-page=1`;
        const res = await fetch(url);
        if (!res.ok) {
          unresolved.push(name);
          return;
        }
        const data = await res.json();
        const top = data?.results?.[0];
        if (top?.id) {
          resolved.push({
            id: top.id.replace('https://openalex.org/', ''),
            name: top.display_name,
            worksCount: top.works_count,
          });
        } else {
          unresolved.push(name);
        }
      } catch {
        unresolved.push(name);
      }
    }),
  );

  return { resolved, unresolved };
}
