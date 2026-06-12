'use client';

// Info tab: scheme name + description. Split out of RankingsEditor.tsx
// (2026-06 L2 decomposition).

import { Info } from 'lucide-react';
import type { RankingScheme } from '@/types/interfaces';
import type { UpdateScheme } from './types';

export default function InfoTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: UpdateScheme;
}) {
  return (
    <div className='space-y-4 max-w-2xl'>
      <div>
        <label className='text-xs font-medium text-app-muted block mb-1'>
          Name
        </label>
        <input
          type='text'
          value={scheme.name}
          disabled={!editable}
          onChange={(e) =>
            update((d) => {
              d.name = e.target.value || d.name;
            })
          }
          className='w-full px-3 py-2 border border-app rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed'
        />
      </div>
      <div>
        <label className='text-xs font-medium text-app-muted block mb-1'>
          Description
        </label>
        <textarea
          value={scheme.description ?? ''}
          disabled={!editable}
          onChange={(e) =>
            update((d) => {
              d.description = e.target.value;
            })
          }
          rows={4}
          className='w-full px-3 py-2 border border-app rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed'
        />
      </div>
      {!editable && (
        <p className='text-[11px] text-app-soft flex items-start gap-1'>
          <Info size={12} className='mt-0.5 flex-shrink-0' />
          Click &ldquo;Fork to edit&rdquo; above to make this scheme editable.
        </p>
      )}
    </div>
  );
}
