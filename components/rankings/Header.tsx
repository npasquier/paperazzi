'use client';

// Scheme header: name, read-only/editable badge, Fork / Reset / Export
// actions. Split out of RankingsEditor.tsx (2026-06 L2 decomposition).

import { Download, RotateCcw, GitFork } from 'lucide-react';
import type { RankingScheme } from '@/types/interfaces';

export default function Header({
  scheme,
  editable,
  onFork,
  onResetClick,
  onExport,
}: {
  scheme: RankingScheme;
  editable: boolean;
  onFork: () => void;
  onResetClick: () => void;
  onExport: () => void;
}) {
  return (
    <div className='surface-card border border-app rounded-lg p-4'>
      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div className='min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <h1 className='text-xl font-semibold text-stone-900'>
              {scheme.name}
            </h1>
            {!editable && (
              <span className='inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded chip-muted text-stone-600'>
                Built-in baseline (read-only)
              </span>
            )}
            {editable && (
              <span className='inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded badge-accent'>
                Editable
              </span>
            )}
          </div>
          {scheme.description && (
            <p className='text-sm text-app-muted mt-1'>{scheme.description}</p>
          )}
          <p className='text-[11px] text-app-soft mt-1'>
            Schema version v{scheme.version} · id <code>{scheme.id}</code>
          </p>
        </div>
        <div className='flex items-center gap-2 flex-wrap'>
          {!editable ? (
            <button
              onClick={onFork}
              className='inline-flex items-center gap-1 px-3 py-1.5 button-primary rounded-lg text-sm'
              title='Make a personal copy of the built-in scheme so you can edit it.'
            >
              <GitFork size={14} />
              Fork to edit
            </button>
          ) : (
            <button
              onClick={onResetClick}
              className='inline-flex items-center gap-1 px-3 py-1.5 button-secondary rounded-lg text-sm'
              title='Discard your edits and restore the built-in CNRS scheme.'
            >
              <RotateCcw size={14} />
              Reset to default
            </button>
          )}
          <button
            onClick={onExport}
            className='inline-flex items-center gap-1 px-3 py-1.5 button-secondary rounded-lg text-sm'
            title='Download the active ranking as a JSON file.'
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
