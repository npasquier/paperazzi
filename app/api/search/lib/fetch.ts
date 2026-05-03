// HTTP wrapper for OpenAlex calls.
//
// Adds: API-key injection (the key picker is request-scoped — see
// lib/keys.ts), exponential-backoff retry on 503 / network errors, jitter
// on the first request to avoid thundering herd, and per-key counter
// updates so retry exhaustion produces a useful diagnostic.

import {
  KeyPicker,
  recordKeyCall,
  recordKeyFailure,
  logKeyExhaustion,
} from './keys';

/**
 * Fetch an OpenAlex JSON endpoint, returning the parsed body. The result
 * type is generic — the caller knows which endpoint they hit and what
 * shape it returns. Use `await fetchOpenAlex<OpenAlexResultsPage<Work>>(…)`.
 *
 * Retries on 503 (upstream busy) with exponential backoff, capped at 5s.
 * The same key is reused across retries so a single upstream call doesn't
 * burn N keys; if you want a different key per retry, pull a fresh one
 * from the picker per attempt.
 */
export async function fetchOpenAlex<T = unknown>(
  url: string,
  getKey: KeyPicker,
  retries = 3,
): Promise<T> {
  const apiKey = getKey();
  if (apiKey) {
    url += (url.includes('?') ? '&' : '?') + `api_key=${apiKey}`;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Tiny jitter (≤40ms) to desynchronize the parallel batched-search
      // calls. Keeps OpenAlex's per-IP burst limit happier.
      await new Promise((r) => setTimeout(r, Math.random() * 40));
      const res = await fetch(url);
      recordKeyCall(apiKey);

      if (res.status === 503 && attempt < retries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(
          `OpenAlex 503, retrying in ${waitTime}ms (${attempt}/${retries})`,
        );
        recordKeyFailure(apiKey, 503);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!res.ok) {
        recordKeyFailure(apiKey, res.status);
        // Capture the response body — OpenAlex usually returns JSON with
        // an explanatory `error` / `message` field on 400/422. Without
        // this the generic "OpenAlex API returned 400" tells you nothing.
        let bodyPreview = '';
        try {
          bodyPreview = (await res.text()).slice(0, 500);
        } catch {
          // ignore
        }
        console.error(
          `OpenAlex API error: ${res.status} ${res.statusText} — ${bodyPreview}`,
        );
        if (res.status === 503) {
          logKeyExhaustion('all 503 retries exhausted on a single call');
          throw new Error(
            'OpenAlex API is temporarily unavailable. Please try again in a moment.',
          );
        }
        if (res.status === 400 && url.length > 6000) {
          // Most common cause when filtering a network view by a wide
          // category — the openalex_id list + ISSN whitelist exceeds the
          // upstream URL limit. Report it explicitly.
          throw new Error(
            `OpenAlex returned 400 (request URL too long: ${url.length} chars). Try narrowing the journal filter or use Specific mode with a smaller list.`,
          );
        }
        throw new Error(
          `OpenAlex API returned ${res.status}, ${res.statusText}, URL length: ${url.length}, body: ${bodyPreview}, URL: ${url}`,
        );
      }

      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        recordKeyFailure(apiKey);
        console.error('Failed to parse JSON. URL:', url);
        throw new Error('Invalid JSON response from OpenAlex');
      }
    } catch (error) {
      if (attempt === retries || !(error instanceof TypeError)) {
        if (attempt === retries) {
          logKeyExhaustion('network/transport error after all retries');
        }
        throw error;
      }
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(
        `Network error, retrying in ${waitTime}ms (${attempt}/${retries})`,
      );
      recordKeyFailure(apiKey);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  // Should be unreachable — the loop above either returns or throws on
  // the final attempt — but TypeScript can't see that.
  logKeyExhaustion('fell out of retry loop');
  throw new Error('Failed to fetch from OpenAlex after retries');
}
