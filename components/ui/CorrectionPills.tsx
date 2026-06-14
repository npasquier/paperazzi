'use client';

import { CORRECTION_TYPES, openCorrectionForm } from '@/utils/correctionForms';

/**
 * Row of one-click "pills" for OpenAlex corrections. Each pill opens the
 * correction form prefilled for that edit type (Title, Abstract, Merge, …) so
 * the user only has to describe the fix and submit. Replaces the single generic
 * "Submit correction" link with a quick pick of what's wrong.
 */
export function CorrectionPills({
  workId,
  abstract,
  label = 'Fix:',
  className = '',
}: {
  workId: string;
  /** Recovered abstract text; only used by the "Abstract" pill. */
  abstract?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {label && <span className='text-xs text-stone-500'>{label}</span>}
      {CORRECTION_TYPES.map((type) => (
        <button
          key={type.id}
          type='button'
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void openCorrectionForm(workId, type.id, { abstract });
          }}
          title={`Open the OpenAlex form prefilled for “${type.editTypeOption}”`}
          className='rounded-full border border-app surface-muted px-2 py-0.5 text-[11px] text-stone-600 transition hover:border-app-strong hover:text-stone-900'
        >
          {type.pill}
        </button>
      ))}
    </div>
  );
}
