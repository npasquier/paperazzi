'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Download, Info, Pin, BookOpen } from 'lucide-react';
import { Paper } from '@/types/interfaces';
import PinButton from './PinButton';
import PaperInfoModal from '../PaperInfoModal';

interface PaperCardProps {
  paper: Paper;
  variant?: 'default' | 'compact' | 'pinned';
  showPinButton?: boolean;
  showActions?: boolean;
  preserveParams?: string;
  highlighted?: boolean;
  onClick?: () => void;
}

export default function PaperCard({
  paper,
  variant = 'default',
  showPinButton = true,
  showActions = true,
  preserveParams = '',
  highlighted = false,
  onClick,
}: PaperCardProps) {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const router = useRouter();

  const paperUrl = `/paper/${paper.id.split('/').pop()}${
    preserveParams ? `?${preserveParams}` : ''
  }`;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons/links inside the card
    if ((e.target as HTMLElement).closest('button, a, [role="button"]')) {
      return;
    }
    if (onClick) {
      onClick();
    }
    router.push(paperUrl);
  };

  const openGoogleScholar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(
      paper.title
    )}`;
    window.open(url, '_blank');
  };

  const handleInfoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowInfoModal(true);
  };

  if (variant === 'pinned') {
    return (
      <>
        <div
          onClick={handleCardClick}
          className={`
            bg-stone-50 border rounded-lg p-3 relative cursor-pointer
            ${
              highlighted
                ? 'border-amber-400 bg-amber-50'
                : 'border-stone-200 hover:border-stone-300'
            }
          `}
        >
          {showPinButton && (
            <div className='absolute top-2 right-2'>
              <PinButton paper={paper} size='sm' />
            </div>
          )}
          <div className='pr-8'>
            <div className='font-semibold text-stone-900 text-xs leading-snug mb-1 line-clamp-2'>
              {paper.title}
            </div>
            <div className='text-xs text-stone-500'>
              {paper.publication_year} • {paper.cited_by_count} cites{' '}
              {paper.referenced_works_count !== undefined && (
                <> • {paper.referenced_works_count} refs</>
              )}
            </div>
          </div>
        </div>
        <PaperInfoModal
          paper={paper}
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
        />
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <>
        <div
          onClick={handleCardClick}
          className={`
            border rounded-lg p-3 transition bg-white cursor-pointer
            ${
              highlighted
                ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                : 'border-stone-200 hover:border-stone-300'
            }
          `}
        >
          {highlighted && (
            <div className='flex items-center gap-1 text-xs text-amber-700 font-medium mb-2'>
              <Pin size={12} className='fill-amber-700' />
              Pinned paper
            </div>
          )}
          <div className='font-semibold text-stone-900 text-sm leading-snug mb-1'>
            {paper.title}
          </div>
          <div className='text-xs text-stone-600 mb-1'>
            {paper.authors.slice(0, 3).join(', ')}
            {paper.authors.length > 3 && '...'}
          </div>
          <div className='text-xs text-stone-500'>
            {paper.journal_name} • {paper.publication_year} •{' '}
            {paper.cited_by_count} citations
          </div>
        </div>
        <PaperInfoModal
          paper={paper}
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
        />
      </>
    );
  }

  // Default variant
  return (
    <>
      <div
        onClick={handleCardClick}
        className={`
          bg-white border rounded-lg p-3 transition cursor-pointer
          ${
            highlighted
              ? 'border-amber-400 bg-amber-50'
              : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'
          }
        `}
      >
        <div className='flex items-start justify-between gap-4'>
          {/* Left side: Paper info */}
          <div className='flex-1 min-w-0'>
            <h3 className='font-semibold text-stone-900 text-base leading-snug mb-1'>
              {paper.title}
            </h3>

            <div className='text-sm text-stone-600 mb-1 truncate'>
              {paper.authors.slice(0, 5).join(', ')}
              {paper.authors.length > 5 &&
                `, +${paper.authors.length - 5} more`}
            </div>

            <div className='text-xs text-stone-500'>
              {paper.journal_name} • {paper.publication_year} •{' '}
              {paper.cited_by_count} citations
              {paper.referenced_works_count !== undefined && (
                <> • {paper.referenced_works_count} refs</>
              )}
            </div>
          </div>

          {/* Right side: Action buttons */}
          {showActions && (
            <div className='flex flex-wrap gap-2 items-start flex-shrink-0'>
              {showPinButton && <PinButton paper={paper} size='sm' />}

              <button
                onClick={handleInfoClick}
                className='inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap'
              >
                <Info size={12} /> Info
              </button>

              <button
                onClick={openGoogleScholar}
                className='inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition text-xs font-medium whitespace-nowrap'
              >
                <BookOpen size={12} /> Scholar
              </button>

              {paper.doi && (
                <a
                  href={`https://doi.org/${paper.doi.replace(
                    'https://doi.org/',
                    ''
                  )}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap'
                >
                  <ExternalLink size={12} /> DOI
                </a>
              )}

              {paper.pdf_url && (
                <a
                  href={paper.pdf_url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap'
                >
                  <Download size={12} /> PDF
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <PaperInfoModal
        paper={paper}
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
    </>
  );
}
