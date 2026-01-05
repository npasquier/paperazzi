'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import { ExternalLink, Download } from 'lucide-react';
import parsePapers from '@/utils/parsePapers';
import buildAbstract from '@/utils/abstract';
import { Paper } from '@/types/interfaces';
import { usePins } from '@/contexts/PinContext';
import PinButton from '@/components/ui/PinButton';
import PinSidebar from '@/components/PinSidebar';

export default function PaperPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = params?.id;
  const { pinnedPapers, pinnedIds } = usePins();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [referencedWorks, setReferencedWorks] = useState<string[]>([]);
  const [cites, setCites] = useState<Paper[]>([]);
  const [citesPage, setCitesPage] = useState(1);
  const [cited, setCited] = useState<Paper[]>([]);
  const [citedPage, setCitedPage] = useState(1);
  const [relatedPapers, setRelatedPapers] = useState<Paper[]>([]);
  const [loadingPaper, setLoadingPaper] = useState(true);
  const [loadingCites, setLoadingCites] = useState(false);
  const [loadingCited, setLoadingCited] = useState(false);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Ref for intersection observer
  const relatedSectionRef = useRef<HTMLDivElement>(null);
  const [hasLoadedRelated, setHasLoadedRelated] = useState(false);

  const paperId =
    typeof rawId === 'string'
      ? rawId
      : Array.isArray(rawId)
      ? rawId[0]
      : undefined;

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
    setRelatedPapers([]);
    setLoadingPaper(true);
    setLoadingCites(false);
    setLoadingCited(false);
    setLoadingRelated(false);
    setHasLoadedRelated(false);
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

  // Fetch references (backward citations)
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

  // Fetch related papers when section is visible
  useEffect(() => {
    if (!paperId || !paper || hasLoadedRelated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasLoadedRelated) {
          setHasLoadedRelated(true);
          fetchRelatedPapers();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (relatedSectionRef.current) {
      observer.observe(relatedSectionRef.current);
    }

    return () => observer.disconnect();
  }, [paperId, paper, hasLoadedRelated]);

  const fetchRelatedPapers = async () => {
    if (!paper) return;
    setLoadingRelated(true);
    try {
      // Use OpenAlex's related-to filter based on title/concepts
      const res = await axios.get(
        `https://api.openalex.org/works?filter=related_to:${paperId}&per-page=6&mailto=${process.env.NEXT_PUBLIC_MAIL_ID}`
      );
      const papers = parsePapers(res.data.results);
      // Filter out the current paper
      setRelatedPapers(papers.filter((p) => p.id !== paper.id));
    } catch (error) {
      console.error('Error fetching related papers:', error);
    } finally {
      setLoadingRelated(false);
    }
  };

  if (!paperId)
    return <div className='p-6 text-stone-600'>Paper ID not found</div>;
  if (loadingPaper || !paper)
    return <div className='p-6 text-stone-600'>Loading paper…</div>;

  // Determine which pinned papers appear in references/citations
  const pinnedInReferences = pinnedPapers.filter((pp) =>
    referencedWorks.some((ref) => ref.includes(pp.id.split('/').pop()!))
  );
  const pinnedInCited = pinnedPapers.filter((pp) =>
    cited.some((c) => c.id === pp.id)
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
          Pinned paper
        </div>
      )}
      <div className='font-semibold text-stone-900 text-sm leading-snug mb-1'>
        {r.title}
      </div>
      <div className='text-xs text-stone-600 mb-1'>
        {r.authors.slice(0, 3).join(', ')}
        {r.authors.length > 3 && '...'}
      </div>
      <div className='text-xs text-stone-500'>
        {r.journal_name} • {r.publication_year} • {r.cited_by_count} citations
      </div>
    </Link>
  );

  const regularCites = cites.filter(
    (c) => !pinnedInReferences.some((pp) => pp.id === c.id)
  );
  const regularCited = cited.filter(
    (c) => !pinnedInCited.some((pp) => pp.id === c.id)
  );

  return (
    <div className='min-h-screen bg-stone-50 flex'>
      {/* Main Content */}
      <div className='flex-1 overflow-y-auto'>
        <div className='max-w-5xl mx-auto p-6 space-y-6'>
          {/* MAIN PAPER */}
          <div className='bg-white border border-stone-200 rounded-lg p-6'>
            <div className='flex items-start justify-between gap-4 mb-2'>
              <h1 className='text-2xl font-bold text-stone-900 flex-1'>
                {paper.title}
              </h1>
              <PinButton paper={paper} />
            </div>
            <div className='text-sm text-stone-600 mb-1'>
              {paper.authors.join(', ')}
            </div>
            <div className='text-sm text-stone-500 mb-3'>
              {paper.journal_name} • {paper.publication_year} •{' '}
              {paper.cited_by_count} citations
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

          {/* REFERENCES */}
          <div className='space-y-3'>
            <h2 className='text-lg font-semibold text-stone-900'>
              References ({referencedWorks.length})
            </h2>
            <div className='grid md:grid-cols-2 gap-3'>
              {pinnedInReferences.map((pp) =>
                renderPaperCard(pp, 'pinned-ref', true)
              )}
              {regularCites.map((r) => renderPaperCard(r, 'references'))}
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

          {/* CITED BY */}
          <div className='space-y-3'>
            <h2 className='text-lg font-semibold text-stone-900'>
              Cited by ({paper.cited_by_count})
            </h2>
            <div className='grid md:grid-cols-2 gap-3'>
              {pinnedInCited.map((pp) =>
                renderPaperCard(pp, 'pinned-cited', true)
              )}
              {regularCited.map((r) => renderPaperCard(r, 'cited'))}
            </div>
            {cited.length > 0 && (
              <button
                onClick={() => setCitedPage((p) => p + 1)}
                disabled={loadingCited}
                className='px-4 py-2 text-sm border border-stone-300 rounded-lg bg-white hover:bg-stone-50 transition text-stone-700 font-medium disabled:opacity-50'
              >
                {loadingCited ? 'Loading...' : 'Load more citations'}
              </button>
            )}
          </div>

          {/* RELATED PAPERS - Lazy loaded */}
          <div ref={relatedSectionRef} className='space-y-3'>
            <h2 className='text-lg font-semibold text-stone-900'>
              Related Papers
            </h2>
            {loadingRelated ? (
              <div className='text-sm text-stone-500 py-4'>
                Loading related papers...
              </div>
            ) : relatedPapers.length > 0 ? (
              <div className='grid md:grid-cols-2 gap-3'>
                {relatedPapers.map((r) => renderPaperCard(r, 'related'))}
              </div>
            ) : hasLoadedRelated ? (
              <div className='text-sm text-stone-500 py-4'>
                No related papers found
              </div>
            ) : (
              <div className='text-sm text-stone-500 py-4'>
                Scroll to load related papers...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pin Sidebar */}
      <PinSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
    </div>
  );
}
