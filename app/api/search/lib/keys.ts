// OpenAlex API key management.
//
// Reads OPENALEX_KEYS from the environment (comma-separated), validates it
// at boot, exposes a per-request KeyPicker that rotates round-robin from a
// random offset, and tracks per-key success/failure counters that can be
// dumped when retries are exhausted.

const RAW_KEYS = (process.env.OPENALEX_KEYS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Boot-time env validation. Without keys the app technically still works
// (OpenAlex's no-key path is rate-limited harder but functional), so we
// don't throw — the build shouldn't fail. But a missing config is almost
// always unintentional, so we log a loud one-time warning the first time
// this module loads in a serverless instance.
if (RAW_KEYS.length === 0) {
  console.warn(
    '[OpenAlex] OPENALEX_KEYS env var is empty. Falling back to unauthenticated requests, which are subject to a stricter upstream rate limit. Set OPENALEX_KEYS="key1,key2,…" to enable rotation.',
  );
} else {
  console.log(
    `[OpenAlex] loaded ${RAW_KEYS.length} API key${RAW_KEYS.length === 1 ? '' : 's'} for rotation`,
  );
}

// Re-exported in case other modules want to reason about whether key
// rotation is enabled (e.g. logging, future feature flags).
export const OPENALEX_KEYS: readonly string[] = RAW_KEYS;
export const HAS_OPENALEX_KEYS = RAW_KEYS.length > 0;

export type KeyPicker = () => string | null;

/**
 * One picker per request: starts at a random offset (so different cold-
 * started serverless instances and different concurrent requests on the
 * same instance don't all begin on KEYS[0]), then rotates round-robin
 * from there. Sub-calls within one request thus also spread across keys.
 */
export function makeKeyPicker(): KeyPicker {
  if (RAW_KEYS.length === 0) return () => null;
  let i = Math.floor(Math.random() * RAW_KEYS.length);
  return () => RAW_KEYS[i++ % RAW_KEYS.length];
}

// ────────────────────────────────────────────────────────────────────
// Per-key counters
// ────────────────────────────────────────────────────────────────────
//
// Lives in module-level state so it accumulates across requests on the
// same warm serverless instance. Resets on cold start (acceptable — the
// purpose is *debuggability*, not usage analytics; if you need durable
// metrics, ship them to a real telemetry sink). We never persist the
// raw key string in logs — only a redacted prefix — so a counter dump
// can be safely included in error traces.

interface KeyStat {
  calls: number; // total fetchOpenAlex invocations using this key
  failures: number; // non-2xx responses or thrown errors
  lastFailureAt?: number; // ms epoch
  lastFailureStatus?: number;
}

const counters = new Map<string, KeyStat>();

function statFor(key: string): KeyStat {
  let s = counters.get(key);
  if (!s) {
    s = { calls: 0, failures: 0 };
    counters.set(key, s);
  }
  return s;
}

export function recordKeyCall(key: string | null) {
  if (!key) return;
  statFor(key).calls++;
}

export function recordKeyFailure(key: string | null, status?: number) {
  if (!key) return;
  const s = statFor(key);
  s.failures++;
  s.lastFailureAt = Date.now();
  if (typeof status === 'number') s.lastFailureStatus = status;
}

/** Redact a key for logging — keep only the first 8 chars + ellipsis. */
function redact(key: string): string {
  return key.length <= 8 ? `${key}...` : `${key.slice(0, 8)}...`;
}

/** Snapshot of all counters, with keys redacted. Safe to log. */
export function getKeyCountersSnapshot() {
  return Array.from(counters.entries()).map(([k, s]) => ({
    key: redact(k),
    ...s,
  }));
}

/**
 * Dump the counter snapshot to stderr — call this when a request bails
 * out after exhausting retries, so logs explain *which* keys are taking
 * the failures. Returns the snapshot for inclusion in caller-built error
 * messages too.
 */
export function logKeyExhaustion(reason: string) {
  const snapshot = getKeyCountersSnapshot();
  console.error('[OpenAlex] retries exhausted', { reason, snapshot });
  return snapshot;
}
