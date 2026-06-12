'use client';

// Tab strip for the rankings editor. Split out of RankingsEditor.tsx
// (2026-06 L2 decomposition).

import type { RankingScheme } from '@/types/interfaces';
import type { TabId } from './types';

export default function Tabs({
  current,
  onChange,
  scheme,
}: {
  current: TabId;
  onChange: (t: TabId) => void;
  scheme: RankingScheme;
}) {
  const counts: Record<TabId, string> = {
    info: '',
    journals: scheme.journals.length.toLocaleString(),
    tiers: String(scheme.tiers.length),
    domains: String(scheme.domains.length),
  };
  const tabs: { id: TabId; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'journals', label: 'Journals' },
    { id: 'tiers', label: 'Tiers' },
    { id: 'domains', label: 'Domains' },
  ];
  return (
    <div className='flex items-center gap-1 surface-subtle border border-app rounded-lg p-1 w-fit'>
      {tabs.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-3 py-1 text-sm rounded-md transition ${
              active
                ? 'surface-card text-app font-medium shadow-sm'
                : 'text-app-muted hover:text-app'
            }`}
          >
            {t.label}
            {counts[t.id] && (
              <span className='ml-1 text-[11px] text-app-soft'>
                ({counts[t.id]})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
