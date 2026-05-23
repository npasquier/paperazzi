// Client-side OpenAlex fetch helpers.
//
// Every browser-side call to the OpenAlex API should go through here so it
// consistently carries the polite-pool `mailto` param. OpenAlex gives
// requests that identify themselves (via `mailto=`) higher, more reliable
// rate limits — see https://docs.openalex.org/how-to-use-the-api/api-overview#the-polite-pool.
//
// Server-side calls are different: they live in app/api/search/lib/fetch.ts
// and authenticate with a rotated `api_key` instead. This module is for the
// direct-from-browser calls (autocomplete, pin refresh, citation drill-down
// metadata, the network focal paper, …) that don't go through /api/search.
//
// `NEXT_PUBLIC_MAIL_ID` is inlined at build time for client bundles, so
// reading it here is safe in a 'use client' tree.

import cleanHtml from '@/utils/cleanHtml';
import type { Paper } from '@/types/interfaces';

const MAIL_ID = process.env.NEXT_PUBLIC_MAIL_ID || '';

/**
 * Append the polite-pool `mailto` to an OpenAlex URL. No-op when no mail id
 * is configured, and idempotent — a URL that already has a `mailto=` is
 * returned unchanged so callers can wrap freely.
 */
export function withMailto(url: string): string {
  if (!MAIL_ID) return url;
  if (/[?&]mailto=/.test(url)) return url;
  return (
    url + (url.includes('?') ? '&' : '?') + `mailto=${encodeURIComponent(MAIL_ID)}`
  );
}

/** `fetch()` an OpenAlex URL with the polite-pool `mailto` attached. */
export function openAlexFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(withMailto(url), init);
}

/** Minimal shape of the OpenAlex work fields the lite mapper reads. */
interface RawWork {
  id: string;
  title?: string | null;
  authorships?: { author: { display_name: string } }[];
  publication_year?: number;
  primary_location?: { source?: { display_name?: string } };
  doi?: string | null;
  cited_by_count?: number;
}

/**
 * Map an OpenAlex work record to the lightweight Paper shape used by the
 * citation banners (citing / referencedBy / citingAll / referencesAll).
 * "Lite" because it skips abstract reconstruction and referenced_works —
 * those banners only show title / authors / journal / year / citations.
 */
export function mapWorkToPaperLite(data: RawWork): Paper {
  return {
    id: data.id,
    title: cleanHtml(data.title),
    authors: data.authorships?.map((a) => a.author.display_name) || [],
    publication_year: data.publication_year ?? 0,
    journal_name: data.primary_location?.source?.display_name || 'Unknown',
    doi: data.doi ?? undefined,
    cited_by_count: data.cited_by_count ?? 0,
    abstract: '',
  };
}

/**
 * Fetch a single OpenAlex work by id and map it to a lite Paper. Returns
 * null on any HTTP / network / parse failure so callers can filter it out
 * — this folds in the per-call error handling the banner effects used to
 * repeat inline.
 */
export async function fetchWorkAsPaper(id: string): Promise<Paper | null> {
  try {
    const res = await openAlexFetch(`https://api.openalex.org/works/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as RawWork;
    return mapWorkToPaperLite(data);
  } catch {
    return null;
  }
}
