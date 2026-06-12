'use client';

// Admin-only OpenAlex API usage modal. Triggered by Cmd/Ctrl+Shift+U
// from anywhere in the app (see NavBar.tsx); no visible button. Polls
// /api/openalex/usage every 60s while open. Lays out three tiers of
// information for the admin: global quota across all keys, per-key
// breakdown (with redacted key preview, error banner if the key
// failed, and resets-in countdown), and a local-session footer
// (calls/failures since boot).
//
// Design intent: match the rest of the app's warm light palette
// (surface-card, text-stone, app CSS variables for accent/warning/
// danger) rather than the previous standalone dark surface. The
// "this is an internal tool" feel is conveyed via small font sizes
// and dense layout, not by a different theme.

import { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  AlertTriangle,
  Activity,
  Clock,
} from 'lucide-react';

// ── Response types (mirror app/api/openalex/usage/route.ts) ──────────
interface KeyLocalStats {
  calls: number;
  failures: number;
  lastFailureAt?: number;
  lastFailureStatus?: number;
}

interface KeyRateLimit {
  dailyBudgetUsd: number;
  dailyUsedUsd: number;
  dailyRemainingUsd: number;
  usedPercent: number;
  prepaidBalanceUsd: number;
  prepaidRemainingUsd: number;
  prepaidExpiresAt: string | null;
  resetsAt: string | null;
  resetsInSeconds: number | null;
  endpointCostsUsd: Record<string, number>;
}

interface UsageKey {
  id: string;
  index: number;
  label: string;
  preview: string;
  error?: string;
  localStats: KeyLocalStats;
  rateLimit?: KeyRateLimit;
}

