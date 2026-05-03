// Lightweight shortcut syntax for the search bar.
//
//   @name  → filter by author (resolved via OpenAlex /authors?search=)
//   #abbr  → filter by journal (resolved via the static JOURNAL_SHORTCUTS
//            map in data/journalAbbreviations.ts)
//
// Both shortcuts are stripped from the query before submission and routed
// to their respective URL params (`authors=`, `journals=`). Multiple
// shortcuts of the same kind are AND-ed (intersected). Anything left in the
// query after stripping is searched as keywords as usual.
//
// Resolution failures are returned alongside successes so callers can
// decide whether to surface "couldn't find X" hints.

import { SelectedAuthor } from '@/types/interfaces';
import {
  JOURNAL_SHORTCUTS,
  JournalShortcut,
} from '@/data/journalAbbreviations';

// @ pattern: consumed by extractMentions. Requires whitespace or start
// before `@` so "foo@bar.com" isn't treated as a mention. Word-boundary at
// the end stops at apostrophes and the like.
const MENTION_RE = /(?:^|\s)@([A-Za-z][A-Za-z0-9-]{1,})\b/g;
// # pattern: same shape, different prefix.
const JOURNAL_RE = /(?:^|\s)#([A-Za-z][A-Za-z0-9-]{1,})\b/g;

export function extractMentions(query: string): {
  cleanQuery: string;
  mentions: string[];
  journalAbbrevs: string[];
} {
  const mentions: string[] = [];
  const journalAbbrevs: string[] = [];
  const cleanQuery = query
    .replace(MENTION_RE, (_match, name) => {
      mentions.push(name);
      // Replace the consumed token (with its leading whitespace) by a
      // single space so adjacent words don't run together: "a @b c" → "a  c"
      // → collapsed below to "a c".
      return ' ';
    })
    .replace(JOURNAL_RE, (_match, abbrev) => {
      journalAbbrevs.push(abbrev);
      return ' ';
    })
    .trim()
    .replace(/\s+/g, ' ');
  return { cleanQuery, mentions, journalAbbrevs };
}

// Look up a list of `#abbrev` tokens against the static journal-shortcut
// map. Resolution is purely client-side and synchronous — no API calls.
// Returns `{ resolved, unresolved }` to mirror resolveMentions.
export function resolveJournalShortcuts(abbrevs: string[]): {
  resolved: JournalShortcut[];
  unresolved: string[];
} {
  const resolved: JournalShortcut[] = [];
  const unresolved: string[] = [];
  for (const a of abbrevs) {
    const hit = JOURNAL_SHORTCUTS[a.toLowerCase()];
    if (hit) resolved.push(hit);
    else unresolved.push(a);
  }
  return { resolved, unresolved };
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
