'use client';

import { Pin as PinIcon } from 'lucide-react';
import { Paper } from '@/types/interfaces';
import { usePins } from '@/contexts/PinContext';

interface PinButtonProps {
  paper: Paper;
  size?: 'sm' | 'md';
}

export default function PinButton({ paper, size = 'md' }: PinButtonProps) {
  const { isPinned, togglePin } = usePins();
  const pinned = isPinned(paper.id);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePin(paper);
      }}
      className={`
        inline-flex items-center justify-center
        rounded-lg border transition
        ${size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'}
        ${
          pinned
            ? 'bg-amber-100 border-amber-400 text-amber-600'
            : 'bg-white border-stone-300 text-stone-500 hover:bg-stone-50'
        }
      `}
      title={pinned ? 'Unpin paper' : 'Pin paper'}
    >
      <PinIcon size={size === 'sm' ? 14 : 16} className={pinned ? 'fill-amber-500' : ''} />
    </button>
  );
}
