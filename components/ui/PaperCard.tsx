'use client';
import { useState } from 'react';
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
  Network as NetworkIcon,
} from 'lucide-react';
import { Paper } from '@/types/interfaces';
import PinButton from './PinButton';
import { reportedPaperKey } from '@/utils/storageKeys';
import PaperInfoModal from '@/components/PaperInfoModal';

interface PaperCardProps {
  paper: Paper;
  variant?: 'default' | 'compact' | 'pinned';
  showPinButton?: boolean;
  showActions?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
  onAuthorClick?: (authorName: string) => void;
  // Color used to mark a paper as belonging to a pin group (rendered as a
  // thin left border on the pinned variant).
  groupColor?: string;
  disablePrimaryOpen?: boolean;
}

export default function PaperCard({
  paper,
  variant = 'default',
  showPinButton = true,
  showActions = true,
  highlighted = false,
  onClick,
  onAuthorClick,
  groupColor,
  disablePrimaryOpen = false,
}: PaperCardProps) {
  const [isAbstractExpanded, setIsAbstractExpanded] = useState(false);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isPaperInfoOpen, setIsPaperInfoOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [hasReported, setHasReported] = useState(false);

  const workId = paper.id.replace('https://openalex.org/', '');

  // Check if abstract exists
  const hasAbstract = paper.abstract && paper.abstract.trim().length > 0;

  // Check localStorage for reported status
  const reportedKey = reportedPaperKey(workId);
  const [isReportedStored] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(reportedKey) === 'true';
    }
    return false;
  });

  const openGoogleScholar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(
      paper.title
    )}`;
    window.open(url, '_blank');
  };

  const openPaperInfoModal = () => {
    setIsPaperInfoOpen(true);
  };

  const handlePinnedCardOpen = () => {
    if (disablePrimaryOpen) return;
    openPaperInfoModal();
  };

  const handlePinnedCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disablePrimaryOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPaperInfoModal();
    }
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

  const getPinnedAuthorLabel = () => {
    const firstAuthor = paper.authors?.[0]?.trim();
    return firstAuthor
      ? `${firstAuthor.split(/\s+/).pop()}${paper.authors.length > 1 ? ' et al.' : ''}`
      : 'Unknown author';
  };

  if (variant === 'pinned') {
    return (
      <>
        <div
          className={`
            surface-card border border-app rounded-lg px-2.5 py-2 relative group transition
            ${
              highlighted
                ? 'border-[var(--warning-border)] bg-[var(--warning-bg)]'
                : 'hover:border-[var(--border-strong)]'
            }
            ${disablePrimaryOpen ? '' : 'cursor-pointer'}
          `}
          style={
            groupColor
              ? {
                  borderLeftColor: groupColor,
                  borderLeftWidth: 3,
                }
              : undefined
          }
          onClick={handlePinnedCardOpen}
          onKeyDown={handlePinnedCardKeyDown}
          role={disablePrimaryOpen ? undefined : 'button'}
          tabIndex={disablePrimaryOpen ? undefined : 0}
        >
          {showPinButton && (
            <div className='absolute top-2 right-2'>
              <PinButton paper={paper} size='xs' />
            </div>
          )}

          <div className='pr-11 min-w-0'>
            <div className='font-semibold text-stone-900 text-[13px] leading-snug line-clamp-1'>
              {paper.title || (
                <span className='text-stone-400 italic'>Untitled</span>
              )}
            </div>
            <div className='mt-0.5 flex min-w-0 items-center gap-0.5 text-[10px] text-stone-500 overflow-hidden whitespace-nowrap'>
              <span className='max-w-[82px] truncate flex-shrink'>
                {getPinnedAuthorLabel()}
              </span>
              <span className='flex-shrink-0'>·</span>
              <span className='flex-shrink-0'>
                {paper.publication_year || '—'}
              </span>
              <span className='flex-shrink-0'>·</span>
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
                {(paper.cited_by_count ?? 0).toLocaleString()} cites
              </button>
              {paper.referenced_works_count !== undefined && (
                <>
                  <span className='flex-shrink-0'>·</span>
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
              <span className='flex-shrink-0'>·</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClick) onClick();
                  const event = new CustomEvent('paper-network-click', {
                    detail: { paper },
                  });
                  window.dispatchEvent(event);
                }}
                className='inline-flex items-center gap-0.5 hover:text-stone-700 hover:underline transition cursor-pointer flex-shrink-0'
                title='View references + citing papers as a network'
              >
                <NetworkIcon size={9} /> network
              </button>
            </div>
          </div>
        </div>

        <PaperInfoModal
          paper={paper}
          isOpen={isPaperInfoOpen}
          onClose={() => setIsPaperInfoOpen(false)}
        />
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`
          border border-app rounded-lg p-3 transition surface-card cursor-pointer
          ${
            highlighted
              ? 'border-[var(--warning-border)] bg-[var(--warning-bg)] ring-2 ring-[var(--warning-border)]/40'
              : 'hover:border-[var(--border-strong)]'
          }
        `}
      >
        {highlighted && (
          <div className='flex items-center gap-1 text-xs text-warning font-medium mb-2'>
            <Pin size={12} className='fill-[var(--warning-foreground)]' />
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
      surface-card border border-app rounded-lg transition relative group
      ${
        highlighted
          ? 'border-[var(--warning-border)] bg-[var(--warning-bg)]'
          : 'hover:border-[var(--border-strong)] hover:shadow-sm'
      }
    `}
    >
      <div className='p-3 cursor-pointer'>
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
              <span>•</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const event = new CustomEvent('paper-network-click', {
                    detail: { paper },
                  });
                  window.dispatchEvent(event);
                }}
                className='inline-flex items-center gap-1 hover:text-stone-700 hover:underline transition cursor-pointer'
                title='View references + citing papers as a network'
              >
                <NetworkIcon size={11} /> see network
              </button>
            </div>
          </div>

          {showActions && (
            <div className='flex flex-wrap gap-2 items-start flex-shrink-0'>
              {showPinButton && <PinButton paper={paper} size='sm' />}

              <button
                onClick={openGoogleScholar}
                className='inline-flex items-center gap-1 px-2.5 py-1 banner-info rounded-lg text-accent-strong transition text-xs font-medium whitespace-nowrap'
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
                  className='inline-flex items-center gap-1 px-2.5 py-1 button-secondary rounded-lg transition text-xs font-medium whitespace-nowrap'
                >
                  <ExternalLink size={12} /> DOI
                </a>
              )}

              {paper.pdf_url && (
                <a
                  href={paper.pdf_url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 px-2.5 py-1 button-secondary rounded-lg transition text-xs font-medium whitespace-nowrap'
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
          <div className='px-3 pb-3 pt-0 border-t border-app'>
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
        <div className='px-3 pb-3 pt-0 border-t border-app'>
          <div className='mt-3 space-y-2'>
            <p className='text-xs text-stone-500'>
              Report errors or missing data to OpenAlex
            </p>
            {/* Compact inline Work ID with copy */}
            <div className='flex items-center gap-2 text-xs'>
              <span className='text-stone-500'>ID:</span>
              <code className='px-1.5 py-0.5 surface-muted rounded text-stone-600 font-mono text-[11px]'>
                {workId}
              </code>
              <button
                onClick={copyWorkId}
                className='p-0.5 text-stone-400 hover:text-stone-600 transition'
                title='Copy Work ID'
              >
                {isCopied ? (
                  <Check size={12} className='text-success' />
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
                    ? 'text-success'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
                title={isReported ? 'Unmark as reported' : 'Mark as reported'}
              >
                <CheckCircle
                  size={12}
                  className={isReported ? 'fill-[var(--success-foreground)] text-[var(--foreground-inverse)]' : ''}
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
          className='p-1 text-stone-400 hover:text-stone-600 hover:bg-[var(--surface-muted)] rounded transition'
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
            className='p-1 text-stone-400 hover:text-stone-600 hover:bg-[var(--surface-muted)] rounded transition'
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
