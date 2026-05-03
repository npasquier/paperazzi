'use client';

import { Pin as PinIcon } from 'lucide-react';
import { Paper } from '@/types/interfaces';
import { usePins } from '@/contexts/PinContext';
import { normalizeId } from '@/utils/normalizeId';

interface PinButtonProps {
  paper: Paper;
  size?: 'xs' | 'sm' | 'md';
}

export default function PinButton({ paper, size = 'md' }: PinButtonProps) {
  const { isPinned, togglePin } = usePins();
  const pinned = isPinned(normalizeId(paper.id));


  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePin(paper);
      }}
      className={`
        inline-flex items-center justify-center
        border transition
        ${
          size === 'xs'
            ? 'w-[20px] h-[20px] rounded-md'
            : size === 'sm'
              ? 'w-7 h-7 rounded-lg'
              : 'w-9 h-9 rounded-lg'
        }
        ${
          pinned
            ? 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-warning'
            : 'surface-card border-app text-app-soft hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-muted)]'
        }
      `}
      title={pinned ? 'Unpin paper' : 'Pin paper'}
    >
      <PinIcon
        size={size === 'xs' ? 11 : size === 'sm' ? 14 : 16}
        className={pinned ? 'fill-[var(--warning-foreground)]' : ''}
      />
    </button>
  );
}
