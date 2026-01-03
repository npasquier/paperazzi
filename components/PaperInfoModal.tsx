'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, ExternalLink, BookOpen } from 'lucide-react';
import { Paper } from '@/types/interfaces';
import PinButton from './ui/PinButton';
import { cleanAbstract } from '@/utils/abstract';

interface PaperInfoModalProps {
  paper: Paper;
  isOpen: boolean;
  onClose: () => void;
}

interface RelatedPaper {
  id: string;
  title: string;
  authors: string[];
  publication_year: number;
  journal_name: string;
  doi?: string;
  cited_by_count: number;
}

export default function PaperInfoModal({
  paper,
  isOpen,
  onClose,
}: PaperInfoModalProps) {
  const [relatedPapers, setRelatedPapers] = useState<RelatedPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [abstract, setAbstract] = useState<string>(
    cleanAbstract(paper.abstract || '')
  );

  useEffect(() => {
    if (!isOpen) return;

    const fetchRelatedPapers = async () => {
      setLoading(true);
      try {
        const paperId = paper.id.replace('https://openalex.org/', '');
        const res = await fetch(
          `https://api.openalex.org/works/${paperId}?mailto=${
            process.env.NEXT_PUBLIC_MAIL_ID || ''
          }`
        );
        const data = await res.json();

        // Get abstract if not already available
        if (!abstract && data.abstract_inverted_index) {
          const words: string[] = [];
          Object.entries(data.abstract_inverted_index).forEach(
            ([word, positions]: any) => {
              positions.forEach((p: number) => (words[p] = word));
            }
          );
          setAbstract(cleanAbstract(words.join(' ')));
        }

        // Fetch related works
        if (data.related_works && data.related_works.length > 0) {
          const relatedIds = data.related_works.slice(0, 5);
          const relatedRes = await fetch(
            `https://api.openalex.org/works?filter=openalex_id:${relatedIds.join(
              '|'
            )}&per-page=5&mailto=${process.env.NEXT_PUBLIC_MAIL_ID || ''}`
          );
          const relatedData = await relatedRes.json();

          if (relatedData.results) {
            setRelatedPapers(
              relatedData.results.map((w: any) => ({
                id: w.id,
                title: w.title,
                authors:
                  w.authorships?.map((a: any) => a.author.display_name) || [],
                publication_year: w.publication_year,
                journal_name:
                  w.primary_location?.source?.display_name || 'Unknown',
                doi: w.doi,
                cited_by_count: w.cited_by_count,
              }))
            );
          }
        }
      } catch (error) {
        console.error('Failed to fetch related papers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedPapers();
  }, [isOpen, paper.id, abstract]);

  const openGoogleScholar = (title: string) => {
    const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(
      title
    )}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4'>
        {/* Header */}
        <div className='flex items-start justify-between p-4 border-b border-stone-200'>
          <div className='flex-1 min-w-0 pr-4'>
            <h2 className='text-lg font-semibold text-stone-900 leading-snug'>
              {paper.title}
            </h2>
            <p className='text-sm text-stone-600 mt-1'>
              {paper.authors.slice(0, 5).join(', ')}
              {paper.authors.length > 5 && ` +${paper.authors.length - 5} more`}
            </p>
            <p className='text-xs text-stone-500 mt-1'>
              {paper.journal_name} • {paper.publication_year} •{' '}
              {paper.cited_by_count} citations
            </p>
          </div>
          <button
            onClick={onClose}
            className='p-1 hover:bg-stone-100 rounded transition flex-shrink-0'
          >
            <X size={20} className='text-stone-500' />
          </button>
        </div>

        {/* Content */}
        <div className='flex-1 overflow-y-auto p-4'>
          {/* Action buttons */}
          <div className='flex flex-wrap gap-2 mb-4'>
            <PinButton paper={paper} size='sm' />

            <button
              onClick={() => openGoogleScholar(paper.title)}
              className='inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-xs font-medium'
            >
              <BookOpen size={14} />
              Google Scholar
            </button>

            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition text-xs font-medium'
              >
                <ExternalLink size={14} />
                DOI
              </a>
            )}
          </div>

          {/* Abstract */}
          <div className='mb-6'>
            <h3 className='text-sm font-semibold text-stone-900 mb-2'>
              Abstract
            </h3>
            {abstract ? (
              <p className='text-sm text-stone-600 leading-relaxed'>
                {abstract}
              </p>
            ) : (
              <p className='text-sm text-stone-400 italic'>
                No abstract available
              </p>
            )}
          </div>

          {/* Related Papers */}
          <div>
            <h3 className='text-sm font-semibold text-stone-900 mb-3'>
              Related Papers
            </h3>
            {loading ? (
              <div className='flex items-center justify-center py-6'>
                <Loader2 className='animate-spin text-stone-400' size={20} />
              </div>
            ) : relatedPapers.length > 0 ? (
              <div className='space-y-2'>
                {relatedPapers.map((related) => (
                  <RelatedPaperCard
                    key={related.id}
                    paper={related}
                    onGoogleScholar={() => openGoogleScholar(related.title)}
                  />
                ))}
              </div>
            ) : (
              <p className='text-sm text-stone-400 italic'>
                No related papers found
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-component for related papers
function RelatedPaperCard({
  paper,
  onGoogleScholar,
}: {
  paper: RelatedPaper;
  onGoogleScholar: () => void;
}) {
  const paperId = paper.id.replace('https://openalex.org/', '');

  return (
    <div className='bg-stone-50 border border-stone-200 rounded-lg p-3 hover:border-stone-300 transition'>
      <div className='flex items-start justify-between gap-3'>
        <a href={`/paper/${paperId}`} className='flex-1 min-w-0 block'>
          <h4 className='text-sm font-medium text-stone-900 leading-snug line-clamp-2 hover:text-stone-700'>
            {paper.title}
          </h4>
          <p className='text-xs text-stone-500 mt-1 truncate'>
            {paper.authors.slice(0, 3).join(', ')}
            {paper.authors.length > 3 && '...'}
          </p>
          <p className='text-xs text-stone-400 mt-0.5'>
            {paper.journal_name} • {paper.publication_year} •{' '}
            {paper.cited_by_count} citations
          </p>
        </a>

        <div className='flex gap-1.5 flex-shrink-0'>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onGoogleScholar();
            }}
            className='p-1.5 text-blue-600 hover:bg-blue-50 rounded transition'
            title='Search on Google Scholar'
          >
            <BookOpen size={14} />
          </button>

          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target='_blank'
              rel='noopener noreferrer'
              onClick={(e) => e.stopPropagation()}
              className='p-1.5 text-stone-500 hover:bg-stone-100 rounded transition'
              title='Open DOI'
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
