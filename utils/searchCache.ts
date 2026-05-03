// Tiny in-memory cache for search-page fetches.
//
// Goals:
//   - Instant back-and-forth pagination (page 1 → 2 → 1 = 1 fetch, not 3).
//   - Instant chip toggle / filter restore (remove a chip, add it back —
//     cache hit on the original URL).
//   - No loading flash on browser back/forward navigation.
//   - Inflight deduplication: two concurrent calls to the same URL share
//     one network request.
//
// What this is NOT:
//   - Persisted (clears on hard refresh — sessionStorage would persist but
//     adds complexity and stale-data risk we don't need).
//   - TTL'd (within a session, cached entries are trusted forever; if the
//     user wants fresh data they can hard-refresh).
//   - A general-purpose data layer. SWR / TanStack Query do this better.
//     We're trading their breadth for ~50 lines and zero deps.
//
// The cache is a module-level singleton — fine for a Next.js client
// component because it lives in the browser tab's JS heap.

const CACHE_MAX = 30; // ~5–30kB per entry → ~1MB ceiling, fine for browser.

class LRUCache<V> {
  // Insertion-ordered Map: oldest entry is the first key. We re-insert on
  // get to bump it to "most recently used".
  private map = new Map<string, V>();

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > CACHE_MAX) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

const responseCache = new LRUCache<unknown>();
const inflightCache = new Map<string, Promise<unknown>>();

/**
 * Fetch JSON with caching + in-flight deduplication.
 *
 *   Cache hit       → returns the cached body (one microtask tick later).
 *   In-flight       → returns the existing promise, so two concurrent
 *                     callers share one network request.
 *   Otherwise       → new fetch, body parsed as JSON, stored on success.
 *
 * Caching policy:
 *   - 2xx + JSON body  → cached and returned.
 *   - non-2xx + JSON   → returned (so the caller can read `data.error`)
 *                        but NOT cached, so the next call retries fresh.
 *   - non-JSON or net error → throws; nothing cached.
 *
 * The "return errors but don't cache them" rule is what `/api/search`
 * needs: the API returns 5xx with a JSON `{error}` envelope and the UI
 * shows that specific message, but a transient 5xx shouldn't pin the
 * cache to "permanently broken".
 */
export async function cachedFetch<T = unknown>(url: string): Promise<T> {
  if (responseCache.has(url)) {
    return responseCache.get(url) as T;
  }
  const inflight = inflightCache.get(url);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const promise = (async () => {
    const res = await fetch(url);
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      // Non-JSON response — fatal because the rest of the codebase assumes
      // JSON shape. Don't cache.
      throw new Error(`Non-JSON response from ${url} (HTTP ${res.status})`);
    }
    if (res.ok) responseCache.set(url, data);
    return data as T;
  })().finally(() => {
    inflightCache.delete(url);
  });

  inflightCache.set(url, promise);
  return promise as Promise<T>;
}

/**
 * Synchronously check whether a URL is in the cache. Useful for components
 * that want to seed initial state from the cache and skip the loading
 * flash entirely on cache hits.
 */
export function peekCache<T = unknown>(url: string): T | undefined {
  return responseCache.get(url) as T | undefined;
}

/** Clear everything — wire to a "refresh" action if you ever want one. */
export function clearSearchCache(): void {
  responseCache.clear();
  inflightCache.clear();
}

/** Diagnostic: useful in DevTools console. */
export function searchCacheStats() {
  return { entries: responseCache.size(), inflight: inflightCache.size };
}
