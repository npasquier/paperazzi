import { NextResponse } from 'next/server';
import {
  HAS_OPENALEX_KEYS,
  OPENALEX_KEYS,
  getKeyCounterSnapshotForKey,
  redactOpenAlexKey,
} from '@/app/api/search/lib/keys';
import type { OpenAlexRateLimitResponse } from '@/types/openalex';

export const dynamic = 'force-dynamic';

interface UsageKeySnapshot {
  id: string;
  index: number;
  label: string;
  preview: string;
  error?: string;
  localStats: {
    calls: number;
    failures: number;
    lastFailureAt?: number;
    lastFailureStatus?: number;
  };
  rateLimit?: {
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
  };
}

interface UsageRouteResponse {
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
  keys: UsageKeySnapshot[];
}

function jsonNoStore(body: UsageRouteResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  });
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normaliseErrorBody(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length > 180 ? `${collapsed.slice(0, 177)}...` : collapsed;
}

async function fetchKeyUsage(
  key: string,
  index: number,
): Promise<UsageKeySnapshot> {
  const label = `Key ${index + 1}`;
  const localStats = getKeyCounterSnapshotForKey(key);

  try {
    const res = await fetch(
      `https://api.openalex.org/rate-limit?api_key=${encodeURIComponent(key)}`,
      {
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      let details = '';
      try {
        details = normaliseErrorBody(await res.text());
      } catch {
        // ignore
      }
      return {
        id: `openalex-key-${index + 1}`,
        index: index + 1,
        label,
        preview: redactOpenAlexKey(key),
        localStats,
        error: details
          ? `OpenAlex returned ${res.status}: ${details}`
          : `OpenAlex returned ${res.status} ${res.statusText}`,
      };
    }

    const data = (await res.json()) as OpenAlexRateLimitResponse;
    const rateLimit = data.rate_limit;
    if (!rateLimit) {
      return {
        id: `openalex-key-${index + 1}`,
        index: index + 1,
        label,
        preview: redactOpenAlexKey(key),
        localStats,
        error: 'OpenAlex returned no rate-limit payload for this key.',
      };
    }

    const dailyBudgetUsd = readNumber(rateLimit.daily_budget_usd);
    const dailyUsedUsd = readNumber(rateLimit.daily_used_usd);
    const dailyRemainingUsd = readNumber(rateLimit.daily_remaining_usd);

    return {
      id: `openalex-key-${index + 1}`,
      index: index + 1,
      label,
      preview: redactOpenAlexKey(key),
      localStats,
      rateLimit: {
        dailyBudgetUsd,
        dailyUsedUsd,
        dailyRemainingUsd,
        usedPercent:
          dailyBudgetUsd > 0
            ? Math.max(0, Math.min(100, (dailyUsedUsd / dailyBudgetUsd) * 100))
            : 0,
        prepaidBalanceUsd: readNumber(rateLimit.prepaid_balance_usd),
        prepaidRemainingUsd: readNumber(rateLimit.prepaid_remaining_usd),
        prepaidExpiresAt: rateLimit.prepaid_expires_at || null,
        resetsAt: rateLimit.resets_at || null,
        resetsInSeconds:
          typeof rateLimit.resets_in_seconds === 'number'
            ? rateLimit.resets_in_seconds
            : null,
        endpointCostsUsd: rateLimit.endpoint_costs_usd || {},
      },
    };
  } catch (error) {
    return {
      id: `openalex-key-${index + 1}`,
      index: index + 1,
      label,
      preview: redactOpenAlexKey(key),
      localStats,
      error: error instanceof Error ? error.message : 'Unknown fetch error',
    };
  }
}

export async function GET() {
  const fetchedAt = new Date().toISOString();

  if (!HAS_OPENALEX_KEYS) {
    return jsonNoStore({
      fetchedAt,
      configuredKeys: 0,
      message:
        'No OpenAlex API keys are configured. Add OPENALEX_KEYS or OPEN_ALEX_API_KEY to enable live usage tracking.',
      summary: {
        successfulKeys: 0,
        failedKeys: 0,
        totalBudgetUsd: 0,
        totalUsedUsd: 0,
        totalRemainingUsd: 0,
        totalUsedPercent: 0,
        totalCalls: 0,
        totalFailures: 0,
        resetsAt: null,
      },
      keys: [],
    });
  }

  const keys = await Promise.all(OPENALEX_KEYS.map(fetchKeyUsage));
  const successful = keys.filter((item) => item.rateLimit);
  const resetTimes = successful
    .map((item) => item.rateLimit?.resetsAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  const totalBudgetUsd = successful.reduce(
    (sum, item) => sum + (item.rateLimit?.dailyBudgetUsd || 0),
    0,
  );
  const totalUsedUsd = successful.reduce(
    (sum, item) => sum + (item.rateLimit?.dailyUsedUsd || 0),
    0,
  );
  const totalRemainingUsd = successful.reduce(
    (sum, item) => sum + (item.rateLimit?.dailyRemainingUsd || 0),
    0,
  );

  return jsonNoStore({
    fetchedAt,
    configuredKeys: OPENALEX_KEYS.length,
    summary: {
      successfulKeys: successful.length,
      failedKeys: keys.length - successful.length,
      totalBudgetUsd,
      totalUsedUsd,
      totalRemainingUsd,
      totalUsedPercent:
        totalBudgetUsd > 0 ? Math.max(0, (totalUsedUsd / totalBudgetUsd) * 100) : 0,
      totalCalls: keys.reduce((sum, item) => sum + item.localStats.calls, 0),
      totalFailures: keys.reduce(
        (sum, item) => sum + item.localStats.failures,
        0,
      ),
      resetsAt:
        resetTimes.length > 0 ? new Date(Math.min(...resetTimes)).toISOString() : null,
    },
    keys,
  });
}
