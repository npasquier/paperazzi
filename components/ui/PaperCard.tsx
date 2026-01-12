'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  Download,
  ChevronDown,
  Pin,
  BookOpen,
  Info,
  Copy,
  Check,
  CheckCircle,
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
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isAuthorsExpanded, setIsAuthorsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const router = useRouter();

  const paperUrl = `/paper/${paper.id.split('/').pop()}${
    preserveParams ? `?${preserveParams}` : ''
  }`;

  const workId = paper.id.replace('https://openalex.org/', '');

  // Check if abstract exists
  const hasAbstract = paper.abstract && paper.abstract.trim().length > 0;

  // Check localStorage for reported status
  const reportedKey = `reported-${workId}`;
  const [isReportedStored] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(reportedKey) === 'true';
    }
    return false;
  });

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, [role="button"]')) {
      return;
    }
    if (onClick) {
      onClick();
    }
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
    if (!isAbstractExpanded) {
      setIsInfoExpanded(false);
    }
  };

  const toggleInfo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsInfoExpanded(!isInfoExpanded);
    if (!isInfoExpanded) {
      setIsAbstractExpanded(false);
    }
  };

  const toggleAuthorsExpanded = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAuthorsExpanded(!isAuthorsExpanded);
  };

  const handleAuthorClick = (e: React.MouseEvent, authorName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAuthorClick) {
      onAuthorClick(authorName);
    }
  };

  const copyWorkId = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(workId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openOpenAlexForm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const formUrl =
      'https://docs.google.com/forms/d/e/1FAIpQLScUcNZdqOBFxVJ0oihjeHFilm9IqqWKQY4WDmmqgxUNGr3R1g/viewform';
    window.open(formUrl, '_blank');
  };

  const handleReportedToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!hasReported && !isReportedStored) {
      // First time reporting - dispatch celebration event for full-page animation
      setHasReported(true);
      localStorage.setItem(reportedKey, 'true');

      // Dispatch custom event for the parent to show celebration
      window.dispatchEvent(
        new CustomEvent('paper-reported', {
          detail: { paperId: workId },
        })
      );
    } else {
      // Toggle off
      setHasReported(false);
      localStorage.removeItem(reportedKey);
    }
  };

  // Helper to display "Not available" for missing data
  const displayValue = (
    value: string | undefined | null,
    fallback = 'Not available'
  ) => {
    if (!value || value.trim() === '' || value === 'Unknown') {
      return <span className='text-stone-400 italic'>{fallback}</span>;
    }
    return value;
  };

  const renderAuthors = (maxAuthors: number, textSize: string = 'text-sm') => {
    if (!paper.authors || paper.authors.length === 0) {
      return (
        <div className={`${textSize} text-stone-400 italic mb-1`}>
          Authors not available
        </div>
      );
    }

    const displayAuthors = paper.authors.slice(0, maxAuthors);
    const hasMore = paper.authors.length > maxAuthors;

    return (
      <div className={`${textSize} text-stone-600 mb-1`}>
        {displayAuthors.map((author, idx) => (
          <span key={idx}>
            <button
              onClick={(e) => handleAuthorClick(e, author)}
              className='hover:text-stone-900 hover:underline transition-colors cursor-pointer inline'
              title={`Search papers by ${author}`}
            >
              {author}
            </button>
            {idx < displayAuthors.length - 1 && ', '}
          </span>
        ))}
        {hasMore && (
          <span className='text-stone-500'>
            , +{paper.authors.length - maxAuthors} more
          </span>
        )}
      </div>
    );
  };

  // Render expandable authors for pinned variant
  const renderExpandableAuthors = (
    initialMax: number,
    textSize: string = 'text-xs'
  ) => {
    if (!paper.authors || paper.authors.length === 0) {
      return (
        <div className={`${textSize} text-stone-400 italic mb-1`}>
          Authors not available
        </div>
      );
    }

    const hasMore = paper.authors.length > initialMax;
    const displayAuthors = isAuthorsExpanded
      ? paper.authors
      : paper.authors.slice(0, initialMax);

    return (
      <div className={`${textSize} text-stone-600 mb-1`}>
        {displayAuthors.map((author, idx) => (
          <span key={idx}>
            <button
              onClick={(e) => handleAuthorClick(e, author)}
              className='hover:text-stone-900 hover:underline transition-colors cursor-pointer inline'
              title={`Search papers by ${author}`}
            >
              {author}
            </button>
            {idx < displayAuthors.length - 1 && ', '}
          </span>
        ))}
        {hasMore && !isAuthorsExpanded && (
          <button
            onClick={toggleAuthorsExpanded}
            className='text-stone-500 hover:text-stone-700 hover:underline transition-colors cursor-pointer ml-0.5'
            title='Show all authors'
          >
            +{paper.authors.length - initialMax} more
          </button>
        )}
        {isAuthorsExpanded && hasMore && (
          <button
            onClick={toggleAuthorsExpanded}
            className='text-stone-400 hover:text-stone-600 transition-colors cursor-pointer ml-1 text-[10px]'
            title='Show fewer authors'
          >
            (show less)
          </button>
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
            {paper.title || (
              <span className='text-stone-400 italic'>Untitled</span>
            )}
          </div>

          {/* Use expandable authors */}
          {renderExpandableAuthors(2, 'text-xs')}

          <div className='text-xs text-stone-500 flex items-center gap-1.5 min-w-0 flex-wrap'>
            {paper.journal_name && (
              <>
                <span 
                  className='truncate max-w-[100px] hover:max-w-none hover:whitespace-normal cursor-default transition-all'
                >
                  {paper.journal_name}
                </span>
                <span className='flex-shrink-0'>•</span>
              </>
            )}
            <span className='flex-shrink-0'>{paper.publication_year || '—'}</span>
            <span className='flex-shrink-0'>•</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
                const event = new CustomEvent('paper-citing-click', {
                  detail: { paper },
                });
                window.dispatchEvent(event);
              }}
              className='hover:text-stone-700 hover:underline transition cursor-pointer flex-shrink-0'
              title='Find papers that cite this paper'
            >
              {paper.cited_by_count ?? 0} cites
            </button>
            {paper.referenced_works_count !== undefined && (
              <>
                <span className='flex-shrink-0'>•</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onClick) onClick();
                    const event = new CustomEvent('paper-refs-click', {
                      detail: { paper },
                    });
                    window.dispatchEvent(event);
                  }}
                  className='hover:text-stone-700 hover:underline transition cursor-pointer flex-shrink-0'
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
          {paper.title || (
            <span className='text-stone-400 italic'>Untitled</span>
          )}
        </div>
        {renderAuthors(3, 'text-xs')}
        <div className='text-xs text-stone-500'>
          {displayValue(paper.journal_name)} • {paper.publication_year || '—'} •{' '}
          {paper.cited_by_count ?? 0} citations
        </div>
      </div>
    );
  }

  // Default variant
  const isReported = hasReported || isReportedStored;

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
          <div className='flex-1 min-w-0'>
            <h3 className='font-semibold text-stone-900 text-base leading-snug mb-1'>
              {paper.title || (
                <span className='text-stone-400 italic'>Untitled</span>
              )}
            </h3>
            {renderAuthors(5)}

            <div className='text-xs text-stone-500 flex items-center gap-2 flex-wrap'>
              <span>{displayValue(paper.journal_name)}</span>
              <span>•</span>
              <span>{paper.publication_year || '—'}</span>
              <span>•</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const event = new CustomEvent('paper-citing-click', {
                    detail: { paper },
                  });
                  window.dispatchEvent(event);
                }}
                className='hover:text-stone-700 hover:underline transition cursor-pointer'
                title='Find papers that cite this paper'
              >
                {paper.cited_by_count ?? 0} citations
              </button>
              {paper.referenced_works_count !== undefined && (
                <>
                  <span>•</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const event = new CustomEvent('paper-refs-click', {
                        detail: { paper },
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

      {/* Abstract Section - Only show if abstract exists */}
      {hasAbstract && (
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
      )}

      {/* Info Section */}
      <div
        className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isInfoExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}
        `}
      >
        <div className='px-3 pb-3 pt-0 border-t border-stone-200'>
          <div className='mt-3 space-y-2'>
            <p className='text-xs text-stone-500'>
              Report errors or missing data to OpenAlex
            </p>
            {/* Compact inline Work ID with copy */}
            <div className='flex items-center gap-2 text-xs'>
              <span className='text-stone-500'>ID:</span>
              <code className='px-1.5 py-0.5 bg-stone-100 rounded text-stone-600 font-mono text-[11px]'>
                {workId}
              </code>
              <button
                onClick={copyWorkId}
                className='p-0.5 text-stone-400 hover:text-stone-600 transition'
                title='Copy Work ID'
              >
                {isCopied ? (
                  <Check size={12} className='text-green-600' />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
            {/* Compact action row - with proper spacing from toggle buttons */}
            <div className='flex items-center gap-3 pt-1 pr-16'>
              <button
                onClick={openOpenAlexForm}
                className='inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 hover:underline transition'
              >
                <ExternalLink size={11} />
                Submit correction
              </button>
              <button
                onClick={handleReportedToggle}
                className={`inline-flex items-center gap-1 text-xs transition ${
                  isReported
                    ? 'text-green-600'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
                title={isReported ? 'Unmark as reported' : 'Mark as reported'}
              >
                <CheckCircle
                  size={12}
                  className={isReported ? 'fill-green-600 text-white' : ''}
                />
                <span>{isReported ? 'Reported' : 'Mark as reported'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle buttons - positioned in bottom right, Info on LEFT of chevron */}
      <div className='absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
        {/* Info toggle - on the LEFT */}
        <button
          onClick={toggleInfo}
          className='p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition'
          aria-expanded={isInfoExpanded}
          aria-label='Report error or missing data'
          title='Report error or missing data'
        >
          <Info
            size={16}
            className={`transition-colors ${isInfoExpanded ? 'text-stone-600' : ''}`}
          />
        </button>

        {/* Abstract toggle - on the RIGHT, only show if abstract exists */}
        {hasAbstract && (
          <button
            onClick={toggleAbstract}
            className='p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition'
            aria-expanded={isAbstractExpanded}
            aria-label={isAbstractExpanded ? 'Hide abstract' : 'Show abstract'}
            title={isAbstractExpanded ? 'Hide abstract' : 'Show abstract'}
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-300 ${
                isAbstractExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
      </div>
    </div>
  );
}