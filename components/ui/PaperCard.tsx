'use client';

import Link from 'next/link';
import { ExternalLink, Download, Info, Pin } from 'lucide-react';
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
  const paperUrl = `/paper/${paper.id.split('/').pop()}${preserveParams ? `?${preserveParams}` : ''}`;
  
  if (variant === 'pinned') {
    return (
      <div
        className={`
          bg-stone-50 border rounded-lg p-3 relative
          ${highlighted ? 'border-amber-400 bg-amber-50' : 'border-stone-200'}
        `}
      >
        {showPinButton && (
          <div className="absolute top-2 right-2">
            <PinButton paper={paper} size="sm" />
          </div>
        )}
        <Link href={paperUrl} className="block pr-8" onClick={onClick}>
          <div className="font-semibold text-stone-900 text-xs leading-snug mb-1 line-clamp-2">
            {paper.title}
          </div>
          <div className="text-xs text-stone-500">
            {paper.publication_year} • {paper.cited_by_count} cites
          </div>
        </Link>
      </div>
    );
  }
  
  if (variant === 'compact') {
    return (
      <Link
        href={paperUrl}
        onClick={onClick}
        className={`
          block border rounded-lg p-3 transition bg-white
          ${highlighted
            ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
            : 'border-stone-200 hover:border-stone-300'
          }
        `}
      >
        {highlighted && (
          <div className="flex items-center gap-1 text-xs text-amber-700 font-medium mb-2">
            <Pin size={12} className="fill-amber-700" />
            Pinned paper
          </div>
        )}
        <div className="font-semibold text-stone-900 text-sm leading-snug mb-1">
          {paper.title}
        </div>
        <div className="text-xs text-stone-600 mb-1">
          {paper.authors.slice(0, 3).join(', ')}
          {paper.authors.length > 3 && '...'}
        </div>
        <div className="text-xs text-stone-500">
          {paper.journal_name} • {paper.publication_year} • {paper.cited_by_count} citations
        </div>
      </Link>
    );
  }
  
  // Default variant
  return (
    <div
      className={`
        bg-white border rounded-lg p-3 transition
        ${highlighted
          ? 'border-amber-400 bg-amber-50'
          : 'border-stone-200 hover:border-stone-300'
        }
      `}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left side: Paper info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-stone-900 text-base leading-snug mb-1">
            {paper.title}
          </h3>
          
          <div className="text-sm text-stone-600 mb-1 truncate">
            {paper.authors.slice(0, 5).join(', ')}
            {paper.authors.length > 5 && `, +${paper.authors.length - 5} more`}
          </div>
          
          <div className="text-xs text-stone-500">
            {paper.journal_name} • {paper.publication_year} • {paper.cited_by_count} citations
          </div>
        </div>
        
        {/* Right side: Action buttons */}
        {showActions && (
          <div className="flex flex-wrap gap-2 items-start flex-shrink-0">
            {showPinButton && <PinButton paper={paper} size="sm" />}
            
            <Link
              href={paperUrl}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap"
            >
              <Info size={12} /> Info
            </Link>
            
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap"
              >
                <ExternalLink size={12} /> DOI
              </a>
            )}
            
            {paper.pdf_url && (
              <a
                href={paper.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium whitespace-nowrap"
              >
                <Download size={12} /> PDF
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}