interface UsageData {
  fetchedAt: string;
  configuredKeys: number;
  message?: string;
  summary: {
    successfulKeys: number;
    failedKeys: number;
    totalBudgetUsd: number;
    totalUsedUsd: number;
    totalRemainingUsd: number;
    totalUsedPercent: number;
    totalCalls: number;
    totalFailures: number;
    resetsAt: string | null;
  };
  keys: UsageKey[];
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

// Semantic color for a usage bar. Returns a CSS variable reference so
// the threshold colors track theme changes (no hardcoded hex). Three
// bands — safe / caution / near-limit — keep the signal simple
// enough to read at a glance:
//   < 70%  → accent (teal, healthy)
//   70-89% → warning-foreground (amber, slowing down)
//   ≥ 90%  → danger (red, about to throttle)
function usageColorVar(percent: number): string {
  if (percent >= 90) return 'var(--danger)';
  if (percent >= 70) return 'var(--warning-foreground)';
  return 'var(--accent)';
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// "Resets in 2h 15m" — relative time is more useful than a 14:23
// absolute clock for a quota that depends on when the last call was
// made. Falls back to a dash for missing / negative values.
function formatRelative(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes - hours * 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

// "10s ago" — anchors the freshness of the snapshot. Re-renders only
// on poll (every 60s), so it isn't a live ticker — but with the
// modal limited to a single user-session it doesn't need to be.
function formatTimeAgo(iso: string): string {
  const elapsed = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (elapsed < 5) return 'just now';
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  return `${Math.floor(elapsed / 3600)}h ago`;
}

// sessionStorage key for the operator's usage token. Session-scoped on
// purpose: the token is a server secret (USAGE_API_TOKEN), so we keep it
// out of long-lived localStorage and re-prompt per browser session.
const USAGE_TOKEN_STORAGE_KEY = 'paperazzi:usage-token';

function readStoredToken(): string {
  try {
    return sessionStorage.getItem(USAGE_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export default function OpenAlexUsageModal({ isOpen, onClose }: Props) {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 401 from the route → the deployment requires USAGE_API_TOKEN. Show
  // a token prompt instead of the generic error banner.
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const load = async (tokenOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = tokenOverride ?? readStoredToken();
      const res = await fetch('/api/openalex/usage', {
        cache: 'no-store',
        headers: token ? { 'x-usage-token': token } : undefined,
      });
      if (res.status === 401) {
        setNeedsToken(true);
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as UsageData;
      setNeedsToken(false);
      setData(json);
      // The token worked (or wasn't needed) — persist it for this session.
      if (tokenOverride !== undefined) {
        try {
          sessionStorage.setItem(USAGE_TOKEN_STORAGE_KEY, tokenOverride);
        } catch {
          /* private mode etc. — degrade to per-open prompting. */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown fetch error');
    } finally {
      setLoading(false);
    }
  };

  const submitToken = () => {
    const trimmed = tokenInput.trim();
    if (trimmed) load(trimmed);
  };

  // Poll while open. Cleared on close so the request stops when the
  // modal isn't visible.
  useEffect(() => {
    if (!isOpen) return;
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [isOpen]);

  // Esc closes. The modal is keyboard-triggered (Cmd/Ctrl+Shift+U)
  // so admins navigate it without the mouse; an explicit close key
  // matches the open key.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasKeys = !!data && data.configuredKeys > 0;
  const successful = data?.keys.filter((k) => k.rateLimit) ?? [];
  const failing = data?.keys.filter((k) => k.error) ?? [];

  return (
    <div
      className='fixed inset-0 overlay-soft flex items-center justify-center z-50'
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-labelledby='openalex-usage-title'
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className='surface-card rounded-lg border border-app p-4 max-w-xl w-full mx-4 shadow-lg max-h-[85vh] overflow-y-auto'
      >
        {/* Header */}
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-2'>
            <Activity size={16} className='text-stone-500' />
            <h3
              id='openalex-usage-title'
              className='text-sm font-medium text-stone-900'
            >
              OpenAlex API usage
            </h3>
          </div>
          <div className='flex items-center gap-1'>
            <button
              onClick={() => load()}
              disabled={loading}
              className='p-1.5 text-stone-400 hover:text-stone-600 rounded transition disabled:cursor-not-allowed'
              title='Refresh now'
              aria-label='Refresh'
            >
              <RefreshCw
                size={14}
                className={loading ? 'animate-spin' : ''}
              />
            </button>
            <button
              onClick={onClose}
              className='p-1.5 text-stone-400 hover:text-stone-600 rounded transition'
              title='Close (Esc)'
              aria-label='Close'
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Status strip: key health + last fetched. Doubles as the
            "this is a live snapshot, not a saved report" cue. */}
        {data && (
          <div className='flex items-center justify-between text-[11px] text-stone-500 mb-4'>
            <div className='flex items-center gap-3'>
              {hasKeys ? (
                <>
                  <span className='inline-flex items-center gap-1.5'>
                    <span
                      aria-hidden='true'
                      className='inline-block w-1.5 h-1.5 rounded-full'
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                    {successful.length}{' '}
                    {successful.length === 1 ? 'key live' : 'keys live'}
                  </span>
                  {failing.length > 0 && (
                    <span className='inline-flex items-center gap-1.5'>
                      <span
                        aria-hidden='true'
                        className='inline-block w-1.5 h-1.5 rounded-full'
                        style={{ backgroundColor: 'var(--danger)' }}
                      />
                      {failing.length} failing
                    </span>
                  )}
                </>
              ) : (
                <span>No keys configured</span>
              )}
            </div>
            <span>Refreshed {formatTimeAgo(data.fetchedAt)}</span>
          </div>
        )}

        {/* Initial loading state. */}
        {!data && loading && (
          <div className='py-8 text-center text-xs text-stone-400'>
            Loading usage…
          </div>
        )}

        {/* Token prompt — the deployment has USAGE_API_TOKEN set (or is
            production without one) and the route answered 401. */}
        {needsToken && (
          <div className='surface-subtle border border-app rounded p-3 mb-3'>
            <p className='text-xs text-stone-600 leading-snug mb-2'>
              This endpoint requires the usage token (the deployment&apos;s{' '}
              <code className='font-mono text-[11px]'>USAGE_API_TOKEN</code>).
            </p>
            <div className='flex items-center gap-2'>
              <input
                type='password'
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitToken();
                }}
                placeholder='Usage token'
                autoFocus
                className='flex-1 text-xs rounded border border-app px-2 py-1.5 bg-[var(--background-card)] text-stone-700 focus:outline-none'
              />
              <button
                onClick={submitToken}
                disabled={loading || !tokenInput.trim()}
                className='text-xs px-2.5 py-1.5 rounded border border-app text-stone-600 hover:text-stone-900 transition disabled:cursor-not-allowed disabled:opacity-50'
              >
                Unlock
              </button>
            </div>
          </div>
        )}

        {/* Fetch error from /api/openalex/usage itself. */}
        {error && (
          <div className='banner-danger rounded p-2.5 flex items-start gap-2 text-xs mb-3'>
            <AlertTriangle
              size={14}
              className='text-danger flex-shrink-0 mt-0.5'
            />
            <p className='text-danger leading-snug'>
              Couldn&apos;t reach the usage endpoint: {error}
            </p>
          </div>
        )}

        {/* No keys configured — surface the route's own message so the
            admin knows which env var to set. */}
        {data && !hasKeys && data.message && (
          <div className='surface-subtle border border-app rounded p-3 text-xs text-stone-600 leading-snug'>
            {data.message}
          </div>
        )}

        {/* Global quota — sum across all keys. */}
        {data && hasKeys && (
          <>
            <section className='mb-5'>
              <div className='flex items-baseline justify-between mb-1.5'>
                <h4 className='text-[11px] uppercase tracking-wider text-stone-500 font-medium'>
                  Daily quota · all keys combined
                </h4>
                <span className='text-xs font-semibold text-stone-700 tabular-nums'>
                  {data.summary.totalUsedPercent.toFixed(1)}%
                </span>
              </div>
              <div className='h-2 rounded-full overflow-hidden surface-subtle'>
                <div
                  className='h-full transition-[width] duration-500'
                  style={{
                    width: `${data.summary.totalUsedPercent}%`,
                    backgroundColor: usageColorVar(
                      data.summary.totalUsedPercent,
                    ),
                  }}
                />
              </div>
              <div className='flex items-center justify-between text-[11px] text-stone-500 mt-1.5 tabular-nums'>
                <span>
                  {formatUsd(data.summary.totalUsedUsd)} used of{' '}
                  {formatUsd(data.summary.totalBudgetUsd)}
                </span>
                <span>
                  {formatUsd(data.summary.totalRemainingUsd)} remaining
                </span>
              </div>
            </section>

            {/* Per-key cards. Each card shows the same shape: label +
                redacted preview, percent, bar, $ usage line, calls/
                failures, resets-in countdown. Errored keys get a red
                banner in place of the bar. */}
            <section className='mb-4'>
              <h4 className='text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-2'>
                Per key
              </h4>
              <div className='space-y-2'>
                {data.keys.map((k) => {
                  const rl = k.rateLimit;
                  const percent = rl?.usedPercent ?? 0;
                  const color = usageColorVar(percent);
                  return (
                    <div
                      key={k.id}
                      className='surface-subtle border border-app rounded p-2.5'
                    >
                      <div className='flex items-baseline justify-between gap-2 mb-1.5'>
                        <div className='inline-flex items-baseline gap-2 min-w-0'>
                          <span className='text-xs font-medium text-stone-700 flex-shrink-0'>
                            {k.label}
                          </span>
                          <code className='text-[10px] text-stone-400 font-mono truncate'>
                            {k.preview}
                          </code>
                        </div>
                        {rl && (
                          <span className='text-[11px] font-semibold text-stone-700 flex-shrink-0 tabular-nums'>
                            {percent.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {rl ? (
                        <>
                          <div className='h-1.5 rounded-full overflow-hidden bg-[var(--background-card)]'>
                            <div
                              className='h-full transition-[width] duration-500'
                              style={{
                                width: `${percent}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                          <div className='flex items-center justify-between text-[10px] text-stone-500 mt-1.5 tabular-nums'>
                            <span>
                              {formatUsd(rl.dailyUsedUsd)} of{' '}
                              {formatUsd(rl.dailyBudgetUsd)}
                              {' · '}
                              {k.localStats.calls}{' '}
                              {k.localStats.calls === 1 ? 'call' : 'calls'}
                              {k.localStats.failures > 0 && (
                                <>
                                  {' · '}
                                  <span style={{ color: 'var(--danger)' }}>
                                    {k.localStats.failures} failed
                                  </span>
                                </>
                              )}
                            </span>
                            <span className='inline-flex items-center gap-1'>
                              <Clock
                                size={10}
                                className='text-stone-400'
                                aria-hidden='true'
                              />
                              resets in {formatRelative(rl.resetsInSeconds)}
                            </span>
                          </div>
                        </>
                      ) : (
                        k.error && (
                          <div className='banner-danger rounded p-1.5 text-[11px] text-danger flex items-start gap-1.5 leading-snug'>
                            <AlertTriangle
                              size={11}
                              className='flex-shrink-0 mt-0.5'
                              aria-hidden='true'
                            />
                            <span className='break-all'>{k.error}</span>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Footer: process-local counters that the route adds on
                top of OpenAlex's reported numbers — useful when a key
                is reporting 0% but is actually being hammered (e.g.
                during local dev where the rate-limit endpoint lags). */}
            <div className='flex items-center justify-between text-[11px] text-stone-500 mt-4 pt-3 border-t border-app-muted tabular-nums'>
              <span>
                Local session: {data.summary.totalCalls} calls ·{' '}
                {data.summary.totalFailures} failures
              </span>
              <span className='text-stone-400'>
                Press{' '}
                <kbd className='rounded border border-app px-1 text-[10px] font-mono text-stone-500'>
                  Esc
                </kbd>{' '}
                to close
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
