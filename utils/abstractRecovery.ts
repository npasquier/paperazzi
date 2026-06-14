// Server-side abstract recovery cascade.
//
// Given a DOI, try to recover an abstract from: Crossref → the DOI landing
// page. Semantic Scholar was dropped — it sometimes returns a different or
// truncated abstract, which is worse than nothing for a correction that gets
// submitted to OpenAlex. Used by the /api/recover-abstract route so the
// browser never has to fight CORS on Crossref / publisher pages.
//
// This module is server-only: it reads process.env and fetches third-party
// hosts. Do not import it into a 'use client' tree.

export type AbstractSource = 'crossref' | 'landing-page';

export interface RecoveredAbstract {
  abstract: string;
  source: AbstractSource;
}

const MAIL = process.env.MAIL_ID || process.env.NEXT_PUBLIC_MAIL_ID || '';

/** A real abstract is more than a few words; reject junk fragments. */
const looksReal = (s: string) => s.trim().length >= 80;

/** Strip the doi.org / doi: prefix so we have a bare DOI. */
export function bareDoi(s: string): string {
  return s
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .trim();
}

/**
 * Crossref deposits abstracts as JATS XML (e.g. <jats:p>…</jats:p>).
 * Reduce to plain text: drop tags, decode the few entities that show up,
 * collapse whitespace, strip a leading "Abstract" label.
 */
export function jatsToText(jats: string): string {
  return jats
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^abstract[\s.:;-]*/i, '')
    .trim();
}

async function fromCrossref(doi: string): Promise<string | null> {
  const url =
    `https://api.crossref.org/works/${encodeURIComponent(doi)}` +
    (MAIL ? `?mailto=${encodeURIComponent(MAIL)}` : '');
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'paperazzi (+https://paperazzi.vercel.app)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { abstract?: string } };
    const raw = data.message?.abstract;
    if (!raw) return null;
    const text = jatsToText(raw);
    return looksReal(text) ? text : null;
  } catch {
    return null;
  }
}


/** Pull a <meta> content value by name/property, trying both attribute orders. */
function metaContent(html: string, name: string): string | null {
  const a = html.match(
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i',
    ),
  );
  if (a) return a[1];
  const b = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`,
      'i',
    ),
  );
  return b ? b[1] : null;
}

async function fromLandingPage(doi: string): Promise<string | null> {
  try {
    const res = await fetch(`https://doi.org/${doi}`, {
      headers: {
        // A real browser UA + Accept-Language gets past naive bot filters on
        // platforms like Atypon (INFORMS / Management Science). It will NOT
        // beat a full Cloudflare JS challenge — those pages stay unscrapeable
        // server-side, which is why APIs (Crossref/S2) run first.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 1. Structured abstract meta tags (most reliable; nesting-proof).
    for (const name of ['citation_abstract', 'dc.description', 'dcterms.abstract']) {
      const c = metaContent(html, name);
      if (c && looksReal(jatsToText(c))) return jatsToText(c);
    }

    // 2. An element whose class mentions "abstract" — covers aeaweb.org's
    //    <section class="…abstract"> and Atypon's <div class="hlFld-Abstract">
    //    / <div class="abstractInFull">.
    const sec = html.match(
      /<(section|div)[^>]*class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
    );
    if (sec && looksReal(jatsToText(sec[2]))) return jatsToText(sec[2]);

    // 3. JSON-LD scholarly metadata.
    const ld = html.match(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (ld) {
      try {
        const obj = JSON.parse(ld[1]) as { abstract?: string; description?: string };
        const a = obj.abstract || obj.description;
        if (a && looksReal(jatsToText(a))) return jatsToText(a);
      } catch {
        /* malformed JSON-LD — ignore */
      }
    }

    // 4. Last resort: og/twitter description (may be truncated — the user
    //    reviews every recovered abstract before submitting, so this is safe).
    for (const name of ['og:description', 'twitter:description', 'description']) {
      const c = metaContent(html, name);
      if (c && looksReal(jatsToText(c))) return jatsToText(c);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Run the cascade and return the first usable abstract, or null if every
 * source comes up empty.
 */
export async function recoverAbstract(
  rawDoi: string,
): Promise<RecoveredAbstract | null> {
  const doi = bareDoi(rawDoi);
  if (!doi) return null;

  const cr = await fromCrossref(doi);
  if (cr) return { abstract: cr, source: 'crossref' };

  const lp = await fromLandingPage(doi);
  if (lp) return { abstract: lp, source: 'landing-page' };

  return null;
}
