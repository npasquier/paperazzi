'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  Download,
  ChevronDown,
  ChevronUp,
  Pin,
  BookOpen,
} from 'lucide-react';
import { Paper } from '@/types/interfaces';
import PinButton from './PinButton';

interface PaperCardProps {
  paper: Paper;
  variant?: 'default' | 'compact' | 'pinned';
  showPinButton?: boolean;
  showActions?: boolean;
  preserveParams?: string;
  highlighted?: boolean;
  onClick?: () => void;
  onAuthorClick?: (authorName: string) => void;
}

export default function PaperCard({
  paper,
  variant = 'default',
  showPinButton = true,
  showActions = true,
  preserveParams = '',
  highlighted = false,
  onClick,
  onAuthorClick,
}: PaperCardProps) {
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);
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
    // Open in new tab instead of navigating
    window.open(paperUrl, '_blank');
  };

  const openGoogleScholar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(
      paper.title
    )}`;
    window.open(url, '_blank');
  };

  const toggleAbstract = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAbstractExpanded(!isAbstractExpanded);
  };

  const handleAuthorClick = (e: React.MouseEvent, authorName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAuthorClick) {
      onAuthorClick(authorName);
    }
  };

  const renderAuthors = (maxAuthors: number, textSize: string = 'text-sm') => {
    const displayAuthors = paper.authors.slice(0, maxAuthors);
    const hasMore = paper.authors.length > maxAuthors;

    return (
      <div className={`${textSize} text-stone-600 mb-1`}>
        {displayAuthors.map((author, idx) => (
          <span key={idx}>
            <button
              onClick={(e) => handleAuthorClick(e, author)}
              className="hover:text-stone-900 hover:underline transition-colors cursor-pointer inline"
              title={`Search papers by ${author}`}
            >
              {author}
            </button>
            {idx < displayAuthors.length - 1 && ', '}
          </span>
        ))}
        {hasMore && (
          <span className="text-stone-500">
            , +{paper.authors.length - maxAuthors} more
          </span>
        )}
      </div>
    );
  };

  if (variant === 'pinned') {
    return (
      <div
        className={`
          bg-stone-50 border rounded-lg p-3 relative group
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
          <div 
            onClick={handleCardClick}
            className='font-semibold text-stone-900 text-xs leading-snug mb-1 line-clamp-2 cursor-pointer'
          >
            {paper.title}
          </div>
          <div className='text-xs text-stone-500 flex items-center gap-2'>
            <span>{paper.publication_year}</span>
            <span>•</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
                // Will be handled by PinSidebar's handleSearchCiting
                const event = new CustomEvent('paper-citing-click', { 
                  detail: { paper } 
                });
                window.dispatchEvent(event);
              }}
              className='hover:text-stone-700 hover:underline transition cursor-pointer'
              title='Find papers that cite this paper'
            >
              {paper.cited_by_count} cites
            </button>
            {paper.referenced_works_count !== undefined && (
              <>
                <span>•</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onClick) onClick();
                    // Will be handled by PinSidebar's handleSearchReferences
                    const event = new CustomEvent('paper-refs-click', { 
                      detail: { paper } 
                    });
                    window.dispatchEvent(event);
                  }}
                  className='hover:text-stone-700 hover:underline transition cursor-pointer'
                  title='Find papers cited by this paper'
                >
                  {paper.referenced_works_count} refs
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
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
        {renderAuthors(3, 'text-xs')}
        <div className='text-xs text-stone-500'>
          {paper.journal_name} • {paper.publication_year} •{' '}
          {paper.cited_by_count} citations
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={`
      bg-white border rounded-lg transition relative group
      ${
        highlighted
          ? 'border-amber-400 bg-amber-50'
          : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'
      }
    `}
    >
      <div onClick={handleCardClick} className='p-3 cursor-pointer'>
        <div className='flex items-start justify-between gap-4'>
          {/* Left side: Paper info */}
          <div className='flex-1 min-w-0'>
            <h3 className='font-semibold text-stone-900 text-base leading-snug mb-1'>
              {paper.title}
            </h3>

            {renderAuthors(5)}

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

      {/* Collapsible Abstract */}
      {paper.abstract && (
        <>
          <div
            className={`
            overflow-hidden transition-all duration-300 ease-in-out
            ${isAbstractExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
          `}
          >
            <div className='px-3 pb-3 pt-0 border-t border-stone-200'>
              <div className='mt-3 text-sm text-stone-700 leading-relaxed'>
                <b>Abstract</b>: {paper.abstract}
              </div>
            </div>
          </div>

          {/* Bottom-right Arrow Toggle - Shows on hover */}
          <button
            onClick={toggleAbstract}
            className='absolute bottom-2 right-2 p-1 text-stone-400 hover:text-stone-600 transition opacity-0 group-hover:opacity-100'
            aria-expanded={isAbstractExpanded}
            aria-label={isAbstractExpanded ? 'Hide abstract' : 'Show abstract'}
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-300 ${
                isAbstractExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </>
      )}
    </div>
  );
}