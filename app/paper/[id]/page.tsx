'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import parsePapers from '@/utils/parsePapers';
import buildAbstract from '@/utils/abstract';
import { Paper } from '@/types/interfaces';
import Link from 'next/link';
import { ExternalLink, Download, Pin, X } from 'lucide-react';

export default function PaperPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawId = params?.id;
  
  const [paper, setPaper] = useState<Paper | null>(null);
  const [pinnedPapers, setPinnedPapers] = useState<Paper[]>([]);
  const [referencedWorks, setReferencedWorks] = useState<string[]>([]);
  const [cites, setCites] = useState<Paper[]>([]);
  const [citesPage, setCitesPage] = useState(1);
  const [cited, setCited] = useState<Paper[]>([]);
  const [citedPage, setCitedPage] = useState(1);
  const [loadingPaper, setLoadingPaper] = useState(true);
  const [loadingCites, setLoadingCites] = useState(false);
  const [loadingCited, setLoadingCited] = useState(false);

  const paperId =
    typeof rawId === 'string'
      ? rawId
      : Array.isArray(rawId)
      ? rawId[0]
      : undefined;

  const MAX_PINS = 5;

  // Parse pinned IDs from URL
  const pinnedIds = searchParams.get('pinned')?.split(',').filter(Boolean) || [];

  // Check if current paper is pinned
  const isPinned = paperId ? pinnedIds.includes(paperId) : false;

  // Fetch pinned papers
  useEffect(() => {
    if (pinnedIds.length === 0) {
      setPinnedPapers([]);
      return;
    }

    const fetchPinned = async () => {
      const papers: Paper[] = [];
      for (const id of pinnedIds) {
        try {
          const res = await axios.get(
            `https://api.openalex.org/works/${id}?mailto=${process.env.NEXT_PUBLIC_MAIL_ID}`
          );
          const [p] = parsePapers([res.data]);
          papers.push(p);
        } catch {}
      }
      setPinnedPapers(papers);
    };
    fetchPinned();
  }, [pinnedIds.join(',')]);

  // Memoized helper function
  const fetchPapersByIds = useCallback(
    async (ids: string[]): Promise<Paper[]> => {
      const papers: Paper[] = [];
      for (const url of ids) {
        const id = url.split('/').pop();
        if (!id) continue;
        try {
          const res = await axios.get(
            `https://api.openalex.org/works/${id}?mailto=${process.env.NEXT_PUBLIC_MAIL_ID}`
          );
          const [p] = parsePapers([res.data]);
          papers.push(p);
        } catch {}
      }
      return papers;
    },
    []
  );

  // Reset state when paperId changes
  useEffect(() => {
    setPaper(null);
    setReferencedWorks([]);
    setCites([]);
    setCitesPage(1);
    setCited([]);
    setCitedPage(1);
    setLoadingPaper(true);
    setLoadingCites(false);
    setLoadingCited(false);
  }, [paperId]);

  // Fetch main paper
  useEffect(() => {
    if (!paperId) return;
    let isCancelled = false;
    const fetchPaper = async () => {
      setLoadingPaper(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works/${paperId}?mailto=${process.env.NEXT_PUBLIC_MAIL_ID}`
        );
        if (isCancelled) return;
        const [p] = parsePapers([res.data]);
        setPaper(p);
        setReferencedWorks(res.data.referenced_works || []);
      } finally {
        if (!isCancelled) setLoadingPaper(false);
      }
    };
    fetchPaper();
    return () => {
      isCancelled = true;
    };
  }, [paperId]);

  // Fetch references (cited by this paper)
  useEffect(() => {
    if (referencedWorks.length === 0) return;
    let isCancelled = false;
    const fetchReferences = async () => {
      setLoadingCites(true);
      const batch = referencedWorks.slice((citesPage - 1) * 5, citesPage * 5);
      if (!batch.length) {
        setLoadingCites(false);
        return;
      }
      const newPapers = await fetchPapersByIds(batch);
      if (!isCancelled) {
        setCites((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...newPapers.filter((p) => !seen.has(p.id))];
        });
        setLoadingCites(false);
      }
    };
    fetchReferences();
    return () => {
      isCancelled = true;
    };
  }, [citesPage, referencedWorks, fetchPapersByIds]);

  // Fetch citing papers
  useEffect(() => {
    if (!paperId) return;
    let isCancelled = false;
    const fetchCiting = async () => {
      setLoadingCited(true);
      try {
        const res = await axios.get(
          `https://api.openalex.org/works?filter=cites:${paperId}&per-page=5&page=${citedPage}&mailto=${process.env.NEXT_PUBLIC_MAIL_ID}`
        );
        const newPapers = parsePapers(res.data.results);
        if (!isCancelled) {
          setCited((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...newPapers.filter((p) => !seen.has(p.id))];
          });
        }
      } finally {
        if (!isCancelled) setLoadingCited(false);
      }
    };
    fetchCiting();
    return () => {
      isCancelled = true;
    };
  }, [citedPage, paperId]);

  // Toggle pin
  const togglePin = () => {
    if (!paperId) return;
    
    let newPinnedIds: string[];
    if (isPinned) {
      // Unpin
      newPinnedIds = pinnedIds.filter(id => id !== paperId);
    } else {
      // Pin (max 5)
      if (pinnedIds.length >= MAX_PINS) {
        alert(`Maximum ${MAX_PINS} papers can be pinned`);
        return;
      }
      newPinnedIds = [...pinnedIds, paperId];
    }

    updatePinnedUrl(newPinnedIds);
  };

  // Remove specific pin
  const removePin = (idToRemove: string) => {
    const newPinnedIds = pinnedIds.filter(id => id !== idToRemove);
    updatePinnedUrl(newPinnedIds);
  };

  // Update URL with pinned papers
  const updatePinnedUrl = (newPinnedIds: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPinnedIds.length > 0) {
      params.set('pinned', newPinnedIds.join(','));
    } else {
      params.delete('pinned');
    }
    router.replace(`/paper/${paperId}?${params.toString()}`);
  };

  // Conditional rendering
  if (!paperId) return <div className='p-6 text-stone-600'>Paper ID not found</div>;
  if (loadingPaper || !paper) return <div className='p-6 text-stone-600'>Loading paper…</div>;

  // Check which pinned papers appear in references/citations
  const pinnedInReferences = pinnedPapers.filter(pp => 
    referencedWorks.some(ref => ref.includes(pp.id.split('/').pop()!))
  );
  const pinnedInCited = pinnedPapers.filter(pp =>
    cited.some(c => c.id === pp.id)
  );

  const renderPaperCard = (r: Paper, prefix: string, isPinnedCard = false) => (
    <Link
      key={`${prefix}-${r.id}-${paperId}`}
      href={`/paper/${r.id.split('/').pop()}?pinned=${pinnedIds.join(',')}`}
      className={`block border rounded-lg p-3 transition bg-white ${
        isPinnedCard 
          ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' 
          : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      {isPinnedCard && (
        <div className='flex items-center gap-1 text-xs text-amber-700 font-medium mb-2'>
          <Pin size={12} className='fill-amber-700' />
          Pinned paper
        </div>
      )}
      <div className='font-semibold text-stone-900 text-sm leading-snug mb-1'>{r.title}</div>
      <div className='text-xs text-stone-600 mb-1'>{r.authors.slice(0, 3).join(', ')}{r.authors.length > 3 && '...'}</div>
      <div className='text-xs text-stone-500'>
        {r.journal_name} • {r.publication_year} • {r.cited_by_count} citations
      </div>
    </Link>
  );

  // Filter out pinned papers from regular lists
  const regularCites = cites.filter(c => 
    !pinnedInReferences.some(pp => pp.id === c.id)
  );
  const regularCited = cited.filter(c =>
    !pinnedInCited.some(pp => pp.id === c.id)
  );

  return (
    <div className='min-h-screen bg-stone-50 flex'>
      {/* Pinned Papers Sidebar */}
      {pinnedPapers.length > 0 && (
        <aside className='w-72 bg-white border-r border-stone-200 p-4 overflow-y-auto'>
          <h3 className='text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2'>
            <Pin size={14} className='fill-stone-700' />
            Pinned Papers ({pinnedPapers.length}/{MAX_PINS})
          </h3>
          <div className='space-y-2'>
            {pinnedPapers.map(pp => (
              <div
                key={pp.id}
                className='bg-stone-50 border border-stone-200 rounded-lg p-3 relative'
              >
                <button
                  onClick={() => removePin(pp.id.split('/').pop()!)}
                  className='absolute top-2 right-2 p-1 hover:bg-stone-200 rounded transition'
                  title='Unpin'
                >
                  <X size={12} className='text-stone-600' />
                </button>
                <Link
                  href={`/paper/${pp.id.split('/').pop()}?pinned=${pinnedIds.join(',')}`}
                  className='block pr-6'
                >
                  <div className='font-semibold text-stone-900 text-xs leading-snug mb-1'>
                    {pp.title}
                  </div>
                  <div className='text-xs text-stone-500'>
                    {pp.publication_year} • {pp.cited_by_count} cites
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Main Content */}
      <div className='flex-1 overflow-y-auto'>
        <div className='max-w-5xl mx-auto p-6 space-y-6'>
          {/* MAIN PAPER */}
          <div className='bg-white border border-stone-200 rounded-lg p-6'>
            <div className='flex items-start justify-between gap-4 mb-2'>
              <h1 className='text-2xl font-bold text-stone-900 flex-1'>{paper.title}</h1>
              <button
                onClick={togglePin}
                className={`flex-shrink-0 p-2 rounded-lg border transition ${
                  isPinned
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
                }`}
                title={isPinned ? 'Unpin this paper' : `Pin this paper (${pinnedIds.length}/${MAX_PINS})`}
              >
                <Pin size={18} className={isPinned ? 'fill-amber-700' : ''} />
              </button>
            </div>
            <div className='text-sm text-stone-600 mb-1'>
              {paper.authors.join(', ')}
            </div>
            <div className='text-sm text-stone-500 mb-3'>
              {paper.journal_name} • {paper.publication_year} • {paper.cited_by_count} citations
            </div>
            <div className='flex flex-wrap gap-2 mb-4'>
              {paper.doi && (
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition'
                >
                  <ExternalLink size={12} /> DOI
                </a>
              )}
              {paper.pdf_url && (
                <a
                  href={paper.pdf_url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition'
                >
                  <Download size={12} /> PDF
                </a>
              )}
            </div>
            {paper.abstract && (
              <p className='text-sm text-stone-700 leading-relaxed'>
                {buildAbstract(paper.abstract)}
              </p>
            )}
          </div>

          {/* REFERENCES (backward citations) */}
          <div className='space-y-3'>
            <h2 className='text-lg font-semibold text-stone-900'>
              References ({referencedWorks.length})
            </h2>
            <div className='grid md:grid-cols-2 gap-3'>
              {/* Show pinned papers at top if they're in references */}
              {pinnedInReferences.map(pp => renderPaperCard(pp, 'pinned-ref', true))}
              
              {/* Show regular references */}
              {regularCites.map(r => renderPaperCard(r, 'references'))}
            </div>
            {referencedWorks.length > cites.length && (
              <button
                onClick={() => setCitesPage((p) => p + 1)}
                disabled={loadingCites}
                className='px-4 py-2 text-sm border border-stone-300 rounded-lg bg-white hover:bg-stone-50 transition text-stone-700 font-medium disabled:opacity-50'
              >
                {loadingCites ? 'Loading...' : 'Load more references'}
              </button>
            )}
          </div>

          {/* CITED BY (forward citations) */}
          <div className='space-y-3'>
            <h2 className='text-lg font-semibold text-stone-900'>
              Cited by ({paper.cited_by_count})
            </h2>
            <div className='grid md:grid-cols-2 gap-3'>
              {/* Show pinned papers at top if they cite this paper */}
              {pinnedInCited.map(pp => renderPaperCard(pp, 'pinned-cited', true))}
              
              {/* Show regular citations */}
              {regularCited.map(r => renderPaperCard(r, 'cited'))}
            </div>
            <button
              onClick={() => setCitedPage((p) => p + 1)}
              disabled={loadingCited}
              className='px-4 py-2 text-sm border border-stone-300 rounded-lg bg-white hover:bg-stone-50 transition text-stone-700 font-medium disabled:opacity-50'
            >
              {loadingCited ? 'Loading...' : 'Load more citations'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}