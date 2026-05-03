'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ExternalLink, BookOpen } from 'lucide-react';
import { Paper } from '@/types/interfaces';
import PinButton from './ui/PinButton';
import { cleanAbstract } from '@/utils/abstract';

interface PaperInfoModalProps {
  paper: Paper;
  isOpen: boolean;
  onClose: () => void;
}

interface OpenAlexWorkDetails {
  abstract_inverted_index?: Record<string, number[]>;
}

export default function PaperInfoModal({
  paper,
  isOpen,
  onClose,
}: PaperInfoModalProps) {
  const [abstract, setAbstract] = useState<string>('');
  const [isLoadingAbstract, setIsLoadingAbstract] = useState(false);

  useEffect(() => {
    setAbstract(cleanAbstract(paper.abstract || ''));
    setIsLoadingAbstract(false);
  }, [paper.id, paper.abstract]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const initialAbstract = cleanAbstract(paper.abstract || '');
    if (initialAbstract) return;

    let cancelled = false;

    const fetchAbstract = async () => {
      setIsLoadingAbstract(true);
      try {
        const paperId = paper.id.replace('https://openalex.org/', '');
        const res = await fetch(
          `https://api.openalex.org/works/${paperId}?mailto=${
            process.env.NEXT_PUBLIC_MAIL_ID || ''
          }`
        );
        const data = (await res.json()) as OpenAlexWorkDetails;

        if (data.abstract_inverted_index) {
          const words: string[] = [];
          Object.entries(data.abstract_inverted_index).forEach(
            ([word, positions]) => {
              positions.forEach((p: number) => (words[p] = word));
            }
          );
          if (!cancelled) {
            setAbstract(cleanAbstract(words.join(' ')));
          }
        }
      } catch (error) {
        console.error('Failed to fetch abstract:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingAbstract(false);
        }
      }
    };

    fetchAbstract();
    return () => {
      cancelled = true;
    };
  }, [isOpen, paper.id, paper.abstract]);

  const openGoogleScholar = (title: string) => {
    const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(
      title
    )}`;
    window.open(url, '_blank');
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className='fixed inset-0 z-50 flex items-center justify-center overlay-soft'
      onClick={onClose}
    >
      <div
        className='surface-card border border-app rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4 cursor-auto'
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-start justify-between p-4 border-b border-app'>
          <div className='flex-1 min-w-0 pr-4 select-text'>
            <h2 className='text-lg font-semibold text-stone-900 leading-snug cursor-text'>
              {paper.title}
            </h2>
            <p className='text-sm text-stone-600 mt-1 cursor-text'>
              {paper.authors.slice(0, 5).join(', ')}
              {paper.authors.length > 5 && ` +${paper.authors.length - 5} more`}
            </p>
            <p className='text-xs text-stone-500 mt-1 cursor-text'>
              {paper.journal_name} • {paper.publication_year} •{' '}
              {paper.cited_by_count} citations
            </p>
          </div>
          <button
            onClick={onClose}
            className='p-1 hover:bg-[var(--surface-muted)] rounded transition flex-shrink-0'
          >
            <X size={20} className='text-stone-500' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto p-4'>
          <div className='flex flex-wrap gap-2 mb-4'>
            <PinButton paper={paper} size='sm' />

            <button
              onClick={() => openGoogleScholar(paper.title)}
              className='inline-flex items-center gap-1.5 px-3 py-1.5 banner-info text-accent-strong rounded-lg transition text-xs font-medium'
            >
              <BookOpen size={14} />
              Google Scholar
            </button>

            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi.replace(
                  'https://doi.org/',
                  ''
                )}`}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1.5 px-3 py-1.5 button-secondary rounded-lg transition text-xs font-medium'
              >
                <ExternalLink size={14} />
                DOI
              </a>
            )}
          </div>

          <div className='select-text'>
            <h3 className='text-sm font-semibold text-stone-900 mb-2'>
              Abstract
            </h3>
            {abstract ? (
              <p className='text-sm text-stone-600 leading-relaxed cursor-text whitespace-pre-wrap'>
                {abstract}
              </p>
            ) : isLoadingAbstract ? (
              <div className='flex items-center gap-2 py-2 text-sm text-stone-500'>
                <Loader2 className='animate-spin text-stone-400' size={16} />
                Loading abstract...
              </div>
            ) : (
              <p className='text-sm text-stone-400 italic'>
                No abstract available
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
